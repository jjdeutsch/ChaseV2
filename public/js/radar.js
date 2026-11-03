(() => {
  const status = document.getElementById("radarStatus");
  if (!document.getElementById("radarMap")) return;
  if (!window.L) { status.textContent = "Map library failed to load."; return; }

  const map = L.map("radarMap", { center: [39.5, -98.35], zoom: 4 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  let radarLayer = null;
  let radarVisible = true;
  async function loadRadar() {
    status.textContent = "Loading latest available radar frame...";
    try {
      const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!response.ok) throw new Error("Radar provider response was not successful");
      const data = await response.json();
      const frames = data.radar?.past || [];
      const frame = frames[frames.length - 1];
      if (!frame) throw new Error("No radar frames are currently available");
      if (radarLayer) map.removeLayer(radarLayer);
      radarLayer = L.tileLayer(`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0.68, tileSize: 256, maxZoom: 12, attribution: "Radar: RainViewer"
      });
      if (radarVisible) radarLayer.addTo(map);
      const date = new Date(frame.time * 1000);
      status.textContent = `Radar frame: ${date.toLocaleTimeString()} · Source: RainViewer`;
    } catch (error) {
      status.textContent = `Radar layer unavailable: ${error.message}. Base map remains available.`;
    }
  }

  L.control.scale().addTo(map);
  L.marker([42.1292, -80.0851]).addTo(map).bindPopup("<strong>Erie, Pennsylvania</strong><br>Regional reference point");
  document.getElementById("nationalView").addEventListener("click", () => map.setView([39.5, -98.35], 4));
  document.getElementById("erieView").addEventListener("click", () => map.setView([42.1292, -80.0851], 8));
  document.getElementById("refreshRadar").addEventListener("click", loadRadar);
  document.getElementById("toggleRadar").addEventListener("click", (event) => {
    radarVisible = !radarVisible;
    if (radarLayer) radarVisible ? radarLayer.addTo(map) : map.removeLayer(radarLayer);
    event.currentTarget.textContent = radarVisible ? "Hide Radar Layer" : "Show Radar Layer";
  });
  map.whenReady(() => { map.invalidateSize(); loadRadar(); });
  window.addEventListener("resize", () => map.invalidateSize());
  setInterval(loadRadar, 10 * 60 * 1000);
})();