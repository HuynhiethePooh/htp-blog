import { maxBidFor, spentBy } from '../lib/rules.js'

/** Every coach's money and roster at a glance — the thing people stare at while bidding. */
export default function CoachBoard({ state, youId }) {
  const nominatorId = state.order?.[state.nominatorIdx]
  const highBidder = state.auction?.highBidder

  return (
    <div className="panel">
      <h2 className="panel-title">Coaches</h2>
      <div className="coach-list">
        {state.coaches.map((coach) => {
          const picks = state.rosters[coach.id] ?? []
          const left = state.settings.budget - spentBy(state, coach.id)
          const max = maxBidFor(state, coach.id)
          const classes = [
            'coach',
            coach.id === youId ? 'is-you' : '',
            coach.id === nominatorId && state.status === 'drafting' ? 'is-nominating' : '',
            coach.id === highBidder ? 'is-high' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div className={classes} key={coach.id}>
              <div className="coach-head">
                <span className="coach-name">
                  {coach.name}
                  {coach.id === youId && <span className="tag tag-you">You</span>}
                  {coach.id === nominatorId && state.status === 'drafting' && !state.auction && (
                    <span className="tag tag-nom">On the clock</span>
                  )}
                </span>
                <span className="coach-budget">{left}</span>
              </div>

              <div className="coach-meta">
                <span>
                  {picks.length}/{state.settings.rosterSize} drafted
                </span>
                <span>{max > 0 ? `max bid ${max}` : 'roster full'}</span>
              </div>

              <div className="slots">
                {Array.from({ length: state.settings.rosterSize }, (_, i) => {
                  const pick = picks[i]
                  return (
                    <span className="slot" key={i} title={pick ? `${pick.name} — ${pick.price}` : 'Empty slot'}>
                      {pick && <img src={pick.sprite} alt={pick.name} loading="lazy" />}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
