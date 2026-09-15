const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// =========================================================
// STATIC FILES
// =========================================================

app.use(express.static(__dirname));

// =========================================================
// CLEAN WEBSITE URLS
// =========================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/about", (req, res) => {
    res.sendFile(path.join(__dirname, "about.html"));
});

app.get("/live", (req, res) => {
    res.sendFile(path.join(__dirname, "live.html"));
});

app.get("/reports", (req, res) => {
    res.sendFile(path.join(__dirname, "reports.html"));
});

app.get("/resources", (req, res) => {
    res.sendFile(path.join(__dirname, "resources.html"));
});

app.get("/storms", (req, res) => {
    res.sendFile(path.join(__dirname, "storms.html"));
});

app.get("/donate", (req, res) => {
    res.sendFile(path.join(__dirname, "donate.html"));
});

// =========================================================
// YOUTUBE LIVE STATUS
// =========================================================

const channels = [
    {
        name: "Stop Spot Chase",
        handle: "@StopSpotChase"
    },
    {
        name: "Josh Deutsch Official",
        handle: "@JoshDeutschOfficial"
    }
];

// Get YouTube channel ID from handle
async function getChannelId(handle) {
    const url =
        `https://www.googleapis.com/youtube/v3/channels` +
        `?part=id&forHandle=${encodeURIComponent(handle)}` +
        `&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        throw new Error(`Channel not found: ${handle}`);
    }

    return data.items[0].id;
}

// Check whether a channel is currently live
async function checkLive(channel) {
    const channelId = await getChannelId(channel.handle);

    const url =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&channelId=${channelId}` +
        `&eventType=live&type=video&key=${YOUTUBE_API_KEY}`;

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
            thumbnail: video.snippet.thumbnails?.high?.url ||
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
                error: "YOUTUBE_API_KEY is not configured on the server."
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
