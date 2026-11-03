
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

  // USGS National Map
  L.tileLayer(
    "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        'Map: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS National Map</a>'
    }
  ).addTo(map);

  // Radar settings
  let radarLayer = null;
  let radarVisible = true;

  // NWS warning settings
  let warningLayer = L.geoJSON(null, {
    style: styleWarning,
    onEachFeature: addWarningPopup
  }).addTo(map);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // Warning colors
  function getWarningColor(event) {
    const name = (event || "").toLowerCase();

    if (name.includes("tornado warning")) return "#ff2020";
    if (name.includes("severe thunderstorm warning")) return "#ff8c00";
    if (name.includes("flash flood warning")) return "#a855f7";
    if (name.includes("tornado watch")) return "#2678ff";
    if (name.includes("severe thunderstorm watch")) return "#ffd21f";
    if (name.includes("flash flood watch")) return "#22c55e";
    if (name.includes("winter storm")) return "#38bdf8";
    if (name.includes("blizzard")) return "#60a5fa";
    if (name.includes("snow squall")) return "#93c5fd";

    return "#facc15";
  }

  function styleWarning(feature) {
    const event = feature.properties?.event || "";
    const color = getWarningColor(event);

    return {
      color,
      weight: 2.5,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: 0.16
    };
  }

  // Popup when a warning is clicked
  function addWarningPopup(feature, layer) {
    const p = feature.properties || {};

    const event = escapeHTML(p.event || "Weather Alert");
    const headline = escapeHTML(p.headline || "");
    const area = escapeHTML(p.areaDesc || "Area not specified");
    const severity = escapeHTML(p.severity || "Unknown");
    const urgency = escapeHTML(p.urgency || "Unknown");
    const expires = p.expires
      ? new Date(p.expires).toLocaleString()
      : "Not specified";

    const description = escapeHTML(p.description || "");
    const instruction = escapeHTML(p.instruction || "");

    const color = getWarningColor(p.event);

    const popup = `
      <div style="min-width:220px;max-width:320px;color:#111;">
        <div style="
          background:${color};
          color:#111;
          padding:8px;
          margin:-2px -2px 10px;
          border-radius:4px;
          font-weight:800;
        ">
          ${event}
        </div>

        <strong>${headline}</strong>

        <p><strong>Area:</strong> ${area}</p>
        <p><strong>Severity:</strong> ${severity}</p>
        <p><strong>Urgency:</strong> ${urgency}</p>
        <p><strong>Expires:</strong> ${escapeHTML(expires)}</p>

        ${description
          ? `<details><summary>Alert description</summary><p>${description}</p></details>`
          : ""}

        ${instruction
          ? `<details><summary>Safety instructions</summary><p>${instruction}</p></details>`
          : ""}

        ${p.web
          ? `<p><a href="${escapeHTML(p.web)}" target="_blank" rel="noopener">Official NWS alert</a></p>`
          : ""}
      </div>
    `;

    layer.bindPopup(popup);
  }

  // Load active NWS alerts
  async function loadWarnings() {
    try {
      const response = await fetch("/api/weather/alerts", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("NWS alert service returned an error");
      }

      const data = await response.json();

      const features =
        data.features ||
        data.alerts?.features ||
        data.data?.features ||
        [];

      warningLayer.clearLayers();

      const validFeatures = features.filter(feature =>
        feature.geometry &&
        feature.geometry.type &&
        feature.properties
      );

      warningLayer.addData(validFeatures);

      const count = validFeatures.length;

      const warningCount = validFeatures.filter(feature => {
        const event = (feature.properties?.event || "").toLowerCase();
        return event.includes("warning");
      }).length;

      const watchCount = validFeatures.filter(feature => {
        const event = (feature.properties?.event || "").toLowerCase();
        return event.includes("watch");
      }).length;

      const warningStatus =
        `${count} active NWS alerts · ${warningCount} warnings · ${watchCount} watches`;

      if (status) {
        status.textContent = warningStatus;
      }

      console.log("NWS alerts loaded:", count);

    } catch (error) {
      console.error("NWS warning error:", error);

      if (status) {
        status.textContent =
          "Weather alerts unavailable. Check the NWS alert service.";
      }
    }
  }

  // Load RainViewer radar
  async function loadRadar() {
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json"
      );

      if (!response.ok) {
        throw new Error("RainViewer response unsuccessful");
      }

      const data = await response.json();
      const frames = data.radar?.past || [];
      const frame = frames[frames.length - 1];

      if (!frame) {
        throw new Error("No radar frames available");
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

      console.log(
        "Radar frame loaded:",
        new Date(frame.time * 1000).toLocaleTimeString()
      );

    } catch (error) {
      console.error("Radar loading error:", error);
    }
  }

  // Layer controls
  L.control.layers(
    {},
    {
      "Weather Radar": radarLayer || L.layerGroup(),
      "NWS Warnings & Watches": warningLayer
    },
    { collapsed: true }
  ).addTo(map);

  // Scale
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

  // Refresh radar and warnings
  document.getElementById("refreshRadar")?.addEventListener("click", () => {
    loadRadar();
    loadWarnings();
  });

  // Toggle radar
  document.getElementById("toggleRadar")?.addEventListener("click", event => {
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

  // Initial loading
  map.whenReady(() => {
    map.invalidateSize();
    loadRadar();
    loadWarnings();
  });

  // Refresh radar every 10 minutes
  setInterval(loadRadar, 10 * 60 * 1000);

  // Refresh NWS warnings every 5 minutes
  setInterval(loadWarnings, 5 * 60 * 1000);

  // Resize map
  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

})();
