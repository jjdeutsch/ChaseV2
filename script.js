
"use strict";

/* =========================================================
   STOP SPOT CHASE — NATIONWIDE WEATHER ALERT SYSTEM
   Existing browser voice + warning tone + popup alerts
   ========================================================= */

const CONFIG = {
    apiUrl: "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update",
    refreshMs: 60_000,
    maxDisplayedAlerts: 100,
    maxPopupsPerRefresh: 4,
    voiceRate: 0.88,
    voicePitch: 0.85,
    voiceVolume: 1
};

const ALERT_RULES = {
    "Tornado Warning": {
        type: "Tornado Warning", priority: 1, icon: "🌪️", level: "warning"
    },
    "PDS Tornado Warning": {
        type: "PDS Tornado", priority: 0, icon: "🌪️", level: "pds"
    },
    "Tornado Watch": {
        type: "Tornado Watch", priority: 4, icon: "🌪️", level: "watch"
    },
    "Severe Thunderstorm Warning": {
        type: "Severe Thunderstorm Warning", priority: 2, icon: "⛈️", level: "warning"
    },
    "Severe Thunderstorm Watch": {
        type: "Severe Thunderstorm Watch", priority: 5, icon: "⛈️", level: "watch"
    },
    "Extreme Wind Warning": {
        type: "Extreme Wind Warning", priority: 1, icon: "💨", level: "warning"
    },
    "Flash Flood Warning": {
        type: "Flash Flood Warning", priority: 1, icon: "🌊", level: "warning"
    },
    "Flood Warning": {
        type: "Flood Warning", priority: 3, icon: "🌊", level: "warning"
    },
    "Flood Watch": {
        type: "Flood Watch", priority: 6, icon: "🌊", level: "watch"
    },
    "Flash Flood Watch": {
        type: "Flash Flood Watch", priority: 5, icon: "🌊", level: "watch"
    },
    "Blizzard Warning": {
        type: "Blizzard Warning", priority: 1, icon: "❄️", level: "warning"
    },
    "Winter Storm Warning": {
        type: "Winter Storm Warning", priority: 2, icon: "❄️", level: "warning"
    },
    "Winter Storm Watch": {
        type: "Winter Storm Watch", priority: 5, icon: "❄️", level: "watch"
    },
    "Ice Storm Warning": {
        type: "Ice Storm Warning", priority: 1, icon: "🧊", level: "warning"
    },
    "Snow Squall Warning": {
        type: "Snow Squall Warning", priority: 1, icon: "🌨️", level: "warning"
    },
    "Lake Effect Snow Warning": {
        type: "Lake Effect Snow Warning", priority: 2, icon: "🌨️", level: "warning"
    },
    "Lake Effect Snow Watch": {
        type: "Lake Effect Snow Watch", priority: 5, icon: "🌨️", level: "watch"
    },
    "Lake Effect Snow Advisory": {
        type: "Lake Effect Snow Advisory", priority: 7, icon: "🌨️", level: "advisory"
    },
    "Winter Weather Advisory": {
        type: "Winter Weather Advisory", priority: 7, icon: "❄️", level: "advisory"
    },
    "High Wind Warning": {
        type: "High Wind Warning", priority: 2, icon: "💨", level: "warning"
    },
    "High Wind Watch": {
        type: "High Wind Watch", priority: 5, icon: "💨", level: "watch"
    },
    "Wind Advisory": {
        type: "Wind Advisory", priority: 7, icon: "💨", level: "advisory"
    },
    "Hurricane Warning": {
        type: "Hurricane Warning", priority: 1, icon: "🌀", level: "warning"
    },
    "Hurricane Watch": {
        type: "Hurricane Watch", priority: 4, icon: "🌀", level: "watch"
    },
    "Tropical Storm Warning": {
        type: "Tropical Storm Warning", priority: 2, icon: "🌀", level: "warning"
    },
    "Tropical Storm Watch": {
        type: "Tropical Storm Watch", priority: 5, icon: "🌀", level: "watch"
    },
    "Storm Surge Warning": {
        type: "Storm Surge Warning", priority: 1, icon: "🌊", level: "warning"
    },
    "Storm Surge Watch": {
        type: "Storm Surge Watch", priority: 4, icon: "🌊", level: "watch"
    },
    "Coastal Flood Warning": {
        type: "Coastal Flood Warning", priority: 2, icon: "🌊", level: "warning"
    },
    "Coastal Flood Watch": {
        type: "Coastal Flood Watch", priority: 5, icon: "🌊", level: "watch"
    },
    "Coastal Flood Advisory": {
        type: "Coastal Flood Advisory", priority: 7, icon: "🌊", level: "advisory"
    },
    "Extreme Cold Warning": {
        type: "Extreme Cold Warning", priority: 2, icon: "🥶", level: "warning"
    },
    "Cold Weather Advisory": {
        type: "Cold Weather Advisory", priority: 7, icon: "🥶", level: "advisory"
    },
    "Wind Chill Warning": {
        type: "Wind Chill Warning", priority: 2, icon: "🥶", level: "warning"
    },
    "Wind Chill Watch": {
        type: "Wind Chill Watch", priority: 5, icon: "🥶", level: "watch"
    },
    "Heat Warning": {
        type: "Heat Warning", priority: 2, icon: "🌡️", level: "warning"
    },
    "Excessive Heat Warning": {
        type: "Excessive Heat Warning", priority: 1, icon: "🌡️", level: "warning"
    },
    "Heat Advisory": {
        type: "Heat Advisory", priority: 7, icon: "🌡️", level: "advisory"
    },
    "Excessive Heat Watch": {
        type: "Excessive Heat Watch", priority: 5, icon: "🌡️", level: "watch"
    },
    "Red Flag Warning": {
        type: "Red Flag Warning", priority: 3, icon: "🔥", level: "warning"
    },
    "Fire Weather Watch": {
        type: "Fire Weather Watch", priority: 6, icon: "🔥", level: "watch"
    },
    "Dust Storm Warning": {
        type: "Dust Storm Warning", priority: 2, icon: "🌫️", level: "warning"
    },
    "Dense Fog Advisory": {
        type: "Dense Fog Advisory", priority: 7, icon: "🌫️", level: "advisory"
    },
    "Tsunami Warning": {
        type: "Tsunami Warning", priority: 0, icon: "🌊", level: "warning"
    },
    "Tsunami Watch": {
        type: "Tsunami Watch", priority: 3, icon: "🌊", level: "watch"
    }
};

