
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],

      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://fonts.googleapis.com"
      ],

      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],

      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:"
      ],

      connectSrc: [
        "'self'",
        "https://api.weather.gov",
        "https://tilecache.rainviewer.com",
        "https://api.rainviewer.com",
        "https://www.googleapis.com",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://api.open-meteo.com",
        "https://geocoding-api.open-meteo.com",
        "https://www.spc.noaa.gov",
        "https://basemap.nationalmap.gov"
      ],

      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com"
      ],

      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// --------------------------------------------------
// CACHE SETTINGS
// --------------------------------------------------

const CACHE_MS = 5 * 60 * 1000;
const YOUTUBE_CACHE_MS = 15 * 60 * 1000;

let alertCache = { at: 0, data: null };
let youtubeCache = { at: 0, data: null };
let reportCache = { at: 0, data: null };

// --------------------------------------------------
// SHARED FETCH FUNCTION
// --------------------------------------------------

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StopSpotChase/2.0 (weather operations website)",
      ...headers
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StopSpotChase/2.0 (weather operations website)",
      ...headers
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed: ${response.status}`);
  }

  return response.text();
}

// --------------------------------------------------
// HEALTH AND STATUS
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Stop Spot Chase",
    version: "2.0.0",
    time: new Date().toISOString()
  });
});

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    service: "Stop Spot Chase",
    environment: process.env.NODE_ENV || "development",
    time: new Date().toISOString()
  });
});

// --------------------------------------------------
// NATIONAL WEATHER SERVICE ALERTS
// --------------------------------------------------

app.get("/api/weather/alerts", async (_req, res) => {
  try {
    if (alertCache.data && Date.now() - alertCache.at < CACHE_MS) {
      return res.json({
        ...alertCache.data,
        cached: true
      });
    }

    const data = await fetchJson(
      "https://api.weather.gov/alerts/active",
      {
        Accept: "application/geo+json"
      }
    );

    const features = Array.isArray(data.features)
      ? data.features
      : [];

    // Keep original features and geometry for Leaflet.
    const alerts = features.map(feature => {
      const p = feature.properties || {};

      return {
        id: feature.id || p.id || `${p.event}-${p.sent}`,
        event: p.event || "Weather Alert",
        headline: p.headline || p.event || "Weather alert",
        description: p.description || "",
        instruction: p.instruction || "",
        area: p.areaDesc || "Area not specified",
        severity: p.severity || "Unknown",
        urgency: p.urgency || "Unknown",
        certainty: p.certainty || "Unknown",
        effective: p.effective || null,
        expires: p.expires || null,
        sender: p.senderName || "National Weather Service",
        url: p.web || feature.id || "https://www.weather.gov/"
      };
    });

    const result = {
      ok: true,
      count: alerts.length,
      updated: new Date().toISOString(),

      // Used by radar.html to draw warning polygons.
      features,

      // Used by other website pages for alert information.
      alerts
    };

    alertCache = {
      at: Date.now(),
      data: result
    };

    res.json(result);

  } catch (error) {
    console.error("NWS alert error:", error);

    res.status(502).json({
      ok: false,
      error: "Unable to retrieve National Weather Service alerts.",
      details: error.message
    });
  }
});

// --------------------------------------------------
// WEATHER SUMMARY
// --------------------------------------------------

app.get("/api/weather/summary", async (_req, res) => {
  try {
    const data = await fetchJson(
      "https://api.weather.gov/alerts/active",
      {
        Accept: "application/geo+json"
      }
    );

    const alerts = (data.features || []).map(
      feature => feature.properties || {}
    );

    const count = fn => alerts.filter(fn).length;

    res.json({
      ok: true,
      total: alerts.length,

      tornadoWarnings: count(
        a => /Tornado Warning/i.test(a.event || "")
      ),

      severeWarnings: count(
        a => /Severe Thunderstorm Warning/i.test(a.event || "")
      ),

      tornadoWatches: count(
        a => /Tornado Watch/i.test(a.event || "")
      ),

      severeWatches: count(
        a => /Severe Thunderstorm Watch/i.test(a.event || "")
      ),

      winterAlerts: count(
        a => /(Winter Storm|Blizzard|Ice Storm|Snow Squall|Winter Weather|Lake Effect Snow)/i.test(a.event || "")
      ),

      updated: new Date().toISOString()
    });

  } catch (error) {
    console.error("Weather summary error:", error);

    res.status(502).json({
      ok: false,
      error: "Weather summary unavailable.",
      details: error.message
    });
  }
});

// --------------------------------------------------
// SPC STORM REPORTS
// --------------------------------------------------

// Parse CSV while respecting quoted fields.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;

      row.push(field.trim());

      if (row.some(value => value !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(
    value => value.toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  return rows.map(values => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });

    return record;
  });
}

function findCSVValue(record, possibleNames) {
  for (const name of possibleNames) {
    if (record[name] !== undefined && record[name] !== "") {
      return record[name];
    }
  }

  return "";
}

function dateStamp(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

app.get("/api/weather/reports", async (_req, res) => {
  try {
    if (reportCache.data && Date.now() - reportCache.at < 5 * 60 * 1000) {
      return res.json({
        ...reportCache.data,
        cached: true
      });
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const dates = [
      dateStamp(today),
      dateStamp(yesterday)
    ];

    const reports = [];
    const sources = [];

    for (const date of dates) {
      const year = date.slice(0, 4);

      const url =
        `https://www.spc.noaa.gov/climo/reports/${year}/${date}_rpts_filtered.csv`;

      try {
        const csv = await fetchText(url);
        const records = parseCSV(csv);

        for (const record of records) {
          const lat = Number(
            findCSVValue(record, ["lat", "latitude"])
          );

          const lon = Number(
            findCSVValue(record, ["lon", "long", "longitude"])
          );

          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon) ||
            Math.abs(lat) > 90 ||
            Math.abs(lon) > 180
          ) {
            continue;
          }

          const type = findCSVValue(record, [
            "type",
            "event",
            "reporttype"
          ]);

          const location = [
            findCSVValue(record, ["location", "city"]),
            findCSVValue(record, ["county"]),
            findCSVValue(record, ["state"])
          ].filter(Boolean).join(", ");

          reports.push({
            type: type || "Storm Report",
            event: type || "Storm Report",
            latitude: lat,
            longitude: lon,
            location: location || "Location not listed",
            comments: findCSVValue(record, [
              "comments",
              "remark",
              "remarks"
            ]),
            time: findCSVValue(record, [
              "time",
              "timeutc"
            ]),
            date
          });
        }

        sources.push(date);

      } catch (error) {
        console.warn(`SPC report file unavailable for ${date}:`, error.message);
      }
    }

    const result = {
      ok: true,
      count: reports.length,
      reports,
      source: "NOAA Storm Prediction Center",
      datesChecked: dates,
      datesAvailable: sources,
      updated: new Date().toISOString()
    };

    reportCache = {
      at: Date.now(),
      data: result
    };

    res.json(result);

  } catch (error) {
    console.error("Storm reports error:", error);

    res.status(502).json({
      ok: false,
      error: "Unable to retrieve SPC storm reports.",
      details: error.message
    });
  }
});

