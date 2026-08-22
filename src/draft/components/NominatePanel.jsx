import { useMemo, useState } from 'react'
import { POOL } from '../data/pool.js'
import { Notice, Types } from './Bits'

const TYPES = [...new Set(POOL.flatMap((p) => p.types))].sort()

/**
 * Searchable Reg M-B pool. Doubles as a read-only browser for coaches who aren't on
 * the clock, so everyone can scout while waiting.
 */
export default function NominatePanel({ draftedIds, canNominate, minBid, maxBid, onNominate, busy, error }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showDrafted, setShowDrafted] = useState(false)
  const [megaOnly, setMegaOnly] = useState(false)
  const [selected, setSelected] = useState(null)
  const [opening, setOpening] = useState(String(minBid))

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return POOL.filter((p) => {
      if (!showDrafted && draftedIds.has(p.id)) return false
      if (megaOnly && !p.isMega) return false
      if (typeFilter && !p.types.includes(typeFilter)) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.species.toLowerCase().includes(q)) return false
      return true
    })
  }, [query, typeFilter, showDrafted, megaOnly, draftedIds])

  const openingNum = Math.floor(Number(opening))
  const validOpening = Number.isFinite(openingNum) && openingNum >= minBid && openingNum <= maxBid
  const canSubmit = canNominate && selected && validOpening && !busy

  const submit = (e) => {
    e.preventDefault()
    if (canSubmit) onNominate(selected.id, openingNum)
  }

  return (
    <div className="panel">
      <h2 className="panel-title">
        {canNominate ? 'You are on the clock — nominate a Pokémon' : `Pool · ${visible.length} shown`}
      </h2>

      <div className="pool-controls">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 310 Pokémon…"
          aria-label="Search the Regulation M-B pool"
          autoComplete="off"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setMegaOnly((v) => !v)} aria-pressed={megaOnly}>
          {megaOnly ? '✓ Megas' : 'Megas'}
        </button>
        <button type="button" onClick={() => setShowDrafted((v) => !v)} aria-pressed={showDrafted}>
          {showDrafted ? '✓ Drafted' : 'Drafted'}
        </button>
      </div>

      {canNominate && (
        <form onSubmit={submit} className="bid-row" style={{ marginBottom: '0.75rem' }}>
          <span className="small muted" style={{ minWidth: '7rem' }}>
            {selected ? selected.name : 'Pick one below'}
          </span>
          <input
            type="number"
            value={opening}
            min={minBid}
            max={maxBid}
            onChange={(e) => setOpening(e.target.value)}
            aria-label="Opening bid"
          />
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {busy ? 'Nominating…' : 'Nominate'}
          </button>
          <span className="small muted">
            Opening bid {minBid}–{maxBid}
          </span>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="muted small center">Nothing matches that search.</p>
      ) : (
        <div className="pool-grid">
          {visible.map((p) => {
            const drafted = draftedIds.has(p.id)
            const isSelected = selected?.id === p.id
            return (
              <button
                type="button"
                key={p.id}
                className={`pool-item${isSelected ? ' selected' : ''}${drafted ? ' drafted' : ''}`}
                onClick={() => !drafted && canNominate && setSelected(p)}
                disabled={drafted || !canNominate}
                title={p.name}
              >
                {p.isMega && <span className="pool-mega">M</span>}
                <img src={p.sprite} alt="" loading="lazy" />
                <span className="label">{p.name}</span>
                <Types types={p.types} />
              </button>
            )
          })}
        </div>
      )}

      <Notice kind="error">{error}</Notice>
    </div>
  )
}
