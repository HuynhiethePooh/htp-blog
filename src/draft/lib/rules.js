/**
 * Auction draft rules. Pure functions over a plain-JSON draft state -- no I/O, no
 * clock reads (callers pass `now`), no randomness. Everything here is unit tested in
 * rules.test.mjs, and the API layer is the only thing that touches storage.
 *
 * The server is the sole authority on time: `auction.endsAt` is an absolute epoch-ms
 * timestamp, and clients only ever render a countdown toward it.
 */

export const DEFAULT_SETTINGS = {
  budget: 100,
  rosterSize: 6,
  minBid: 1,
  timerSec: 30, // fresh auction clock after a nomination
  bidResetSec: 15, // clock a bid resets to, when it would otherwise end sooner
  nominationSec: 60, // time a coach has to nominate before we skip them
}

export const MAX_LOG = 200

/** Settings a commissioner may change, with the bounds we accept. */
export const SETTINGS_BOUNDS = {
  budget: [10, 1000],
  rosterSize: [1, 12],
  minBid: [1, 50],
  timerSec: [5, 300],
  bidResetSec: [3, 300],
  nominationSec: [10, 600],
}

export function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const out = { ...base }
  for (const [key, [lo, hi]] of Object.entries(SETTINGS_BOUNDS)) {
    if (input?.[key] == null) continue
    const n = Math.floor(Number(input[key]))
    if (!Number.isFinite(n)) continue
    out[key] = Math.min(hi, Math.max(lo, n))
  }
  return out
}

// ── Roster / budget math ─────────────────────────────────────────────

export const rosterOf = (state, coachId) => state.rosters?.[coachId] ?? []

export const spentBy = (state, coachId) =>
  rosterOf(state, coachId).reduce((sum, pick) => sum + pick.price, 0)

export const slotsLeft = (state, coachId) =>
  state.settings.rosterSize - rosterOf(state, coachId).length

/**
 * The most a coach can bid right now.
 *
 * Winning this auction fills one of their open slots, so they must still be able to
 * afford `minBid` for every *other* slot they have left. This is what stops someone
 * from spending down to 0 with an unfillable roster.
 */
export function maxBidFor(state, coachId) {
  const left = slotsLeft(state, coachId)
  if (left <= 0) return 0
  const reserve = (left - 1) * state.settings.minBid
  return state.settings.budget - spentBy(state, coachId) - reserve
}

export const budgetLeft = (state, coachId) => state.settings.budget - spentBy(state, coachId)

export const isDrafted = (state, pokemonId) =>
  Object.values(state.rosters ?? {}).some((picks) => picks.some((p) => p.pokemonId === pokemonId))

export const coachById = (state, coachId) => state.coaches.find((c) => c.id === coachId) ?? null

// ── Turn order ───────────────────────────────────────────────────────

/** Coaches still able to nominate (roster not full), in seat order. */
const eligibleNominators = (state) => state.order.filter((id) => slotsLeft(state, id) > 0)

export const currentNominator = (state) => state.order[state.nominatorIdx] ?? null

/**
 * Advance to the next coach with roster space. Marks the draft done when nobody has
 * space left. Wraps around; safe when the current nominator just filled their roster.
 */
export function advanceNominator(state, now) {
  if (eligibleNominators(state).length === 0) {
    state.status = 'done'
    state.nominationDeadline = null
    log(state, now, { type: 'draft_done' })
    return state
  }

  const n = state.order.length
  for (let step = 1; step <= n; step++) {
    const idx = (state.nominatorIdx + step) % n
    if (slotsLeft(state, state.order[idx]) > 0) {
      state.nominatorIdx = idx
      break
    }
  }
  state.nominationDeadline = now + state.settings.nominationSec * 1000
  return state
}

// ── Log ──────────────────────────────────────────────────────────────

export function log(state, now, entry) {
  state.log.push({ t: now, ...entry })
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG)
  return state
}

// ── Validation ───────────────────────────────────────────────────────

