// pixelMapTiles.js — raster basemap (OSM/CARTO) วางใต้ pixel map
// tile คำนวณจาก standard Web Mercator slippy-map grid แล้ว project มุมแต่ละ tile ผ่าน equirectangular
// projection เดียวกับ district polygons (makeProjection) — ภาพจึงถูกยืด/บีบเล็กน้อยให้พอดีกรอบเขต
// (<image preserveAspectRatio="none"> ที่ MapCanvas.jsx รองรับ mismatch นี้อยู่แล้ว)
const TILE_SIZE = 256
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd']
const OSM_SUBDOMAINS = ['a', 'b', 'c']

// สอดคล้องกับ basemap ที่ใช้อยู่แล้วใน IncidentMap.jsx (carto) / OverviewMiniMap.jsx (osm)
export const TILE_SOURCES = {
  carto: {
    label: 'ยาเสพติด',
    attribution: '© OpenStreetMap contributors © CARTO',
    url: (z, x, y) => `https://${CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
  },
  osm: {
    label: 'OSM',
    attribution: '© OpenStreetMap contributors',
    url: (z, x, y) => `https://${OSM_SUBDOMAINS[(x + y) % OSM_SUBDOMAINS.length]}.tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
}

const clampLat = (lat) => Math.min(85.0511, Math.max(-85.0511, lat))
const lon2tileX = (lon, z) => (lon + 180) / 360 * 2 ** z
const lat2tileY = (lat, z) => {
  const rad = clampLat(lat) * Math.PI / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z
}
const tileX2lon = (x, z) => x / 2 ** z * 360 - 180
const tileY2lat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

const MAX_TILES_PER_AXIS = 24 // กันกรณี zoom-out/pan สุดขั้วแล้ว request tile เป็นพันรูป

// คืน { tiles: [{ key, z, x, y, px, py, pw, ph }] } — px/py/pw/ph เป็นพิกัด "ก่อน" zoom transform
// (เหมือน districtPaths) เพราะ <g> รอบนอกใน MapCanvas.jsx ใส่ transform={translate(t.x,t.y) scale(t.k)} ให้แล้ว
export function visibleTiles({ project, unproject, width, height, transform }) {
  const t = transform ?? { x: 0, y: 0, k: 1 }
  const minPX = (0 - t.x) / t.k
  const maxPX = (width - t.x) / t.k
  const minPY = (0 - t.y) / t.k
  const maxPY = (height - t.y) / t.k

  const [lngW, latN] = unproject([minPX, minPY])
  const [lngE, latS] = unproject([maxPX, maxPY])
  const lngSpan = Math.max(1e-9, lngE - lngW)

  let z = Math.round(Math.log2((360 * width) / (TILE_SIZE * lngSpan)))
  z = Math.min(18, Math.max(3, z))

  let xMin = Math.floor(lon2tileX(lngW, z))
  let xMax = Math.floor(lon2tileX(lngE, z))
  let yMin = Math.floor(lat2tileY(latN, z))
  let yMax = Math.floor(lat2tileY(latS, z))

  if (xMax - xMin + 1 > MAX_TILES_PER_AXIS) {
    const cx = Math.round((xMin + xMax) / 2)
    xMin = cx - Math.floor(MAX_TILES_PER_AXIS / 2)
    xMax = cx + Math.floor(MAX_TILES_PER_AXIS / 2)
  }
  if (yMax - yMin + 1 > MAX_TILES_PER_AXIS) {
    const cy = Math.round((yMin + yMax) / 2)
    yMin = cy - Math.floor(MAX_TILES_PER_AXIS / 2)
    yMax = cy + Math.floor(MAX_TILES_PER_AXIS / 2)
  }

  const maxIndex = 2 ** z - 1
  const tiles = []
  for (let x = Math.max(0, xMin); x <= Math.min(maxIndex, xMax); x++) {
    for (let y = Math.max(0, yMin); y <= Math.min(maxIndex, yMax); y++) {
      const [px1, py1] = project([tileX2lon(x, z), tileY2lat(y, z)])
      const [px2, py2] = project([tileX2lon(x + 1, z), tileY2lat(y + 1, z)])
      tiles.push({
        key: `${z}/${x}/${y}`, z, x, y,
        px: Math.min(px1, px2), py: Math.min(py1, py2),
        pw: Math.abs(px2 - px1), ph: Math.abs(py2 - py1),
      })
    }
  }
  return { tiles, z }
}
