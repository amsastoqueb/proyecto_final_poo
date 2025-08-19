document.addEventListener('DOMContentLoaded', () => {
  // ======== CONFIG CHARTS ========
  const meses = [
    { id: 'enero',      label: 'Enero' },
    { id: 'febrero',    label: 'Febrero' },
    { id: 'marzo',      label: 'Marzo' },
    { id: 'abril',      label: 'Abril' },
    { id: 'mayo',       label: 'Mayo' },
    { id: 'junio',      label: 'Junio' },
    { id: 'julio',      label: 'Julio' },
    { id: 'agosto',     label: 'Agosto' },
    { id: 'septiembre', label: 'Septiembre' },
    { id: 'octubre',    label: 'Octubre' },
    { id: 'noviembre',  label: 'Noviembre' },
  ];
  const DATA_DIR = 'grafPM10';
  const filenameFor = (idMes) => `${DATA_DIR}/contCB_${idMes}2023.geojson`;

  // ======== HELPERS COMUNES ========
  const chartsTrack = document.getElementById('chartsTrack');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');

  function norm(s){
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().toLowerCase();
  }
  function pickPM10Value(props){
    const candidates = [
      'valor','VALOR','Valor','pm10','PM10','Pm10',
      'concentracion','concentración','CONCENTRACION','CONCENTRACIÓN',
      'concentracion_pm10','CONCENTRACION_PM10'
    ];
    for (const k of candidates){
      if (k in props){
        const v = Number(props[k]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  // ======== VISOR LEAFLET (ANTES DE LAS GRÁFICAS) ========
  const initialCenter = [4.6097, -74.0817]; // Bogotá

  const mapEl = document.getElementById('map');
  if (mapEl && typeof L !== 'undefined'){
    const map = L.map('map', { center: initialCenter, zoom: 13 });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Helpers
    function maybeFlipGeoJSON(gj){ try{
      const f=gj.features?.[0]; if(!f?.geometry) return gj; let sample=null;
      (function take(g){const t=g.type,c=g.coordinates; if(t==='Point') sample=c;
        else if(t==='MultiPoint'||t==='LineString') sample=c[0];
        else if(t==='Polygon'||t==='MultiLineString') sample=c[0][0];
        else if(t==='MultiPolygon') sample=c[0][0][0]; })(f.geometry);
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
    function safeFitToLayer(group, fallbackCenter=initialCenter, fallbackZoom=13){
      try{
        const b=group.getBounds();
        if(b?.isValid()){
          const sw=b.getSouthWest(), ne=b.getNorthEast();
          if(Math.abs(sw.lng)<=180 && Math.abs(ne.lng)<=180 && Math.abs(sw.lat)<=90 && Math.abs(ne.lat)<=90){
            map.fitBounds(b.pad(0.08)); return;
          }
        }
      }catch{}
      map.setView(fallbackCenter, fallbackZoom);
    }

    // ===== Barrio (borde) con tooltip en hover =====
    const barrioLayer = L.geoJSON(null, {
      style:()=>({ color:'#0e9f6e', weight:4, dashArray:'10 6', fill:false, opacity:0.95 }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip('Barrio Arborizadora Alta', {
          sticky: true,
          direction: 'top',
          className: 'barrio-tooltip'
        });
        layer.on({
          mouseover: (e)=> e.target.setStyle({ weight:6 }),
          mouseout:  (e)=> barrioLayer.resetStyle(e.target)
        });
      }
    }).addTo(map);

    // ===== PM10 enero 2023 (solo estación Ciudad Bolívar) =====
    const pm10Layer = L.geoJSON(null, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 3, color:'#2563eb', weight:1, fillColor:'#60a5fa', fillOpacity:0.7
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const val = pickPM10Value(p);
        const when = p.fecha_hora ?? p.FECHA_HORA ?? p.fecha ?? p.datetime ?? '';
        const est  = p.estacion   ?? p.ESTACION   ?? p.Estacion ?? '';
        layer.bindTooltip(
          `<strong>${est || 'Estación'}</strong><br>${when || '—'}<br>PM10: ${val ?? '—'}`,
          { sticky:true }
        );
      }
    }).addTo(map);

    let stationMarker = null;

    // Cargas
    const barrioPromise = fetch('arbalta_barrio_4326.geojson')
      .then(r=>r.json()).then(maybeFlipGeoJSON).then(fc=>barrioLayer.addData(fc));

    const contPromise = fetch('grafPM10/contCB_enero2023.geojson')
      .then(r=>r.json())
      .then(maybeFlipGeoJSON)
      .then(fc=>{
        const target = norm('Ciudad Bolivar');
        // FILTRAR SOLO ESTACIÓN CIUDAD BOLÍVAR
        const filtered = {
          type:'FeatureCollection',
          features: (fc.features || []).filter(f =>
            norm(f?.properties?.estacion ?? f?.properties?.ESTACION ?? f?.properties?.Estacion ?? '') === target
          )
        };
        pm10Layer.addData(filtered);

        // Crear marcador de la estación (del primer punto filtrado)
        const f0 = filtered.features.find(feat => feat.geometry?.type === 'Point');
        if (f0){
          const [lng, lat] = f0.geometry.coordinates;
          stationMarker = L.marker([lat, lng], { title:'Estación Ciudad Bolívar' })
            .addTo(map)
            .bindPopup('<strong>Estación:</strong> Ciudad Bolívar');
        }
      });

    Promise.allSettled([barrioPromise, contPromise]).then(()=>{
      const group = L.featureGroup([barrioLayer, pm10Layer, stationMarker].filter(Boolean));
      safeFitToLayer(group);
    });
  }

  // ======== GRÁFICAS ========
  function createChartCard(mes){
    const card = document.createElement('div');
    card.className = 'chart-card';
    const title = document.createElement('h3');
    title.className = 'chart-title';
    title.textContent = `Contaminante PM10 de ${mes.label} de 2023`;
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${mes.id}-2023`;
    card.appendChild(title);
    card.appendChild(canvas);
    chartsTrack.appendChild(card);
    return canvas;
  }

  function drawEmpty(mes, msg){
    const ctx = createChartCard(mes).getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: { datasets: [{ label:'PM10', data:[{ x:new Date(), y:0 }], borderWidth:2, pointRadius:0, tension:0.25 }] },
      options: {
        responsive:true, maintainAspectRatio:false, animation:false, resizeDelay:50,
        plugins:{ legend:{display:false}, tooltip:{enabled:false}, title:{display:true, text:msg} },
        scales:{
          x:{ type:'time', time:{ unit:'day', tooltipFormat:'yyyy-MM-dd HH:mm', displayFormats:{ day:'yyyy-MM-dd', hour:'yyyy-MM-dd HH:mm' } },
              ticks:{ minRotation:45, maxRotation:45 }, title:{ display:true, text:'Fecha y Hora' } },
          y:{ title:{ display:true, text:'PM10' }, beginAtZero:true }
        }
      }
    });
  }

  function drawChart(mes, points){
    const ctx = createChartCard(mes).getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: { datasets: [{ label:'PM10', data: points.map(p=>({x:p.x,y:p.y})), borderWidth:2, borderColor:'#1f2937', backgroundColor:'rgba(31,41,55,.08)', pointRadius:0, hoverRadius:3, tension:0.25 }] },
      options: {
        responsive:true, maintainAspectRatio:false, animation:false, resizeDelay:50,
        plugins:{ legend:{display:false}, tooltip:{enabled:true, intersect:false, mode:'index',
          callbacks:{ title:(items)=>{const d=items?.[0]?.parsed?.x; return d ? new Date(d).toLocaleString('sv-SE').replace('T',' ') : ''; } } } },
        scales:{
          x:{ type:'time', time:{ unit:'day', tooltipFormat:'yyyy-MM-dd HH:mm', displayFormats:{ day:'yyyy-MM-dd', hour:'yyyy-MM-dd HH:mm' } },
              ticks:{ minRotation:45, maxRotation:45 }, title:{ display:true, text:'Fecha y Hora' } },
          y:{ title:{ display:true, text:'PM10' }, beginAtZero:true }
        }
      }
    });
  }

  async function loadAndPlotMonth(mes){
    const file = filenameFor(mes.id);
    let gj;
    try{
      const r = await fetch(file);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      gj = await r.json();
    }catch(e){
      console.error('No se pudo cargar', file, e);
      drawEmpty(mes, `Sin datos (${mes.label})`);
      return;
    }

    const feats = Array.isArray(gj?.features) ? gj.features : [];
    const target = norm('Ciudad Bolivar'); // estación objetivo
    const filtered = feats.filter(f => {
      const p = f?.properties || {};
      const est = norm(p.estacion ?? p.ESTACION ?? p.Estacion ?? '');
      const cont = norm(p.contaminante ?? p.CONTAMINANTE ?? '');
      return est === target && cont === 'pm10';
    });

    const points = [];
    for (const f of filtered){
      const p = f.properties || {};
      const when = p.fecha_hora ?? p.FECHA_HORA ?? p.fecha ?? p.datetime ?? null;
      const val = pickPM10Value(p);
      if (!when || val==null) continue;
      const d = new Date(when);
      if (isNaN(d)) continue;
      points.push({ x: d, y: val, t: d.getTime() });
    }

    points.sort((a,b) => a.t - b.t);
    if (!points.length){
      drawEmpty(mes, `Sin datos válidos (${mes.label})`);
      return;
    }
    drawChart(mes, points);
  }

  (async function initCharts(){
    for (const mes of meses){ await loadAndPlotMonth(mes); }
  })();

  // Navegación del carrusel
  function scrollByOneCard(dir = 1){
    const step = chartsTrack.clientWidth;
    chartsTrack.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  btnPrev?.addEventListener('click', () => scrollByOneCard(-1));
  btnNext?.addEventListener('click', () => scrollByOneCard(1));
});