let currentAlerts = [];
let lastSuccessfulUpdate = null;
let refreshTimer = null;
let isLoadingAlerts = false;
let audioEnabled = false;
let audioContext = null;
let baselineEstablished = false;
let seenAlertIds = new Set();
let announcementQueue = [];
let isSpeaking = false;

/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener("DOMContentLoaded", initializeSite);

function initializeSite() {
    initializeNavigation();
    initializeExternalLinks();
    initializeAlertInterface();
    injectAlertStyles();
    createAudioControls();
}

function initializeNavigation() {
    document.querySelectorAll(".nav-links a").forEach(link => {
        link.addEventListener("click", () => {
            document.querySelectorAll(".nav-links a").forEach(item => {
                item.classList.remove("clicked");
            });
            link.classList.add("clicked");
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.getAttribute("href");
            if (!targetId || targetId === "#") return;

            const target = document.querySelector(targetId);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}

function initializeExternalLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
        const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        link.setAttribute("rel", [...rel].join(" "));
    });
}

function initializeAlertInterface() {
    const hasAlertInterface =
        document.getElementById("homeAlerts") ||
        document.getElementById("stormAlerts") ||
        document.getElementById("stormAlertList") ||
        document.getElementById("fullStormAlerts") ||
        document.querySelector("[data-alert-list]") ||
        document.querySelector("[data-alert-count]");

    if (!hasAlertInterface) return;

    loadWeatherAlerts();

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadWeatherAlerts, CONFIG.refreshMs);
}

