import { useState } from 'react'
import { SETTINGS_BOUNDS } from '../lib/rules.js'
import { CopyField, Notice } from './Bits'

const FIELDS = [
  ['budget', 'Points per coach', 'Everyone starts with this many points to spend.'],
  ['rosterSize', 'Team size', 'How many Pokémon each coach drafts.'],
  ['minBid', 'Minimum bid', 'The smallest legal bid, and the amount reserved per empty slot.'],
  ['timerSec', 'Auction timer', 'Seconds on the clock when a Pokémon is nominated.'],
  ['bidResetSec', 'Bid reset', 'A late bid pushes the clock back out to this many seconds.'],
  ['nominationSec', 'Nomination timer', 'How long a coach has to nominate before being skipped.'],
]

/** Pre-draft room: seats fill up, the commissioner sets the rules and starts. */
export default function Lobby({ state, you, isAdmin, shareUrl, onAdmin, busy, error }) {
  const [draftSettings, setDraftSettings] = useState(state.settings)
  const [editing, setEditing] = useState(false)

  const set = (key, value) => setDraftSettings((s) => ({ ...s, [key]: value }))
  const saveSettings = () => {
    onAdmin('settings', { settings: draftSettings })
    setEditing(false)
  }

  const enough = state.coaches.length >= 2

  return (
    <div className="draft-shell">
      <div className="draft-topbar">
        <div className="topbar-id">
          <span className="room-code">{state.room}</span>
          <span className="muted small">Waiting to start</span>
        </div>
        <div className="topbar-stats">
          <div className="stat">
            <span className="stat-label">Coaches</span>
            <span className="stat-value">{state.coaches.length}</span>
          </div>
        </div>
      </div>

      <div className="draft-columns">
        <div>
          <div className="panel">
            <h2 className="panel-title">Invite your group</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Send this link. They enter their name and claim a seat — no account needed.
            </p>
            <CopyField value={shareUrl} label="Draft invite link" />
          </div>

          <div className="panel">
            <div className="spread" style={{ marginBottom: '0.75rem' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>
                Rules
              </h2>
              {isAdmin && !editing && (
                <button type="button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <>
                {FIELDS.map(([key, label, help]) => (
                  <div className="field" key={key}>
                    <label htmlFor={`s-${key}`}>{label}</label>
                    <input
                      id={`s-${key}`}
                      type="number"
                      min={SETTINGS_BOUNDS[key][0]}
                      max={SETTINGS_BOUNDS[key][1]}
                      value={draftSettings[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                    <div className="small muted">{help}</div>
                  </div>
                ))}
                <div className="bid-row">
                  <button type="button" className="btn-primary" onClick={saveSettings} disabled={busy}>
                    Save rules
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSettings(state.settings)
                      setEditing(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <table className="results-table">
                <tbody>
                  {FIELDS.map(([key, label]) => (
                    <tr key={key}>
                      <td className="muted">{label}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {state.settings[key]}
                        {key.endsWith('Sec') ? 's' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h2 className="panel-title">Seats ({state.coaches.length})</h2>
            {state.coaches.map((c, i) => (
              <div className="seat-row" key={c.id}>
                <span>
                  <span className="muted small" style={{ marginRight: '0.5rem' }}>
                    {i + 1}
                  </span>
                  {c.name}
                  {c.id === you?.id && <span className="tag tag-you">You</span>}
                </span>
                {isAdmin && c.id !== you?.id && (
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={() => onAdmin('removeCoach', { coachId: c.id })}
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            {!enough && (
              <Notice kind="info">Waiting for at least one more coach to join.</Notice>
            )}

            {isAdmin && (
              <div style={{ marginTop: '1rem' }}>
                <div className="admin-bar" style={{ marginBottom: '0.6rem' }}>
                  <button type="button" onClick={() => onAdmin('shuffle')} disabled={busy || !enough}>
                    Shuffle order
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => onAdmin('start')}
                  disabled={busy || !enough}
                >
                  Start draft
                </button>
                <p className="small muted center" style={{ marginBottom: 0 }}>
                  Nomination goes in the order shown above.
                </p>
              </div>
            )}
            {!isAdmin && (
              <Notice kind="info">Waiting for the commissioner to start the draft.</Notice>
            )}
            <Notice kind="error">{error}</Notice>
          </div>
        </div>
      </div>
    </div>
  )
}
