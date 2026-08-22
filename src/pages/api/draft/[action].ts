import type { APIRoute } from 'astro'

import { POOL } from '../../../draft/data/pool.js'
import {
  DraftError,
  isPersistent,
  getStore,
  loadDraft,
  mutate,
  newToken,
  reserveRoom,
} from '../../../server/draftStore.js'
import {
  applyBid,
  applyElapsed,
  applyNomination,
  cancelAuction,
  createDraft,
  forceSell,
  log,
  pause,
  publicView,
  resume,
  sanitizeSettings,
  shuffleOrder,
  startDraft,
  undoLastPick,
  validateBid,
  validateNomination,
} from '../../../draft/lib/rules.js'

// This is the only part of the site that runs on a server; everything else stays
// statically prerendered.
export const prerender = false

const MAX_COACHES = 12
const MAX_NAME = 24

const byId = new Map(POOL.map((p) => [p.id, p]))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const oops = (message: string, status = 400) => json({ error: message }, status)

/** Trim, collapse whitespace, and cap a user-supplied display name. */
const cleanName = (raw: unknown) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)

/** Resolve the caller's coach id from their bearer token. */
function whoami(state: any, token: unknown): string | null {
  if (!token || typeof token !== 'string') return null
  return state.tokens?.[token] ?? null
}

const isAdmin = (state: any, token: unknown) =>
  typeof token === 'string' && token.length > 0 && state.adminToken === token

/** Run `apply` against the room, folding in any elapsed-clock work first. */
async function withDraft(room: string, apply: (state: any, now: number) => any) {
  return mutate(room, (state) => {
    const now = Date.now()
    const elapsed = applyElapsed(state, now)
    const outcome = apply(state, now)
    // Nothing to persist unless the clock or the action changed something.
    if (!elapsed && outcome?.skipWrite) return outcome
    return { ...outcome, skipWrite: false }
  })
}

export const GET: APIRoute = async ({ params, url }) => {
  // /api/draft/health -- confirms which store is live without exposing credentials.
  // Worth hitting once after a deploy: "memory" means drafts will lose state.
  if (params.action === 'health') {
    const store = getStore()
    let reachable = null
    if (store.name !== 'memory') {
      try {
        await store.load('__healthcheck__')
        reachable = true
      } catch {
        reachable = false
      }
    }
    return json({
      store: store.name,
      persistent: isPersistent(),
      reachable,
      ok: isPersistent() && reachable !== false,
      pool: POOL.length,
    })
  }

  if (params.action !== 'state') return oops('Unknown action.', 404)

  const room = (url.searchParams.get('room') ?? '').toUpperCase()
  const token = url.searchParams.get('token')
  const since = Number(url.searchParams.get('v') ?? -1)
  if (!room) return oops('Missing room code.')

  try {
    // Peek first: if the clock owes nothing and the caller is already current, answer
    // without a write. This is what keeps 8 clients polling within the free tier.
    const { state, version } = await loadDraft(room)
    const now = Date.now()
    const needsWork = applyElapsed(structuredClone(state), now)

    if (!needsWork && version === since) {
      return json({ unchanged: true, version, now, persistent: isPersistent() })
    }

    const fresh = await withDraft(room, () => ({ skipWrite: true }))
    return json({
      state: publicView(fresh.state, whoami(fresh.state, token), Date.now()),
      version: fresh.version,
      persistent: isPersistent(),
    })
  } catch (err) {
    return handle(err)
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return oops('Malformed request body.')
  }

  const action = params.action
  const room = String(body?.room ?? '').toUpperCase()

  try {
    if (action === 'create') return await handleCreate(body)

    if (!room) return oops('Missing room code.')

    switch (action) {
      case 'join':
        return await handleJoin(room, body)
      case 'nominate':
        return await handleNominate(room, body)
      case 'bid':
        return await handleBid(room, body)
      case 'admin':
        return await handleAdmin(room, body)
      default:
        return oops('Unknown action.', 404)
    }
  } catch (err) {
    return handle(err)
  }
}

function handle(err: unknown) {
  if (err instanceof DraftError) return oops(err.message, err.status)
  console.error('[draft]', err)
  return oops('Something went wrong on our end.', 500)
}

/** Standard success envelope: the caller's view of the new state. */
const stateResponse = (state: any, version: number, coachId: string | null, extra: object = {}) =>
  json({ ...extra, state: publicView(state, coachId, Date.now()), version })

// ── Actions ──────────────────────────────────────────────────────────

async function handleCreate(body: any) {
  const name = cleanName(body?.name)
  if (!name) return oops('Enter your name first.')

  const now = Date.now()
  const state: any = createDraft({ room: 'PENDING', adminName: name, settings: body?.settings, now })

  // The commissioner takes the first seat -- they're drafting too.
  const coachId = 'c1'
  const token = newToken()
  const adminToken = newToken()
  state.coaches.push({ id: coachId, name, seat: 0 })
  state.rosters[coachId] = []
  state.tokens = { [token]: coachId }
  state.adminToken = adminToken
  state.nextSeat = 2

  const room = await reserveRoom(state)
  return json({
    room,
    coachId,
    token,
    adminToken,
    state: publicView(state, coachId, now),
    version: 1,
    persistent: isPersistent(),
  })
}

