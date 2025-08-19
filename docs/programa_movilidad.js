document.addEventListener('DOMContentLoaded', () => { 
  const initialCenter = [4.6097, -74.0817];

  const map = L.map('map', { center: initialCenter, zoom: 13 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', className: 'green-tiles'
  }).addTo(map);

  // ==== Helpers ====
  function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function toSlug(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^\w\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,''); }
  function maybeFlipGeoJSON(gj){ try{
      const f=gj.features?.[0]; if(!f?.geometry) return gj; let sample=null;
      (function take(g){const t=g.type,c=g.coordinates; if(t==='Point') sample=c; else if(t==='MultiPoint'||t==='LineString') sample=c[0];
        else if(t==='Polygon'||t==='MultiLineString') sample=c[0][0]; else if(t==='MultiPolygon') sample=c[0][0][0]; })(f.geometry);
      if(!sample||sample.length<2) return gj;
      const isLatLon = (a)=> Math.abs(a[0])<=90 && Math.abs(a[1])<=180;
      const isLonLat = (a)=> Math.abs(a[0])<=180 && Math.abs(a[1])<=90;
      if(isLatLon(sample)&&!isLonLat(sample)){
        const mapCoords=(geom,fn)=>{ const t=geom.type,c=geom.coordinates;
          if(t==='Point') return {type:t, coordinates:fn(c)};
          if(t==='MultiPoint'||t==='LineString') return {type:t, coordinates:c.map(fn)};
          if(t==='MultiLineString'||t==='Polygon') return {type:t, coordinates:c.map(r=>r.map(fn))};
          if(t==='MultiPolygon') return {type:t, coordinates:c.map(p=>p.map(r=>r.map(fn)))}; return geom; };
        return { type:'FeatureCollection', features: gj.features.map(feat=>({ ...feat, geometry: mapCoords(feat.geometry, ([a,b,...r])=>[b,a,...r]) })) };
      }
      return gj;
    }catch{ return gj; } }
  function safeFitToLayer(lyr, fallbackCenter=initialCenter, fallbackZoom=13){
    try{ const b=lyr.getBounds(); if(b?.isValid()){ const sw=b.getSouthWest(), ne=b.getNorthEast();
        if(Math.abs(sw.lng)<=180 && Math.abs(ne.lng)<=180 && Math.abs(sw.lat)<=90 && Math.abs(ne.lat)<=90) return map.fitBounds(b.pad(0.1)); } }
    catch{} map.setView(fallbackCenter, fallbackZoom);
  }

  // ====== Panes y orden de dibujo ======
  map.createPane('barrioPane');    map.getPane('barrioPane').style.zIndex = 610;  map.getPane('barrioPane').style.pointerEvents='none';
  map.createPane('rutasPane');     map.getPane('rutasPane').style.zIndex  = 640;  // debajo de paraderos
  map.createPane('paraderosPane'); map.getPane('paraderosPane').style.zIndex = 650; // ENCIMA de rutas

  // ====== BARRIO (borde) ======
  const barrioLayer = L.geoJSON(null, {
    pane:'barrioPane',
    style:()=>({
      color:'#0d7588ff',
      weight:5,
      dashArray:'12 6 3 6',
      lineCap:'round',
      lineJoin:'round',
      fill:false,
      fillOpacity:0
    })
  }).addTo(map);

  // ====== RUTAS (LineString) — hover SOLO destino_ru ======
  const rutasLayer = L.geoJSON(null, {
    pane:'rutasPane',
    style:()=>({ color:'#1d4ed8', weight:3, opacity:0.9 }),
    onEachFeature:(feature, layer)=>{
      const p = feature.properties || {};
      const destino = p.destino_ru ?? p.DESTINO_RU ?? p.destino ?? '';

      // Tooltip solo con destino
      const html = `<div><strong>Destino:</strong> ${escapeHtml(destino || '—')}</div>`;
      layer.bindTooltip(html, { sticky:true, className:'rutas-tooltip', direction:'top' });

      // “Alumbramiento” en hover
      layer.on({
        mouseover:(e)=>{
          e.target.setStyle({ weight:5, color:'#1e40af' });
          const el=e.target.getElement?.(); if(el) el.style.filter='drop-shadow(0 0 6px rgba(56,189,248,0.9))';
          e.target.bringToFront();
        },
        mouseout:(e)=>{
          rutasLayer.resetStyle(e.target);
          const el=e.target.getElement?.(); if(el) el.style.filter='';
        }
      });
    }
  }).addTo(map);

  // ====== PARADEROS (Point) — popup con IMAGEN por 'direccion_' ======
  const paraderosLayer = L.geoJSON(null, {
    pane:'paraderosPane',
    pointToLayer:(feature, latlng)=> L.circleMarker(latlng, {
      radius:5, color:'#0431acff', weight:2, fillColor:'#0431acff', fillOpacity:0.95
    }),
    onEachFeature:(feature, layer)=>{
      const p = feature.properties || {};
      const nom = p.nombre ?? p.NOMBRE ?? p.Name ?? 'Paradero';
      const via = p.via    ?? p.VIA    ?? '';
      const dir = p.direccion_ ?? p.DIRECCION_ ?? p.direccion ?? p.DIRECCION ?? nom;

      let lon = p.longitud ?? p.LONGITUD ?? p.lon ?? null;
      let lat = p.latitud  ?? p.LATITUD  ?? p.lat ?? null;
      if (lon==null || lat==null){ try{ const ll=layer.getLatLng(); lat=ll.lat; lon=ll.lng; }catch{} }
      const lonTxt = (lon!=null && isFinite(Number(lon))) ? Number(lon).toFixed(6) : '—';
      const latTxt = (lat!=null && isFinite(Number(lat))) ? Number(lat).toFixed(6) : '—';

      // Tooltip breve (nombre + vía)
      const tt = `<strong>${escapeHtml(nom)}</strong>${via ? `<br>${escapeHtml(via)}` : ''}`;
      layer.bindTooltip(tt, { sticky:true, className:'paradero-tooltip', direction:'top' });

      // IMAGEN según 'direccion_' (exacto -> slug -> placeholder)
      const imgExact = 'imgmov/'+encodeURIComponent(dir)+'.png';
      const imgSlug  = 'imgmov/'+toSlug(dir)+'.png';

      const popupHTML = `
        <div style="max-width:340px">
          <img src="${imgExact}" alt="${escapeHtml(dir)}"
               style="width:100%;height:auto;border-radius:8px;margin-bottom:.5rem;"
               onerror="if(!this.dataset.trySlug){this.dataset.trySlug=1;this.src='${imgSlug}';}else{this.onerror=null;this.src='imgmov/placeholder.jpg';}">
          <div class="tt-attrs">
            <div><strong>Nombre:</strong> ${escapeHtml(nom)}</div>
            <div><strong>Vía:</strong> ${escapeHtml(via || '—')}</div>
            <div><strong>Longitud:</strong> ${escapeHtml(lonTxt)}</div>
            <div><strong>Latitud:</strong> ${escapeHtml(latTxt)}</div>
          </div>
        </div>`;
      layer.bindPopup(popupHTML);

      // Alumbramiento en hover
      layer.on({
        mouseover:(e)=>{
          e.target.setStyle({ radius:7, weight:3, fillOpacity:1 });
          const el=e.target.getElement?.(); if(el) el.style.filter='drop-shadow(0 0 6px rgba(167,139,250,0.95))';
          e.target.bringToFront();
        },
        mouseout:(e)=>{
          e.target.setStyle({ radius:5, weight:2, fillOpacity:0.95 });
          const el=e.target.getElement?.(); if(el) el.style.filter='';
        }
      });
    }
  }).addTo(map);

  // ====== Cargas ======
  const barrioPromise    = fetch('arbalta_barrio_4326.geojson').then(r=>r.json()).then(maybeFlipGeoJSON).then(fc=>barrioLayer.addData(fc));
  const rutasPromise     = fetch('rutas.geojson').then(r=>r.json()).then(maybeFlipGeoJSON).then(fc=>rutasLayer.addData(fc));
  const paraderosPromise = fetch('paraderos.geojson').then(r=>r.json()).then(maybeFlipGeoJSON).then(fc=>paraderosLayer.addData(fc));

  Promise.allSettled([barrioPromise, rutasPromise, paraderosPromise]).then(()=>{
    paraderosLayer.bringToFront(); // asegurar puntos encima de líneas
    const group = L.featureGroup([barrioLayer, rutasLayer, paraderosLayer]);
    safeFitToLayer(group);
  });
});
