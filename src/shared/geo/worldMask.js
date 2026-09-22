export function buildOuterMask(districtsGeoJSON) {
  if (!districtsGeoJSON?.features) return null

  const holes = []
  districtsGeoJSON.features.forEach(f => {
    const geom = f.geometry
    if (geom.type === 'Polygon') {
      holes.push(geom.coordinates[0])
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => holes.push(poly[0]))
    }
  })

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[99.0, 12.5], [102.5, 12.5], [102.5, 15.0], [99.0, 15.0], [99.0, 12.5]],
        ...holes
      ]
    }
  }
}
