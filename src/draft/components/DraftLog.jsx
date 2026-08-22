/** Running feed of everything that has happened. Newest first (the list is reversed in CSS). */
export default function DraftLog({ state }) {
  const nameOf = (id) => state.coaches.find((c) => c.id === id)?.name ?? 'Someone'

  const line = (e) => {
    switch (e.type) {
      case 'nominate':
        return (
          <>
            <strong>{nameOf(e.coachId)}</strong> nominated <strong>{e.name}</strong> at {e.amount}
          </>
        )
      case 'bid':
        return (
          <>
            <strong>{nameOf(e.coachId)}</strong> bid {e.amount}
          </>
        )
      case 'sold':
        return (
          <>
            <strong>{e.name}</strong> → <strong>{nameOf(e.coachId)}</strong> for {e.amount}
          </>
        )
      case 'joined':
        return <><strong>{e.name}</strong> joined</>
      case 'reclaimed':
        return <><strong>{e.name}</strong> reconnected</>
      case 'undo':
        return (
          <>
            Undid <strong>{e.name}</strong> — {e.amount} refunded to {nameOf(e.coachId)}
          </>
        )
      case 'auction_cancelled':
        return <>Auction for <strong>{e.name}</strong> cancelled</>
      case 'nomination_skipped':
        return <><strong>{nameOf(e.coachId)}</strong> ran out of nomination time</>
      case 'draft_started':
        return <>Draft started</>
      case 'draft_done':
        return <>Draft complete</>
      case 'order_shuffled':
        return <>Nomination order shuffled</>
      case 'paused':
        return <>Paused</>
      case 'resumed':
        return <>Resumed</>
      case 'created':
        return <>Room created</>
      default:
        return null
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Draft log</h2>
      <div className="log">
        {state.log.map((e, i) => {
          const content = line(e)
          if (!content) return null
          return (
            <div className={`log-entry${e.type === 'sold' ? ' log-sold' : ''}`} key={`${e.t}-${i}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
