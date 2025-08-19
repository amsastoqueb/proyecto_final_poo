// ===== programa_parques.js =====
document.addEventListener('DOMContentLoaded', () => { 
  // ====== MAPA ======
  const initialCenter = [4.6097, -74.0817];
  const map = L.map('map', { center: initialCenter, zoom: 13 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', className: 'green-tiles'
  }).addTo(map);

  // ====== HELPERS ======
  const DETALLE_HOST_ID = 'detalle-parque';

  const escapeHtml = (s)=> String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  // normaliza: sin tildes, espacios duplicados → uno, minúsculas
  function norm(s){
    return String(s||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim().toLowerCase();
  }

  const getTitulo = (p)=> p?.NOMBRE_PAR ?? p?.nombre ?? p?.name ?? p?.titulo ?? 'Parque';
  const getTipo   = (p)=> p?.TIPOPARQUE ?? p?.tipo_parque ?? p?.tipo ?? p?.categoria ?? '—';

  function parseNumber(val){
    if (val == null) return null;
    if (typeof val === 'number') return isFinite(val) ? val : null;
    let s = String(val).trim().replace(/[^\d.,-]/g, '');
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
    s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  const getAreaM2 = (p)=> {
    const v = parseNumber(p?.SHAPE_AREA ?? p?.area_m2 ?? p?.area ?? p?.sup_m2 ?? p?.superficie_m2);
    return v != null ? v : null;
  };
  const fmtArea = (m2)=>{
    if (m2 == null) return '—';
    const ha = m2 / 10000;
    return `${m2.toLocaleString('es-CO',{maximumFractionDigits:0})} m² (${ha.toLocaleString('es-CO',{maximumFractionDigits:2})} ha)`;
  };
  const toNameSlug = (s)=> String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()
                        .toLowerCase().replace(/\s+/g,'_').replace(/[^\w\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');

  // ===== DESCRIPCIONES MANUALES POR NOMBRE_PAR =====
  // Usa EXACTAMENTE los nombres que te pasan en el GeoJSON (sin preocuparte por tildes/mayúsculas/espacios).
  const DESCRIPCIONES_POR_NOMBRE = (() => {
    const D = {};
    const add = (names, html) => names.forEach(n => D[norm(n)] = html);

    add(['ARBORIZADORA ALTA'], `
      <p>Este es un importante "pulmón verde" y un parque metropolitano ubicado en Ciudad Bolívar, en la dirección Diagonal 73 Sur # 40-80. Es un espacio público administrado por el IDRD, diseñado para el esparcimiento, la recreación y el bienestar social de la comunidad. Entre sus instalaciones se destacan un coliseo cubierto con cancha de fútbol y fútbol sala, una zona de juegos infantiles, canchas múltiples de baloncesto y zonas verdes. También cuenta con un "Paradero Para Libros Paraparques" para fomentar la lectura.</p>
    `);

    add(['Desarrollo Arborizadora Alta'], `
      <p>Más allá de ser un parque, en esta zona se encuentra un "Centro de Desarrollo Comunitario" (CDC) que ofrece actividades recreativas, deportivas y formativas. Se ubica en la Calle 70 Sur # 34-05 y es un espacio clave para el fortalecimiento social y comunitario en la localidad. El área de parque asociada es catalogada como un espacio deportivo.</p>
    `);

    add(['DESARROLLO JERUSALEM'], `
      <p>El Parque de Desarrollo Jerusalén es un escenario público vecinal ubicado en la Calle 69N Sur con Carrera 45, en el barrio Arborizadora Alta. Es administrado por el Instituto Distrital de Recreación y Deporte (IDRD) y cuenta con una variedad de instalaciones para el disfrute de la comunidad.</p>
    `);

    add(['JUAN JOSE RONDON'], `
      <p>El Parque Juan José Rondón, también ubicado en el barrio Arborizadora Alta, es un espacio de recreación familiar con una extensión de aproximadamente 7.3 acres (alrededor de 2.95 hectáreas). Se encuentra dentro de la UPZ San Francisco.</p>
    `);

    // Variantes que deben mostrar la MISMA descripción
    add([
      'URBANIZACION ARBORIZADORA ALTA',
      'URBANIZACIÓN  ARBORIZADORA ALTA',   // doble espacio
      'Urbanizacion Arborizadota Alta'     // typo “Arborizadota”
    ], `
      <p>Este es un parque local clasificado como un espacio de proximidad. Sirve como un área fundamental para el disfrute de la comunidad en la urbanización, brindando a sus habitantes un lugar cercano para la recreación y el esparcimiento.</p>
    `);

    add(['URBANIZACION CANDELARIA LA NUEVA PRIMER SECTOR'], `
      <p>Candelaria La Nueva Primer Sector: Este es un parque destacado por su infraestructura deportiva. Ubicado en la Calle 62B Sur # 22-47, cuenta con una piscina semiolímpica, una piscina recreativa para niños, canchas de microfútbol, baloncesto y voleibol, así como zonas de ejercicio con unidades de multifuerza. Es un espacio fundamental para la actividad física y el deporte en el sector.</p>
    `);

    return D;
  })();

  function descripcionPorNombre(nombreParque){
    return DESCRIPCIONES_POR_NOMBRE[norm(nombreParque)] || '';
  }

  function mostrarDescripcionEnPanel(nombre, htmlDescripcion, subtitulo){
    const panel = document.getElementById(DETALLE_HOST_ID);
    if (!panel) return;
    panel.innerHTML = `
      <h3>${escapeHtml(nombre || 'Parque')}</h3>
      ${subtitulo ? `<p style="margin:.25rem 0 .5rem 0"><em>${escapeHtml(subtitulo)}</em></p>` : ''}
      ${htmlDescripcion || '<p>Sin descripción disponible.</p>'}
    `;
  }

  // ===== Robustez coordenadas / fit =====
  const isLonLat = ([x,y])=> Math.abs(x)<=180 && Math.abs(y)<=90;
  const isLatLon = ([x,y])=> Math.abs(x)<=90  && Math.abs(y)<=180;
  function mapCoords(geom, fn){
    const t=geom.type, c=geom.coordinates;
    if (t==='Point') return {type:t, coordinates:fn(c)};
    if (t==='MultiPoint'||t==='LineString') return {type:t, coordinates:c.map(fn)};
    if (t==='MultiLineString'||t==='Polygon') return {type:t, coordinates:c.map(r=>r.map(fn))};
    if (t==='MultiPolygon') return {type:t, coordinates:c.map(p=>p.map(r=>r.map(fn)))}; 
    if (t==='GeometryCollection') return {type:t, geometries: geom.geometries.map(g=>mapCoords(g,fn))};
    return geom;
  }
  function maybeFlipGeoJSON(gj){
    try{
      const f=gj.features?.[0]; if(!f?.geometry) return gj; let sample=null;
      (function take(g){const t=g.type,c=g.coordinates; if(t==='Point') sample=c;
        else if(t==='MultiPoint'||t==='LineString') sample=c[0];
        else if(t==='Polygon'||t==='MultiLineString') sample=c[0][0];
        else if(t==='MultiPolygon') sample=c[0][0][0];
        else if(t==='GeometryCollection'&&g.geometries?.length) take(g.geometries[0]);})(f.geometry);
      if(!sample||sample.length<2) return gj;
      if (isLatLon(sample) && !isLonLat(sample)){
        return { type:'FeatureCollection',
          features: gj.features.map(feat=>({ ...feat, geometry: mapCoords(feat.geometry, ([a,b,...r])=>[b,a,...r]) }))
        };
      }
      return gj;
    }catch{ return gj; }
  }
  function safeFitToLayer(lyr, fallbackCenter=initialCenter, fallbackZoom=13){
    try{
      const b=lyr.getBounds();
      if(b?.isValid()){
        const sw=b.getSouthWest(), ne=b.getNorthEast();
        if(Math.abs(sw.lng)<=180 && Math.abs(ne.lng)<=180 && Math.abs(sw.lat)<=90 && Math.abs(ne.lat)<=90){
          return map.fitBounds(b.pad(0.1));
        }
      }
    }catch{}
    map.setView(fallbackCenter, fallbackZoom);
  }

  // ====== Turf loader + RECORTE ======
  function ensureTurf(){
    if (window.turf) return Promise.resolve();
    return new Promise((resolve, reject)=>{
      const s=document.createElement('script');
      s.src='https://unpkg.com/@turf/turf@6.5.0/turf.min.js';
      s.async=true; s.onload=()=>resolve(); s.onerror=()=>reject(new Error('No se pudo cargar Turf.js'));
      document.head.appendChild(s);
    });
  }

  function clipToBarrio(parquesFC, barrioFC){
    if (!window.turf) {
      console.error('Turf no disponible para recorte');
      return { type:'FeatureCollection', features:[] };
    }
    // Disolver barrio
    let barrioGeom = null;
    try{
      const feats = (barrioFC.features||[]).filter(f=>f && f.geometry);
      if (!feats.length) return { type:'FeatureCollection', features:[] };
      barrioGeom = feats[0];
      for (let i=1;i<feats.length;i++){
        const u=turf.union(barrioGeom, feats[i]);
        if (u) barrioGeom=u;
      }
    }catch{
      try{ barrioGeom = turf.combine(barrioFC).features[0]; }catch{ return {type:'FeatureCollection',features:[]}; }
    }

    const out=[];
    for (const f of (parquesFC.features||[])){
      if(!f?.geometry) continue;
      try{
        const inter = turf.intersect(f, barrioGeom);
        if (inter?.geometry){ inter.properties={...f.properties}; out.push(inter); }
      }catch{
        try{ if(turf.booleanWithin(f,barrioGeom)) out.push(f); }catch{}
      }
    }
    return { type:'FeatureCollection', features: out };
  }

  // ====== CAPAS ======
  map.createPane('barrioPane');
  const barrioPane = map.getPane('barrioPane');
  barrioPane.style.zIndex = 610;
  barrioPane.style.pointerEvents = 'none';

  const barrioLayer = L.geoJSON(null, {
    pane:'barrioPane',
    style:()=>({ color:'#0f766e', weight:5, dashArray:'12 6 3 6', lineCap:'round', lineJoin:'round', fill:false, fillOpacity:0 })
  }).addTo(map);

  const parquesLayer = L.geoJSON(null, {
    style:()=>({ color:'#14532d', weight:2, fillColor:'#34d399', fillOpacity:0.45 }),
    onEachFeature:(feature, layer)=>{
      const p      = feature.properties || {};
      const nombre = getTitulo(p);
      const tipo   = getTipo(p);
      const m2     = getAreaM2(p);
      const extTxt = fmtArea(m2);

      const imgExact = 'imgparques/' + encodeURIComponent(nombre) + '.jpg';
      const imgSlug  = 'imgparques/' + toNameSlug(nombre) + '.jpg';

      // Tooltip
      layer.bindTooltip(`
        <div class="tt-attrs">
          <div><strong>Parque:</strong> ${escapeHtml(nombre)}</div>
          <div><strong>Tipo de parque:</strong> ${escapeHtml(tipo)}</div>
          <div><strong>Extensión:</strong> ${extTxt}</div>
        </div>`, { sticky:true, direction:'top', className:'info-tooltip' });

      // Popup
      layer.bindPopup(`
        <div style="max-width:340px">
          <img src="${imgExact}" alt="${escapeHtml(nombre)}"
               style="width:100%;height:auto;border-radius:8px;margin-bottom:.5rem;"
               onerror="if(!this.dataset.trySlug){this.dataset.trySlug=1;this.src='${imgSlug}';}else{this.onerror=null;this.src='img/placeholder.jpg';}">
          <div class="tt-attrs">
            <div><strong>Parque:</strong> ${escapeHtml(nombre)}</div>
            <div><strong>Tipo de parque:</strong> ${escapeHtml(tipo)}</div>
            <div><strong>Extensión:</strong> ${extTxt}</div>
          </div>
        </div>`);

      // Click => descripción manual por NOMBRE_PAR
      layer.on('click', ()=>{
        const htmlDesc = descripcionPorNombre(nombre);
        mostrarDescripcionEnPanel(nombre, htmlDesc || '<p>Sin descripción disponible.</p>', tipo);
        if (!htmlDesc) console.warn('Falta descripción para:', nombre, '→ clave:', norm(nombre));
      });

      // Hover highlight
      layer.on({
        mouseover: e=> e.target.setStyle({ weight:3, fillOpacity:0.55 }),
        mouseout:  e=> parquesLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);

  // ====== CARGA + RECORTE ======
  const barrioPromise  = fetch('arbalta_barrio_4326.geojson').then(r=>r.json()).then(maybeFlipGeoJSON);
  const parquesPromise = fetch('arbalta_parques_4326.geojson').then(r=>r.json()).then(maybeFlipGeoJSON);

  Promise.all([ensureTurf(), barrioPromise, parquesPromise])
    .then(([_, barrioFC, parquesFC])=>{
      barrioLayer.addData(barrioFC);                 // dibuja barrio
      const clipped = clipToBarrio(parquesFC, barrioFC); // recorta parques
      parquesLayer.clearLayers();
      parquesLayer.addData(clipped);
      const group = L.featureGroup([barrioLayer, parquesLayer]);
      safeFitToLayer(group);
    })
    .catch(err=>{
      console.error('Error en carga/recorte:', err);
      // fallback: mostrar parques sin recorte
      parquesPromise.then(p=>{
        parquesLayer.addData(p);
        safeFitToLayer(parquesLayer);
      });
    });
});