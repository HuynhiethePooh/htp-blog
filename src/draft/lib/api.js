import { useCallback, useEffect, useRef, useState } from 'react'

const BASE = '/api/draft'

/** Poll fast while money is on the line, slow when nothing is happening. */
const POLL_LIVE_MS = 800
const POLL_IDLE_MS = 2500
const POLL_HIDDEN_MS = 10_000

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request(path, options) {
  let res
  try {
    res = await fetch(`${BASE}/${path}`, options)
  } catch {
    throw new ApiError('Lost connection to the draft.', 0, null)
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status, body)
  return body
}

export const post = (action, body) =>
  request(action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

export const fetchState = (room, token, version) => {
  const qs = new URLSearchParams({ room, v: String(version ?? -1) })
  if (token) qs.set('token', token)
  return request(`state?${qs}`)
}

// ── Session persistence ──────────────────────────────────────────────
// A seat is bound to a browser, so a refresh mid-draft puts you back in your seat.

const KEY = 'htp-draft-session'

export function loadSession(room) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return all[room] ?? null
  } catch {
    return null
  }
}

export function saveSession(room, session) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    all[room] = { ...(all[room] ?? {}), ...session }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private browsing, storage disabled -- the draft still works for this tab */
  }
}

export function clearSession(room) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    delete all[room]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* nothing to clean up */
  }
}

// ── Live state ───────────────────────────────────────────────────────

/**
 * Subscribe to a room.
 *
 * Returns the latest server state plus `serverNow()`, which converts the local clock
 * into server time. Every countdown in the UI goes through it: the server owns the
 * deadline, and a viewer whose laptop clock is three minutes fast must still see the
 * same time remaining as everyone else.
 */
export function useDraftState(room, token) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(true)

  const versionRef = useRef(-1)
  const skewRef = useRef(0)
  const tokenRef = useRef(token)
  tokenRef.current = token

  /** Server time, estimated from the last response we saw. */
  const serverNow = useCallback(() => Date.now() + skewRef.current, [])

  const absorb = useCallback((payload) => {
    if (!payload) return
    if (typeof payload.version === 'number') versionRef.current = payload.version
    const now = payload.now ?? payload.state?.now
    if (typeof now === 'number') skewRef.current = now - Date.now()
    if (payload.state) setState(payload.state)
  }, [])

  // Let callers fold a mutation's response straight into local state, so the board
  // updates the instant your own bid lands instead of on the next poll.
  const apply = useCallback((payload) => absorb(payload), [absorb])

  useEffect(() => {
    if (!room) return undefined

    let cancelled = false
    let timer = null

    const tick = async () => {
      if (cancelled) return
      try {
        const payload = await fetchState(room, tokenRef.current, versionRef.current)
        if (cancelled) return
        absorb(payload)
        setConnected(true)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err.status === 404) {
          setError(err.message)
          return // stop polling a room that does not exist
        }
        setConnected(false)
      }
      if (!cancelled) timer = setTimeout(tick, nextDelay())
    }

    const nextDelay = () => {
      if (typeof document !== 'undefined' && document.hidden) return POLL_HIDDEN_MS
      return state?.auction && state.status === 'drafting' ? POLL_LIVE_MS : POLL_IDLE_MS
    }

    tick()

    // Coming back to the tab should feel instant, not "wait for the slow timer".
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // `state` is intentionally excluded: re-subscribing on every state change would
    // restart the poll loop constantly. nextDelay() reads it via closure on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, absorb])

  return { state, error, connected, serverNow, apply, setState }
}

/**
 * Re-render roughly 10x/second so countdowns tick smoothly between polls.
 * Returns a monotonically increasing counter; callers just need the re-render.
 */
export function useTicker(active = true, intervalMs = 100) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}
