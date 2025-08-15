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

  // --------- Helpers ----------
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }
  function getTitulo(p){ return p?.NOMBRE_PAR ?? p?.nombre ?? p?.name ?? p?.titulo ?? 'Parque'; }
  function getTipo(p){   return p?.TIPOPARQUE ?? p?.tipo_parque ?? p?.tipo ?? p?.categoria ?? '—'; }

  function parseNumber(val){
    if (val == null) return null;
    if (typeof val === 'number') return isFinite(val) ? val : null;
    let s = String(val).trim().replace(/[^\d.,-]/g, '');
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.'); // coma decimal
    s = s.replace(/,/g, ''); // miles
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  // SHAPE_AREA -> m²
  function getAreaM2(p){
    const v = parseNumber(p?.SHAPE_AREA ?? p?.area_m2 ?? p?.area ?? p?.sup_m2 ?? p?.superficie_m2);
    return v != null ? v : null;
  }
  function fmtArea(m2){
    if (m2 == null) return '—';
    const ha = m2 / 10000;
    return `${m2.toLocaleString('es-CO',{maximumFractionDigits:0})} m² (${ha.toLocaleString('es-CO',{maximumFractionDigits:2})} ha)`;
  }

  // Normaliza el ID a nombre de archivo para imagen
  function toIdStr(id){
    return String(id ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'_')
      .replace(/_+/g,'_').replace(/^_|_$/g,'');
  }

  // Robustez coords
  function isLonLat([x, y]) { return Math.abs(x) <= 180 && Math.abs(y) <= 90; }
  function isLatLon([x, y]) { return Math.abs(x) <= 90  && Math.abs(y) <= 180; }
  function mapCoords(geom, fn) {
    const t = geom.type, c = geom.coordinates;
    if (t === 'Point') return { type: t, coordinates: fn(c) };
    if (t === 'MultiPoint' || t === 'LineString') return { type: t, coordinates: c.map(fn) };
    if (t === 'MultiLineString' || t === 'Polygon') return { type: t, coordinates: c.map(r => r.map(fn)) };
    if (t === 'MultiPolygon') return { type: t, coordinates: c.map(p => p.map(r => r.map(fn))) };
    if (t === 'GeometryCollection') return { type: t, geometries: geom.geometries.map(g => mapCoords(g, fn)) };
    return geom;
  }
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
        return {
          type: 'FeatureCollection',
          features: gj.features.map(feat => ({
            ...feat,
            geometry: mapCoords(feat.geometry, ([a, b, ...rest]) => [b, a, ...rest])
          }))
        };
      }
      return gj;
    } catch { return gj; }
  }
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

  // === Capa de PARQUES (con imagen por ID_PARQUE en el popup) ===
  const parquesLayer = L.geoJSON(null, {
    style: () => ({
      color: '#14532d',
      weight: 2,
      fillColor: '#34d399',
      fillOpacity: 0.45
    }),
    onEachFeature: (feature, layer) => {
      const p      = feature.properties || {};
      const nombre = getTitulo(p);
      const tipo   = getTipo(p);
      const m2     = getAreaM2(p);
      const extTxt = fmtArea(m2);

      // Imagen SOLO por ID_PARQUE (no se muestra el ID)
      const namePark = p.NOMBRE_PAR ?? p.nombre_par ?? p.par ?? null;
      let img = 'imgparques/placeholder.jpg';
      if (namePark != null) img = `imgparques/ARBORIZADORA ALTA/${toIdStr(namePark)}.jpg`;

      // Tooltip (hover): 3 atributos
      const tooltipHTML = `
        <div class="tt-attrs">
          <div><strong>Parque:</strong> ${escapeHtml(nombre)}</div>
          <div><strong>Tipo de parque:</strong> ${escapeHtml(tipo)}</div>
          <div><strong>Extensión:</strong> ${extTxt}</div>
        </div>
      `;
      layer.bindTooltip(tooltipHTML, {
        sticky: true,
        direction: 'top',
        className: 'info-tooltip'
      });

      // Popup (clic): imagen + atributos
      const popupHTML = `
        <div style="max-width:340px">
          <img src="${encodeURI(img)}"
               alt="${escapeHtml(nombre)}"
               style="width:100%;height:auto;border-radius:8px;margin-bottom:.5rem;"
               onerror="this.onerror=null;this.src='img/placeholder.jpg';">
          <div class="tt-attrs">
            <div><strong>Parque:</strong> ${escapeHtml(nombre)}</div>
            <div><strong>Tipo de parque:</strong> ${escapeHtml(tipo)}</div>
            <div><strong>Extensión:</strong> ${extTxt}</div>
          </div>
        </div>
      `;
      layer.bindPopup(popupHTML);

      layer.on({
        mouseover: (e) => e.target.setStyle({ weight: 3, fillOpacity: 0.55 }),
        mouseout:  (e) => parquesLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);

  // === NUEVO: Pane y capa para el LÍMITE DEL BARRIO (solo borde) ===
  // Pane encima de polígonos pero sin bloquear interacción
  map.createPane('barrioPane');
  const barrioPane = map.getPane('barrioPane');
  barrioPane.style.zIndex = 610;              // encima de overlayPane (parques), debajo de tooltips/popups
  barrioPane.style.pointerEvents = 'none';    // no bloquear clics en parques

  const barrioLayer = L.geoJSON(null, {
    pane: 'barrioPane',
    style: () => ({
      color: '#0f766e',        // verde azulado que combina
      weight: 5,               // más gruesa
      dashArray: '12 6 3 6',   // patrón “disruptivo”
      lineCap: 'round',
      lineJoin: 'round',
      fill: false,             // SIN RELLENO
      fillOpacity: 0           // por si acaso
    })
  }).addTo(map);

  // === Cargar ambas capas ===
  const parquesPromise = fetch('arbalta_parques_4326.geojson')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(raw => { parquesLayer.addData(maybeFlipGeoJSON(raw)); })
    .catch(err => console.error('Error cargando arbalta_parques_4326.geojson:', err));

  const barrioPromise = fetch('arbalta_barrio_4326.geojson') // <-- cambia el nombre si tu archivo es otro
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(raw => { barrioLayer.addData(maybeFlipGeoJSON(raw)); })
    .catch(err => console.error('Error cargando arbalta_barrio_4326.geojson:', err));

  // Ajustar vista a AMBAS capas cuando terminen
  Promise.allSettled([parquesPromise, barrioPromise]).then(() => {
    const group = L.featureGroup([parquesLayer, barrioLayer]);
    safeFitToLayer(group);
  });
});