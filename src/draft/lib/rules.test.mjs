import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SETTINGS,
  advanceNominator,
  applyBid,
  applyElapsed,
  applyNomination,
  createDraft,
  currentNominator,
  maxBidFor,
  pause,
  resume,
  resolveAuction,
  sanitizeSettings,
  shuffleOrder,
  slotsLeft,
  spentBy,
  startDraft,
  undoLastPick,
  validateBid,
  validateNomination,
  publicView,
} from './rules.js'

const T0 = 1_750_000_000_000
const mon = (id, name = id) => ({ id, name, sprite: `${id}.png` })

/** A draft mid-flight with `n` coaches and no picks yet. */
function draft(n = 4, settings = {}, now = T0) {
  const state = createDraft({ room: 'TEST', settings, now })
  for (let i = 0; i < n; i++) {
    state.coaches.push({ id: `c${i}`, name: `Coach ${i}`, seat: i })
    state.rosters[`c${i}`] = []
  }
  return startDraft(state, now)
}

// ── Budget math ──────────────────────────────────────────────────────

test('max bid reserves min bid for every other open slot', () => {
  const s = draft(2, { budget: 100, rosterSize: 6, minBid: 1 })
  // 6 empty slots: winning this one leaves 5 to fill at 1 each.
  assert.equal(maxBidFor(s, 'c0'), 95)
})

test('max bid accounts for points already spent', () => {
  const s = draft(2, { budget: 100, rosterSize: 6, minBid: 1 })
  s.rosters.c0.push({ pokemonId: 'x', name: 'X', price: 40, wonAt: T0 })
  // spent 40, 5 slots left -> 100 - 40 - (4 * 1)
  assert.equal(maxBidFor(s, 'c0'), 56)
  assert.equal(spentBy(s, 'c0'), 40)
})

test('max bid on the final slot can spend every remaining point', () => {
  const s = draft(2, { budget: 100, rosterSize: 2, minBid: 1 })
  s.rosters.c0.push({ pokemonId: 'x', name: 'X', price: 60, wonAt: T0 })
  assert.equal(slotsLeft(s, 'c0'), 1)
  assert.equal(maxBidFor(s, 'c0'), 40) // nothing left to reserve
})

test('a full roster can bid nothing', () => {
  const s = draft(2, { budget: 100, rosterSize: 1 })
  s.rosters.c0.push({ pokemonId: 'x', name: 'X', price: 10, wonAt: T0 })
  assert.equal(maxBidFor(s, 'c0'), 0)
})

test('minBid above 1 scales the reserve', () => {
  const s = draft(2, { budget: 100, rosterSize: 4, minBid: 5 })
  // 4 slots: reserve 3 * 5 = 15
  assert.equal(maxBidFor(s, 'c0'), 85)
})

test('a coach can always fill their roster after bidding their max', () => {
  const s = draft(2, { budget: 100, rosterSize: 6, minBid: 1 })
  // Repeatedly spend the maximum allowed; the roster must still fill out.
  for (let i = 0; i < 6; i++) {
    const max = maxBidFor(s, 'c0')
    assert.ok(max >= s.settings.minBid, `slot ${i} left no affordable bid (max ${max})`)
    s.rosters.c0.push({ pokemonId: `p${i}`, name: `P${i}`, price: max, wonAt: T0 + i })
  }
  assert.equal(slotsLeft(s, 'c0'), 0)
  assert.ok(spentBy(s, 'c0') <= 100, `overspent: ${spentBy(s, 'c0')}`)
})

// ── Bid validation ───────────────────────────────────────────────────

function withAuction(s, { high = 10, bidder = 'c0', now = T0 } = {}) {
  applyNomination(s, bidder, mon('flutter', 'Flutter Mane'), high, now)
  return s
}

test('a bid must beat the standing high bid', () => {
  const s = withAuction(draft(2))
  assert.equal(validateBid(s, 'c1', 10, T0).ok, false)
  assert.equal(validateBid(s, 'c1', 11, T0).ok, true)
})

