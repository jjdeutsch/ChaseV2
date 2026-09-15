/* =========================================================
   STOP SPOT CHASE
   Nationwide Weather & Storm Chasing
   Website JavaScript
   ========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
   ========================================================= */

const NWS_ALERT_URL =
    "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const REFRESH_INTERVAL =
    60 * 1000;


/*
    Only these alert types are displayed.

    Everything else from the National Weather Service
    is intentionally ignored.
*/

const QUALIFYING_ALERTS = {

    PDS_TORNADO:
        "PDS Tornado",

    TORNADO_WARNING:
        "Tornado Warning",

    TORNADO_WATCH:
        "Tornado Watch",

    SEVERE_WARNING:
        "Severe Thunderstorm Warning",

    SEVERE_WATCH:
        "Severe Thunderstorm Watch"

};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentAlerts = [];

let lastSuccessfulUpdate = null;

let refreshTimer = null;

let isLoadingAlerts = false;


/* =========================================================
   PAGE READY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initializeSite
);


/* =========================================================
   INITIALIZE SITE
   ========================================================= */

function initializeSite() {

    initializeNavigation();

    initializeExternalLinks();

    initializeAlertInterface();

}


/* =========================================================
   INITIALIZE ALERT INTERFACE
   ========================================================= */

function initializeAlertInterface() {

    const alertInterfaceExists =
        document.getElementById("homeAlerts") ||
        document.getElementById("stormAlerts") ||
        document.getElementById("stormAlertList") ||
        document.getElementById("fullStormAlerts") ||
        document.querySelector("[data-alert-list]") ||
        document.querySelector("[data-alert-count]") ||
        document.querySelector("[data-alert-type]");

    /*
        Do not continuously contact NWS on pages that
        do not use weather alerts.
    */

    if (!alertInterfaceExists) {
        return;
    }


    loadWeatherAlerts();


    if (refreshTimer) {
        clearInterval(refreshTimer);
    }


    refreshTimer =
        setInterval(
            loadWeatherAlerts,
            REFRESH_INTERVAL
        );

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function initializeNavigation() {

    const navLinks =
        document.querySelectorAll(
            ".nav-links a"
        );


    navLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                navLinks.forEach(item => {

                    item.classList.remove(
                        "clicked"
                    );

                });


                link.classList.add(
                    "clicked"
                );

            }
        );

    });


    /*
        Smooth scrolling for internal anchors.
    */

    document
        .querySelectorAll(
            'a[href^="#"]'
        )
        .forEach(link => {

            link.addEventListener(
                "click",
                event => {

                    const targetId =
                        link.getAttribute(
                            "href"
                        );


                    if (
                        !targetId ||
                        targetId === "#"
                    ) {
                        return;
                    }


                    const target =
                        document.querySelector(
                            targetId
                        );


                    if (!target) {
                        return;
                    }


                    event.preventDefault();


                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                }
            );

        });

}


/* =========================================================
   EXTERNAL LINKS
   ========================================================= */

function initializeExternalLinks() {

    document
        .querySelectorAll(
            'a[target="_blank"]'
        )
        .forEach(link => {

            const existingRel =
                link.getAttribute("rel") || "";


            const relParts =
                existingRel
                    .split(/\s+/)
                    .filter(Boolean);


            if (
                !relParts.includes("noopener")
            ) {
                relParts.push("noopener");
            }


            if (
                !relParts.includes("noreferrer")
            ) {
                relParts.push("noreferrer");
            }


            link.setAttribute(
                "rel",
                relParts.join(" ")
            );

        });

}


/* =========================================================
   LOAD NWS ALERTS
   ========================================================= */

async function loadWeatherAlerts() {

    /*
        Prevent multiple simultaneous requests.
    */

    if (isLoadingAlerts) {
        return;
    }


    isLoadingAlerts = true;


    try {

        const response =
            await fetch(
                NWS_ALERT_URL,
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/geo+json"
                    },

                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `NWS request failed with status ${response.status}`
            );

        }


        const data =
            await response.json();


        const features =
            Array.isArray(data.features)
                ? data.features
                : [];


        currentAlerts =
            features
                .map(normalizeAlert)
                .filter(
                    alert =>
                        alert !== null
                )
                .sort(sortAlerts);


        lastSuccessfulUpdate =
            new Date();


        updateAlertInterfaces();


        console.info(
            `Stop Spot Chase: ${currentAlerts.length} qualifying NWS alerts loaded.`
        );


    } catch (error) {

        console.error(
            "Stop Spot Chase: Unable to load NWS alerts.",
            error
        );


        showAlertError();


    } finally {

        isLoadingAlerts = false;

    }

}


