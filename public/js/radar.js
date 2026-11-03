
(() => {
  const status = document.getElementById("radarStatus");
  const radarMap = document.getElementById("radarMap");

  if (!radarMap) return;

  if (!window.L) {
    if (status) status.textContent = "Map library failed to load.";
    return;
  }

  // Initialize map
  const map = L.map("radarMap", {
    center: [39.5, -98.35],
    zoom: 4,
    minZoom: 3,
    maxZoom: 19
  });

  // OpenStreetMap community tile server
  const osmLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
    }
  );

  osmLayer.addTo(map);

  // Radar settings
  let radarLayer = null;
  let radarVisible = true;

  // Load RainViewer radar
  async function loadRadar() {
    if (status) {
      status.textContent = "Loading latest available radar frame...";
    }

    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json"
      );

      if (!response.ok) {
        throw new Error("Radar provider response was unsuccessful");
      }

      const data = await response.json();
      const frames = data.radar?.past || [];
      const frame = frames[frames.length - 1];

      if (!frame) {
        throw new Error("No radar frames are currently available");
      }

      if (radarLayer) {
        map.removeLayer(radarLayer);
      }

      radarLayer = L.tileLayer(
        `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        {
          opacity: 0.68,
          tileSize: 256,
          maxZoom: 12,
          attribution: "Radar: RainViewer"
        }
      );

      if (radarVisible) {
        radarLayer.addTo(map);
      }

      const date = new Date(frame.time * 1000);

      if (status) {
        status.textContent =
          `Radar frame: ${date.toLocaleTimeString()} · Source: RainViewer`;
      }

    } catch (error) {
      if (status) {
        status.textContent =
          `Radar layer unavailable: ${error.message}. OpenStreetMap remains available.`;
      }
    }
  }

  // Map scale
  L.control.scale().addTo(map);

  // Erie reference marker
  L.marker([42.1292, -80.0851])
    .addTo(map)
    .bindPopup(
      "<strong>Erie, Pennsylvania</strong><br>Regional reference point"
    );

  // National view
  document.getElementById("nationalView")?.addEventListener("click", () => {
    map.setView([39.5, -98.35], 4);
  });

  // Erie view
  document.getElementById("erieView")?.addEventListener("click", () => {
    map.setView([42.1292, -80.0851], 8);
  });

  // Refresh radar
  document.getElementById("refreshRadar")?.addEventListener("click", () => {
    loadRadar();
  });

  // Show/hide radar
  document.getElementById("toggleRadar")?.addEventListener("click", (event) => {
    radarVisible = !radarVisible;

    if (radarLayer) {
      if (radarVisible) {
        radarLayer.addTo(map);
      } else {
        map.removeLayer(radarLayer);
      }
    }

    event.currentTarget.textContent = radarVisible
      ? "Hide Radar Layer"
      : "Show Radar Layer";
  });

  // Initial load
  map.whenReady(() => {
    map.invalidateSize();
    loadRadar();
  });

  // Resize map when window changes
  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

  // Refresh radar every 10 minutes
  setInterval(loadRadar, 10 * 60 * 1000);

})();