test('you cannot outbid yourself', () => {
  const s = withAuction(draft(2), { bidder: 'c0' })
  const r = validateBid(s, 'c0', 50, T0)
  assert.equal(r.ok, false)
  assert.match(r.error, /already the high bidder/)
})

test('a bid over max bid is rejected with the cap in the message', () => {
  const s = withAuction(draft(2, { budget: 100, rosterSize: 6, minBid: 1 }))
  const r = validateBid(s, 'c1', 96, T0)
  assert.equal(r.ok, false)
  assert.match(r.error, /only bid up to 95/)
})

test('a coach with a full roster cannot bid', () => {
  const s = draft(2, { budget: 100, rosterSize: 1 })
  withAuction(s, { bidder: 'c0' })
  s.rosters.c1.push({ pokemonId: 'x', name: 'X', price: 5, wonAt: T0 })
  const r = validateBid(s, 'c1', 50, T0)
  assert.equal(r.ok, false)
  assert.match(r.error, /roster is already full/)
})

test('bids are rejected once the clock has run out', () => {
  const s = withAuction(draft(2))
  const after = s.auction.endsAt + 1
  assert.equal(validateBid(s, 'c1', 99, after).ok, false)
})

test('bids are rejected while paused', () => {
  const s = withAuction(draft(2))
  pause(s, T0 + 1000)
  assert.equal(validateBid(s, 'c1', 20, T0 + 2000).ok, false)
})

test('non-integer and junk bids are rejected', () => {
  const s = withAuction(draft(2))
  assert.equal(validateBid(s, 'c1', 'abc', T0).ok, false)
  assert.equal(validateBid(s, 'c1', NaN, T0).ok, false)
})

// ── Anti-snipe ───────────────────────────────────────────────────────

test('a late bid extends the clock to the reset window', () => {
  const s = draft(2, { timerSec: 30, bidResetSec: 15 })
  withAuction(s)
  const late = s.auction.endsAt - 2000 // 2s left
  applyBid(s, 'c1', 20, late)
  assert.equal(s.auction.endsAt, late + 15_000)
})

test('an early bid never shortens the clock', () => {
  const s = draft(2, { timerSec: 30, bidResetSec: 15 })
  withAuction(s)
  const original = s.auction.endsAt
  applyBid(s, 'c1', 20, T0 + 1000) // 29s still left, longer than the 15s reset
  assert.equal(s.auction.endsAt, original)
})

// ── Resolution ───────────────────────────────────────────────────────

test('an expired auction awards the Pokemon and charges the winner', () => {
  const s = draft(3, { budget: 100, rosterSize: 6 })
  withAuction(s, { bidder: 'c0', high: 10 })
  applyBid(s, 'c1', 34, T0 + 1000)

  const changed = applyElapsed(s, s.auction.endsAt + 1)
  assert.equal(changed, true)
  assert.equal(s.auction, null)
  assert.equal(s.rosters.c1.length, 1)
  assert.equal(s.rosters.c1[0].name, 'Flutter Mane')
  assert.equal(s.rosters.c1[0].price, 34)
  assert.equal(spentBy(s, 'c1'), 34)
  assert.equal(spentBy(s, 'c0'), 0, 'the losing nominator must not be charged')
})

test('an auction nobody contested goes to the nominator at their opening bid', () => {
  const s = draft(3)
  withAuction(s, { bidder: 'c0', high: 7 })
  applyElapsed(s, s.auction.endsAt + 1)
  assert.equal(s.rosters.c0[0].price, 7)
})

test('applyElapsed is a no-op while the clock is still running', () => {
  const s = withAuction(draft(2))
  assert.equal(applyElapsed(s, T0 + 500), false)
  assert.ok(s.auction)
})

