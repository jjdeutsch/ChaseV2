
const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");

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

const SITE_URL = (
    process.env.SITE_URL || "https://chasev2.onrender.com"
).replace(/\/+$/, "");

// =========================================================
// EMAIL CONFIGURATION
// =========================================================

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const EMAIL_TIMEOUT_MS = 12000;

const emailTransporter =
    EMAIL_USER && EMAIL_APP_PASSWORD
        ? nodemailer.createTransport({
              service: "gmail",
              auth: {
                  user: EMAIL_USER,
                  pass: EMAIL_APP_PASSWORD
              },
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 15000
          })
        : null;

function escapeEmailHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// =========================================================
// EMAIL TIMEOUT HELPER
// =========================================================

async function sendEmailWithTimeout(mail) {
    if (!emailTransporter) {
        throw new Error(
            "Email credentials are not configured."
        );
    }

    let timeoutId;

    try {
        await Promise.race([
            emailTransporter.sendMail(mail),

            new Promise((resolve, reject) => {
                timeoutId = setTimeout(() => {
                    reject(
                        new Error(
                            "Confirmation email timed out."
                        )
                    );
                }, EMAIL_TIMEOUT_MS);
            })
        ]);

        return true;
    } finally {
        clearTimeout(timeoutId);
    }
}

// =========================================================
// BUILD REPORT CONFIRMATION EMAIL
// =========================================================

async function sendReportConfirmation(report) {
    // Email is optional on the public form.
    if (!report.email) {
        return false;
    }

    if (!emailTransporter) {
        throw new Error(
            "Configure EMAIL_USER and EMAIL_APP_PASSWORD in Render."
        );
    }

    const photos = Array.isArray(report.photos)
        ? report.photos
        : [];

    const photoListHtml = photos.length
        ? photos.map((photo, index) => {
              const photoUrl = `${SITE_URL}${photo.url}`;

              return `
                  <li style="margin-bottom:16px;">
                      <strong>Photo ${index + 1}:</strong>
                      ${escapeEmailHtml(
                          photo.originalName || photo.filename
                      )}
                      <br>
                      <a href="${escapeEmailHtml(photoUrl)}">
                          View submitted photo
                      </a>
                  </li>
              `;
          }).join("")
        : "<li>No photos were uploaded.</li>";

    const fields = [
        ["Report ID", report.id],
        ["Name / Display Name", report.displayName],
        ["Email Address", report.email || "Not provided"],
        ["Report Title", report.title],
        ["Chase Date", report.date],
        ["Storm Type", report.stormType],
        ["Location", report.location],
        ["Full Report Description", report.description],
        ["YouTube / Video Link", report.youtubeUrl || "Not provided"],
        ["Additional Link", report.socialUrl || "Not provided"],
        ["Permission to Share", "Granted through the submission form"],
        ["Submitted At", report.createdAt],
        ["Review Status", "Pending review"]
    ];

    const detailsHtml = fields.map(([label, value]) => `
        <tr>
            <td style="padding:10px;border:1px solid #ddd;vertical-align:top;">
                <strong>${escapeEmailHtml(label)}</strong>
            </td>
            <td style="padding:10px;border:1px solid #ddd;white-space:pre-wrap;overflow-wrap:anywhere;">
                ${escapeEmailHtml(value)}
            </td>
        </tr>
    `).join("");

    const detailsText = fields
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n\n");

    const photoText = photos.length
        ? photos.map((photo, index) =>
              `${index + 1}. ${photo.originalName || photo.filename}\n${SITE_URL}${photo.url}`
          )
        : ["No photos were uploaded."];

    const mail = {
        from: `"Stop Spot Chase Reports" <${EMAIL_USER}>`,
        to: report.email,
        replyTo: EMAIL_USER,
        subject: `Report Received: ${report.title}`,

        text: [
            "Thank you for submitting a report to Stop Spot Chase.",
            "",
            "Here is a complete copy of your submission:",
            "",
            detailsText,
            "",
            "SUBMITTED PHOTOS",
            "",
            ...photoText,
            "",
            "Your report is pending review and has not automatically been published.",
            "",
            "Stop Spot Chase — Storm Chasing & Weather"
        ].join("\n"),

        html: `
            <div style="font-family:Arial,sans-serif;color:#172033;max-width:700px;margin:0 auto;">
                <div style="background:#ef3340;color:#fff;padding:24px;border-radius:12px 12px 0 0;">
                    <h1 style="margin:0;">Stop Spot Chase</h1>
                    <p style="margin-bottom:0;">Storm Report Confirmation</p>
                </div>

                <div style="padding:24px;border:1px solid #ddd;">
                    <h2>Your report has been received!</h2>

                    <p>
                        Thank you, ${escapeEmailHtml(report.displayName)}.
                        Below is a copy of the information you submitted.
                    </p>

                    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                        ${detailsHtml}
                    </table>

                    <h3>Submitted Photos</h3>
                    <ul>${photoListHtml}</ul>

                    <p>
                        <strong>Status:</strong> Pending review.
                        Your report has not automatically been published.
                    </p>

                    <p>
                        Thank you for contributing to the Stop Spot Chase community.
                    </p>

                    <p>
                        <strong>Stop Spot Chase</strong><br>
                        Storm Chasing &amp; Weather
                    </p>
                </div>
            </div>
        `
    };

    return sendEmailWithTimeout(mail);
}

