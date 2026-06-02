import { useEffect } from 'react'
import { Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps'
import { formatDistance } from '../utils/geo'

function AllRoundsMapInner({ results }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    results.forEach(r => {
      bounds.extend(r.guess)
      bounds.extend(r.restaurant)
    })
    map.fitBounds(bounds, 60)

    const lines = results.map(
      r =>
        new window.google.maps.Polyline({
          path: [r.guess, r.restaurant],
          geodesic: true,
          strokeColor: '#ff6b6b',
          strokeOpacity: 0.7,
          strokeWeight: 2,
          map,
        })
    )
    return () => lines.forEach(l => l.setMap(null))
  }, [map, results])

  return (
    <>
      {results.map((r, i) => (
        <span key={i}>
          <AdvancedMarker position={r.guess} title={`Round ${i + 1} guess`}>
            <Pin background="#4285f4" glyph={`${i + 1}`} glyphColor="#fff" borderColor="#2a6dd9" />
          </AdvancedMarker>
          <AdvancedMarker position={r.restaurant} title={r.restaurant.name}>
            <Pin background="#34a853" glyph={`${i + 1}`} glyphColor="#fff" borderColor="#2a8a44" />
          </AdvancedMarker>
        </span>
      ))}
    </>
  )
}

export default function FinalScreen({ results, onPlayAgain }) {
  const totalScore = results.reduce((sum, r) => sum + r.score, 0)
  const maxScore = results.length * 5000

  return (
    <div className="final-screen">
      <div className="final-header">
        <div className="header-logo">NYGuesser</div>
        <div className="final-score">{totalScore.toLocaleString()}</div>
        <div className="final-score-max">/ {maxScore.toLocaleString()} points</div>
      </div>

      <div className="final-rounds">
        {results.map((r, i) => (
          <div key={i} className="final-round-row">
            <span className="final-round-num">{i + 1}</span>
            <span className="final-round-name">{r.restaurant.name}</span>
            <span className="final-round-dist">{formatDistance(r.distance)}</span>
            <span className="final-round-score">{r.score.toLocaleString()} pts</span>
          </div>
        ))}
      </div>

      <div className="final-map">
        <Map
          style={{ width: '100%', height: '100%' }}
          mapId={import.meta.env.PUBLIC_GOOGLE_MAPS_MAP_ID}
          defaultCenter={{ lat: 40.7128, lng: -74.006 }}
          defaultZoom={11}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
        >
          <AllRoundsMapInner results={results} />
        </Map>
      </div>

      <div className="final-footer">
        <button className="primary-btn" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  )
}