/* =========================================================
   NORMALIZE ALERT
   ========================================================= */

function normalizeAlert(feature) {

    if (
        !feature ||
        !feature.properties
    ) {
        return null;
    }


    const properties =
        feature.properties;


    const event =
        String(
            properties.event || ""
        ).trim();


    const headline =
        String(
            properties.headline || ""
        ).trim();


    const description =
        String(
            properties.description || ""
        ).trim();


    const areaDesc =
        String(
            properties.areaDesc || ""
        ).trim();


    const sent =
        properties.sent
            ? new Date(properties.sent)
            : null;


    const effective =
        properties.effective
            ? new Date(properties.effective)
            : null;


    const expires =
        properties.expires
            ? new Date(properties.expires)
            : null;


    /*
        Ignore expired alerts.
    */

    if (
        expires &&
        !Number.isNaN(expires.getTime()) &&
        expires.getTime() < Date.now()
    ) {
        return null;
    }


    /*
        Ignore alerts that have not become effective yet.
    */

    if (
        effective &&
        !Number.isNaN(effective.getTime()) &&
        effective.getTime() > Date.now()
    ) {
        return null;
    }


    /*
        Identify PDS Tornado Warnings.

        NWS may indicate PDS in the headline,
        description, or parameters.
    */

    const headlineLower =
        headline.toLowerCase();


    const descriptionLower =
        description.toLowerCase();


    const parameterText =
        JSON.stringify(
            properties.parameters || {}
        ).toLowerCase();


    const isPDS =
        event.toLowerCase() ===
            "tornado warning" &&
        (
            headlineLower.includes(
                "particularly dangerous situation"
            ) ||

            descriptionLower.includes(
                "particularly dangerous situation"
            ) ||

            headlineLower.includes(
                "pds tornado"
            ) ||

            descriptionLower.includes(
                "pds tornado"
            ) ||

            parameterText.includes(
                "particularly dangerous situation"
            ) ||

            parameterText.includes(
                "pds"
            )
        );


    let alertType = null;


    if (isPDS) {

        alertType =
            QUALIFYING_ALERTS.PDS_TORNADO;


    } else if (
        event === "Tornado Warning"
    ) {

        alertType =
            QUALIFYING_ALERTS.TORNADO_WARNING;


    } else if (
        event === "Tornado Watch"
    ) {

        alertType =
            QUALIFYING_ALERTS.TORNADO_WATCH;


    } else if (
        event ===
        "Severe Thunderstorm Warning"
    ) {

        alertType =
            QUALIFYING_ALERTS.SEVERE_WARNING;


    } else if (
        event ===
        "Severe Thunderstorm Watch"
    ) {

        alertType =
            QUALIFYING_ALERTS.SEVERE_WATCH;

    }


    /*
        Ignore every other NWS product.
    */

    if (!alertType) {
        return null;
    }


    return {

        id:
            feature.id ||
            `${event}-${sent ? sent.getTime() : Date.now()}-${areaDesc}`,

        event,

        alertType,

        headline,

        description,

        areaDesc,

        sent,

        effective,

        expires,

        urgency:
            properties.urgency ||
            "",

        severity:
            properties.severity ||
            "",

        certainty:
            properties.certainty ||
            "",

        sender:
            properties.senderName ||
            "National Weather Service",

        instruction:
            properties.instruction ||
            "",

        url:
            feature.id ||
            "",

        isPDS

    };

}


/* =========================================================
   SORT ALERTS
   ========================================================= */

function sortAlerts(a, b) {

    const priority = {

        "PDS Tornado":
            1,

        "Tornado Warning":
            2,

        "Severe Thunderstorm Warning":
            3,

        "Tornado Watch":
            4,

        "Severe Thunderstorm Watch":
            5

    };


    const aPriority =
        priority[a.alertType] || 99;


    const bPriority =
        priority[b.alertType] || 99;


    if (
        aPriority !==
        bPriority
    ) {
        return (
            aPriority -
            bPriority
        );
    }


    const aTime =
        a.sent instanceof Date &&
        !Number.isNaN(
            a.sent.getTime()
        )
            ? a.sent.getTime()
            : 0;


    const bTime =
        b.sent instanceof Date &&
        !Number.isNaN(
            b.sent.getTime()
        )
            ? b.sent.getTime()
            : 0;


    return bTime - aTime;

}


/* =========================================================
   GET ALERT COUNTS
   ========================================================= */

