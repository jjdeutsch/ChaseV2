const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================
// CONFIGURATION
// =========================================================

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

const pagesPath = path.join(__dirname, "pages");
const dataPath = path.join(__dirname, "data");
const uploadsPath = path.join(__dirname, "uploads");
const reportsFile = path.join(dataPath, "reports.json");

// Create required folders
fs.mkdirSync(dataPath, { recursive: true });
fs.mkdirSync(uploadsPath, { recursive: true });

// Create reports database if it does not exist
if (!fs.existsSync(reportsFile)) {
    fs.writeFileSync(reportsFile, "[]", "utf8");
}

// =========================================================
// MIDDLEWARE
// =========================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve CSS, JavaScript, images, etc. from project root
app.use(express.static(__dirname));

// Serve website files from pages folder
app.use(express.static(pagesPath));

// Serve uploaded community photos
app.use("/uploads", express.static(uploadsPath));

// =========================================================
// REPORT DATABASE HELPERS
// =========================================================

function readReports() {
    try {
        const raw = fs.readFileSync(reportsFile, "utf8");

        if (!raw.trim()) {
            return [];
        }

        const reports = JSON.parse(raw);

        return Array.isArray(reports) ? reports : [];
    } catch (error) {
        console.error("Unable to read reports database:", error);
        return [];
    }
}

function writeReports(reports) {
    const tempFile = reportsFile + ".tmp";

    fs.writeFileSync(
        tempFile,
        JSON.stringify(reports, null, 2),
        "utf8"
    );

    fs.renameSync(tempFile, reportsFile);
}

function generateId() {
    return (
        Date.now().toString(36) +
        "-" +
        crypto.randomBytes(6).toString("hex")
    );
}

// =========================================================
// ADMIN AUTHENTICATION
// =========================================================

function createAdminToken() {
    if (!SESSION_SECRET) {
        throw new Error("SESSION_SECRET is not configured.");
    }

    const expires = Date.now() + (8 * 60 * 60 * 1000);

    const payload = Buffer.from(
        JSON.stringify({
            admin: true,
            expires
        })
    ).toString("base64url");

    const signature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
    if (!token || !SESSION_SECRET) {
        return false;
    }

    try {
        const parts = token.split(".");

        if (parts.length !== 2) {
            return false;
        }

        const payload = parts[0];
        const providedSignature = parts[1];

        const expectedSignature = crypto
            .createHmac("sha256", SESSION_SECRET)
            .update(payload)
            .digest("base64url");

        const providedBuffer = Buffer.from(providedSignature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (providedBuffer.length !== expectedBuffer.length) {
            return false;
        }

        if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
            return false;
        }

        const decoded = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        );

        if (!decoded.admin) {
            return false;
        }

        if (!decoded.expires || Date.now() > decoded.expires) {
            return false;
        }

        return true;

    } catch (error) {
        return false;
    }
}

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(";");

    for (const cookie of cookies) {
        const parts = cookie.trim().split("=");

        if (parts[0] === name) {
            return decodeURIComponent(parts.slice(1).join("="));
        }
    }

    return null;
}

function requireAdmin(req, res, next) {
    const token = getCookie(req, "ssc_admin");

    if (!verifyAdminToken(token)) {
        return res.status(401).json({
            success: false,
            error: "Administrator authentication required."
        });
    }

    next();
}

// =========================================================
// UPLOAD CONFIGURATION
// =========================================================

