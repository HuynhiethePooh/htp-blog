import { spentBy } from '../lib/rules.js'

/** Final teams, once every roster is full. */
export default function Results({ state, youId }) {
  const exportText = state.coaches
    .map((c) => {
      const picks = state.rosters[c.id] ?? []
      const lines = picks.map((p) => `  ${p.name} (${p.price})`).join('\n')
      return `${c.name} — ${spentBy(state, c.id)}/${state.settings.budget} spent\n${lines}`
    })
    .join('\n\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
    } catch {
      /* clipboard blocked; the rosters are all on screen anyway */
    }
  }

  return (
    <div className="panel">
      <div className="spread" style={{ marginBottom: '0.75rem' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          Final teams
        </h2>
        <button type="button" onClick={copy}>
          Copy all rosters
        </button>
      </div>

      {state.coaches.map((c) => {
        const picks = state.rosters[c.id] ?? []
        return (
          <div key={c.id} style={{ marginBottom: '1.25rem' }}>
            <div className="spread">
              <strong>
                {c.name}
                {c.id === youId && <span className="tag tag-you">You</span>}
              </strong>
              <span className="muted small">
                {spentBy(state, c.id)}/{state.settings.budget} spent
              </span>
            </div>
            <table className="results-table">
              <tbody>
                {picks.map((p) => (
                  <tr key={p.pokemonId}>
                    <td style={{ width: 40 }}>
                      <img src={p.sprite} alt="" width="32" height="32" style={{ objectFit: 'contain' }} />
                    </td>
                    <td>{p.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