function getAlertCounts() {

    return {

        total:
            currentAlerts.length,

        pds:
            currentAlerts.filter(
                alert =>
                    alert.alertType ===
                    QUALIFYING_ALERTS.PDS_TORNADO
            ).length,

        tornadoWarnings:
            currentAlerts.filter(
                alert =>
                    alert.alertType ===
                    QUALIFYING_ALERTS.TORNADO_WARNING
            ).length,

        severeWarnings:
            currentAlerts.filter(
                alert =>
                    alert.alertType ===
                    QUALIFYING_ALERTS.SEVERE_WARNING
            ).length,

        tornadoWatches:
            currentAlerts.filter(
                alert =>
                    alert.alertType ===
                    QUALIFYING_ALERTS.TORNADO_WATCH
            ).length,

        severeWatches:
            currentAlerts.filter(
                alert =>
                    alert.alertType ===
                    QUALIFYING_ALERTS.SEVERE_WATCH
            ).length

    };

}


/* =========================================================
   UPDATE ALL ALERT INTERFACES
   ========================================================= */

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


/* =========================================================
   UPDATE ALERT COUNT ELEMENTS
   ========================================================= */

function updateAlertCountElements() {

    const counts =
        getAlertCounts();


    const countMap = {

        total:
            counts.total,

        pds:
            counts.pds,

        "pds-tornado":
            counts.pds,

        tornado:
            counts.tornadoWarnings,

        "tornado-warning":
            counts.tornadoWarnings,

        "tornado-warnings":
            counts.tornadoWarnings,

        severe:
            counts.severeWarnings,

        "severe-warning":
            counts.severeWarnings,

        "severe-warnings":
            counts.severeWarnings,

        "tornado-watch":
            counts.tornadoWatches,

        "tornado-watches":
            counts.tornadoWatches,

        "severe-watch":
            counts.severeWatches,

        "severe-watches":
            counts.severeWatches

    };


    document
        .querySelectorAll(
            "[data-alert-count]"
        )
        .forEach(element => {

            const type =
                String(
                    element.getAttribute(
                        "data-alert-count"
                    ) || "total"
                ).toLowerCase();


            const count =
                countMap[type] ?? 0;


            element.textContent =
                Number(count).toLocaleString();

        });

}


/* =========================================================
   PDS STATUS
   ========================================================= */

function updatePDSStatus() {

    const pdsAlerts =
        currentAlerts.filter(
            alert =>
                alert.isPDS
        );


    const pdsActive =
        pdsAlerts.length > 0;


    document
        .querySelectorAll(
            "[data-pds-status]"
        )
        .forEach(element => {

            element.textContent =
                pdsActive
                    ? "PDS TORNADO WARNING ACTIVE"
                    : "NO PDS TORNADO WARNING";

            element.classList.toggle(
                "active",
                pdsActive
            );

        });


    document
        .querySelectorAll(
            "[data-pds-active]"
        )
        .forEach(element => {

            element.hidden =
                !pdsActive;

        });

}


/* =========================================================
   HOME ALERT COUNT
   ========================================================= */

function updateHomeAlertCount() {

    const element =
        document.getElementById(
            "homeAlertCount"
        );


    if (!element) {
        return;
    }


    element.textContent =
        currentAlerts.length.toLocaleString();

}


/* =========================================================
   HOME ALERT BADGE
   ========================================================= */

function updateHomeAlertBadge() {

    const element =
        document.getElementById(
            "homeAlertBadge"
        );


    if (!element) {
        return;
    }


    element.textContent =
        currentAlerts.length.toLocaleString();

}


/* =========================================================
   HOME ALERT LIST
   ========================================================= */

function updateHomeAlertList() {

    const container =
        document.getElementById(
            "homeAlerts"
        );


    if (!container) {
        return;
    }


    if (
        currentAlerts.length === 0
    ) {

        container.innerHTML = `
            <div class="alert-empty">
                <div class="alert-empty-icon">✓</div>

                <strong>
                    No Qualifying Severe Weather Alerts
                </strong>

                <p>
                    No tornado or severe thunderstorm
                    watches or warnings are currently active.
                </p>
            </div>
        `;

        return;
    }


    const alertsToShow =
        currentAlerts.slice(
            0,
            15
        );


    container.innerHTML =
        alertsToShow
            .map(
                alert =>
                    createAlertCard(alert)
            )
            .join("");

}


/* =========================================================
   STORM CENTER ALERT LIST
   ========================================================= */

