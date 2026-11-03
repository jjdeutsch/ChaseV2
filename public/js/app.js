(() => {
  const $ = (id) => document.getElementById(id);
  const clock = $("siteClock");
  function updateClock() {
    if (clock) clock.textContent = new Date().toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  async function getJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  }

  async function updateSummary() {
    try {
      const data = await getJson("/api/weather/summary");
      ["tornadoWarnings", "severeWarnings", "tornadoWatches", "winterAlerts"].forEach(id => {
        if ($(id)) $(id).textContent = data[id] ?? "0";
      });
      if ($("weatherUpdated")) $("weatherUpdated").textContent = new Date(data.updated).toLocaleTimeString();
    } catch (error) {
      if ($("weatherUpdated")) $("weatherUpdated").textContent = "Weather data temporarily unavailable";
    }
  }

  function renderChannel(channel, statusId, playerId) {
    const status = $(statusId);
    const player = $(playerId);
    if (!status || !channel) return;
    status.textContent = channel.status === "live" ? "● LIVE NOW" :
      channel.status === "offline" ? "OFFLINE" :
      channel.status === "manual" ? "CHANNEL READY" : "STATUS UNAVAILABLE";
    status.classList.toggle("is-live", channel.status === "live");
    if (player && channel.status === "live" && channel.videoId) {
      player.innerHTML = `<iframe title="${channel.name} live stream" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(channel.videoId)}?autoplay=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>`;
    }
  }

  async function updateYoutube() {
    try {
      const data = await getJson("/api/youtube/status");
      renderChannel(data.channels?.chase, "chaseStreamStatus", "chasePlayer");
      renderChannel(data.channels?.main, "mainStreamStatus", "mainPlayer");
    } catch {
      ["chaseStreamStatus", "mainStreamStatus"].forEach(id => {
        if ($(id)) $(id).textContent = "STATUS UNAVAILABLE";
      });
    }
  }

  async function updateAlerts() {
    const container = $("alertsList");
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Loading active alerts...</div>';
    try {
      const data = await getJson("/api/weather/alerts");
      if (!data.alerts?.length) {
        container.innerHTML = '<div class="empty-state">No active NWS alerts were returned for the United States.</div>';
        return;
      }
      container.innerHTML = data.alerts.map(a => {
        const event = String(a.event || "Weather Alert");
        const type = /tornado warning/i.test(event) ? "tornado" : /severe thunderstorm warning/i.test(event) ? "severe" : "";
        const safe = (value) => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
        return `<article class="alert-card ${type}">
          <h3>${safe(event)}</h3>
          <div class="alert-meta">${safe(a.area)} · Severity: ${safe(a.severity)} · Expires: ${a.expires ? new Date(a.expires).toLocaleString() : "Not listed"}</div>
          <p>${safe(a.headline)}</p>
          <details><summary>Details and instructions</summary><p>${safe(a.description)}</p>${a.instruction ? `<p><strong>Instructions:</strong> ${safe(a.instruction)}</p>` : ""}</details>
          <p><a class="text-link" href="${safe(a.url)}" target="_blank" rel="noopener noreferrer">Official alert details ↗</a></p>
        </article>`;
      }).join("");
    } catch {
      container.innerHTML = '<div class="empty-state">Unable to load active alerts right now. Check <a href="https://www.weather.gov/" target="_blank" rel="noopener">weather.gov</a>.</div>';
    }
  }

  updateSummary();
  updateYoutube();
  updateAlerts();
  setInterval(updateSummary, 60000);
  setInterval(updateYoutube, 15 * 60 * 1000);
  setInterval(updateAlerts, 60000);

  const reportForm = $("reportForm");
  if (reportForm) {
    reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(reportForm).entries());
      const subject = encodeURIComponent(`Stop Spot Chase Weather Report: ${values.type || "Observation"}`);
      const body = encodeURIComponent(
        `Name: ${values.name || "Not provided"}\nLocation: ${values.location || "Not provided"}\nReport type: ${values.type || "Not specified"}\nTime: ${values.time || "Not provided"}\n\nDetails:\n${values.details || ""}`
      );
      window.location.href = `mailto:stopspotchasereports@gmail.com?subject=${subject}&body=${body}`;
      const message = $("reportMessage");
      if (message) message.textContent = "Your email app should open with the report filled in. Review and send it to submit.";
    });
  }
})();