// =========================================================
// CREATE REQUIRED FOLDERS AND DATABASE
// =========================================================

fs.mkdirSync(dataPath, { recursive: true });
fs.mkdirSync(uploadsPath, { recursive: true });

if (!fs.existsSync(reportsFile)) {
    fs.writeFileSync(reportsFile, "[]", "utf8");
}

// =========================================================
// MIDDLEWARE
// =========================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve site assets and pages.
app.use(express.static(__dirname));
app.use(express.static(pagesPath));

// Serve uploaded community photos.
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
        throw new Error("Unable to read the reports database.");
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

function deleteUploadedFiles(files) {
    if (!Array.isArray(files)) {
        return;
    }

    for (const file of files) {
        try {
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (error) {
            console.error(
                "Unable to remove uploaded file:",
                error.message
            );
        }
    }
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

        if (!crypto.timingSafeEqual(
            providedBuffer,
            expectedBuffer
        )) {
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
    } catch {
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
            try {
                return decodeURIComponent(parts.slice(1).join("="));
            } catch {
                return null;
            }
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
// PHOTO UPLOAD CONFIGURATION
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
        "https://www.googleapis.com/youtube/v3/search" +
        `?part=snippet&channelId=${channel.channelId}` +
        "&eventType=live&type=video" +
        `&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;

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

        return res.json({
            success: true,
            status: anyLive ? "live" : "offline",
            checkedAt: new Date().toISOString(),
            channels: results
        });
    } catch (error) {
        console.error("Live status error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to check YouTube live status."
        });
    }
});

// =========================================================
// COMMUNITY REPORTS — PUBLIC APPROVED REPORTS ONLY
// =========================================================

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

        return res.json({
            success: true,
            reports: approvedReports
        });
    } catch (error) {
        console.error("Public reports error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load reports."
        });
    }
});

// =========================================================
// SUBMIT A NEW COMMUNITY REPORT
// =========================================================

app.post(
    "/api/reports",
    upload.array("photos", 6),
    async (req, res) => {
        let reportSaved = false;

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

            // Email is optional to match reports.html.
            if (
                !displayName?.trim() ||
                !title?.trim() ||
                !date?.trim() ||
                !location?.trim() ||
                !stormType?.trim() ||
                !description?.trim()
            ) {
                deleteUploadedFiles(req.files);

                return res.status(400).json({
                    success: false,
                    error: "Please complete all required fields."
                });
            }

            const emailAddress = String(email || "").trim();

            if (
                emailAddress &&
                (
                    emailAddress.length > 254 ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)
                )
            ) {
                deleteUploadedFiles(req.files);

                return res.status(400).json({
                    success: false,
                    error: "Please enter a valid email address."
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

            const now = new Date().toISOString();

            const newReport = {
                id: generateId(),
                displayName: String(displayName).trim(),
                email: emailAddress,
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
                createdAt: now,
                updatedAt: now
            };

            // Save first. Email failures must never undo the report.
            const reports = readReports();

            reports.push(newReport);
            writeReports(reports);
            reportSaved = true;

            console.log(
                `Report ${newReport.id} saved and awaiting review.`
            );

            // Attempt email with a strict timeout.
            // This is deliberately isolated from report saving.
            let emailSent = false;

            if (newReport.email) {
                try {
                    emailSent = await sendReportConfirmation(newReport);

                    if (emailSent) {
                        console.log(
                            `Confirmation email sent for report ${newReport.id}.`
                        );
                    }
                } catch (emailError) {
                    console.error(
                        `Confirmation email failed for report ${newReport.id}:`,
                        emailError.message
                    );
                }
            }

            // Always return a response after the email attempt finishes
            // or times out.
            return res.status(201).json({
                success: true,
                emailSent,
                reportId: newReport.id,
                message: emailSent
                    ? "Your report was submitted successfully. A confirmation email has been sent."
                    : newReport.email
                        ? "Your report was saved and is awaiting review, but the confirmation email could not be sent. Your report was not lost."
                        : "Your report was submitted successfully and is awaiting review. Add an email address if you would like a confirmation email."
            });
        } catch (error) {
            console.error("Report submission error:", error);

            if (!reportSaved) {
                deleteUploadedFiles(req.files);
            }

            return res.status(500).json({
                success: false,
                error: reportSaved
                    ? "Your report was saved, but an additional operation failed. Please do not submit it again."
                    : "Unable to save your report. Please try again later."
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

        return res.json({
            success: true,
            message: "Administrator login successful."
        });
    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
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

        return res.json({
            success: true,
            reports
        });
    } catch (error) {
        console.error("Admin reports error:", error);

        return res.status(500).json({
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

        if (req.body.featured !== undefined) {
            report.featured = Boolean(req.body.featured);
        }

        if (req.body.title !== undefined) {
            report.title = String(req.body.title).trim();
        }

        if (req.body.location !== undefined) {
            report.location = String(req.body.location).trim();
        }

        if (req.body.description !== undefined) {
            report.description = String(req.body.description).trim();
        }

        if (req.body.stormType !== undefined) {
            report.stormType = String(req.body.stormType).trim();
        }

        report.updatedAt = new Date().toISOString();
        reports[index] = report;

        writeReports(reports);

        return res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error("Admin update error:", error);

        return res.status(500).json({
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

        // Delete the report's uploaded photos.
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
                        error.message
                    );
                }
            }
        }

        reports.splice(index, 1);
        writeReports(reports);

        return res.json({
            success: true,
            message: "Report deleted."
        });
    } catch (error) {
        console.error("Admin delete error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to delete report."
        });
    }
});

// =========================================================
// UPLOAD AND REQUEST ERROR HANDLER
// =========================================================

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

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

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                success: false,
                error: "Unexpected photo field. Please use the report form to upload photos."
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

    return next();
});

// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "online",
        service: "Stop Spot Chase",
        emailConfigured: Boolean(emailTransporter),
        time: new Date().toISOString()
    });
});

// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {
    console.log(`Stop Spot Chase server running on port ${PORT}`);
    console.log(`Website pages: ${pagesPath}`);
    console.log(`Community reports database: ${reportsFile}`);
    console.log(`Community uploads: ${uploadsPath}`);

    console.log(
        `Report confirmation email: ${
            emailTransporter ? "configured" : "NOT CONFIGURED"
        }`
    );
});