test('the same Pokemon cannot be nominated twice', () => {
  const s = draft(2)
  withAuction(s, { bidder: 'c0' })
  applyElapsed(s, s.auction.endsAt + 1)
  const r = validateNomination(s, currentNominator(s), 'flutter', 5, T0 + 99_999)
  assert.equal(r.ok, false)
  assert.match(r.error, /already on a team/)
})

// ── Turn order ───────────────────────────────────────────────────────

test('nomination passes to the next coach after a sale', () => {
  const s = draft(3)
  assert.equal(currentNominator(s), 'c0')
  withAuction(s, { bidder: 'c0' })
  applyElapsed(s, s.auction.endsAt + 1)
  assert.equal(currentNominator(s), 'c1')
})

test('nomination order skips coaches whose rosters are full', () => {
  const s = draft(3, { rosterSize: 1 })
  s.rosters.c1.push({ pokemonId: 'x', name: 'X', price: 1, wonAt: T0 })
  advanceNominator(s, T0)
  assert.equal(currentNominator(s), 'c2', 'c1 is full and must be skipped')
})

test('the draft finishes when every roster is full', () => {
  const s = draft(2, { rosterSize: 1 })
  s.rosters.c0.push({ pokemonId: 'a', name: 'A', price: 1, wonAt: T0 })
  s.rosters.c1.push({ pokemonId: 'b', name: 'B', price: 1, wonAt: T0 })
  advanceNominator(s, T0)
  assert.equal(s.status, 'done')
})

test('a coach who sits on their nomination is skipped', () => {
  const s = draft(3, { nominationSec: 60 })
  assert.equal(currentNominator(s), 'c0')
  const changed = applyElapsed(s, s.nominationDeadline + 1)
  assert.equal(changed, true)
  assert.equal(currentNominator(s), 'c1')
  assert.ok(s.log.some((e) => e.type === 'nomination_skipped'))
})

test('only the coach on the clock may nominate', () => {
  const s = draft(3)
  assert.equal(validateNomination(s, 'c1', 'flutter', 5, T0).ok, false)
  assert.equal(validateNomination(s, 'c0', 'flutter', 5, T0).ok, true)
})

test('an opening bid below the minimum is rejected', () => {
  const s = draft(2, { minBid: 3 })
  const r = validateNomination(s, 'c0', 'flutter', 2, T0)
  assert.equal(r.ok, false)
  assert.match(r.error, /at least 3/)
})

// ── Pause / resume ───────────────────────────────────────────────────

test('pause and resume preserve the time remaining', () => {
  const s = draft(2, { timerSec: 30 })
  withAuction(s)
  pause(s, T0 + 10_000) // 20s left
  assert.equal(s.status, 'paused')
  assert.equal(s.auction.remainingMs, 20_000)

  resume(s, T0 + 600_000) // ten minutes later
  assert.equal(s.status, 'drafting')
  assert.equal(s.auction.endsAt, T0 + 600_000 + 20_000)
  assert.equal(s.auction.remainingMs, undefined)
})

test('a paused auction does not resolve itself', () => {
  const s = withAuction(draft(2))
  pause(s, T0 + 1000)
  assert.equal(applyElapsed(s, T0 + 999_999), false)
  assert.ok(s.auction, 'the auction must survive a long pause')
})

// ── Undo ─────────────────────────────────────────────────────────────

test('undo refunds the pick and returns the Pokemon to the pool', () => {
  const s = draft(3)
  withAuction(s, { bidder: 'c0', high: 10 })
  applyBid(s, 'c1', 30, T0 + 1000)
  applyElapsed(s, s.auction.endsAt + 1)
  assert.equal(spentBy(s, 'c1'), 30)

  undoLastPick(s, T0 + 100_000)
  assert.equal(spentBy(s, 'c1'), 0)
  assert.equal(s.rosters.c1.length, 0)
  // c0 nominated it, so the turn goes back to c0.
  assert.equal(currentNominator(s), 'c0')
  assert.equal(validateNomination(s, 'c0', 'flutter', 5, T0 + 100_000).ok, true)
})

