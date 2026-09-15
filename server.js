const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// =========================================================
// WEBSITE FILES
// =========================================================

const pagesPath = path.join(__dirname, "pages");

// Serve CSS, JavaScript, images, etc. from the project root
app.use(express.static(__dirname));

// Serve website files from the pages folder
app.use(express.static(pagesPath));

// =========================================================
// CLEAN URLS
// =========================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(pagesPath, "index.html"));
});

app.get("/about", (req, res) => {
    res.sendFile(path.join(pagesPath, "about.html"));
});

app.get("/live", (req, res) => {
    res.sendFile(path.join(pagesPath, "live.html"));
});

app.get("/reports", (req, res) => {
    res.sendFile(path.join(pagesPath, "reports.html"));
});

app.get("/resources", (req, res) => {
    res.sendFile(path.join(pagesPath, "resources.html"));
});

app.get("/storms", (req, res) => {
    res.sendFile(path.join(pagesPath, "storms.html"));
});

app.get("/donate", (req, res) => {
    res.sendFile(path.join(pagesPath, "donate.html"));
});

// =========================================================
// YOUTUBE CHANNELS
// =========================================================

const channels = [
    {
        name: "Stop Spot Chase",
        handle: "@StopSpotChase",
        channelId: "UC5a3b573uIkbTW7TSZ4bo9w"
    },
    {
        name: "Josh Deutsch Official",
        handle: "@JoshDeutschOfficial",
        channelId: "UCRPbPO52nNrKjk4vrOfAduw"
    }
];

// =========================================================
// CHECK YOUTUBE LIVE STATUS
// =========================================================

async function checkLive(channel) {
    const url =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet` +
        `&channelId=${channel.channelId}` +
        `&eventType=live` +
        `&type=video` +
        `&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
        const video = data.items[0];

        return {
            live: true,
            channel: channel.name,
            handle: channel.handle,
            videoId: video.id.videoId,
            title: video.snippet.title,
            thumbnail:
                video.snippet.thumbnails?.high?.url ||
                video.snippet.thumbnails?.default?.url ||
                null,
            url: `https://www.youtube.com/watch?v=${video.id.videoId}`
        };
    }

    return {
        live: false,
        channel: channel.name,
        handle: channel.handle
    };
}

// =========================================================
// LIVE STATUS API
// =========================================================

app.get("/api/live-status", async (req, res) => {
    try {
        if (!YOUTUBE_API_KEY) {
            return res.status(500).json({
                success: false,
                error: "YOUTUBE_API_KEY is not configured."
            });
        }

        const results = await Promise.all(
            channels.map(channel => checkLive(channel))
        );

        const anyLive = results.some(channel => channel.live);

        res.json({
            success: true,
            status: anyLive ? "live" : "offline",
            checkedAt: new Date().toISOString(),
            channels: results
        });

    } catch (error) {
        console.error("Live status error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to check YouTube live status."
        });
    }
});

// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "online",
        service: "Stop Spot Chase",
        time: new Date().toISOString()
    });
});

// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {
    console.log(`Stop Spot Chase server running on port ${PORT}`);
});
