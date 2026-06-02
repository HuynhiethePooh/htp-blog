import { useEffect, useRef, useState } from 'react'
import { Map, AdvancedMarker, Pin, useMapsLibrary } from '@vis.gl/react-google-maps'
import { haversineDistance, calculateScore } from '../utils/geo'
import { NYT_TOP_100 } from '../data/restaurants'

export default function GameScreen({ round, totalRounds, onSubmit }) {
  const placesLib = useMapsLibrary('places')
  const hiddenRef = useRef(null)
  const [service, setService] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [photoUrls, setPhotoUrls] = useState([])
  const [loading, setLoading] = useState(true)
  const [usedIndices] = useState(() => new Set())
  const [pin, setPin] = useState(null)

  useEffect(() => {
    if (!placesLib || !hiddenRef.current) return
    setService(new placesLib.PlacesService(hiddenRef.current))
  }, [placesLib])

  useEffect(() => {
    if (!service) return
    fetchRestaurant(service, 0)
  }, [service])


  function pickRestaurantName() {
    const remaining = NYT_TOP_100.map((_, i) => i).filter(i => !usedIndices.has(i))
    const pool = remaining.length > 0 ? remaining : NYT_TOP_100.map((_, i) => i)
    const idx = pool[Math.floor(Math.random() * pool.length)]
    usedIndices.add(idx)
    return NYT_TOP_100[idx]
  }

 function fetchRestaurant(svc, retries) {
    if (retries > 8) return
    const name = pickRestaurantName()
    svc.textSearch(
      { query: `${name} restaurant New York City` },
      (results, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          fetchRestaurant(svc, retries + 1)
          return
        } 
        const chosen = results[0]
        if (!chosen.geometry?.location || !chosen.photos?.length) {
          fetchRestaurant(svc, retries + 1)
          return
        } 
        svc.getDetails(
          { placeId: chosen.place_id, fields: ['photos'] },
          (details, detailStatus) => {
            const pool = detailStatus === window.google.maps.places.PlacesServiceStatus.OK &&
  details?.photos?.length > 4
              ? details.photos.slice(4)
              : chosen.photos
            const shuffled = pool.slice().sort(() => Math.random() - 0.5)
            const urls = shuffled.slice(0, 4).map(p => p.getUrl({ maxWidth: 800, maxHeight: 800 }))
            setRestaurant({ name: chosen.name, lat: chosen.geometry.location.lat(), lng:
  chosen.geometry.location.lng() })
            setPhotoUrls(urls)
            setLoading(false)
          } 
        ) 
      } 
    ) 
  }

  const handleMapClick = (e) => {
    if (!e.detail?.latLng) return
    setPin({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng })
  }

  const handleSubmit = () => {
    const distance = haversineDistance(pin.lat, pin.lng, restaurant.lat, restaurant.lng)
    onSubmit({ restaurant, photoUrl: photoUrls[0], guess: pin, distance, score: calculateScore(distance) })
  }

  return (
    <div className="game-screen">
      <div ref={hiddenRef} style={{ display: 'none' }} />

      <header className="game-header">
        <span className="header-logo">NYGuesser</span>
        <span className="header-round">Round {round} / {totalRounds}</span>
        <span className="header-tip">Click the map to place your pin</span>
      </header>

      <div className="game-body">
        <div className="photo-panel">
          {loading ? (
            <div className="loading-state">Finding a restaurant...</div>
          ) : (
            <>
              <div className="photo-panel__scroll">
                <div className="photo-grid">
                  {photoUrls.map((url, i) => (
                    <img key={i} src={url} alt="Restaurant dish" className="photo-grid__img" />
                  ))}
                </div>
              </div>
              <div className="photo-overlay">Guess the location of this Manhattan restaurant</div>
            </>
          )}
        </div>

        <div className="map-panel">
          <Map
            style={{ width: '100%', height: '100%' }}
            mapId={import.meta.env.PUBLIC_GOOGLE_MAPS_MAP_ID}
            defaultCenter={{ lat: 40.7128, lng: -74.006 }}
            defaultZoom={11} 
            onClick={handleMapClick}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
          >
            {pin && (
              <AdvancedMarker position={pin}>
                <Pin background="#4285f4" glyphColor="#fff" borderColor="#2a6dd9" />
              </AdvancedMarker>
            )}
          </Map>
          <button
            className={`guess-btn ${pin ? 'guess-btn--active' : ''}`}
            onClick={handleSubmit}
            disabled={!pin || loading}
          >
            {pin ? 'Submit Guess' : 'Click map to place pin'}
          </button>
        </div>
      </div>
    </div>
  )
}
