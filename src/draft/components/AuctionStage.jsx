import { useEffect, useState } from 'react'
import { POOL } from '../data/pool.js'
import { Notice, Timer, Types } from './Bits'

const byId = new Map(POOL.map((p) => [p.id, p]))
const QUICK = [1, 2, 5, 10]

/**
 * The live auction: what's up, who's winning, how long is left, and the bid controls.
 *
 * Every number shown here comes from the server. The only thing computed locally is
 * how far the countdown has advanced since the last poll.
 */
export default function AuctionStage({ state, you, now, onBid, busy, error }) {
  const auction = state.auction
  const [custom, setCustom] = useState('')

  // A new auction should not inherit the last one's typed bid.
  useEffect(() => setCustom(''), [auction?.pokemonId])

  if (!auction) return null

  const mon = byId.get(auction.pokemonId)
  const highName = state.coaches.find((c) => c.id === auction.highBidder)?.name ?? '—'
  const youAreHigh = you && auction.highBidder === you.id
  const paused = state.status === 'paused'

  const maxBid = you?.maxBid ?? 0
  const next = auction.highBid + 1
  const canBidAtAll = Boolean(you) && !paused && you.slotsLeft > 0 && !youAreHigh && maxBid >= next

  const customNum = Math.floor(Number(custom))
  const customValid = Number.isFinite(customNum) && customNum >= next && customNum <= maxBid

  const totalMs = Math.max(state.settings.timerSec, state.settings.bidResetSec) * 1000
  const remaining = Math.max(0, auction.endsAt - now)

  const submitCustom = (e) => {
    e.preventDefault()
    if (canBidAtAll && customValid && !busy) onBid(customNum)
  }

  /** Why the bid controls are disabled, in plain language. */
  const blockedReason = () => {
    if (!you) return 'You are watching this draft — you do not have a seat.'
    if (paused) return 'The commissioner paused the draft.'
    if (you.slotsLeft <= 0) return 'Your roster is full.'
    if (youAreHigh) return 'You are the high bidder — wait to be outbid.'
    if (maxBid < next) return `You can only bid up to ${maxBid}, and it is already at ${auction.highBid}.`
    return null
  }
  const blocked = blockedReason()

  return (
    <div className="panel">
      <h2 className="panel-title">On the block</h2>
      <div className="stage">
        <div className="stage-art">
          {mon?.isMega && <span className="mega-badge">MEGA</span>}
          <img src={auction.sprite ?? mon?.sprite} alt={auction.name} />
        </div>

        <div style={{ minWidth: 0 }}>
          <h3 className="stage-name">{auction.name}</h3>
          <div style={{ marginBottom: '0.6rem' }}>
            <Types types={mon?.types} />
          </div>

          <Timer endsAt={auction.endsAt} now={now} totalMs={totalMs} paused={paused} />

          <div className="stage-bid">
            <strong>{auction.highBid}</strong>
            {youAreHigh ? (
              <span style={{ color: 'var(--good)', fontWeight: 700 }}>you are winning</span>
            ) : (
              <>high bid — {highName}</>
            )}
          </div>

          {blocked ? (
            <Notice kind="info">{blocked}</Notice>
          ) : (
            <>
              <div className="bid-row">
                <button
                  type="button"
                  className="btn-primary bid-big"
                  onClick={() => onBid(next)}
                  disabled={busy || remaining <= 0}
                >
                  Bid {next}
                </button>
                {QUICK.map((step) => {
                  const amount = auction.highBid + step
                  if (step === 1 || amount > maxBid) return null
                  return (
                    <button key={step} type="button" onClick={() => onBid(amount)} disabled={busy || remaining <= 0}>
                      +{step}
                    </button>
                  )
                })}
                <form onSubmit={submitCustom} className="bid-row" style={{ gap: '0.35rem' }}>
                  <input
                    type="number"
                    value={custom}
                    min={next}
                    max={maxBid}
                    placeholder={String(maxBid)}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-label="Custom bid amount"
                  />
                  <button type="submit" disabled={!customValid || busy || remaining <= 0}>
                    Bid
                  </button>
                </form>
              </div>
              <p className="bid-hint">
                You can bid up to <strong>{maxBid}</strong> — the rest of your {you.budgetLeft} points is
                reserved to fill {you.slotsLeft - 1} more slot{you.slotsLeft - 1 === 1 ? '' : 's'}.
              </p>
            </>
          )}

          <Notice kind="error">{error}</Notice>
        </div>
      </div>
    </div>
  )
}
