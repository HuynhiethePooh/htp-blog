/** Small shared presentational pieces. */

export function Types({ types }) {
  if (!types?.length) return null
  return (
    <span className="types">
      {types.map((t) => (
        <span key={t} className={`type t-${t}`}>
          {t}
        </span>
      ))}
    </span>
  )
}

/** Server-authoritative countdown. `endsAt` and `now` are both server-clock ms. */
export function Timer({ endsAt, now, totalMs, paused }) {
  const remaining = Math.max(0, endsAt - now)
  const secs = remaining / 1000
  const urgent = !paused && secs <= 5
  const pct = totalMs > 0 ? Math.min(100, (remaining / totalMs) * 100) : 0

  return (
    <div className={`timer${urgent ? ' urgent' : ''}`}>
      <span className="timer-value" aria-live="off">
        {paused ? '❚❚' : secs >= 10 ? Math.ceil(secs) : secs.toFixed(1)}
      </span>
      <div
        className="timer-bar"
        role="progressbar"
        aria-valuenow={Math.ceil(secs)}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-label="Time remaining in this auction"
      >
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Notice({ kind = 'info', children }) {
  if (!children) return null
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

/** Copy-to-clipboard field for share links and room codes. */
export function CopyField({ value, label }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard blocked -- the value is selectable in the input either way */
    }
  }
  return (
    <div className="share-row">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copy}>
        Copy
      </button>
    </div>
  )
}
