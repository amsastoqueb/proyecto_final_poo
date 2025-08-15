document.addEventListener('DOMContentLoaded', () => {
  // Centro por defecto: Bogotá
  const initialCenter = [4.6097, -74.0817];

  // Crear mapa en el DIV #map
  const map = L.map('map', {
    center: initialCenter,
    zoom: 13
  });

  // Capa base OSM con tinte verde (la clase se tiñe con CSS)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    className: 'green-tiles'
  }).addTo(map);

  // --- Capa para polígonos de parques (con estilo) ---
  const parquesLayer = L.geoJSON(null, {
    style: () => ({
      color: '#14532d',     // borde
      weight: 2,
      fillColor: '#34d399', // relleno
      fillOpacity: 0.45
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const nombre = p.nombre || p.name || 'Parque';
      const tipo   = p.tipo || p.categoria || '';
      layer.bindPopup(`<strong>${nombre}</strong>${tipo ? `<br><em>${tipo}</em>` : ''}`);

      // Hover (opcional)
      layer.on({
        mouseover: (e) => e.target.setStyle({ weight: 3, fillOpacity: 0.55 }),
        mouseout:  (e) => parquesLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);

  // Utilidad: validar valores de lat/lon
  function isLonLat([x, y]) { return Math.abs(x) <= 180 && Math.abs(y) <= 90; }
  function isLatLon([x, y]) { return Math.abs(x) <= 90  && Math.abs(y) <= 180; }

  // Recorrer coords y transformar si hace falta
  function mapCoords(geom, fn) {
    const t = geom.type, c = geom.coordinates;
    if (t === 'Point') return { type: t, coordinates: fn(c) };
    if (t === 'MultiPoint' || t === 'LineString') return { type: t, coordinates: c.map(fn) };
    if (t === 'MultiLineString' || t === 'Polygon') return { type: t, coordinates: c.map(r => r.map(fn)) };
    if (t === 'MultiPolygon') return { type: t, coordinates: c.map(p => p.map(r => r.map(fn))) };
    if (t === 'GeometryCollection') return { type: t, geometries: geom.geometries.map(g => mapCoords(g, fn)) };
    return geom;
  }

  // Si detecto [lat,lon], invierto a [lon,lat]
  function maybeFlipGeoJSON(gj) {
    try {
      const f = gj.features?.[0]; if (!f?.geometry) return gj;
      let sample = null;
      const take = (g) => {
        const t = g.type, c = g.coordinates;
        if (t === 'Point') sample = c;
        else if (t === 'MultiPoint' || t === 'LineString') sample = c[0];
        else if (t === 'Polygon' || t === 'MultiLineString') sample = c[0][0];
        else if (t === 'MultiPolygon') sample = c[0][0][0];
        else if (t === 'GeometryCollection' && g.geometries?.length) take(g.geometries[0]);
      };
      take(f.geometry);
      if (!sample || sample.length < 2) return gj;

      if (isLatLon(sample) && !isLonLat(sample)) {
        console.warn('Detectado posible [lat,lon]. Se invierte a [lon,lat].');
        return {
          type: 'FeatureCollection',
          features: gj.features.map(feat => ({
            ...feat,
            geometry: mapCoords(feat.geometry, ([a, b, ...rest]) => [b, a, ...rest])
          }))
        };
      }
      if (Math.abs(sample[0]) > 180 || Math.abs(sample[1]) > 90) {
        console.warn('Coordenadas fuera de rango: el GeoJSON no parece EPSG:4326.');
      }
      return gj;
    } catch { return gj; }
  }

  // fitBounds con validación
  function safeFitToLayer(lyr, fallbackCenter = initialCenter, fallbackZoom = 13) {
    try {
      const b = lyr.getBounds();
      if (b?.isValid()) {
        const sw = b.getSouthWest(), ne = b.getNorthEast();
        const okLon = Math.abs(sw.lng) <= 180 && Math.abs(ne.lng) <= 180;
        const okLat = Math.abs(sw.lat) <= 90  && Math.abs(ne.lat) <= 90;
        if (okLon && okLat) return map.fitBounds(b.pad(0.1));
      }
    } catch {}
    map.setView(fallbackCenter, fallbackZoom);
  }

  // Cargar archivo
  fetch('arbalta_parques_4326.geojson')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(raw => {
      if (!raw?.features?.length) { console.warn('GeoJSON sin features.'); return; }
      const data = maybeFlipGeoJSON(raw);
      parquesLayer.addData(data);
      safeFitToLayer(parquesLayer);
    })
    .catch(err => {
      console.error('Error cargando arbalta_parques_4326.geojson:', err);
      map.setView(initialCenter, 13);
    });
});

