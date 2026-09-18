"use strict";

import { loadAnnouncements } from "./announcements.js";

import {
    closeActivePlayerCard,
    initializePlayerCardInteractions,
    isPlayerCardOpen,
    openPlayerCard,
} from "./player-card.js";

import {
    formatAccuracy,
    renderWeeklyView,
} from "./weekly.js";

const SEASON = 2026;
const DEFAULT_WEEK = 1;
const REGULAR_SEASON_WEEKS = 18;

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let currentWeekData = null;
let seasonData = null;
let playerNameMap = new Map();


document.addEventListener("DOMContentLoaded", () => {
    initializeWeekSelector();
    initializeTabs();
    initializePlayerCardInteractions();
    loadAnnouncements();

    const requestedWeek = getRequestedWeek();

    document.querySelector("#week-select").value = String(requestedWeek);

    loadWeek(requestedWeek);
    initializeAutoRefresh();
});

function initializeAutoRefresh() {
    window.setInterval(() => {
        if (!document.hidden) {
            refreshCurrentWeek();
        }
    }, REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            refreshCurrentWeek();
        }
    });
}


async function refreshCurrentWeek() {
    if (isPlayerCardOpen()) {
        return;
    }

    const week = Number(
        document.querySelector("#week-select").value,
    );

    try {
        const response = await fetch(
            `./data/${SEASON}/week${formatWeek(week)}.json`,
            { cache: "no-store" },
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        if (
            JSON.stringify(data)
            === JSON.stringify(currentWeekData)
        ) {
            return;
        }

        currentWeekData = data;
        seasonData = null;

        rememberPlayerNames(data.players ?? []);
        renderWeeklyView(data, getPlayerName);
    } catch {
        // Keep displaying the existing data if refresh fails.
    }
}


function initializeWeekSelector() {
    const select = document.querySelector("#week-select");

    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
        const option = document.createElement("option");

        option.value = String(week);
        option.textContent = String(week);

        select.append(option);
    }

    select.addEventListener("change", () => {
        const week = Number(select.value);

        closeActivePlayerCard();

        updateWeekQueryString(week);
        loadWeek(week);
    });
}


function initializeTabs() {
    const weeklyTab = document.querySelector("#weekly-tab");
    const seasonTab = document.querySelector("#season-tab");

    weeklyTab.addEventListener("click", () => {
        closeActivePlayerCard();
        showView("weekly");
    });

    seasonTab.addEventListener("click", async () => {
        closeActivePlayerCard();
        showView("season");

        if (seasonData === null) {
            await loadSeason();
        }
    });
}


function showView(view) {
    const weeklyTab = document.querySelector("#weekly-tab");
    const seasonTab = document.querySelector("#season-tab");

    const weeklyView = document.querySelector("#weekly-view");
    const seasonView = document.querySelector("#season-view");

    const showingWeekly = view === "weekly";

    weeklyView.hidden = !showingWeekly;
    seasonView.hidden = showingWeekly;

    weeklyTab.classList.toggle("active", showingWeekly);
    seasonTab.classList.toggle("active", !showingWeekly);

    weeklyTab.setAttribute(
        "aria-selected",
        String(showingWeekly),
    );

    seasonTab.setAttribute(
        "aria-selected",
        String(!showingWeekly),
    );
}


async function loadWeek(week) {
    closeActivePlayerCard();

    setText("#week-heading", `Week ${week}`);
    setText("#week-status", "Loading…");
    setText("#weekly-message", "");

    const playerList = document.querySelector("#player-list");
    const summary = document.querySelector("#weekly-summary");

    playerList.replaceChildren();
    summary.replaceChildren();

    try {
        const response = await fetch(
            `./data/${SEASON}/week${formatWeek(week)}.json`,
            { cache: "no-store" },
        );

        if (!response.ok) {
            throw new Error(`Week ${week} is not available yet.`);
        }

        currentWeekData = await response.json();

        rememberPlayerNames(currentWeekData.players ?? []);

        renderWeeklyView(currentWeekData, getPlayerName);
    } catch (error) {
        setText(
            "#week-status",
            `Week ${week}`,
        );

        setText(
            "#weekly-message",
            error instanceof Error
                ? error.message
                : "Unable to load this week.",
        );
    }
}


