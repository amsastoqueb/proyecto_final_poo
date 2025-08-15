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

  // ===== Helpers de texto/valores =====
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }
  // Campos exactos pedidos
  function getTitulo(p){ return p?.NOMBRE_PAR ?? p?.nombre ?? p?.name ?? p?.titulo ?? 'Parque'; }
  function getTipo(p){   return p?.TIPOPARQUE ?? p?.tipo_parque ?? p?.tipo ?? p?.categoria ?? '—'; }

  function parseNumber(val){
    if (val == null) return null;
    if (typeof val === 'number') return isFinite(val) ? val : null;
    let s = String(val).trim().replace(/[^\d.,-]/g, '');
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.'); // coma decimal
    s = s.replace(/,/g, ''); // separadores de miles
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

  // Slug seguro por si tus archivos no usan el nombre exacto
  function toNameSlug(s){
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quitar acentos
      .trim()
      .toLowerCase()
      .replace(/\s+/g,'_')      // espacios -> _
      .replace(/[^\w\-]/g,'_')  // no-alfanum -> _
      .replace(/_+/g,'_')       // colapsar __
      .replace(/^_|_$/g,'');    // quitar _ extremos
  }

  // ===== Robustez de coordenadas =====
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
        console.warn('Detectado posible [lat,lon]. Se invierte a [lon,lat].');
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

  // ====== Turf loader (por si no lo añadiste en el HTML) ======
  function ensureTurf(){
    if (window.turf) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Turf.js'));
      document.head.appendChild(s);
    });
  }

  // ====== Recorte de parques al límite del barrio con Turf ======
  function clipToBarrio(parquesFC, barrioFC) {
    if (!window.turf) {
      console.error('Turf.js no está disponible.');
      return { type:'FeatureCollection', features: [] };
    }

    // Disolver el barrio en una sola geometría
    let barrioGeom = null;
    try {
      const feats = (barrioFC.features || []).filter(f => f && f.geometry);
      if (!feats.length) return { type:'FeatureCollection', features: [] };
      barrioGeom = feats[0];
      for (let i = 1; i < feats.length; i++) {
        const u = turf.union(barrioGeom, feats[i]);
        if (u) barrioGeom = u;
      }
    } catch (e) {
      // fallback: combinar sin disolver
      try {
        barrioGeom = turf.combine(barrioFC).features[0];
      } catch {
        return { type:'FeatureCollection', features: [] };
      }
    }

    const out = [];
    for (const f of (parquesFC.features || [])) {
      if (!f || !f.geometry) continue;
      try {
        const inter = turf.intersect(f, barrioGeom);
        if (inter && inter.geometry) {
          inter.properties = { ...f.properties };
          out.push(inter);
        }
      } catch (e) {
        try { if (turf.booleanWithin(f, barrioGeom)) out.push(f); } catch {}
      }
    }
    return { type:'FeatureCollection', features: out };
  }

  // ===== Pane + capa para el LÍMITE DEL BARRIO (solo borde) =====
  map.createPane('barrioPane');
  const barrioPane = map.getPane('barrioPane');
  barrioPane.style.zIndex = 610;           // encima de polígonos
  barrioPane.style.pointerEvents = 'none'; // no bloquea clic/hover

  const barrioLayer = L.geoJSON(null, {
    pane: 'barrioPane',
    style: () => ({
      color: '#0f766e',        // verde azulado que combina
      weight: 5,               // más gruesa
      dashArray: '12 6 3 6',   // patrón “disruptivo”
      lineCap: 'round',
      lineJoin: 'round',
      fill: false,
      fillOpacity: 0
    })
  }).addTo(map);

  // ===== Capa de PARQUES (se dibujarán ya recortados) =====
  const parquesLayer = L.geoJSON(null, {
    style: () => ({
      color: '#14532d',     // borde
      weight: 2,
      fillColor: '#34d399', // relleno
      fillOpacity: 0.45
    }),
    onEachFeature: (feature, layer) => {
      const p      = feature.properties || {};
      const nombre = getTitulo(p);          // NOMBRE_PAR
      const tipo   = getTipo(p);            // TIPOPARQUE
      const m2     = getAreaM2(p);          // SHAPE_AREA
      const extTxt = fmtArea(m2);

      // --- Imagen por NOMBRE_PAR ---
      // 1) archivo exacto con el nombre del parque (URL-encode) -> img/parques/<NOMBRE_PAR>.jpg
      // 2) si falla, probar slug -> img/parques/<slug>.jpg
      // 3) si falla, placeholder
      const imgExact = 'imgparques/' + encodeURIComponent(nombre) + '.jpg';
      const imgSlug  = 'imgparques/' + toNameSlug(nombre) + '.jpg';

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

      // Popup (clic): imagen por NOMBRE_PAR + atributos
      const popupHTML = `
        <div style="max-width:340px">
          <img src="${imgExact}"
               alt="${escapeHtml(nombre)}"
               style="width:100%;height:auto;border-radius:8px;margin-bottom:.5rem;"
               onerror="if(!this.dataset.trySlug){this.dataset.trySlug=1;this.src='${imgSlug}';}else{this.onerror=null;this.src='img/placeholder.jpg';}">
          <div class="tt-attrs">
            <div><strong>Parque:</strong> ${escapeHtml(nombre)}</div>
            <div><strong>Tipo de parque:</strong> ${escapeHtml(tipo)}</div>
            <div><strong>Extensión:</strong> ${extTxt}</div>
          </div>
        </div>
      `;
      layer.bindPopup(popupHTML);

      // Resaltado hover
      layer.on({
        mouseover: (e) => e.target.setStyle({ weight: 3, fillOpacity: 0.55 }),
        mouseout:  (e) => parquesLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);

  // ===== Cargas y recorte =====
  const barrioPromise = fetch('arbalta_barrio_4326.geojson')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(raw => maybeFlipGeoJSON(raw));

  const parquesPromise = fetch('arbalta_parques_4326.geojson')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(raw => maybeFlipGeoJSON(raw));

  // Asegurar Turf + cargar y recortar
  Promise.all([ensureTurf(), barrioPromise, parquesPromise])
    .then(([_, barrioFC, parquesFC]) => {
      // 1) dibuja la delimitación del barrio
      barrioLayer.addData(barrioFC);

      // 2) recorta parques al barrio y dibuja SOLO la parte dentro
      const clipped = clipToBarrio(parquesFC, barrioFC);
      parquesLayer.clearLayers();
      parquesLayer.addData(clipped);

      // 3) encuadre a ambos
      const group = L.featureGroup([barrioLayer, parquesLayer]);
      safeFitToLayer(group);
    })
    .catch(err => {
      console.error('Error cargando/recortando capas:', err);
      // fallback: si falla Turf o el barrio, al menos muestra parques sin recorte
      parquesPromise
        .then(p => { parquesLayer.addData(p); safeFitToLayer(parquesLayer); })
        .catch(e => console.error('Error cargando parques:', e));
    });
});