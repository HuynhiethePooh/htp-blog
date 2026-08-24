import { useCallback, useEffect, useRef, useState } from 'react'

const BASE = '/api/draft'

/** Poll fast while money is on the line, slow when nothing is happening. */
const POLL_LIVE_MS = 800
const POLL_IDLE_MS = 2500
const POLL_HIDDEN_MS = 10_000

// An idle room is the expensive case: every client polling it burns a serverless
// invocation to be told "nothing changed". Back off geometrically from POLL_IDLE_MS
// while the version holds still, and give up entirely once the room has been quiet
// for STALE_AFTER_MS -- an abandoned tab should cost nothing at all.
const POLL_IDLE_MAX_MS = 30_000
const STALE_AFTER_MS = 10 * 60 * 1000

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
 *
 * The loop is deliberately quiet when nothing is happening. It stops outright once the
 * draft is `done`, and parks itself (`stale`, cleared by `reconnect()`) after
 * STALE_AFTER_MS with no change, so a tab left open overnight stops billing us.
 */
export function useDraftState(room, token) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(true)
  const [stale, setStale] = useState(false)

  const versionRef = useRef(-1)
  const skewRef = useRef(0)
  const tokenRef = useRef(token)
  tokenRef.current = token

  // Read by nextDelay() on every tick. These have to be refs, not the `state` variable:
  // the poll loop is set up once per room, so anything it closes over is frozen at the
  // value it had when the room was joined.
  const stateRef = useRef(null)
  const missesRef = useRef(0)
  const quietSinceRef = useRef(Date.now())
  const wakeRef = useRef(null)

  /** Server time, estimated from the last response we saw. */
  const serverNow = useCallback(() => Date.now() + skewRef.current, [])

  const absorb = useCallback((payload) => {
    if (!payload) return false
    const now = payload.now ?? payload.state?.now
    if (typeof now === 'number') skewRef.current = now - Date.now()

    const changed = typeof payload.version === 'number' && payload.version !== versionRef.current
    if (typeof payload.version === 'number') versionRef.current = payload.version
    if (payload.state) {
      stateRef.current = payload.state
      setState(payload.state)
    }

    if (changed) {
      missesRef.current = 0
      quietSinceRef.current = Date.now()
    } else {
      missesRef.current += 1
    }
    return changed
  }, [])

  /** Treat this instant as activity: poll fast again, and un-park a stale loop. */
  const markActive = useCallback(() => {
    missesRef.current = 0
    quietSinceRef.current = Date.now()
    setStale(false)
  }, [])

  // Let callers fold a mutation's response straight into local state, so the board
  // updates the instant your own bid lands instead of on the next poll.
  const apply = useCallback(
    (payload) => {
      absorb(payload)
      markActive()
      wakeRef.current?.()
    },
    [absorb, markActive]
  )

  /** Restart a loop that parked itself. Wired to the "Reconnect" button. */
  const reconnect = useCallback(() => {
    markActive()
    wakeRef.current?.()
  }, [markActive])

  useEffect(() => {
    if (!room) return undefined

    let cancelled = false
    let timer = null

    const nextDelay = () => {
      if (typeof document !== 'undefined' && document.hidden) return POLL_HIDDEN_MS
      const current = stateRef.current
      if (current?.auction && current.status === 'drafting') return POLL_LIVE_MS
      // Geometric backoff, capped. Reset to POLL_IDLE_MS by any change or user action.
      const backoff = POLL_IDLE_MS * 2 ** Math.min(missesRef.current, 8)
      return Math.min(backoff, POLL_IDLE_MAX_MS)
    }

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
        missesRef.current += 1
      }
      if (cancelled) return

      // The draft is over. Nothing can change again, so stop asking forever.
      if (stateRef.current?.status === 'done') return

      // Nobody has touched this room in a long time -- assume the tab was abandoned
      // and wait for a human to ask for more.
      if (Date.now() - quietSinceRef.current >= STALE_AFTER_MS) {
        setStale(true)
        return
      }

      timer = setTimeout(tick, nextDelay())
    }

    const start = () => {
      if (cancelled) return
      clearTimeout(timer)
      tick()
    }
    wakeRef.current = start

    start()

    // Coming back to the tab should feel instant, not "wait for the slow timer".
    // Focusing the tab is also a sign of life, so it resets the backoff and the
    // abandonment clock.
    const onVisible = () => {
      if (document.hidden) return
      markActive()
      start()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      wakeRef.current = null
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [room, absorb, markActive])

  return { state, error, connected, stale, reconnect, serverNow, apply }
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