async function loadSeason() {
    setText(
        "#season-message",
        "Loading season standings…",
    );

    try {
        const response = await fetch(
            `./data/${SEASON}/season.json`,
            { cache: "no-store" },
        );

        if (!response.ok) {
            throw new Error(
                "Season standings are not available yet.",
            );
        }

        seasonData = await response.json();

        await loadSeasonPlayerNames(
            seasonData.weeks_scored ?? [],
        );

        renderSeason(seasonData);
    } catch (error) {
        setText(
            "#season-message",
            error instanceof Error
                ? error.message
                : "Unable to load season standings.",
        );
    }
}


async function loadSeasonPlayerNames(weeks) {
    const requests = weeks.map(async (week) => {
        try {
            const response = await fetch(
                `./data/${SEASON}/week${formatWeek(week)}.json`,
                { cache: "no-store" },
            );

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            rememberPlayerNames(data.players ?? []);
        } catch {
            // Display IDs as a fallback if a weekly file cannot be loaded.
        }
    });

    await Promise.all(requests);
}


function renderSeason(data) {
    const container = document.querySelector("#season-list");
    container.replaceChildren();

    if (!data.players?.length) {
        setText(
            "#season-message",
            "No completed weeks yet.",
        );

        return;
    }

    setText(
        "#season-message",
        `${data.weeks_scored.length} completed week(s).`,
    );

    const players = [...data.players].sort(
        compareSeasonPlayers,
    );

    players.forEach((player, index) => {
        container.append(
            createSeasonCard(
                player,
                index + 1,
            ),
        );
    });
}


function createSeasonCard(player, position) {
    const card = document.createElement("div");
    card.className = "season-card";

    const left = document.createElement("div");

    const name = document.createElement("div");
    name.className = "season-name";

    const crown =
        position === 1
            ? "👑 "
            : "";

    name.textContent =
        `${crown}${position}. ${getPlayerName(player.player_id)}`;

    const meta = document.createElement("div");
    meta.className = "season-meta";

    const missedPicks = player.missed_picks ?? 0;

    meta.textContent =
        `${player.wins}-${player.losses}-${player.ties}`
        + ` • Weeks played: ${player.weeks_played}`
        + ` • Missed picks: ${missedPicks}`;

    left.append(name, meta);

    const right = document.createElement("div");
    right.className = "season-right";

    const accuracy = document.createElement("div");
    accuracy.className = "season-accuracy";
    accuracy.textContent =
        formatAccuracy(player.accuracy);

    const finishIndicators = document.createElement("div");
    finishIndicators.className = "weekly-wins";

    const indicators = [
        `🏆 ${player.weekly_wins}`,
    ];

    const lastPlaceFinishes =
        player.last_place_finishes ?? 0;

    if (lastPlaceFinishes > 0) {
        indicators.push(`💩 ${lastPlaceFinishes}`);
    }

    finishIndicators.textContent =
        indicators.join(" • ");

    right.append(
        accuracy,
        finishIndicators,
    );

    card.append(left, right);

    return card;
}

function compareSeasonPlayers(left, right) {
    if (left.weekly_wins !== right.weekly_wins) {
        return right.weekly_wins - left.weekly_wins;
    }

    const leftAccuracy =
        left.accuracy ?? -1;

    const rightAccuracy =
        right.accuracy ?? -1;

    if (leftAccuracy !== rightAccuracy) {
        return rightAccuracy - leftAccuracy;
    }

    return right.wins - left.wins;
}


function rememberPlayerNames(players) {
    for (const player of players) {
        playerNameMap.set(
            player.id,
            displayName(player),
        );
    }
}


function displayName(player) {
    return player.nickname || player.name;
}


function getPlayerName(playerId) {
    return (
        playerNameMap.get(playerId)
        ?? humanizePlayerId(playerId)
    );
}


function humanizePlayerId(playerId) {
    return playerId
        .split("-")
        .map(
            (part) =>
                part.charAt(0).toUpperCase()
                + part.slice(1),
        )
        .join(" ");
}





function formatWeek(week) {
    return String(week).padStart(2, "0");
}


function getRequestedWeek() {
    const params = new URLSearchParams(
        window.location.search,
    );

    const requested = Number(
        params.get("week"),
    );

    if (
        Number.isInteger(requested)
        && requested >= 1
        && requested <= REGULAR_SEASON_WEEKS
    ) {
        return requested;
    }

    return DEFAULT_WEEK;
}


function updateWeekQueryString(week) {
    const url = new URL(window.location.href);

    url.searchParams.set(
        "week",
        String(week),
    );

    window.history.replaceState(
        {},
        "",
        url,
    );
}


function setText(selector, text) {
    const element = document.querySelector(selector);

    element.textContent = text;
}