/* =========================================================
   NWS ALERT LOADING
   ========================================================= */

async function loadWeatherAlerts() {
    if (isLoadingAlerts) return;
    isLoadingAlerts = true;

    try {
        const response = await fetch(CONFIG.apiUrl, {
            method: "GET",
            headers: { Accept: "application/geo+json" },
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`NWS request failed: HTTP ${response.status}`);
        }

        const data = await response.json();
        const features = Array.isArray(data.features) ? data.features : [];

        const nextAlerts = features
            .map(normalizeAlert)
            .filter(Boolean)
            .sort(sortAlerts);

        const newAlerts = [];

        if (baselineEstablished) {
            for (const alert of nextAlerts) {
                if (!seenAlertIds.has(alert.id)) newAlerts.push(alert);
            }
        }

        currentAlerts = nextAlerts;
        seenAlertIds = new Set(nextAlerts.map(alert => alert.id));
        lastSuccessfulUpdate = new Date();

        updateAlertInterfaces();

        if (!baselineEstablished) {
            baselineEstablished = true;
        } else {
            handleNewAlerts(newAlerts);
        }

        console.info(`Stop Spot Chase: ${currentAlerts.length} active qualifying NWS alerts.`);

    } catch (error) {
        console.error("Stop Spot Chase: Unable to load NWS alerts.", error);
        showAlertError();
    } finally {
        isLoadingAlerts = false;
    }
}

/* =========================================================
   NORMALIZE / CLASSIFY ALERTS
   ========================================================= */

