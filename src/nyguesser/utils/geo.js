export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function calculateScore(distanceMeters) {
  if (distanceMeters <= 50) return 5000
  const linear = Math.exp(-distanceMeters / 2000)
  const gaussian = Math.exp(-((distanceMeters / 4000) ** 2))
  return Math.max(0, Math.round(5000 * (linear + gaussian) / 2))
}

export function formatDistance(meters) {
  const feet = meters * 3.28084
  if (feet < 1000) return `${Math.round(feet)} ft`
  return `${(meters / 1609.344).toFixed(2)} mi`
}
