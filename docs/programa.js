document.addEventListener("DOMContentLoaded", () => {
    console.log("Página cargada correctamente.");
});
0

// Inicializar el mapa centrado en Bogotá
const map = L.map('map').setView([4.60971, -74.08175], 11);

// Capa base (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// -------- 1. MUNICIPIO --------
fetch("https://bogota-laburbano.opendatasoft.com/api/explore/v2.1/catalog/datasets/shapes/records")
  .then(res => res.json())
  .then(data => {
    // Filtrar solo el municipio de Bogotá
    const bogota = data.results.filter(f => f.nombre_mpi === "SANTAFE DE BOGOTA D.C");
    
    bogota.forEach(feature => {
      L.geoJSON(feature.geo_shape, {
        style: { 
          color: "darkgreen",       // Borde verde oscuro
          weight: 2, 
          fillColor: "lightgreen",  // Relleno verde claro pastel
          fillOpacity: 0.5
        }
      }).addTo(map).bindPopup("Municipio: SANTAFE DE BOGOTA D.C");
    });
  })
  .catch(err => console.error("Error cargando municipios:", err));

// -------- 2. LOCALIDAD --------
fetch("https://bogota-laburbano.opendatasoft.com/api/explore/v2.1/catalog/datasets/barrios_prueba/records")
  .then(res => res.json())
  .then(data => {
    const localidad = data.results.filter(f => f.Localidad === "Ciudad Bolívar");
    localidad.forEach(feature => {
      L.geoJSON(feature.geo_shape, {
        style: { color: "green", weight: 2, fillOpacity: 0.1 }
      }).addTo(map).bindPopup("Localidad: Ciudad Bolívar");
    });
  })
  .catch(err => console.error("Error cargando localidades:", err));

// -------- 3. BARRIO --------
fetch("https://bogota-laburbano.opendatasoft.com/api/explore/v2.1/catalog/datasets/barrios_prueba/records")
  .then(res => res.json())
  .then(data => {
    const barrio = data.results.filter(f => f.Nombre === "Arborizadora Alta");
    barrio.forEach(feature => {
      L.geoJSON(feature.geo_shape, {
        style: { color: "red", weight: 2, fillOpacity: 0.2 }
      }).addTo(map).bindPopup("Barrio: Arborizadora Alta");
    });
  })
  .catch(err => console.error("Error cargando barrios:", err));


