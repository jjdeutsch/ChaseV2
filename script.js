
/* ==========================================================
   STOP SPOT CHASE — NATIONAL WEATHER ALERT SYSTEM
   Nationwide NWS tornado and severe thunderstorm alerts
   Popup warnings + alert tone + browser speech
   ========================================================== */

(() => {
  "use strict";

  const CONFIG = {
    apiUrl:
      "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update",

    refreshMs: 60_000,

    // Browser-generated speech is similar in function to
    // a radio announcement, but is not the official NOAA voice.
    voiceRate: 0.85,
    voicePitch: 0.85,
    voiceVolume: 1,

    popupDurationMs: 20_000,

    events: [
      "Tornado Warning",
      "Tornado Watch",
      "Severe Thunderstorm Warning",
      "Severe Thunderstorm Watch"
    ]
  };

  let audioEnabled = false;
  let audioContext = null;
  let firstSuccessfulFetch = true;
  let polling = false;

  const seenAlertIds = new Set();
  const announcementQueue = [];
  let announcing = false;
  let popupTimer = null;

  const alertCounts = {
    pds: 0,
    "tornado-warning": 0,
    "severe-warning": 0,
    "tornado-watch": 0,
    "severe-watch": 0
  };

  // ----------------------------------------------------------
  // STYLES — injected so the existing website design remains
  // unchanged.
  // ----------------------------------------------------------

  function installStyles() {
    if (document.getElementById("ssc-alert-system-styles")) return;

    const style = document.createElement("style");
    style.id = "ssc-alert-system-styles";

    style.textContent = `
      #ssc-alert-controls {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 99990;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: calc(100vw - 32px);
        font-family: Inter, system-ui, sans-serif;
      }

      .ssc-control-button {
        border: 1px solid #ff2638;
        border-radius: 8px;
        padding: 10px 13px;
        background: #111827;
        color: #fff;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 4px 18px #0006;
      }

      .ssc-control-button:hover {
        background: #29202a;
      }

      #ssc-alert-popup {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 99999;
        width: min(440px, calc(100vw - 36px));
        max-height: calc(100vh - 36px);
        overflow-y: auto;
        box-sizing: border-box;
        border: 2px solid #ff2638;
        border-left-width: 7px;
        border-radius: 12px;
        padding: 18px;
        background: #10141d;
        color: #fff;
        font-family: Inter, system-ui, sans-serif;
        box-shadow: 0 12px 45px #000b;
        display: none;
      }

      #ssc-alert-popup.ssc-visible {
        display: block;
        animation: sscAlertEnter .25s ease-out;
      }

      #ssc-alert-popup.ssc-watch {
        border-color: #ffd21f;
      }

      #ssc-alert-popup.ssc-pds {
        border-color: #ff4b00;
        box-shadow: 0 0 25px #ff4b0050, 0 12px 45px #000b;
      }

      #ssc-alert-popup .ssc-alert-kicker {
        color: #ff6875;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.5px;
        margin-bottom: 7px;
      }

      #ssc-alert-popup.ssc-watch .ssc-alert-kicker {
        color: #ffd21f;
      }

      #ssc-alert-popup h2 {
        margin: 0 0 10px;
        font-size: 21px;
        line-height: 1.25;
      }

      #ssc-alert-popup p {
        margin: 8px 0;
        line-height: 1.45;
        font-size: 13px;
        overflow-wrap: anywhere;
      }

      #ssc-alert-popup .ssc-alert-area {
        font-weight: 700;
        color: #f3f4f6;
      }

      #ssc-alert-popup .ssc-alert-instructions {
        margin-top: 12px;
        padding: 10px;
        border-radius: 7px;
        background: #ffffff0b;
        border: 1px solid #ffffff18;
      }

      #ssc-alert-popup .ssc-alert-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      #ssc-alert-popup .ssc-alert-actions button,
      #ssc-alert-popup .ssc-alert-actions a {
        display: inline-block;
        box-sizing: border-box;
        border: 1px solid #ffffff35;
        border-radius: 7px;
        padding: 9px 11px;
        background: #202938;
        color: white;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }

      #ssc-alert-popup .ssc-alert-close {
        position: absolute;
        right: 9px;
        top: 8px;
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 23px;
        cursor: pointer;
      }

      .ssc-alert-card {
        border: 1px solid #ffffff20;
        border-left: 5px solid #ff2638;
        border-radius: 9px;
        padding: 13px;
        margin: 10px 0;
        background: #111827;
        color: inherit;
      }

      .ssc-alert-card.alert-tornado-watch,
      .ssc-alert-card.alert-severe-watch {
        border-left-color: #ffd21f;
      }

      .ssc-alert-card.alert-pds {
        border-left-color: #ff4b00;
      }

      .ssc-alert-card h3 {
        margin: 0 0 7px;
        font-size: 16px;
      }

      .ssc-alert-card p {
        margin: 6px 0;
        line-height: 1.45;
      }

      .ssc-alert-card a {
        color: #ff6875;
        font-weight: 700;
      }

      #ssc-alert-status {
        font-size: 11px;
        opacity: .8;
        align-self: center;
        color: inherit;
      }

      @keyframes sscAlertEnter {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 520px) {
        #ssc-alert-controls {
          right: 8px;
          bottom: 8px;
        }

        #ssc-alert-popup {
          top: 8px;
          right: 8px;
          width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #ssc-alert-popup.ssc-visible {
          animation: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ----------------------------------------------------------
  // CONTROLS AND POPUP
  // ----------------------------------------------------------

  function installControls() {
    if (!document.getElementById("ssc-alert-controls")) {
      const controls = document.createElement("div");
      controls.id = "ssc-alert-controls";

      controls.innerHTML = `
        <button class="ssc-control-button" id="ssc-audio-enable"
          type="button">🔊 Enable Audio</button>
        <button class="ssc-control-button" id="ssc-audio-test"
          type="button">▶ Test Announcement</button>
        <span id="ssc-alert-status" role="status"
          aria-live="polite">Connecting to NWS…</span>
      `;

      document.body.appendChild(controls);

      document.getElementById("ssc-audio-enable")
        .addEventListener("click", enableAudio);

      document.getElementById("ssc-audio-test")
        .addEventListener("click", testAnnouncement);
    }

    if (!document.getElementById("ssc-alert-popup")) {
      const popup = document.createElement("section");
      popup.id = "ssc-alert-popup";
      popup.setAttribute("role", "alertdialog");
      popup.setAttribute("aria-live", "assertive");
      popup.setAttribute("aria-label", "National Weather Service alert");

      document.body.appendChild(popup);
    }
  }

  function setStatus(message) {
    const el = document.getElementById("ssc-alert-status");
    if (el) el.textContent = message;
  }

  // ----------------------------------------------------------
  // AUDIO
  // ----------------------------------------------------------

  async function enableAudio() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass && !audioContext) {
        audioContext = new AudioContextClass();
      }

      if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (!("speechSynthesis" in window)) {
        setStatus("Speech is not supported by this browser.");
        return;
      }

      // The user click unlocks browser audio where supported.
      window.speechSynthesis.cancel();
      audioEnabled = true;

      const button = document.getElementById("ssc-audio-enable");
      if (button) button.textContent = "🔊 Audio Enabled";

      setStatus("Audio enabled — monitoring nationwide alerts.");
    } catch (error) {
      console.error("Stop Spot Chase audio could not start:", error);
      setStatus("Audio unavailable. Check browser permissions.");
    }
  }

  function playWarningTone() {
    return new Promise((resolve) => {
      if (!audioEnabled || !audioContext) {
        resolve();
        return;
      }

      try {
        const now = audioContext.currentTime;
        const master = audioContext.createGain();

        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        master.connect(audioContext.destination);

        // Original alert tone pattern; not an official NWR SAME tone.
        const pattern = [
          { start: 0.00, duration: 0.30, frequency: 880 },
          { start: 0.43, duration: 0.30, frequency: 660 },
          { start: 0.86, duration: 0.30, frequency: 880 }
        ];

        for (const part of pattern) {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(
            part.frequency,
            now + part.start
          );

          gain.gain.setValueAtTime(0.0001, now + part.start);
          gain.gain.exponentialRampToValueAtTime(
            0.75,
            now + part.start + 0.025
          );
          gain.gain.setValueAtTime(
            0.75,
            now + part.start + part.duration - 0.04
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + part.start + part.duration
          );

          oscillator.connect(gain);
          gain.connect(master);

          oscillator.start(now + part.start);
          oscillator.stop(now + part.start + part.duration + 0.02);
        }

        window.setTimeout(resolve, 1350);
      } catch (error) {
        console.error("Warning tone failed:", error);
        resolve();
      }
    });
  }

  function buildAnnouncement(alert) {
    const event = alert.properties.event || "Weather Alert";
    const area = alert.properties.areaDesc || "affected areas";
    const headline = alert.properties.headline || "";
    const instruction = alert.properties.instruction || "";

    let message = "";

    if (isPDS(alert)) {
      message += "Particularly dangerous situation. ";
    }

    message += `${event}. `;

    if (headline && headline.toLowerCase() !== event.toLowerCase()) {
      message += `${headline}. `;
    }

    message += `This alert affects ${area}. `;

    if (instruction) {
      message += `Instructions from the National Weather Service: ${instruction}`;
    } else if (alert.properties.description) {
      message += alert.properties.description;
    }

    message +=
      " Follow instructions from your local National Weather Service office and emergency officials.";

    return message;
  }

  async function announce(alert) {
    if (!audioEnabled || !("speechSynthesis" in window)) return;

    // Keep the queue sequential so announcements do not overlap.
    await playWarningTone();

    if (!audioEnabled) return;

    const utterance = new SpeechSynthesisUtterance(
      buildAnnouncement(alert)
    );

    utterance.rate = CONFIG.voiceRate;
    utterance.pitch = CONFIG.voicePitch;
    utterance.volume = CONFIG.voiceVolume;

    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((voice) =>
      /^en(-|_)/i.test(voice.lang)
    );

    if (englishVoice) utterance.voice = englishVoice;

    await new Promise((resolve) => {
      utterance.onend = resolve;
      utterance.onerror = resolve;

      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error("Speech announcement failed:", error);
        resolve();
      }
    });
  }

  function enqueueAnnouncement(alert) {
    if (!audioEnabled) return;

    announcementQueue.push(alert);
    processAnnouncementQueue();
  }

  async function processAnnouncementQueue() {
    if (announcing) return;
    announcing = true;

    try {
      while (announcementQueue.length > 0 && audioEnabled) {
        const alert = announcementQueue.shift();
        await announce(alert);
      }
    } finally {
      announcing = false;
    }
  }

  async function testAnnouncement() {
    if (!audioEnabled) {
      setStatus("Click Enable Audio first.");
      return;
    }

    const sample = {
      properties: {
        event: "Audio Test",
        areaDesc: "Stop Spot Chase",
        headline: "This is a test of the Stop Spot Chase alert system.",
        description: "",
        instruction:
          "No active weather warning is being reported by this test."
      }
    };

    await announce(sample);
  }

  // ----------------------------------------------------------
  // ALERT CLASSIFICATION
  // ----------------------------------------------------------

  function isPDS(alert) {
    const p = alert.properties || {};
    const text = [
      p.headline,
      p.description,
      p.instruction,
      p.event
    ].filter(Boolean).join(" ");

    return /particularly dangerous situation|\bPDS\b/i.test(text) &&
      /tornado/i.test(text);
  }

  function alertType(alert) {
    const event = (alert.properties?.event || "").trim();

    if (/^Tornado Warning$/i.test(event)) return "tornado-warning";
    if (/^Tornado Watch$/i.test(event)) return "tornado-watch";
    if (/^Severe Thunderstorm Warning$/i.test(event)) return "severe-warning";
    if (/^Severe Thunderstorm Watch$/i.test(event)) return "severe-watch";

    return null;
  }

  function isTargetAlert(alert) {
    return Boolean(alertType(alert));
  }

  function alertClass(alert) {
    if (isPDS(alert)) return "alert-pds";

    switch (alertType(alert)) {
      case "tornado-warning":
        return "alert-tornado-warning";
      case "tornado-watch":
        return "alert-tornado-watch";
      case "severe-warning":
        return "alert-severe-warning";
      case "severe-watch":
        return "alert-severe-watch";
      default:
        return "";
    }
  }

  function countAlerts(alerts) {
    for (const key of Object.keys(alertCounts)) {
      alertCounts[key] = 0;
    }

    for (const alert of alerts) {
      const type = alertType(alert);
      if (type && Object.prototype.hasOwnProperty.call(alertCounts, type)) {
        alertCounts[type]++;
      }

      if (isPDS(alert)) {
        alertCounts.pds++;
      }
    }
  }

  // ----------------------------------------------------------
  // RENDER ALERT COUNTERS AND LISTS
  // ----------------------------------------------------------

  function updateCounters() {
    document.querySelectorAll("[data-alert-count]").forEach((element) => {
      const key = element.getAttribute("data-alert-count");

      if (Object.prototype.hasOwnProperty.call(alertCounts, key)) {
        element.textContent = String(alertCounts[key]);
      }
    });

    const total = alertCounts["tornado-warning"] +
      alertCounts["tornado-watch"] +
      alertCounts["severe-warning"] +
      alertCounts["severe-watch"];

    const totalEl = document.getElementById("stormAlertCount");
    if (totalEl) totalEl.textContent = String(total);

    const badge = document.getElementById("stormAlertBadge");
    if (badge) badge.textContent = total ? `${total} ACTIVE` : "NO ACTIVE ALERTS";

    const updated = document.getElementById("stormLastUpdate");
    if (updated) {
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }

  function safeText(value) {
    return String(value || "");
  }

  function formatTime(value) {
    if (!value) return "Not specified";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not specified";

    return date.toLocaleString();
  }

  function renderAlerts(alerts) {
    const targets = [
      document.getElementById("stormAlerts"),
      document.getElementById("homeAlerts")
    ].filter(Boolean);

    document.querySelectorAll("[data-alert-list]").forEach((element) => {
      if (!targets.includes(element)) targets.push(element);
    });

    const uniqueTargets = [...new Set(targets)];

    if (!alerts.length) {
      uniqueTargets.forEach((container) => {
        container.replaceChildren();

        const message = document.createElement("p");
        message.className = "ssc-no-alerts";
        message.textContent =
          "No active tornado or severe thunderstorm watches or warnings found in the current NWS feed.";

        container.appendChild(message);
      });
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const alert of alerts) {
      const p = alert.properties || {};
      const card = document.createElement("article");
      card.className = `ssc-alert-card alert-card ${alertClass(alert)}`;
      card.dataset.alertType = alertType(alert) || "";

      const heading = document.createElement("h3");
      heading.textContent = `${isPDS(alert) ? "⚠ PDS — " : ""}${safeText(p.event)}`;
      card.appendChild(heading);

      const area = document.createElement("p");
      area.textContent = `Affected area: ${safeText(p.areaDesc) || "Not specified"}`;
      card.appendChild(area);

      if (p.headline) {
        const headline = document.createElement("p");
        headline.textContent = p.headline;
        card.appendChild(headline);
      }

      const expiration = document.createElement("p");
      expiration.textContent = `Expires: ${formatTime(p.expires)}`;
      card.appendChild(expiration);

      if (p.instruction) {
        const instructions = document.createElement("p");
        instructions.textContent = `Instructions: ${p.instruction}`;
        card.appendChild(instructions);
      }

      const link = document.createElement("a");
      link.href = p.web || "https://www.weather.gov/";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View official NWS alert";
      card.appendChild(link);

      fragment.appendChild(card);
    }

    uniqueTargets.forEach((container) => {
      container.replaceChildren(fragment.cloneNode(true));
    });
  }

  // ----------------------------------------------------------
  // POP-UP WARNING
  // ----------------------------------------------------------

  function showPopup(alert) {
    const popup = document.getElementById("ssc-alert-popup");
    if (!popup) return;

    const p = alert.properties || {};
    const type = alertType(alert);
    const pds = isPDS(alert);
    const watch = type === "tornado-watch" || type === "severe-watch";

    popup.className = "";
    if (watch) popup.classList.add("ssc-watch");
    if (pds) popup.classList.add("ssc-pds");

    // Build with DOM APIs to avoid treating NWS text as HTML.
    popup.replaceChildren();

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ssc-alert-close";
    close.setAttribute("aria-label", "Close alert");
    close.textContent = "×";
    close.addEventListener("click", () => {
      popup.classList.remove("ssc-visible");
      clearTimeout(popupTimer);
    });
    popup.appendChild(close);

    const kicker = document.createElement("div");
    kicker.className = "ssc-alert-kicker";
    kicker.textContent = pds
      ? "PARTICULARLY DANGEROUS SITUATION"
      : "STOP SPOT CHASE • NWS ALERT";
    popup.appendChild(kicker);

    const heading = document.createElement("h2");
    heading.textContent = safeText(p.event);
    popup.appendChild(heading);

    const area = document.createElement("p");
    area.className = "ssc-alert-area";
    area.textContent = `Affected area: ${safeText(p.areaDesc) || "Not specified"}`;
    popup.appendChild(area);

    if (p.headline) {
      const headline = document.createElement("p");
      headline.textContent = p.headline;
      popup.appendChild(headline);
    }

    const expiry = document.createElement("p");
    expiry.textContent = `Expires: ${formatTime(p.expires)}`;
    popup.appendChild(expiry);

    if (p.instruction || p.description) {
      const instructions = document.createElement("div");
      instructions.className = "ssc-alert-instructions";
      instructions.textContent =
        p.instruction || p.description || "";
      popup.appendChild(instructions);
    }

    const actions = document.createElement("div");
    actions.className = "ssc-alert-actions";

    const audioButton = document.createElement("button");
    audioButton.type = "button";
    audioButton.textContent = audioEnabled
      ? "🔊 Hear announcement"
      : "🔊 Enable audio";
    audioButton.addEventListener("click", async () => {
      if (!audioEnabled) await enableAudio();
      enqueueAnnouncement(alert);
    });
    actions.appendChild(audioButton);

    const nwsLink = document.createElement("a");
    nwsLink.href = p.web || "https://www.weather.gov/";
    nwsLink.target = "_blank";
    nwsLink.rel = "noopener noreferrer";
    nwsLink.textContent = "Official NWS alert";
    actions.appendChild(nwsLink);

    popup.appendChild(actions);

    popup.classList.add("ssc-visible");

    clearTimeout(popupTimer);
    popupTimer = window.setTimeout(() => {
      popup.classList.remove("ssc-visible");
    }, CONFIG.popupDurationMs);
  }

  // ----------------------------------------------------------
  // NWS FEED
  // ----------------------------------------------------------

  async function fetchAlerts() {
    if (polling) return;
    polling = true;

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/geo+json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`NWS API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const features = Array.isArray(data.features) ? data.features : [];

      const alerts = features
        .filter(isTargetAlert)
        .filter((alert) => {
          const status = alert.properties?.status;
          const messageType = alert.properties?.messageType;
          return (!status || status === "Actual") &&
            (!messageType || messageType === "Alert" || messageType === "Update");
        });

      countAlerts(alerts);
      updateCounters();
      renderAlerts(alerts);

      // On the first successful request, populate the page but don't
      // sound every warning already active across the entire country.
      if (firstSuccessfulFetch) {
        alerts.forEach((alert) => {
          if (alert.id) seenAlertIds.add(alert.id);
        });
        firstSuccessfulFetch = false;
        setStatus("NWS connected • Nationwide monitoring active");
        return;
      }

      const newAlerts = [];

      for (const alert of alerts) {
        const id = alert.id ||
          `${alert.properties?.event}-${alert.properties?.sent}-${alert.properties?.areaDesc}`;

        if (seenAlertIds.has(id)) continue;

        seenAlertIds.add(id);
        newAlerts.push(alert);
      }

      // Show the newest alert and queue each newly detected alert
      // for an announcement if audio has been enabled by the visitor.
      for (const alert of newAlerts) {
        showPopup(alert);
        enqueueAnnouncement(alert);
      }

      setStatus(
        `NWS connected • ${alerts.length} active watches/warnings • Nationwide`
      );

      // Keep memory bounded during long-running sessions.
      if (seenAlertIds.size > 5000) {
        const recent = Array.from(seenAlertIds).slice(-2500);
        seenAlertIds.clear();
        recent.forEach((id) => seenAlertIds.add(id));
      }
    } catch (error) {
      console.error("Stop Spot Chase NWS alert error:", error);
      setStatus("NWS feed unavailable — retrying");
    } finally {
      polling = false;
    }
  }

  // ----------------------------------------------------------
  // STARTUP
  // ----------------------------------------------------------

  function start() {
    installStyles();
    installControls();

    fetchAlerts();
    window.setInterval(fetchAlerts, CONFIG.refreshMs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