const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
];

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadsPath);
        },

        filename: (req, file, cb) => {
            const extension =
                path.extname(file.originalname).toLowerCase() || ".jpg";

            const safeName =
                `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

            cb(null, safeName);
        }
    }),

    limits: {
        files: 6,
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(
                new Error(
                    "Only JPG, PNG, WEBP, and GIF images are allowed."
                )
            );
        }

        cb(null, true);
    }
});

// =========================================================
// WEBSITE CLEAN URLS
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

app.get("/admin", (req, res) => {
    res.sendFile(path.join(pagesPath, "admin.html"));
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
// YOUTUBE LIVE STATUS API
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
// COMMUNITY REPORTS
// =========================================================

// PUBLIC:
// Only approved reports are returned.
app.get("/api/reports", (req, res) => {
    try {
        const reports = readReports();

        const approvedReports = reports
            .filter(report => report.status === "approved")
            .sort((a, b) => {
                const dateA = new Date(a.date || a.createdAt).getTime();
                const dateB = new Date(b.date || b.createdAt).getTime();

                return dateB - dateA;
            });

        res.json({
            success: true,
            reports: approvedReports
        });

    } catch (error) {
        console.error("Public reports error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to load reports."
        });
    }
});

// SUBMIT NEW REPORT
app.post(
    "/api/reports",
    upload.array("photos", 6),
    (req, res) => {
        try {
            const {
                displayName,
                email,
                title,
                date,
                location,
                stormType,
                description,
                youtubeUrl,
                socialUrl
            } = req.body;

            // Required fields
            if (
                !displayName ||
                !title ||
                !date ||
                !location ||
                !stormType ||
                !description
            ) {
                // Delete uploaded files if validation fails
                if (req.files) {
                    for (const file of req.files) {
                        try {
                            fs.unlinkSync(file.path);
                        } catch {}
                    }
                }

                return res.status(400).json({
                    success: false,
                    error: "Please complete all required fields."
                });
            }

            const files = req.files || [];

            const photos = files.map(file => ({
                filename: file.filename,
                originalName: file.originalname,
                url: `/uploads/${file.filename}`,
                mimeType: file.mimetype,
                size: file.size
            }));

            const newReport = {
                id: generateId(),

                displayName: String(displayName).trim(),
                email: email ? String(email).trim() : "",

                title: String(title).trim(),
                date: String(date).trim(),
                location: String(location).trim(),
                stormType: String(stormType).trim(),

                description: String(description).trim(),

                youtubeUrl: youtubeUrl
                    ? String(youtubeUrl).trim()
                    : "",

                socialUrl: socialUrl
                    ? String(socialUrl).trim()
                    : "",

                photos,

                status: "pending",
                featured: false,

                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const reports = readReports();

            reports.push(newReport);

            writeReports(reports);

            res.status(201).json({
                success: true,
                message:
                    "Your chase report was submitted and is awaiting review.",
                reportId: newReport.id
            });

        } catch (error) {
            console.error("Report submission error:", error);

            if (req.files) {
                for (const file of req.files) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch {}
                }
            }

            res.status(500).json({
                success: false,
                error: "Unable to submit your report."
            });
        }
    }
);

// =========================================================
// ADMIN LOGIN
// =========================================================

app.post("/api/admin/login", (req, res) => {
    try {
        if (!ADMIN_PASSWORD) {
            return res.status(500).json({
                success: false,
                error: "ADMIN_PASSWORD is not configured on the server."
            });
        }

        if (!SESSION_SECRET) {
            return res.status(500).json({
                success: false,
                error: "SESSION_SECRET is not configured on the server."
            });
        }

        const password = req.body?.password;

        if (!password) {
            return res.status(400).json({
                success: false,
                error: "Password is required."
            });
        }

        const supplied = Buffer.from(String(password));
        const expected = Buffer.from(String(ADMIN_PASSWORD));

        let passwordMatches = false;

        if (supplied.length === expected.length) {
            passwordMatches = crypto.timingSafeEqual(
                supplied,
                expected
            );
        }

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                error: "Invalid administrator password."
            });
        }

        const token = createAdminToken();

        const secure = process.env.NODE_ENV === "production"
            ? "; Secure"
            : "";

        res.setHeader(
            "Set-Cookie",
            `ssc_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${secure}`
        );

        res.json({
            success: true,
            message: "Administrator login successful."
        });

    } catch (error) {
        console.error("Admin login error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to process administrator login."
        });
    }
});

// =========================================================
// ADMIN SESSION CHECK
// =========================================================

app.get("/api/admin/me", requireAdmin, (req, res) => {
    res.json({
        success: true,
        authenticated: true
    });
});

// =========================================================
// ADMIN LOGOUT
// =========================================================

app.post("/api/admin/logout", (req, res) => {
    res.setHeader(
        "Set-Cookie",
        "ssc_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    );

    res.json({
        success: true
    });
});

// =========================================================
// ADMIN GET ALL REPORTS
// =========================================================

app.get("/api/admin/reports", requireAdmin, (req, res) => {
    try {
        const reports = readReports();

        reports.sort((a, b) => {
            return new Date(b.createdAt).getTime() -
                   new Date(a.createdAt).getTime();
        });

        res.json({
            success: true,
            reports
        });

    } catch (error) {
        console.error("Admin reports error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to load reports."
        });
    }
});

// =========================================================
// ADMIN UPDATE REPORT
// =========================================================

app.patch("/api/admin/reports/:id", requireAdmin, (req, res) => {
    try {
        const reportId = req.params.id;

        const reports = readReports();

        const index = reports.findIndex(
            report => report.id === reportId
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Report not found."
            });
        }

        const report = reports[index];

        // Update status
        if (req.body.status !== undefined) {
            const allowedStatuses = [
                "pending",
                "approved",
                "rejected"
            ];

            if (!allowedStatuses.includes(req.body.status)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid report status."
                });
            }

            report.status = req.body.status;
        }

        // Update featured status
        if (req.body.featured !== undefined) {
            report.featured = Boolean(req.body.featured);
        }

        // Optional admin editing support
        if (req.body.title !== undefined) {
            report.title = String(req.body.title).trim();
        }

        if (req.body.location !== undefined) {
            report.location = String(req.body.location).trim();
        }

        if (req.body.description !== undefined) {
            report.description = String(
                req.body.description
            ).trim();
        }

        if (req.body.stormType !== undefined) {
            report.stormType = String(
                req.body.stormType
            ).trim();
        }

        report.updatedAt = new Date().toISOString();

        reports[index] = report;

        writeReports(reports);

        res.json({
            success: true,
            report
        });

    } catch (error) {
        console.error("Admin update error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to update report."
        });
    }
});

// =========================================================
// ADMIN DELETE REPORT
// =========================================================

app.delete("/api/admin/reports/:id", requireAdmin, (req, res) => {
    try {
        const reportId = req.params.id;

        const reports = readReports();

        const index = reports.findIndex(
            report => report.id === reportId
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: "Report not found."
            });
        }

        const report = reports[index];

        // Delete uploaded photos
        if (Array.isArray(report.photos)) {
            for (const photo of report.photos) {
                if (!photo.filename) {
                    continue;
                }

                const filePath = path.join(
                    uploadsPath,
                    path.basename(photo.filename)
                );

                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (error) {
                    console.error(
                        "Unable to delete photo:",
                        error
                    );
                }
            }
        }

        reports.splice(index, 1);

        writeReports(reports);

        res.json({
            success: true,
            message: "Report deleted."
        });

    } catch (error) {
        console.error("Admin delete error:", error);

        res.status(500).json({
            success: false,
            error: "Unable to delete report."
        });
    }
});

// =========================================================
// UPLOAD ERROR HANDLER
// =========================================================

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                error: "Each photo must be 10 MB or smaller."
            });
        }

        if (error.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({
                success: false,
                error: "You can upload a maximum of 6 photos."
            });
        }

        return res.status(400).json({
            success: false,
            error: error.message
        });
    }

    if (error) {
        console.error("Server error:", error);

        return res.status(400).json({
            success: false,
            error: error.message || "Request failed."
        });
    }

    next();
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
    console.log(
        `Stop Spot Chase server running on port ${PORT}`
    );

    console.log(
        `Website pages: ${pagesPath}`
    );

    console.log(
        `Community reports database: ${reportsFile}`
    );

    console.log(
        `Community uploads: ${uploadsPath}`
    );
});
