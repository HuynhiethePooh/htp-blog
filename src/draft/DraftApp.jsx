import { useCallback, useEffect, useMemo, useState } from 'react'

import { clearSession, loadSession, post, saveSession, useDraftState, useTicker } from './lib/api.js'
import { currentNominator } from './lib/rules.js'
import AuctionStage from './components/AuctionStage'
import CoachBoard from './components/CoachBoard'
import DraftLog from './components/DraftLog'
import Landing from './components/Landing'
import Lobby from './components/Lobby'
import NominatePanel from './components/NominatePanel'
import Results from './components/Results'
import { Notice } from './components/Bits'
import './draft.css'

const roomFromUrl = () => (new URLSearchParams(window.location.search).get('r') ?? '').toUpperCase()

export default function DraftApp() {
  const [room, setRoom] = useState('')
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [joinPrompt, setJoinPrompt] = useState(null)
  const [ready, setReady] = useState(false)

  // Restore the room from the URL and the seat from this browser.
  useEffect(() => {
    const r = roomFromUrl()
    if (r) {
      setRoom(r)
      setSession(loadSession(r))
    }
    setReady(true)
  }, [])

  const { state, error: streamError, connected, stale, reconnect, serverNow, apply } = useDraftState(
    room,
    session?.token
  )

  // Tick locally so the countdown moves smoothly between polls.
  useTicker(Boolean(state?.auction) && state?.status === 'drafting')

  const enterRoom = useCallback((code, sess) => {
    setRoom(code)
    setSession(sess)
    saveSession(code, sess)
    const url = new URL(window.location.href)
    url.searchParams.set('r', code)
    window.history.replaceState({}, '', url)
  }, [])

  /** Wrap a mutation: manage the busy flag, surface errors, fold the response in. */
  const run = useCallback(
    async (fn) => {
      setBusy(true)
      setActionError(null)
      try {
        return await fn()
      } catch (err) {
        setActionError(err.message)
        // A rejected bid still ships fresh state, so the board corrects itself.
        if (err.payload?.state) apply(err.payload)
        return null
      } finally {
        setBusy(false)
      }
    },
    [apply]
  )

  const handleCreate = (name) =>
    run(async () => {
      const res = await post('create', { name })
      enterRoom(res.room, { token: res.token, adminToken: res.adminToken, coachId: res.coachId })
      apply(res)
    })

  const handleJoin = (code, name, reclaim = false) =>
    run(async () => {
      try {
        const res = await post('join', { room: code, name, reclaim })
        setJoinPrompt(null)
        enterRoom(code, { token: res.token, coachId: res.coachId })
        apply(res)
      } catch (err) {
        // The name is taken — offer to take the seat back rather than dead-ending.
        if (err.payload?.canReclaim) {
          setJoinPrompt({ code, name })
          throw new Error(err.message)
        }
        throw err
      }
    })

  const handleBid = (amount) =>
    run(async () => apply(await post('bid', { room, token: session?.token, amount })))

  const handleNominate = (pokemonId, openingBid) =>
    run(async () => apply(await post('nominate', { room, token: session?.token, pokemonId, openingBid })))

  const handleAdmin = (op, extra = {}) =>
    run(async () =>
      apply(await post('admin', { room, token: session?.token, adminToken: session?.adminToken, op, ...extra }))
    )

  const draftedIds = useMemo(() => {
    const ids = new Set()
    for (const picks of Object.values(state?.rosters ?? {})) for (const p of picks) ids.add(p.pokemonId)
    return ids
  }, [state])

  const shareUrl = useMemo(
    () => (typeof window === 'undefined' ? '' : `${window.location.origin}/draft?r=${room}`),
    [room]
  )

  if (!ready) return <div className="draft-root" />

  // ── No seat in this browser: create a draft or claim a seat ────────
  if (!room || !session) {
    return (
      <div className="draft-root">
        <Landing
          initialRoom={room}
          onCreate={handleCreate}
          onJoin={(code, name) => handleJoin(code, name)}
          busy={busy}
          error={actionError ?? streamError}
        />
        {joinPrompt && (
          <div className="centered" style={{ minHeight: 0, paddingTop: 0 }}>
            <div className="card">
              <Notice kind="warn">
                <strong>{joinPrompt.name}</strong> already has a seat in {joinPrompt.code}. If that's you —
                you refreshed, or switched device — take it back. The other device will be signed out.
              </Notice>
              <div className="bid-row" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleJoin(joinPrompt.code, joinPrompt.name, true)}
                  disabled={busy}
                >
                  That's me — take my seat back
                </button>
                <button type="button" onClick={() => setJoinPrompt(null)}>
                  Use a different name
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (streamError) {
    return (
      <div className="draft-root">
        <div className="centered">
          <div className="card center">
            <h1>Draft not found</h1>
            <p className="sub">{streamError}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                clearSession(room)
                window.location.href = '/draft'
              }}
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="draft-root">
        <div className="centered">
          <p className="muted">Loading draft {room}…</p>
        </div>
      </div>
    )
  }

  const you = state.you
  const isAdmin = Boolean(session?.adminToken)
  const now = serverNow()

  // The poll loop parks itself once a room has been quiet for a while, so an
  // abandoned tab stops costing us. Getting live again is one click.
  const staleBanner = stale ? (
    <Notice kind="warn">
      Live updates paused after a quiet spell.{' '}
      <button type="button" className="btn-inline" onClick={reconnect}>
        Reconnect
      </button>
    </Notice>
  ) : null

  if (state.status === 'lobby') {
    return (
      <div className="draft-root">
        {staleBanner}
        <Lobby
          state={state}
          you={you}
          isAdmin={isAdmin}
          shareUrl={shareUrl}
          onAdmin={handleAdmin}
          busy={busy}
          error={actionError}
        />
      </div>
    )
  }

  const nominatorId = currentNominator(state)
  const nominatorName = state.coaches.find((c) => c.id === nominatorId)?.name ?? '—'
  const canNominate = Boolean(you) && state.status === 'drafting' && !state.auction && nominatorId === you.id
  const done = state.status === 'done'

  return (
    <div className="draft-root">
      <div className="draft-shell">
        {staleBanner}
        <div className="draft-topbar">
          <div className="topbar-id">
            <span className="room-code">{state.room}</span>
            <span className="muted small">
              {done
                ? 'Draft complete'
                : state.status === 'paused'
                  ? 'Paused'
                  : state.auction
                    ? 'Auction live'
                    : `${nominatorName} is on the clock`}
            </span>
            {!connected && <span className="muted small">· reconnecting…</span>}
          </div>

          {you && (
            <div className="topbar-stats">
              <div className="stat">
                <span className="stat-label">Points left</span>
                <span className="stat-value">{you.budgetLeft}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Max bid</span>
                <span className="stat-value">{you.maxBid}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Slots</span>
                <span className="stat-value">
                  {state.settings.rosterSize - you.slotsLeft}/{state.settings.rosterSize}
                </span>
              </div>
            </div>
          )}
        </div>

        {state.persistent === false && (
          <Notice kind="warn">
            Running on in-memory storage — state is not shared between function invocations and will be lost
            on restart. Fine for local testing; set the Upstash Redis environment variables in Netlify before
            drafting for real.
          </Notice>
        )}

        {isAdmin && !done && (
          <div className="panel" style={{ padding: '0.6rem 1rem' }}>
            <div className="spread">
              <span className="panel-title" style={{ margin: 0 }}>
                Commissioner
              </span>
              <div className="admin-bar">
                {state.status === 'paused' ? (
                  <button type="button" onClick={() => handleAdmin('resume')} disabled={busy}>
                    Resume
                  </button>
                ) : (
                  <button type="button" onClick={() => handleAdmin('pause')} disabled={busy}>
                    Pause
                  </button>
                )}
                <button type="button" onClick={() => handleAdmin('forceSell')} disabled={busy || !state.auction}>
                  Sell now
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => handleAdmin('cancelAuction')}
                  disabled={busy || !state.auction}
                >
                  Cancel auction
                </button>
                <button type="button" className="btn-danger" onClick={() => handleAdmin('undo')} disabled={busy}>
                  Undo last pick
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="draft-columns">
          <div>
            {done ? (
              <Results state={state} youId={you?.id} />
            ) : (
              <>
                {state.auction && (
                  <AuctionStage
                    state={state}
                    you={you}
                    now={now}
                    onBid={handleBid}
                    busy={busy}
                    error={actionError}
                  />
                )}

                {!state.auction && !canNominate && (
                  <div className="panel center">
                    <h2 className="panel-title">Waiting</h2>
                    <p className="muted" style={{ margin: 0 }}>
                      <strong>{nominatorName}</strong> is choosing who goes up next.
                    </p>
                  </div>
                )}

                <NominatePanel
                  draftedIds={draftedIds}
                  canNominate={canNominate}
                  minBid={state.settings.minBid}
                  maxBid={you?.maxBid ?? 0}
                  onNominate={handleNominate}
                  busy={busy}
                  error={canNominate ? actionError : null}
                />
              </>
            )}
          </div>

          <div>
            <CoachBoard state={state} youId={you?.id} />
            <DraftLog state={state} />
          </div>
        </div>
      </div>
    </div>
  )
}
