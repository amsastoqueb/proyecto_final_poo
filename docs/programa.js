
// Crear el mapa centrado inicialmente en Bogotá
var map = L.map('map').setView([4.60971, -74.08175], 11);

// Agregar capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Variables para capas GeoJSON
var municipiosLayer, localidadesLayer, barriosLayer;

// Función para cargar GeoJSON con filtro y estilo
function cargarGeoJSON(url, filtro, estilo) {
    return fetch(url)
        .then(response => response.json())
        .then(data => {
            // Filtrar features según el filtro pasado
            var featuresFiltradas = data.features.filter(f => {
                for (let key in filtro) {
                    if (f.properties[key] !== filtro[key]) return false;
                }
                return true;
            });
            var geojsonFiltrado = {
                type: "FeatureCollection",
                features: featuresFiltradas
            };
            // Crear la capa Leaflet
            return L.geoJSON(geojsonFiltrado, { style: estilo });
        });
}

// Estilo de los polígonos
var estiloPoligono = {
    color: "#0D3B66",     // borde azul oscuro
    fillColor: "#A9D6E5", // relleno azul pastel
    weight: 2,
    opacity: 1,
    fillOpacity: 0.6
};

// Funciones para los botones
function verMunicipio() {
    if (municipiosLayer) map.removeLayer(municipiosLayer);
    if (localidadesLayer) map.removeLayer(localidadesLayer);
    if (barriosLayer) map.removeLayer(barriosLayer);

    cargarGeoJSON('municipios.geojson', {"nombre_mpi": "SANTAFE DE BOGOTA D.C."}, estiloPoligono)
        .then(layer => {
            municipiosLayer = layer.addTo(map);
            map.fitBounds(layer.getBounds());
        });
}

function verLocalidad() {
    if (municipiosLayer) map.removeLayer(municipiosLayer);
    if (localidadesLayer) map.removeLayer(localidadesLayer);
    if (barriosLayer) map.removeLayer(barriosLayer);

    cargarGeoJSON('poligonos-localidades.geojson', {"Nombre de la localidad": "CIUDAD BOLIVAR"}, estiloPoligono)
        .then(layer => {
            localidadesLayer = layer.addTo(map);
            map.fitBounds(layer.getBounds());
        });
}

function verBarrio() {
    if (municipiosLayer) map.removeLayer(municipiosLayer);
    if (localidadesLayer) map.removeLayer(localidadesLayer);
    if (barriosLayer) map.removeLayer(barriosLayer);

    cargarGeoJSON('barrios.geojson', {"barriocomu": "Arborizadora Alta"}, estiloPoligono)
        .then(layer => {
            barriosLayer = layer.addTo(map);
            map.fitBounds(layer.getBounds());
        });
}
