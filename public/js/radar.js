
(() => {
  const status = document.getElementById("radarStatus");
  const radarMap = document.getElementById("radarMap");

  if (!radarMap || !window.L) {
    if (status) status.textContent = "Map library failed to load.";
    return;
  }

  // ==========================================
  // MAP INITIALIZATION
  // ==========================================

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

  // ==========================================
  // MAP LAYERS
  // ==========================================

  const radarGroup = L.layerGroup().addTo(map);

  const warningLayer = L.geoJSON(null, {
    style: styleWarning,
    onEachFeature: addWarningPopup
  }).addTo(map);

  let radarFrameText = "Radar loading...";
  let alertCountText = "Alerts loading...";

  function updateStatus() {
    if (status) {
      status.textContent =
        `${radarFrameText} | ${alertCountText}`;
    }
  }

  // ==========================================
  // WARNING COLORS
  // ==========================================

  function getWarningColor(event) {
    const name = (event || "").toLowerCase();

    if (name.includes("tornado warning")) return "#ff2020";
    if (name.includes("severe thunderstorm warning")) return "#ff8c00";
    if (name.includes("flash flood warning")) return "#a855f7";
    if (name.includes("tornado watch")) return "#2678ff";
    if (name.includes("severe thunderstorm watch")) return "#ffd21f";
    if (name.includes("winter storm")) return "#38bdf8";
    if (name.includes("blizzard")) return "#60a5fa";

    return "#facc15";
  }

  function styleWarning(feature) {
    const color = getWarningColor(
      feature.properties?.event
    );

    return {
      color,
      weight: 2.5,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: 0.17
    };
  }

  // Safely display NWS information
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // ==========================================
  // WARNING POPUPS
  // ==========================================

  function addWarningPopup(feature, layer) {
    const p = feature.properties || {};

    const event = escapeHTML(p.event || "Weather Alert");
    const headline = escapeHTML(p.headline || "");
    const area = escapeHTML(p.areaDesc || "Area not specified");
    const severity = escapeHTML(p.severity || "Unknown");
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
          margin-bottom:10px;
          border-radius:4px;
          font-weight:800;">
          ${event}
        </div>

        <strong>${headline}</strong>
        <p><strong>Area:</strong> ${area}</p>
        <p><strong>Severity:</strong> ${severity}</p>
        <p><strong>Expires:</strong> ${escapeHTML(expires)}</p>

        ${description
          ? `<details><summary>Description</summary><p>${description}</p></details>`
          : ""}

        ${instruction
          ? `<details><summary>Safety Instructions</summary><p>${instruction}</p></details>`
          : ""}

        ${p.web
          ? `<p><a href="${escapeHTML(p.web)}" target="_blank" rel="noopener">Official NWS Alert</a></p>`
          : ""}
      </div>
    `;

    layer.bindPopup(popup);
  }

  // ==========================================
  // STORM ALERT BANNER
  // ==========================================

  let bannerControl;
  let bannerElement;

  const AlertBanner = L.Control.extend({
    options: {
      position: "topleft"
    },

    onAdd: function () {
      const container = L.DomUtil.create(
        "div",
        "ssc-storm-alert-banner"
      );

      container.style.cssText = `
        display:none;
        background:#151b27;
        color:white;
        border:2px solid #ff2638;
        border-radius:8px;
        padding:12px 16px;
        min-width:240px;
        max-width:360px;
        box-shadow:0 5px 22px rgba(0,0,0,.45);
        font-family:Arial,sans-serif;
        margin-top:10px;
        cursor:pointer;
      `;

      const heading = document.createElement("div");
      heading.style.cssText = `
        color:#ff4b55;
        font-weight:900;
        font-size:13px;
        letter-spacing:1px;
        margin-bottom:5px;
      `;

      heading.textContent = "⚠ ACTIVE WEATHER ALERTS";

      const details = document.createElement("div");
      details.style.cssText = `
        color:#ffffff;
        font-size:12px;
        line-height:1.6;
      `;

      container.appendChild(heading);
      container.appendChild(details);

      container.addEventListener("click", () => {
        if (warningLayer.getLayers().length) {
          const bounds = warningLayer.getBounds();

          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              padding: [35, 35],
              maxZoom: 9
            });
          }
        }
      });

      L.DomEvent.disableClickPropagation(container);

      bannerElement = {
        container,
        heading,
        details
      };

      return container;
    }
  });

  bannerControl = new AlertBanner();
  map.addControl(bannerControl);

  function updateBanner(features) {
    if (!bannerElement) return;

    const activeWarnings = features.filter(feature =>
      (feature.properties?.event || "")
        .toLowerCase()
        .includes("warning")
    );

    if (!activeWarnings.length) {
      bannerElement.container.style.display = "none";
      return;
    }

    bannerElement.container.style.display = "block";

    const tornadoCount = activeWarnings.filter(feature =>
      (feature.properties?.event || "")
        .toLowerCase()
        .includes("tornado warning")
    ).length;

    const severeCount = activeWarnings.filter(feature =>
      (feature.properties?.event || "")
        .toLowerCase()
        .includes("severe thunderstorm warning")
    ).length;

    const otherCount =
      activeWarnings.length - tornadoCount - severeCount;

    const lines = [];

    if (tornadoCount) {
      lines.push(`TORNADO WARNINGS: ${tornadoCount}`);
    }

    if (severeCount) {
      lines.push(`SEVERE THUNDERSTORM WARNINGS: ${severeCount}`);
    }

    if (otherCount) {
      lines.push(`OTHER WARNINGS: ${otherCount}`);
    }

    bannerElement.heading.textContent =
      "⚠ ACTIVE NATIONAL WEATHER SERVICE WARNINGS";

    bannerElement.details.textContent =
      lines.join(" | ") + " — Click to view warning areas";

    if (tornadoCount) {
      bannerElement.container.style.borderColor = "#ff2020";
      bannerElement.heading.style.color = "#ff4545";
    } else {
      bannerElement.container.style.borderColor = "#ff8c00";
      bannerElement.heading.style.color = "#ffad42";
    }
  }

  // ==========================================
  // AUDIBLE ALERT SYSTEM
  // ==========================================

  let soundEnabled = false;
  let audioContext = null;

  const SoundControl = L.Control.extend({
    options: {
      position: "topright"
    },

    onAdd: function () {
      const button = L.DomUtil.create(
        "button",
        "ssc-sound-button"
      );

      button.type = "button";
      button.textContent = "🔇 Enable Alert Sound";

      button.style.cssText = `
        background:#151b27;
        color:white;
        border:1px solid #ff2638;
        border-radius:6px;
        padding:10px 13px;
        font-weight:800;
        font-size:12px;
        cursor:pointer;
        margin-top:10px;
      `;

      button.addEventListener("click", async () => {
        try {
          if (!audioContext) {
            const AudioContextClass =
              window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
              throw new Error("Audio is not supported by this browser");
            }

            audioContext = new AudioContextClass();
          }

          await audioContext.resume();

          soundEnabled = true;
          button.textContent = "🔊 Alert Sound Enabled";
          button.style.background = "#164c32";

          playAlertTone();

        } catch (error) {
          console.error("Audio initialization error:", error);
          button.textContent = "Audio unavailable";
        }
      });

      L.DomEvent.disableClickPropagation(button);

      return button;
    }
  });

  map.addControl(new SoundControl());

  function playAlertTone() {
    if (!soundEnabled || !audioContext) return;

    const now = audioContext.currentTime;

    // Three-part alert tone
    [880, 660, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(
        0.0001,
        now + index * 0.45
      );

      gain.gain.exponentialRampToValueAtTime(
        0.20,
        now + index * 0.45 + 0.04
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + index * 0.45 + 0.32
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(now + index * 0.45);
      oscillator.stop(now + index * 0.45 + 0.35);
    });
  }

  function announceWarning(feature) {
    if (!soundEnabled) return;

    const p = feature.properties || {};
    const event = p.event || "Weather warning";
    const area = p.areaDesc || "affected area";

    playAlertTone();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const message = new SpeechSynthesisUtterance(
        `Attention. New ${event}. Affected areas include ${area}. Please monitor official National Weather Service instructions.`
      );

      message.rate = 0.88;
      message.pitch = 0.85;
      message.volume = 1;

      window.speechSynthesis.speak(message);
    }
  }

  // ==========================================
  // NWS ALERT DETECTION
  // ==========================================

  let knownAlertIds = new Set();
  let firstAlertLoad = true;

  function getAlertId(feature) {
    return (
      feature.id ||
      feature.properties?.id ||
      `${feature.properties?.event}-${feature.properties?.sent}-${feature.properties?.areaDesc}`
    );
  }

  function isAudibleWarning(feature) {
    const event = (
      feature.properties?.event || ""
    ).toLowerCase();

    return (
      event.includes("tornado warning") ||
      event.includes("severe thunderstorm warning")
    );
  }

  async function loadWarnings() {
    try {
      const response = await fetch(
        "/api/weather/alerts",
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("NWS alert service returned an error");
      }

      const data = await response.json();

      const features =
        data.features ||
        data.alerts?.features ||
        data.data?.features ||
        [];

      const validFeatures = features.filter(feature =>
        feature.geometry &&
        feature.properties
      );

      // Detect newly issued alerts
      const newWarnings = [];

      validFeatures.forEach(feature => {
        const id = getAlertId(feature);

        if (!knownAlertIds.has(id)) {
          newWarnings.push(feature);
        }
      });

      // Do not sound for alerts already active on first load
      if (!firstAlertLoad) {
        newWarnings
          .filter(isAudibleWarning)
          .forEach(announceWarning);
      }

      // Update known alerts
      knownAlertIds = new Set(
        validFeatures.map(getAlertId)
      );

      firstAlertLoad = false;

      // Update map polygons
      warningLayer.clearLayers();
      warningLayer.addData(validFeatures);

      // Update banner
      updateBanner(validFeatures);

      const warningCount = validFeatures.filter(feature =>
        (feature.properties?.event || "")
          .toLowerCase()
          .includes("warning")
      ).length;

      const watchCount = validFeatures.filter(feature =>
        (feature.properties?.event || "")
          .toLowerCase()
          .includes("watch")
      ).length;

      alertCountText =
        `${validFeatures.length} alerts · ${warningCount} warnings · ${watchCount} watches`;

      updateStatus();

      console.log("NWS alerts loaded:", validFeatures.length);

    } catch (error) {
      console.error("NWS alert loading error:", error);

      alertCountText = "NWS alerts unavailable";
      updateStatus();
    }
  }

  // ==========================================
  // RAINVIEWER RADAR
  // ==========================================

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

      radarGroup.clearLayers();

      const layer = L.tileLayer(
        `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        {
          opacity: 0.68,
          tileSize: 256,
          maxZoom: 12,
          attribution: "Radar: RainViewer"
        }
      );

      layer.addTo(radarGroup);

      radarFrameText =
        `Radar: ${new Date(frame.time * 1000).toLocaleTimeString()}`;

      updateStatus();

    } catch (error) {
      console.error("Radar loading error:", error);

      radarFrameText = "Radar unavailable";
      updateStatus();
    }
  }

  // ==========================================
  // MAP CONTROLS
  // ==========================================

  L.control.layers(
    null,
    {
      "Weather Radar": radarGroup,
      "NWS Warnings & Watches": warningLayer
    },
    { collapsed: true }
  ).addTo(map);

  L.control.scale().addTo(map);

  L.marker([42.1292, -80.0851])
    .addTo(map)
    .bindPopup(
      "<strong>Erie, Pennsylvania</strong><br>Regional reference point"
    );

  document.getElementById("nationalView")?.addEventListener("click", () => {
    map.setView([39.5, -98.35], 4);
  });

  document.getElementById("erieView")?.addEventListener("click", () => {
    map.setView([42.1292, -80.0851], 8);
  });

  document.getElementById("refreshRadar")?.addEventListener("click", () => {
    loadRadar();
    loadWarnings();
  });

  document.getElementById("toggleRadar")?.addEventListener("click", event => {
    if (map.hasLayer(radarGroup)) {
      map.removeLayer(radarGroup);
      event.currentTarget.textContent = "Show Radar Layer";
    } else {
      map.addLayer(radarGroup);
      event.currentTarget.textContent = "Hide Radar Layer";
    }
  });

  // ==========================================
  // STARTUP AND REFRESH
  // ==========================================

  map.whenReady(() => {
    map.invalidateSize();

    loadRadar();
    loadWarnings();
  });

  // Radar refresh: every 10 minutes
  setInterval(loadRadar, 10 * 60 * 1000);

  // NWS alert refresh: every 60 seconds
  setInterval(loadWarnings, 60 * 1000);

  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

})();
