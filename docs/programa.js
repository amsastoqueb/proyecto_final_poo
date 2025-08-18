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
fetch("https://www.datos.gov.co/resource/tu_api_municipios.geojson?$where=NOMBRE_MPI='SANTAFE DE BOGOTA D.C'")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "blue", weight: 2, fillOpacity: 0.05 }
    }).addTo(map).bindPopup("Municipio: SANTAFE DE BOGOTA D.C");
  })
  .catch(err => console.error("Error cargando municipios:", err));

// -------- 2. LOCALIDAD --------
fetch("https://www.datos.gov.co/resource/tu_api_localidades.geojson?$where=Localidad='Ciudad Bolívar'")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "green", weight: 2, fillOpacity: 0.1 }
    }).addTo(map).bindPopup("Localidad: Ciudad Bolívar");
  })
  .catch(err => console.error("Error cargando localidades:", err));

// -------- 3. BARRIO --------
fetch("https://www.datos.gov.co/resource/tu_api_barrios.geojson?$where=Nombre='Arborizadora Alta'")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "red", weight: 2, fillOpacity: 0.2 }
    }).addTo(map).bindPopup("Barrio: Arborizadora Alta");
  })
  .catch(err => console.error("Error cargando barrios:", err));

