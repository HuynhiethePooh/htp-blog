import { useEffect } from 'react'
import { Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps'
import { formatDistance } from '../utils/geo'

function ResultMapInner({ guess, actual }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend(guess)
    bounds.extend(actual)
    map.fitBounds(bounds, 80)

    const line = new window.google.maps.Polyline({
      path: [guess, actual],
      geodesic: true,
      strokeColor: '#ff6b6b',
      strokeOpacity: 0.9,
      strokeWeight: 3,
      map,
    })
    return () => line.setMap(null)
  }, [map, guess, actual])

  return (
    <>
      <AdvancedMarker position={guess} title="Your guess">
        <Pin background="#4285f4" glyphColor="#fff" borderColor="#2a6dd9" />
      </AdvancedMarker>
      <AdvancedMarker position={actual} title="Actual location">
        <Pin background="#34a853" glyphColor="#fff" borderColor="#2a8a44" />
      </AdvancedMarker>
    </>
  )
}

export default function ResultScreen({ result, round, totalRounds, onNext }) {
  const { restaurant, photoUrl, guess, distance, score } = result
  const isLastRound = round === totalRounds

  return (
    <div className="game-screen">
      <header className="game-header">
        <span className="header-logo">NYGuesser</span>
        <span className="header-round">Round {round} / {totalRounds} &mdash; Result</span>
        <span />
      </header>

      <div className="game-body">
        <div className="photo-panel">
          <div className="photo-panel__scroll">
            <img src={photoUrl} alt="Restaurant" className="restaurant-photo" />
          </div>
          <div className="photo-overlay photo-overlay--name">{restaurant.name}</div>
        </div>

        <div className="map-panel">
          <Map
            style={{ width: '100%', height: '100%' }}
            mapId={import.meta.env.PUBLIC_GOOGLE_MAPS_MAP_ID}
            defaultCenter={restaurant}
            defaultZoom={13}
            gestureHandling="cooperative"
            mapTypeControl={false}
            streetViewControl={false}
          >
            <ResultMapInner guess={guess} actual={restaurant} />
          </Map>

          <div className="result-bar">
            <div className="result-stats">
              <div className="result-stat">
                <span className="result-stat__value result-stat__value--dist">
                  {formatDistance(distance)}
                </span>
                <span className="result-stat__label">away</span>
              </div>
              <div className="result-divider" />
              <div className="result-stat">
                <span className="result-stat__value result-stat__value--score">
                  {score.toLocaleString()}
                </span>
                <span className="result-stat__label">/ 5,000 pts</span>
              </div>
            </div>
            <button className="primary-btn" onClick={onNext}>
              {isLastRound ? 'See Final Score' : 'Next Round'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
