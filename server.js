const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const CHANNELS = {
    stopSpotChase: {
        name: "Stop Spot Chase",
        handle: "@StopSpotChase",
        channelId: "UC5a3b573uIkbTW7TSZ4bo9w"
    },

    joshDeutschOfficial: {
        name: "Josh Deutsch Official",
        handle: "@JoshDeutschOfficial",
        channelId: "UCRPbPO52nNrKjk4vrOfAduw"
    }
};

async function checkChannel(channel) {

    if (!YOUTUBE_API_KEY) {
        throw new Error("YOUTUBE_API_KEY is missing from environment variables");
    }

    const url =
        "https://www.googleapis.com/youtube/v3/search" +
        "?part=snippet" +
        "&channelId=" + encodeURIComponent(channel.channelId) +
        "&eventType=live" +
        "&type=video" +
        "&maxResults=1" +
        "&key=" + encodeURIComponent(YOUTUBE_API_KEY);

    const response = await fetch(url);

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            "YouTube API error: " +
            response.status +
            " " +
            errorText
        );
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        return {
            live: false,
            channel: channel.name,
            handle: channel.handle
        };
    }

    const video = data.items[0];

    return {
        live: true,
        channel: channel.name,
        handle: channel.handle,
        videoId: video.id.videoId,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail:
            video.snippet.thumbnails?.high?.url ||
            video.snippet.thumbnails?.medium?.url ||
            video.snippet.thumbnails?.default?.url
    };
};


/*
    Main website
*/
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pages", "index.html"));
});


/*
    Serve HTML pages from /pages
*/
app.use(express.static(path.join(__dirname, "pages")));


/*
    Serve CSS, JavaScript, images, and other
    files located in the repository root.
*/
app.use(express.static(__dirname));


/*
    YouTube live-status API
*/
app.get("/api/live-status", async (req, res) => {

    try {

        const results = await Promise.all([
            checkChannel(CHANNELS.stopSpotChase),
            checkChannel(CHANNELS.joshDeutschOfficial)
        ]);

        const liveChannels = results.filter(channel => channel.live);

        let status = "offline";

        if (liveChannels.length === 1) {
            status = "live";
        }

        if (liveChannels.length === 2) {
            status = "both";
        }

        res.json({
            success: true,
            status: status,
            checkedAt: new Date().toISOString(),
            channels: results
        });

    } catch (error) {

        console.error("Live-status error:", error);

        res.status(500).json({
            success: false,
            status: "error",
            message: "Unable to check YouTube live status."
        });

    }

});


/*
    Start server
*/
app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log(" STOP SPOT CHASE SERVER");
    console.log("========================================");
    console.log("");
    console.log("Server listening on port " + PORT);
    console.log("");
    console.log("Website:");
    console.log("/");
    console.log("");
    console.log("Live status API:");
    console.log("/api/live-status");
    console.log("");
    console.log("Server is running.");
    console.log("========================================");
    console.log("");

});