function updateStormAlertList() {

    const selectors = [

        "#stormAlerts",

        "#stormAlertList",

        "#fullStormAlerts",

        "[data-storm-alerts]"

    ];


    let container = null;


    for (
        const selector
        of selectors
    ) {

        const element =
            document.querySelector(
                selector
            );


        if (element) {

            container =
                element;

            break;

        }

    }


    if (!container) {
        return;
    }


    if (
        currentAlerts.length === 0
    ) {

        container.innerHTML = `
            <div class="alert-empty alert-empty-large">

                <div class="alert-empty-icon">
                    ✓
                </div>

                <strong>
                    No Qualifying Severe Weather Alerts
                </strong>

                <p>
                    There are currently no active tornado
                    or severe thunderstorm watches or warnings
                    across the United States.
                </p>

            </div>
        `;

        return;
    }


    container.innerHTML =
        currentAlerts
            .map(
                alert =>
                    createAlertCard(
                        alert,
                        true
                    )
            )
            .join("");

}


/* =========================================================
   GENERIC ALERT LISTS
   ========================================================= */

function updateGenericAlertLists() {

    const containers =
        document.querySelectorAll(
            "[data-alert-list]"
        );


    containers.forEach(
        container => {

            if (
                container.id ===
                "homeAlerts"
            ) {
                return;
            }


            if (
                currentAlerts.length === 0
            ) {

                container.innerHTML = `
                    <div class="alert-empty">

                        <div class="alert-empty-icon">
                            ✓
                        </div>

                        <strong>
                            No Active Alerts
                        </strong>

                        <p>
                            No qualifying severe weather alerts
                            are currently active.
                        </p>

                    </div>
                `;

                return;
            }


            container.innerHTML =
                currentAlerts
                    .map(
                        alert =>
                            createAlertCard(
                                alert
                            )
                    )
                    .join("");

        }
    );

}


/* =========================================================
   CREATE ALERT CARD
   ========================================================= */

function createAlertCard(
    alert,
    detailed = false
) {

    const cssClass =
        getAlertClass(
            alert.alertType
        );


    const icon =
        getAlertIcon(
            alert.alertType
        );


    const time =
        formatTime(
            alert.sent
        );


    const expiration =
        formatExpiration(
            alert.expires
        );


    const areas =
        formatAreas(
            alert.areaDesc
        );


    const headline =
        escapeHTML(
            alert.headline ||
            `${alert.alertType} issued`
        );


    const description =
        detailed
            ? truncateText(
                cleanAlertText(
                    alert.description
                ),
                420
            )
            : truncateText(
                cleanAlertText(
                    alert.description
                ),
                180
            );


    const pdsLabel =
        alert.isPDS
            ? `
                <span class="weather-alert-pds">
                    PDS
                </span>
            `
            : "";


    return `
        <article
            class="weather-alert-card ${cssClass}"
            data-alert-type="${escapeHTML(
                alert.alertType
            )}"
            data-alert-id="${escapeHTML(
                alert.id
            )}"
        >

            <div class="weather-alert-top">

                <div class="weather-alert-icon">
                    ${icon}
                </div>

                <div class="weather-alert-title">

                    <span class="weather-alert-type">

                        ${escapeHTML(
                            alert.alertType
                        )}

                        ${pdsLabel}

                    </span>

                    <h4>
                        ${headline}
                    </h4>

                </div>

            </div>


            <div class="weather-alert-meta">

                <span>
                    📍
                    ${escapeHTML(
                        areas
                    )}
                </span>

                <span>
                    🕒
                    ${time}
                </span>

            </div>


            ${
                description
                    ? `
                        <p class="weather-alert-description">
                            ${escapeHTML(
                                description
                            )}
                        </p>
                    `
                    : ""
            }


            ${
                detailed
                    ? `
                        <div class="weather-alert-expiration">

                            <span>
                                Expires
                            </span>

                            <strong>
                                ${expiration}
                            </strong>

                        </div>
                    `
                    : ""
            }

        </article>
    `;

}


/* =========================================================
   ALERT CSS CLASS
   ========================================================= */

function getAlertClass(type) {

    switch (type) {

        case "PDS Tornado":
            return "alert-pds";

        case "Tornado Warning":
            return "alert-tornado-warning";

        case "Tornado Watch":
            return "alert-tornado-watch";

        case "Severe Thunderstorm Warning":
            return "alert-severe-warning";

        case "Severe Thunderstorm Watch":
            return "alert-severe-watch";

        default:
            return "alert-default";

    }

}


/* =========================================================
   ALERT ICON
   ========================================================= */

