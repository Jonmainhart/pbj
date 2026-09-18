"use strict";

import { loadAnnouncements } from "./announcements.js";

import {
    fetchSeason,
    fetchWeek,
} from "./data.js";

import {
    getPlayerName,
    rememberPlayerNames,
} from "./players.js";

import {
    closeActivePlayerCard,
    initializePlayerCardInteractions,
    isPlayerCardOpen,
    openPlayerCard,
} from "./player-card.js";

import { renderWeeklyView } from "./weekly.js";

import { renderSeason } from "./season.js";

import { initializeAutoRefresh } from "./refresh.js";

const SEASON = 2026;
const DEFAULT_WEEK = 1;
const REGULAR_SEASON_WEEKS = 18;

let currentWeekData = null;
let seasonData = null;


document.addEventListener("DOMContentLoaded", () => {
    initializeWeekSelector();
    initializeTabs();
    initializePlayerCardInteractions();
    loadAnnouncements();

    const requestedWeek = getRequestedWeek();

    document.querySelector("#week-select").value = String(requestedWeek);

    loadWeek(requestedWeek);
    initializeAutoRefresh(refreshCurrentWeek);
});


async function refreshCurrentWeek() {
    if (isPlayerCardOpen()) {
        return;
    }

    const week = Number(
        document.querySelector("#week-select").value,
    );

    try {
        const data = await fetchWeek(SEASON, week);

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
        currentWeekData = await fetchWeek(SEASON, week);

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
        seasonData = await fetchSeason(SEASON);

        await loadSeasonPlayerNames(
            seasonData.weeks_scored ?? [],
        );

        renderSeason(seasonData, getPlayerName);
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
            const data = await fetchWeek(SEASON, week);

            rememberPlayerNames(data.players ?? []);
        } catch {
            // Display IDs as a fallback if a weekly file cannot be loaded.
        }
    });

    await Promise.all(requests);
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