// --------------------------------------------------
// YOUTUBE LIVE STATUS
// --------------------------------------------------

async function checkYoutubeChannel(channelId, name) {
  if (!channelId) {
    return {
      name,
      live: false,
      status: "unconfigured",
      url: "https://www.youtube.com/"
    };
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return {
      name,
      live: false,
      status: "manual",
      url: `https://www.youtube.com/channel/${channelId}`,
      note: "Add YOUTUBE_API_KEY in Render environment variables to enable automatic live detection."
    };
  }

  const search = new URL(
    "https://www.googleapis.com/youtube/v3/search"
  );

  search.search = new URLSearchParams({
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key: apiKey
  }).toString();

  try {
    const result = await fetchJson(search.toString());
    const item = result.items && result.items[0];

    if (item) {
      return {
        name,
        live: true,
        status: "live",
        title: item.snippet?.title || "Live broadcast",
        videoId: item.id?.videoId || null,
        url: item.id?.videoId
          ? `https://www.youtube.com/watch?v=${item.id.videoId}`
          : `https://www.youtube.com/channel/${channelId}`
      };
    }

    return {
      name,
      live: false,
      status: "offline",
      url: `https://www.youtube.com/channel/${channelId}`
    };

  } catch (error) {
    return {
      name,
      live: false,
      status: "unavailable",
      url: `https://www.youtube.com/channel/${channelId}`,
      error: error.message
    };
  }
}

app.get("/api/youtube/status", async (_req, res) => {
  try {
    if (
      youtubeCache.data &&
      Date.now() - youtubeCache.at < YOUTUBE_CACHE_MS
    ) {
      return res.json({
        ...youtubeCache.data,
        cached: true
      });
    }

    const [chase, main] = await Promise.all([
      checkYoutubeChannel(
        process.env.STOPSPOTCHASE_CHANNEL_ID ||
          "UC5a3b573uIkbTW7TSZ4bo9w",
        "Stop Spot Chase"
      ),

      checkYoutubeChannel(
        process.env.JOSHDEUTSCH_CHANNEL_ID ||
          "UCRPbPO52nNrKjk4vrOfAduw",
        "Josh Deutsch Official"
      )
    ]);

    const result = {
      ok: true,
      updated: new Date().toISOString(),
      channels: {
        chase,
        main
      }
    };

    youtubeCache = {
      at: Date.now(),
      data: result
    };

    res.json(result);

  } catch (error) {
    console.error("YouTube status error:", error);

    res.status(502).json({
      ok: false,
      error: "YouTube status unavailable.",
      details: error.message
    });
  }
});

// --------------------------------------------------
// NWS LOCATION FORECAST
// --------------------------------------------------

app.get("/api/weather/point", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return res.status(400).json({
      ok: false,
      error: "Valid lat and lon query parameters are required."
    });
  }

  try {
    const point = await fetchJson(
      `https://api.weather.gov/points/${lat},${lon}`,
      {
        Accept: "application/geo+json"
      }
    );

    const forecastUrl = point.properties?.forecast;

    if (!forecastUrl) {
      return res.status(404).json({
        ok: false,
        error: "Forecast endpoint unavailable for this location."
      });
    }

    const forecast = await fetchJson(forecastUrl, {
      Accept: "application/geo+json"
    });

    res.json({
      ok: true,
      location: point.properties?.relativeLocation?.properties || {},
      periods: (forecast.properties?.periods || [])
        .slice(0, 6)
        .map(p => ({
          name: p.name,
          temperature: p.temperature,
          temperatureUnit: p.temperatureUnit,
          windSpeed: p.windSpeed,
          windDirection: p.windDirection,
          shortForecast: p.shortForecast,
          detailedForecast: p.detailedForecast,
          icon: p.icon
        }))
    });

  } catch (error) {
    console.error("NWS point forecast error:", error);

    res.status(502).json({
      ok: false,
      error: "Forecast unavailable.",
      details: error.message
    });
  }
});

// --------------------------------------------------
// 404 HANDLER — EXPRESS 5 COMPATIBLE
// --------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "API endpoint not found"
    });
  }

  res.status(404).sendFile(
    path.join(PUBLIC_DIR, "404.html")
  );
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);

  res.status(500).json({
    ok: false,
    error: "Internal server error."
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Stop Spot Chase 2.0 listening on port ${PORT}`
  );
});