/**
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateBid(state, coachId, amount, now) {
  if (state.status !== 'drafting') return fail('The draft is not running right now.')
  if (!state.auction) return fail('Nothing is up for auction.')
  if (now >= state.auction.endsAt) return fail('That auction just closed.')
  if (!coachById(state, coachId)) return fail('You are not seated in this draft.')

  const amt = Math.floor(Number(amount))
  if (!Number.isFinite(amt)) return fail('That is not a number.')
  if (slotsLeft(state, coachId) <= 0) return fail('Your roster is already full.')
  if (state.auction.highBidder === coachId) return fail('You are already the high bidder.')
  if (amt <= state.auction.highBid) return fail(`You need to beat ${state.auction.highBid}.`)

  const max = maxBidFor(state, coachId)
  if (amt > max) {
    return fail(
      max <= 0
        ? 'You have no points left to bid.'
        : `You can only bid up to ${max} — the rest is reserved to fill your roster.`
    )
  }
  return { ok: true }
}

export function validateNomination(state, coachId, pokemonId, openingBid, now) {
  if (state.status !== 'drafting') return fail('The draft is not running right now.')
  if (state.auction) return fail('An auction is already in progress.')
  if (currentNominator(state) !== coachId) return fail('It is not your turn to nominate.')
  if (!pokemonId) return fail('Pick a Pokémon first.')
  if (isDrafted(state, pokemonId)) return fail('That Pokémon is already on a team.')

  const amt = Math.floor(Number(openingBid))
  if (!Number.isFinite(amt)) return fail('That is not a number.')
  if (amt < state.settings.minBid) return fail(`The opening bid must be at least ${state.settings.minBid}.`)

  const max = maxBidFor(state, coachId)
  if (amt > max) return fail(`You can only open up to ${max}.`)
  return { ok: true }
}

const fail = (error) => ({ ok: false, error })

// ── Mutations ────────────────────────────────────────────────────────
// These mutate `state` in place and return it. The API layer always works on a state
// freshly loaded from storage inside a compare-and-set retry loop, so in-place is safe.

export function applyNomination(state, coachId, pokemon, openingBid, now) {
  const amt = Math.floor(Number(openingBid))
  state.auction = {
    pokemonId: pokemon.id,
    name: pokemon.name,
    sprite: pokemon.sprite,
    nominatedBy: coachId,
    highBid: amt,
    highBidder: coachId,
    bidCount: 1,
    endsAt: now + state.settings.timerSec * 1000,
  }
  state.nominationDeadline = null
  return log(state, now, { type: 'nominate', coachId, pokemonId: pokemon.id, name: pokemon.name, amount: amt })
}

/**
 * Record a bid and, if it landed late, push the clock back out.
 *
 * A bid never *shortens* the auction: `endsAt` only moves forward. This is the
 * anti-snipe rule that keeps a laggy phone from losing to a 200ms head start.
 */
export function applyBid(state, coachId, amount, now) {
  const amt = Math.floor(Number(amount))
  const a = state.auction
  a.highBid = amt
  a.highBidder = coachId
  a.bidCount += 1
  a.endsAt = Math.max(a.endsAt, now + state.settings.bidResetSec * 1000)
  return log(state, now, { type: 'bid', coachId, amount: amt, pokemonId: a.pokemonId, name: a.name })
}

/**
 * Award the live auction to its high bidder.
 *
 * Serverless has no background timer, so this is called lazily by whichever request
 * first observes the clock has run out -- with eight clients polling, that lands
 * within about a second of expiry.
 */
export function resolveAuction(state, now) {
  const a = state.auction
  if (!a) return state

  const winner = a.highBidder
  state.rosters[winner] = state.rosters[winner] ?? []
  state.rosters[winner].push({
    pokemonId: a.pokemonId,
    name: a.name,
    sprite: a.sprite,
    price: a.highBid,
    wonAt: now,
  })
  log(state, now, { type: 'sold', coachId: winner, pokemonId: a.pokemonId, name: a.name, amount: a.highBid })
  state.auction = null
  return advanceNominator(state, now)
}

/**
 * Apply anything the clock owes us: close an expired auction, or skip a coach who sat
 * on their nomination. Returns whether the state actually changed, so a plain poll
 * doesn't burn a write.
 */
export function applyElapsed(state, now) {
  let changed = false

  if (state.status === 'drafting' && state.auction && now >= state.auction.endsAt) {
    resolveAuction(state, now)
    changed = true
  }

  if (
    state.status === 'drafting' &&
    !state.auction &&
    state.nominationDeadline &&
    now >= state.nominationDeadline
  ) {
    const skipped = currentNominator(state)
    log(state, now, { type: 'nomination_skipped', coachId: skipped })
    advanceNominator(state, now)
    changed = true
  }

  return changed
}

// ── Commissioner actions ─────────────────────────────────────────────