async function handleJoin(room: string, body: any) {
  const name = cleanName(body?.name)
  if (!name) return oops('Enter your name first.')

  const issued = { coachId: '', token: '' }

  const { state, version, result } = await withDraft(room, (draft, now) => {
    const existing = draft.coaches.find((c: any) => c.name.toLowerCase() === name.toLowerCase())

    if (existing) {
      // Taking a seat back over after losing a session (cleared storage, dead phone).
      // Deliberate rather than accidental: the client asks for confirmation first.
      if (!body?.reclaim) {
        return { skipWrite: true, error: `"${name}" is already seated. Is that you?`, canReclaim: true }
      }
      for (const [tok, id] of Object.entries(draft.tokens ?? {})) {
        if (id === existing.id) delete draft.tokens[tok]
      }
      const token = newToken()
      draft.tokens[token] = existing.id
      issued.coachId = existing.id
      issued.token = token
      log(draft, now, { type: 'reclaimed', coachId: existing.id, name })
      return {}
    }

    if (draft.status !== 'lobby') return { skipWrite: true, error: 'This draft has already started.' }
    if (draft.coaches.length >= MAX_COACHES) return { skipWrite: true, error: 'This draft is full.' }

    const seat = draft.nextSeat ?? draft.coaches.length + 1
    const coachId = `c${seat}`
    const token = newToken()
    draft.nextSeat = seat + 1
    draft.coaches.push({ id: coachId, name, seat: draft.coaches.length })
    draft.rosters[coachId] = []
    draft.tokens[token] = coachId
    issued.coachId = coachId
    issued.token = token
    log(draft, now, { type: 'joined', coachId, name })
    return {}
  })

  if (result?.error) return json({ error: result.error, canReclaim: result.canReclaim ?? false }, 409)
  return stateResponse(state, version, issued.coachId, { coachId: issued.coachId, token: issued.token })
}

async function handleNominate(room: string, body: any) {
  const pokemon = byId.get(String(body?.pokemonId))
  if (!pokemon) return oops('That Pokémon is not in Regulation M-B.')

  let coachId: string | null = null
  const { state, version, result } = await withDraft(room, (draft, now) => {
    coachId = whoami(draft, body?.token)
    if (!coachId) return { skipWrite: true, error: 'Your seat is not recognized — rejoin the draft.' }

    const check = validateNomination(draft, coachId, pokemon.id, body?.openingBid, now)
    if (!check.ok) return { skipWrite: true, error: check.error }

    applyNomination(draft, coachId, pokemon, body.openingBid, now)
    return {}
  })

  if (result?.error) return json({ error: result.error }, 409)
  return stateResponse(state, version, coachId)
}

async function handleBid(room: string, body: any) {
  let coachId: string | null = null

  const { state, version, result } = await withDraft(room, (draft, now) => {
    coachId = whoami(draft, body?.token)
    if (!coachId) return { skipWrite: true, error: 'Your seat is not recognized — rejoin the draft.' }

    const check = validateBid(draft, coachId, body?.amount, now)
    if (!check.ok) return { skipWrite: true, error: check.error }

    applyBid(draft, coachId, body.amount, now)
    return {}
  })

  // 409 rather than 400: by the time a bid lands, losing the race is normal, not a bug.
  if (result?.error) return json({ error: result.error, state: publicView(state, coachId, Date.now()), version }, 409)
  return stateResponse(state, version, coachId)
}

async function handleAdmin(room: string, body: any) {
  const op = String(body?.op ?? '')
  let coachId: string | null = null

  const { state, version, result } = await withDraft(room, (draft, now) => {
    coachId = whoami(draft, body?.token)
    if (!isAdmin(draft, body?.adminToken)) {
      return { skipWrite: true, error: 'Only the commissioner can do that.' }
    }

    switch (op) {
      case 'start': {
        if (draft.coaches.length < 2) return { skipWrite: true, error: 'You need at least two coaches.' }
        startDraft(draft, now)
        return {}
      }
      case 'pause':
        pause(draft, now)
        return {}
      case 'resume':
        resume(draft, now)
        return {}
      case 'forceSell':
        if (!draft.auction) return { skipWrite: true, error: 'No auction is running.' }
        forceSell(draft, now)
        return {}
      case 'cancelAuction':
        if (!draft.auction) return { skipWrite: true, error: 'No auction is running.' }
        cancelAuction(draft, now)
        return {}
      case 'undo':
        undoLastPick(draft, now)
        return {}
      case 'shuffle':
        if (draft.status !== 'lobby') return { skipWrite: true, error: 'Shuffle the order before starting.' }
        shuffleOrder(draft, now)
        return {}
      case 'settings': {
        if (draft.status !== 'lobby') return { skipWrite: true, error: 'Settings are locked once the draft starts.' }
        draft.settings = sanitizeSettings(body?.settings, draft.settings)
        return {}
      }
      case 'removeCoach': {
        if (draft.status !== 'lobby') return { skipWrite: true, error: 'Coaches can only be removed before the draft starts.' }
        const target = String(body?.coachId ?? '')
        draft.coaches = draft.coaches.filter((c: any) => c.id !== target)
        draft.coaches.forEach((c: any, i: number) => (c.seat = i))
        draft.order = draft.coaches.map((c: any) => c.id)
        delete draft.rosters[target]
        for (const [tok, id] of Object.entries(draft.tokens ?? {})) {
          if (id === target) delete draft.tokens[tok]
        }
        return {}
      }
      default:
        return { skipWrite: true, error: `Unknown command "${op}".` }
    }
  })

  if (result?.error) return json({ error: result.error }, 403)
  return stateResponse(state, version, coachId)
}