function normalizeAlert(feature) {
    if (!feature?.properties) return null;

    const p = feature.properties;
    const event = String(p.event || "").trim();
    const headline = String(p.headline || "").trim();
    const description = String(p.description || "").trim();
    const instruction = String(p.instruction || "").trim();
    const areaDesc = String(p.areaDesc || "").trim();
    const parameters = JSON.stringify(p.parameters || {}).toLowerCase();

    const sent = p.sent ? new Date(p.sent) : null;
    const effective = p.effective ? new Date(p.effective) : null;
    const expires = p.expires ? new Date(p.expires) : null;

    if (expires && !Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
        return null;
    }

    if (effective && !Number.isNaN(effective.getTime()) && effective.getTime() > Date.now()) {
        return null;
    }

    const combinedText = `${event} ${headline} ${description} ${parameters}`.toLowerCase();

    const isPDS =
        event.toLowerCase() === "tornado warning" &&
        (
            combinedText.includes("particularly dangerous situation") ||
            combinedText.includes("pds tornado") ||
            /["']pds["']/.test(parameters)
        );

    let rule;

    if (isPDS) {
        rule = ALERT_RULES["PDS Tornado Warning"];
    } else {
        rule = ALERT_RULES[event];
    }

    // Include selected major alerts even if the exact event has a
    // slightly different official label.
    if (!rule && /tornado warning/i.test(event) && /particularly dangerous situation|\bpds\b/i.test(combinedText)) {
        rule = ALERT_RULES["PDS Tornado Warning"];
    }

    if (!rule) return null;

    const id = feature.id || `${event}-${p.sent || ""}-${areaDesc}`;

    return {
        id,
        event,
        alertType: rule.type,
        priority: rule.priority,
        icon: rule.icon,
        level: rule.level,
        headline,
        description,
        instruction,
        areaDesc,
        sent,
        effective,
        expires,
        urgency: p.urgency || "",
        severity: p.severity || "",
        certainty: p.certainty || "",
        sender: p.senderName || "National Weather Service",
        url: feature.id || "https://www.weather.gov/",
        isPDS: rule.type === "PDS Tornado"
    };
}

function sortAlerts(a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;

    const aTime = a.sent instanceof Date && !Number.isNaN(a.sent.getTime()) ? a.sent.getTime() : 0;
    const bTime = b.sent instanceof Date && !Number.isNaN(b.sent.getTime()) ? b.sent.getTime() : 0;
    return bTime - aTime;
}

/* =========================================================
   COUNTS AND EXISTING PAGE INTERFACES
   ========================================================= */

function getAlertCounts() {
    const count = predicate => currentAlerts.filter(predicate).length;

    return {
        total: currentAlerts.length,
        pds: count(a => a.isPDS),
        tornadoWarnings: count(a => a.alertType === "Tornado Warning"),
        tornadoWatches: count(a => a.alertType === "Tornado Watch"),
        severeWarnings: count(a => a.alertType === "Severe Thunderstorm Warning"),
        severeWatches: count(a => a.alertType === "Severe Thunderstorm Watch"),
        winter: count(a => /snow|winter|blizzard|ice storm/i.test(a.alertType)),
        flood: count(a => /flood/i.test(a.alertType)),
        tropical: count(a => /hurricane|tropical storm|storm surge/i.test(a.alertType)),
        wind: count(a => /wind/i.test(a.alertType)),
        other: count(a => !/tornado|thunderstorm|snow|winter|blizzard|ice storm|flood|hurricane|tropical storm|storm surge|wind/i.test(a.alertType))
    };
}

function updateAlertInterfaces() {
    updateHomeAlertCount();
    updateHomeAlertBadge();
    updateHomeAlertList();
    updateStormAlertList();
    updateGenericAlertLists();
    updateAlertCountElements();
    updateLastUpdateTime();
    updatePDSStatus();
}

function updateAlertCountElements() {
    const c = getAlertCounts();

    const countMap = {
        total: c.total,
        pds: c.pds,
        "pds-tornado": c.pds,
        tornado: c.tornadoWarnings,
        "tornado-warning": c.tornadoWarnings,
        "tornado-warnings": c.tornadoWarnings,
        severe: c.severeWarnings,
        "severe-warning": c.severeWarnings,
        "severe-warnings": c.severeWarnings,
        "tornado-watch": c.tornadoWatches,
        "tornado-watches": c.tornadoWatches,
        "severe-watch": c.severeWatches,
        "severe-watches": c.severeWatches,
        winter: c.winter,
        snow: c.winter,
        "winter-weather": c.winter,
        flood: c.flood,
        tropical: c.tropical,
        wind: c.wind,
        other: c.other
    };

    document.querySelectorAll("[data-alert-count]").forEach(element => {
        const type = String(element.getAttribute("data-alert-count") || "total").toLowerCase();
        element.textContent = Number(countMap[type] ?? c.total).toLocaleString();
    });
}

function updatePDSStatus() {
    const active = currentAlerts.some(alert => alert.isPDS);

    document.querySelectorAll("[data-pds-status]").forEach(element => {
        element.textContent = active ? "PDS TORNADO WARNING ACTIVE" : "NO PDS TORNADO WARNING";
        element.classList.toggle("active", active);
    });

    document.querySelectorAll("[data-pds-active]").forEach(element => {
        element.hidden = !active;
    });
}

function updateHomeAlertCount() {
    const element = document.getElementById("homeAlertCount");
    if (element) element.textContent = currentAlerts.length.toLocaleString();
}

function updateHomeAlertBadge() {
    const element = document.getElementById("homeAlertBadge");
    if (element) element.textContent = currentAlerts.length.toLocaleString();
}

function updateHomeAlertList() {
    const container = document.getElementById("homeAlerts");
    if (!container) return;

    if (!currentAlerts.length) {
        container.innerHTML = emptyAlertsHTML("No qualifying weather alerts are currently active.");
        return;
    }

    container.innerHTML = currentAlerts
        .slice(0, 15)
        .map(alert => createAlertCard(alert))
        .join("");
}

function updateStormAlertList() {
    const container = document.querySelector(
        "#stormAlerts, #stormAlertList, #fullStormAlerts, [data-storm-alerts]"
    );
    if (!container) return;

    if (!currentAlerts.length) {
        container.innerHTML = emptyAlertsHTML("No qualifying nationwide NWS alerts are currently active.");
        return;
    }

    container.innerHTML = currentAlerts
        .slice(0, CONFIG.maxDisplayedAlerts)
        .map(alert => createAlertCard(alert, true))
        .join("");
}

function updateGenericAlertLists() {
    document.querySelectorAll("[data-alert-list]").forEach(container => {
        if (["homeAlerts", "stormAlerts", "stormAlertList", "fullStormAlerts"].includes(container.id)) return;

        container.innerHTML = currentAlerts.length
            ? currentAlerts.slice(0, CONFIG.maxDisplayedAlerts).map(alert => createAlertCard(alert)).join("")
            : emptyAlertsHTML("No qualifying weather alerts are currently active.");
    });
}

function emptyAlertsHTML(message) {
    return `
        <div class="alert-empty">
            <div class="alert-empty-icon">✓</div>
            <strong>No Active Alerts</strong>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function createAlertCard(alert, detailed = false) {
    const description = cleanAlertText(alert.description);
    const areas = formatAreas(alert.areaDesc);
    const expiry = formatDate(alert.expires);
    const cssClass = alert.isPDS ? "alert-pds" : `alert-${alert.level}`;

    return `
        <article class="weather-alert-card ${cssClass}" data-alert-type="${escapeHTML(alert.alertType)}" data-alert-id="${escapeHTML(alert.id)}">
            <div class="weather-alert-top">
                <div class="weather-alert-icon">${alert.icon}</div>
                <div class="weather-alert-title">
                    <span class="weather-alert-type">${escapeHTML(alert.alertType)}${alert.isPDS ? ' <span class="weather-alert-pds">PDS</span>' : ""}</span>
                    <h4>${escapeHTML(alert.headline || `${alert.alertType} issued`)}</h4>
                </div>
            </div>
            <div class="weather-alert-meta">
                <span>📍 ${escapeHTML(areas)}</span>
                <span>🕒 ${escapeHTML(formatDate(alert.sent))}</span>
            </div>
            ${description ? `<p class="weather-alert-description">${escapeHTML(truncateText(description, detailed ? 420 : 180))}</p>` : ""}
            ${detailed ? `<div class="weather-alert-expiration"><span>Expires</span><strong>${escapeHTML(expiry)}</strong></div>` : ""}
            <div class="weather-alert-actions">
                <button type="button" class="weather-alert-speak" data-speak-alert="${escapeHTML(alert.id)}">🔊 Hear alert</button>
                <a href="${safeUrl(alert.url)}" target="_blank" rel="noopener noreferrer">Official NWS alert ↗</a>
            </div>
        </article>
    `;
}

function updateLastUpdateTime() {
    document.querySelectorAll("[data-alert-last-updated], #alertLastUpdated, #lastUpdated").forEach(element => {
        element.textContent = lastSuccessfulUpdate ? lastSuccessfulUpdate.toLocaleTimeString() : "Waiting for update";
    });
}

function showAlertError() {
    document.querySelectorAll("[data-alert-status]").forEach(element => {
        element.textContent = "Unable to refresh NWS alerts. Retrying automatically.";
    });
}

/* =========================================================
   NEW ALERT POPUPS
   ========================================================= */

function handleNewAlerts(alerts) {
    if (!alerts.length) return;

    const ordered = [...alerts].sort(sortAlerts);

    ordered.slice(0, CONFIG.maxPopupsPerRefresh).forEach((alert, index) => {
        setTimeout(() => showPopup(alert), index * 450);
    });

    if (audioEnabled) {
        ordered.forEach(alert => enqueueAnnouncement(alert));
    }
}

function showPopup(alert) {
    const host = document.getElementById("ssc-alert-popups");
    if (!host) return;

    const popup = document.createElement("section");
    popup.className = `ssc-popup ${alert.isPDS ? "ssc-pds" : ""}`;
    popup.setAttribute("role", "alert");

    popup.innerHTML = `
        <button type="button" class="ssc-popup-close" aria-label="Dismiss alert">×</button>
        <div class="ssc-popup-heading">${alert.icon} ${escapeHTML(alert.alertType)}</div>
        <strong>${escapeHTML(alert.headline || alert.alertType)}</strong>
        <p>${escapeHTML(truncateText(cleanAlertText(alert.description), 220))}</p>
        <div class="ssc-popup-location">📍 ${escapeHTML(formatAreas(alert.areaDesc))}</div>
        <div class="ssc-popup-actions">
            <button type="button" class="ssc-popup-hear">🔊 Hear announcement</button>
            <a href="${safeUrl(alert.url)}" target="_blank" rel="noopener noreferrer">NWS details ↗</a>
        </div>
    `;

    popup.querySelector(".ssc-popup-close").addEventListener("click", () => popup.remove());

    popup.querySelector(".ssc-popup-hear").addEventListener("click", async () => {
        await enableAudio();
        enqueueAnnouncement(alert);
    });

    host.prepend(popup);
    setTimeout(() => popup.remove(), 30_000);
}

/* =========================================================
   AUDIO CONTROLS AND EXISTING BROWSER VOICE
   ========================================================= */

function createAudioControls() {
    if (document.getElementById("ssc-audio-controls")) return;

    const controls = document.createElement("div");
    controls.id = "ssc-audio-controls";
    controls.innerHTML = `
        <button type="button" id="ssc-enable-audio">🔊 Enable Audio</button>
        <button type="button" id="ssc-test-audio">Test Announcement</button>
        <span id="ssc-audio-status" aria-live="polite">Audio is off until enabled</span>
    `;

    document.body.appendChild(controls);

    const popupHost = document.createElement("div");
    popupHost.id = "ssc-alert-popups";
    popupHost.setAttribute("aria-live", "assertive");
    document.body.appendChild(popupHost);

    document.getElementById("ssc-enable-audio").addEventListener("click", enableAudio);
    document.getElementById("ssc-test-audio").addEventListener("click", testAnnouncement);

    document.addEventListener("click", event => {
        const button = event.target.closest("[data-speak-alert]");
        if (!button) return;

        const alert = currentAlerts.find(item => item.id === button.getAttribute("data-speak-alert"));
        if (alert) {
            enableAudio().then(() => enqueueAnnouncement(alert));
        }
    });
}

async function enableAudio() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (AudioContextClass && !audioContext) {
            audioContext = new AudioContextClass();
        }

        if (audioContext?.state === "suspended") {
            await audioContext.resume();
        }

        if ("speechSynthesis" in window) {
            window.speechSynthesis.getVoices();
        }

        audioEnabled = true;
        setAudioStatus("Audio enabled — warning tone followed by spoken alerts");
        document.getElementById("ssc-enable-audio").textContent = "🔊 Audio Enabled";

    } catch (error) {
        console.error("Stop Spot Chase audio initialization failed:", error);
        setAudioStatus("Audio could not start. Check browser permissions.");
    }
}

function setAudioStatus(message) {
    const status = document.getElementById("ssc-audio-status");
    if (status) status.textContent = message;
}

function testAnnouncement() {
    enableAudio().then(() => {
        enqueueAnnouncement({
            id: `test-${Date.now()}`,
            alertType: "Stop Spot Chase audio test",
            headline: "This is a Stop Spot Chase Storm Center audio test.",
            areaDesc: "Audio test",
            expires: null,
            isPDS: false,
            level: "test"
        });
    });
}

function enqueueAnnouncement(alert) {
    if (!audioEnabled) return;

    // Do not add the same alert twice to the waiting queue.
    if (announcementQueue.some(item => item.id === alert.id)) return;

    announcementQueue.push(alert);
    announcementQueue.sort(sortAlerts);
    processAnnouncementQueue();
}

async function processAnnouncementQueue() {
    if (isSpeaking || !audioEnabled || !announcementQueue.length) return;

    isSpeaking = true;
    const alert = announcementQueue.shift();

    try {
        await playWarningTone(alert);
        await announce(alert);
    } catch (error) {
        console.error("Stop Spot Chase announcement failed:", error);
    } finally {
        isSpeaking = false;
        setTimeout(processAnnouncementQueue, 250);
    }
}

function playWarningTone(alert) {
    return new Promise(resolve => {
        if (!audioEnabled || !audioContext) {
            resolve();
            return;
        }

        try {
            const now = audioContext.currentTime;
            const urgent = alert.isPDS || alert.level === "warning" || alert.priority <= 2;
            const frequencies = urgent ? [880, 660, 880] : [660, 660];
            const duration = urgent ? 0.32 : 0.22;

            frequencies.forEach((frequency, index) => {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const start = now + index * (duration + 0.10);

                oscillator.type = "sine";
                oscillator.frequency.value = frequency;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.18, start + 0.025);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

                oscillator.connect(gain);
                gain.connect(audioContext.destination);
                oscillator.start(start);
                oscillator.stop(start + duration + 0.03);
            });

            const totalMs = frequencies.length * (duration + 0.10) * 1000;
            setTimeout(resolve, totalMs + 100);
        } catch {
            resolve();
        }
    });
}

/* This is the existing browser/operating-system voice. */
function announce(alert) {
    return new Promise(resolve => {
        if (!audioEnabled || !("speechSynthesis" in window)) {
            resolve();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(buildAnnouncement(alert));
        utterance.rate = CONFIG.voiceRate;
        utterance.pitch = CONFIG.voicePitch;
        utterance.volume = CONFIG.voiceVolume;

        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => /^en(-|_)/i.test(voice.lang));
        if (englishVoice) utterance.voice = englishVoice;

        utterance.onend = resolve;
        utterance.onerror = resolve;

        window.speechSynthesis.speak(utterance);
    });
}

function buildAnnouncement(alert) {
    if (String(alert.id).startsWith("test-")) {
        return "Stop Spot Chase Storm Center. This is an audio test. Your warning tone and spoken announcement are working.";
    }

    const areas = formatAreas(alert.areaDesc);
    const expiry = alert.expires
        ? `This alert expires at ${formatSpeechTime(alert.expires)}.`
        : "";

    const details = cleanAlertText(alert.description);
    const urgentOpening = alert.isPDS
        ? "Particularly dangerous situation. This is an urgent tornado warning."
        : alert.level === "warning"
            ? `Attention. ${alert.alertType} issued.`
            : alert.level === "watch"
                ? `Weather watch issued. ${alert.alertType}.`
                : `Weather advisory issued. ${alert.alertType}.`;

    const locationLine = areas ? `Areas affected include ${areas}.` : "";
    const detailLine = details ? truncateText(details, alert.isPDS ? 520 : 350) : "";

    return [
        "Stop Spot Chase weather alert.",
        urgentOpening,
        alert.headline || "",
        locationLine,
        detailLine,
        expiry,
        "Monitor official National Weather Service information and follow local safety instructions."
    ].filter(Boolean).join(" ");
}

/* =========================================================
   ALERT STYLES — ADDED WITHOUT REPLACING PAGE DESIGN
   ========================================================= */

function injectAlertStyles() {
    if (document.getElementById("ssc-alert-styles")) return;

    const style = document.createElement("style");
    style.id = "ssc-alert-styles";
    style.textContent = `
        #ssc-audio-controls {
            position: fixed; right: 16px; bottom: 16px; z-index: 9998;
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
            max-width: min(620px, calc(100vw - 32px));
            padding: 10px; border: 1px solid rgba(255,255,255,.14);
            border-radius: 14px; background: rgba(7,11,18,.94);
            color: #f5f7fb; box-shadow: 0 12px 35px rgba(0,0,0,.35);
            font: 12px/1.4 Arial, sans-serif;
        }
        #ssc-audio-controls button, .weather-alert-speak,
        .ssc-popup-actions button {
            border: 0; border-radius: 8px; padding: 9px 12px;
            background: #ef3340; color: white; cursor: pointer;
            font-weight: 700;
        }
        #ssc-test-audio { background: #202c3e !important; }
        #ssc-audio-status { color: #c4ccda; }
        #ssc-alert-popups {
            position: fixed; top: 90px; right: 16px; z-index: 9997;
            display: flex; flex-direction: column; gap: 10px;
            width: min(410px, calc(100vw - 32px)); pointer-events: none;
        }
        .ssc-popup {
            position: relative; pointer-events: auto; padding: 16px;
            border: 1px solid rgba(255,140,0,.55); border-left: 5px solid #ff8c00;
            border-radius: 14px; background: #101927; color: #f5f7fb;
            box-shadow: 0 12px 35px rgba(0,0,0,.45);
            font: 13px/1.5 Arial, sans-serif;
        }
        .ssc-popup.ssc-pds { border-color: #ff4b00; border-left-color: #ff4b00; }
        .ssc-popup-heading { color: #ff8c00; font-weight: 900; margin-bottom: 6px; }
        .ssc-pds .ssc-popup-heading { color: #ff5a28; }
        .ssc-popup p { color: #c1cbd9; margin: 8px 0; }
        .ssc-popup-location { color: #e1e7ef; margin-bottom: 10px; }
        .ssc-popup-close {
            position: absolute; top: 5px; right: 9px; background: none;
            border: 0; color: #d9e0ea; font-size: 24px; cursor: pointer;
        }
        .ssc-popup-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .ssc-popup-actions a, .weather-alert-actions a { color:#9fc4ff; font-weight:700; text-decoration:none; }
        .weather-alert-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:12px; font-size:12px; }
        .weather-alert-pds { color:#ff5722; font-weight:900; }
        .weather-alert-card { margin: 10px 0; padding: 16px; border:1px solid rgba(255,255,255,.12); border-radius:14px; background:rgba(15,22,34,.9); color:#f5f7fb; }
        .weather-alert-top { display:flex; align-items:flex-start; gap:12px; }
        .weather-alert-icon { font-size:24px; }
        .weather-alert-title h4 { margin:4px 0; }
        .weather-alert-type { font-size:12px; font-weight:900; color:#ff8c00; }
        .alert-pds { border-color:rgba(255,75,0,.7); }
        .alert-pds .weather-alert-type { color:#ff5722; }
        .alert-warning { border-left:4px solid #ef3340; }
        .alert-watch { border-left:4px solid #2678ff; }
        .alert-advisory { border-left:4px solid #ffd21f; }
        .weather-alert-meta { display:flex; flex-wrap:wrap; gap:12px; color:#aab6c8; font-size:12px; margin:10px 0; }
        .weather-alert-description { color:#c4ccda; font-size:13px; }
        .weather-alert-expiration { display:flex; justify-content:space-between; gap:10px; margin-top:10px; color:#aab6c8; font-size:12px; }
        .alert-empty { padding:18px; color:#c4ccda; }
        .alert-empty-icon { color:#55c987; font-size:22px; }
        @media(max-width:600px) {
            #ssc-audio-controls { left:10px; right:10px; bottom:10px; max-width:none; }
            #ssc-audio-status { width:100%; }
            #ssc-alert-popups { top:12px; right:10px; width:calc(100vw - 20px); }
        }
    `;
    document.head.appendChild(style);
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatAreas(areaText) {
    if (!areaText) return "United States";

    const areas = areaText.split(";").map(item => item.trim()).filter(Boolean);
    if (areas.length <= 4) return areas.join(", ");

    return `${areas.slice(0, 4).join(", ")} and additional nearby areas`;
}

function formatDate(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "Not specified";
    return date.toLocaleString([], {
        month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
    });
}

function formatSpeechTime(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "the listed expiration time";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function cleanAlertText(text) {
    return String(text || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\$\$[\s\S]*?\$\$/g, " ")
        .trim();
}

function truncateText(text, maxLength) {
    const value = String(text || "");
    return value.length > maxLength ? `${value.slice(0, maxLength).trim()}…` : value;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function safeUrl(value) {
    try {
        const url = new URL(value || "https://www.weather.gov/");
        return url.protocol === "https:" ? escapeHTML(url.href) : "https://www.weather.gov/";
    } catch {
        return "https://www.weather.gov/";
    }
}
