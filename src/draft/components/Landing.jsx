import { useState } from 'react'
import { Notice } from './Bits'

/** Create a new draft, or join one with a room code. */
export default function Landing({ initialRoom, onCreate, onJoin, busy, error }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialRoom ?? '')
  const [mode, setMode] = useState(initialRoom ? 'join' : null)

  const trimmedName = name.trim()
  const canJoin = trimmedName && code.trim().length >= 4
  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    if (mode === 'join') {
      if (canJoin) onJoin(code.trim().toUpperCase(), trimmedName)
    } else if (trimmedName) {
      onCreate(trimmedName)
    }
  }

  return (
    <div className="centered">
      <form className="card" onSubmit={submit}>
        <h1>Reg M-B Auction Draft</h1>
        <p className="sub">
          Pokémon Champions, Regulation M-B — 310 draftable Pokémon, Megas included as their own picks.
          Nominate, bid on the clock, build a team.
        </p>

        <div className="field">
          <label htmlFor="coach-name">Your name</label>
          <input
            id="coach-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How your team shows on the board"
            maxLength={24}
            autoComplete="off"
            autoFocus
          />
        </div>

        {mode === 'join' ? (
          <>
            <div className="field">
              <label htmlFor="room-code">Room code</label>
              <input
                id="room-code"
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABCD"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={busy || !canJoin}>
              {busy ? 'Joining…' : 'Join draft'}
            </button>
            <div className="divider">or</div>
            <button type="button" style={{ width: '100%' }} onClick={() => setMode(null)} disabled={busy}>
              Start a new draft instead
            </button>
          </>
        ) : (
          <>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={busy || !trimmedName}>
              {busy ? 'Creating…' : 'Start a new draft'}
            </button>
            <div className="divider">or</div>
            <button type="button" style={{ width: '100%' }} onClick={() => setMode('join')} disabled={busy}>
              Join with a room code
            </button>
          </>
        )}

        <Notice kind="error">{error}</Notice>
      </form>
    </div>
  )
}