function getAlertIcon(type) {

    switch (type) {

        case "PDS Tornado":
            return "🌪️";

        case "Tornado Warning":
            return "🌪️";

        case "Tornado Watch":
            return "👀";

        case "Severe Thunderstorm Warning":
            return "⛈️";

        case "Severe Thunderstorm Watch":
            return "⛈️";

        default:
            return "⚠️";

    }

}


/* =========================================================
   FORMAT AREAS
   ========================================================= */

function formatAreas(areaText) {

    if (!areaText) {
        return "United States";
    }


    const areas =
        areaText
            .split(";")
            .map(
                item =>
                    item.trim()
            )
            .filter(Boolean);


    if (
        areas.length === 0
    ) {
        return "United States";
    }


    if (
        areas.length === 1
    ) {
        return areas[0];
    }


    if (
        areas.length === 2
    ) {
        return `${areas[0]}, ${areas[1]}`;
    }


    return `${areas[0]}, ${areas[1]} +${areas.length - 2} more`;

}


/* =========================================================
   CLEAN ALERT TEXT
   ========================================================= */

function cleanAlertText(text) {

    if (!text) {
        return "";
    }


    return String(text)
        .replace(
            /\r/g,
            ""
        )
        .replace(
            /\n{3,}/g,
            "\n\n"
        )
        .trim();

}


/* =========================================================
   TRUNCATE TEXT
   ========================================================= */

function truncateText(
    text,
    maxLength
) {

    if (!text) {
        return "";
    }


    if (
        text.length <= maxLength
    ) {
        return text;
    }


    return (
        text
            .substring(
                0,
                maxLength
            )
            .trim() +
        "..."
    );

}


/* =========================================================
   FORMAT TIME
   ========================================================= */

function formatTime(date) {

    if (
        !(date instanceof Date)
    ) {
        return "Time unavailable";
    }


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "Time unavailable";
    }


    return date.toLocaleTimeString(
        "en-US",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );

}


/* =========================================================
   FORMAT EXPIRATION
   ========================================================= */

function formatExpiration(date) {

    if (
        !(date instanceof Date)
    ) {
        return "Unknown";
    }


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "Unknown";
    }


    return date.toLocaleString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }
    );

}


/* =========================================================
   LAST UPDATE
   ========================================================= */

function updateLastUpdateTime() {

    const elements = [

        document.getElementById(
            "homeLastUpdate"
        ),

        document.getElementById(
            "stormLastUpdate"
        ),

        document.getElementById(
            "lastUpdate"
        ),

        ...document.querySelectorAll(
            "[data-last-update]"
        )

    ];


    const uniqueElements =
        [
            ...new Set(
                elements.filter(Boolean)
            )
        ];


    if (
        !lastSuccessfulUpdate
    ) {
        return;
    }


    const formatted =
        lastSuccessfulUpdate
            .toLocaleTimeString(
                "en-US",
                {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );


    uniqueElements.forEach(
        element => {

            element.textContent =
                formatted;

        }
    );

}


/* =========================================================
   ALERT ERROR
   ========================================================= */

function showAlertError() {

    const containers = [

        document.getElementById(
            "homeAlerts"
        ),

        document.getElementById(
            "stormAlerts"
        ),

        document.getElementById(
            "stormAlertList"
        ),

        document.getElementById(
            "fullStormAlerts"
        )

    ];


    containers
        .filter(Boolean)
        .forEach(
            container => {

                /*
                    Never erase valid alerts because a
                    temporary NWS refresh failed.
                */

                if (
                    currentAlerts.length > 0
                ) {
                    return;
                }


                container.innerHTML = `
                    <div class="alert-error">

                        <div class="alert-error-icon">
                            ⚠️
                        </div>

                        <strong>
                            Weather Data Temporarily Unavailable
                        </strong>

                        <p>
                            Stop Spot Chase could not retrieve
                            the latest National Weather Service
                            alert data. The site will try again
                            automatically.
                        </p>

                    </div>
                `;

            }
        );

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   STOP SPOT CHASE PUBLIC API
   ========================================================= */

window.StopSpotChase = {

    getAlerts() {

        return [
            ...currentAlerts
        ];

    },


    getAlertCount() {

        return currentAlerts.length;

    },


    getAlertCounts() {

        return {
            ...getAlertCounts()
        };

    },


    getPDSAlerts() {

        return currentAlerts.filter(
            alert =>
                alert.isPDS
        );

    },


    hasPDSWarning() {

        return currentAlerts.some(
            alert =>
                alert.isPDS
        );

    },


    refreshAlerts() {

        return loadWeatherAlerts();

    },


    getLastUpdate() {

        return lastSuccessfulUpdate;

    }

};