/** Freeze both clocks, remembering how much time was left. */
export function pause(state, now) {
  if (state.status !== 'drafting') return state
  state.status = 'paused'
  state.pausedAt = now
  if (state.auction) state.auction.remainingMs = Math.max(0, state.auction.endsAt - now)
  if (state.nominationDeadline) state.nominationRemainingMs = Math.max(0, state.nominationDeadline - now)
  return log(state, now, { type: 'paused' })
}

export function resume(state, now) {
  if (state.status !== 'paused') return state
  state.status = 'drafting'
  if (state.auction) {
    state.auction.endsAt = now + (state.auction.remainingMs ?? state.settings.timerSec * 1000)
    delete state.auction.remainingMs
  }
  if (state.nominationRemainingMs != null) {
    state.nominationDeadline = now + state.nominationRemainingMs
    delete state.nominationRemainingMs
  }
  delete state.pausedAt
  return log(state, now, { type: 'resumed' })
}

/** Close the current auction early, awarding it to the standing high bidder. */
export function forceSell(state, now) {
  if (!state.auction) return state
  return resolveAuction(state, now)
}

/** Throw out the live auction with no winner and hand the nomination back. */
export function cancelAuction(state, now) {
  if (!state.auction) return state
  const { pokemonId, name } = state.auction
  state.auction = null
  log(state, now, { type: 'auction_cancelled', pokemonId, name })
  state.nominationDeadline = now + state.settings.nominationSec * 1000
  return state
}

/**
 * Undo the most recent completed pick: refund it, return the Pokémon to the pool, and
 * set the nomination back to whoever nominated it. Every real draft needs this.
 */
export function undoLastPick(state, now) {
  let latest = null
  for (const [coachId, picks] of Object.entries(state.rosters)) {
    picks.forEach((pick, idx) => {
      if (!latest || pick.wonAt > latest.pick.wonAt) latest = { coachId, idx, pick }
    })
  }
  if (!latest) return state

  state.rosters[latest.coachId].splice(latest.idx, 1)
  state.auction = null
  if (state.status === 'done') state.status = 'drafting'

  // Hand the turn back to whoever nominated the undone pick.
  const nomIdx = state.order.indexOf(
    [...state.log].reverse().find((e) => e.type === 'nominate' && e.pokemonId === latest.pick.pokemonId)
      ?.coachId ?? latest.coachId
  )
  if (nomIdx >= 0) state.nominatorIdx = nomIdx
  state.nominationDeadline = now + state.settings.nominationSec * 1000

  return log(state, now, {
    type: 'undo',
    coachId: latest.coachId,
    pokemonId: latest.pick.pokemonId,
    name: latest.pick.name,
    amount: latest.pick.price,
  })
}

// ── Construction ─────────────────────────────────────────────────────

export function createDraft({ room, adminName, settings, now }) {
  return {
    room,
    version: 0,
    createdAt: now,
    status: 'lobby',
    settings: sanitizeSettings(settings),
    adminName: adminName ?? 'Commissioner',
    coaches: [],
    order: [],
    nominatorIdx: 0,
    rosters: {},
    auction: null,
    nominationDeadline: null,
    log: [{ t: now, type: 'created' }],
  }
}

export function startDraft(state, now) {
  if (state.status !== 'lobby') return state
  if (state.coaches.length < 2) return state
  state.status = 'drafting'
  state.order = state.coaches.map((c) => c.id)
  state.nominatorIdx = 0
  state.nominationDeadline = now + state.settings.nominationSec * 1000
  return log(state, now, { type: 'draft_started' })
}

/** Fisher-Yates over the seating order. Caller supplies randomness for testability. */
export function shuffleOrder(state, now, rand = Math.random) {
  const ids = state.coaches.map((c) => c.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  state.coaches = ids.map((id, seat) => ({ ...coachById(state, id), seat }))
  state.order = ids
  return log(state, now, { type: 'order_shuffled' })
}

/**
 * The view a specific client gets: full public state plus what *they* are allowed to
 * do. Secrets (tokens) never leave the server.
 */
export function publicView(state, coachId, now) {
  const { tokens, adminToken, ...rest } = state
  return {
    ...rest,
    now,
    you: coachId
      ? {
          id: coachId,
          maxBid: maxBidFor(state, coachId),
          budgetLeft: budgetLeft(state, coachId),
          slotsLeft: slotsLeft(state, coachId),
          isNominating: currentNominator(state) === coachId,
        }
      : null,
  }
}