test('undo reopens a finished draft', () => {
  const s = draft(2, { rosterSize: 1 })
  withAuction(s, { bidder: 'c0', high: 5 })
  applyElapsed(s, s.auction.endsAt + 1)
  withAuction(s, { bidder: 'c1', high: 5, now: T0 + 60_000 })
  applyElapsed(s, s.auction.endsAt + 1)
  assert.equal(s.status, 'done')

  undoLastPick(s, T0 + 200_000)
  assert.equal(s.status, 'drafting')
})

test('undo on a draft with no picks is harmless', () => {
  const s = draft(2)
  assert.doesNotThrow(() => undoLastPick(s, T0))
})

// ── Settings, order, and the client view ─────────────────────────────

test('settings are clamped to sane bounds', () => {
  const s = sanitizeSettings({ budget: 999_999, rosterSize: 0, timerSec: 1, minBid: 'x' })
  assert.equal(s.budget, 1000)
  assert.equal(s.rosterSize, 1)
  assert.equal(s.timerSec, 5)
  assert.equal(s.minBid, DEFAULT_SETTINGS.minBid, 'junk falls back to the default')
})

test('shuffling keeps every coach exactly once', () => {
  const s = draft(8)
  const before = s.coaches.map((c) => c.id).sort()
  let i = 0
  shuffleOrder(s, T0, () => [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4][i++ % 8])
  assert.deepEqual(s.coaches.map((c) => c.id).sort(), before)
  assert.deepEqual(s.order.slice().sort(), before)
  assert.deepEqual(s.coaches.map((c) => c.seat), [0, 1, 2, 3, 4, 5, 6, 7])
})

test('the client view never leaks tokens', () => {
  const s = draft(2)
  s.tokens = { c0: 'secret-token' }
  s.adminToken = 'admin-secret'
  const view = publicView(s, 'c0', T0)
  assert.equal(view.tokens, undefined)
  assert.equal(view.adminToken, undefined)
  assert.equal(JSON.stringify(view).includes('secret'), false)
  assert.equal(view.you.id, 'c0')
  assert.equal(view.you.maxBid, maxBidFor(s, 'c0'))
})

test('a draft needs at least two coaches to start', () => {
  const s = createDraft({ room: 'X', now: T0 })
  s.coaches.push({ id: 'c0', name: 'Solo', seat: 0 })
  s.rosters.c0 = []
  startDraft(s, T0)
  assert.equal(s.status, 'lobby')
})

// ── An eight-coach draft, end to end ─────────────────────────────────

test('a full 8-coach draft runs to completion without overspending', () => {
  const s = draft(8, { budget: 100, rosterSize: 6, minBid: 1, timerSec: 30 })
  let now = T0
  let guard = 0

  while (s.status === 'drafting' && guard++ < 200) {
    const nominator = currentNominator(s)
    const opening = Math.min(maxBidFor(s, nominator), 1 + (guard % 7))
    applyNomination(s, nominator, mon(`p${guard}`, `Pokemon ${guard}`), opening, now)

    // A rival outbids when they can afford to.
    const rival = s.order.find((id) => id !== nominator && maxBidFor(s, id) > s.auction.highBid)
    if (rival) {
      now += 1000
      applyBid(s, rival, s.auction.highBid + 1, now)
    }

    now = s.auction.endsAt + 1
    applyElapsed(s, now)
  }

  assert.equal(s.status, 'done', `draft did not finish (guard ${guard})`)
  for (const id of s.order) {
    assert.equal(s.rosters[id].length, 6, `${id} has an incomplete roster`)
    assert.ok(spentBy(s, id) <= 100, `${id} overspent: ${spentBy(s, id)}`)
  }
  // 8 coaches * 6 slots, every Pokemon distinct.
  const all = Object.values(s.rosters).flat().map((p) => p.pokemonId)
  assert.equal(all.length, 48)
  assert.equal(new Set(all).size, 48, 'a Pokemon was drafted twice')
})
