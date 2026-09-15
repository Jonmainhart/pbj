"use strict";

const SEASON = 2026;
const DEFAULT_WEEK = 1;
const REGULAR_SEASON_WEEKS = 18;

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let currentWeekData = null;
let seasonData = null;
let playerNameMap = new Map();

let activePlayerCard = null;
let activeCardOverlay = null;

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
    if (activeCardOverlay !== null) {
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
        renderWeeklyView(data);
    } catch {
        // Keep displaying the existing data if refresh fails.
    }
}


async function loadAnnouncements() {
    await Promise.all([
        loadAnnouncement(
            "./assets/announcement-top.txt",
            "#announcement-top",
        ),
        loadAnnouncement(
            "./assets/announcement-bottom.txt",
            "#announcement-bottom",
        ),
    ]);
}


async function loadAnnouncement(path, selector) {
    const element = document.querySelector(selector);

    try {
        const response = await fetch(
            path,
            { cache: "no-store" },
        );

        if (!response.ok) {
            element.hidden = true;
            return;
        }

        const text = (await response.text()).trim();

        if (!text) {
            element.hidden = true;
            element.textContent = "";
            return;
        }

        element.textContent = text;
        element.hidden = false;
    } catch {
        element.hidden = true;
        element.textContent = "";
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


function initializePlayerCardInteractions() {
    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape"
            && activeCardOverlay !== null
        ) {
            closeActivePlayerCard(true);
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

        renderWeeklyView(currentWeekData);
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


function renderWeeklyView(data) {
    const results = data.results ?? null;
    const players = data.players ?? [];
    const games = data.games ?? [];

    const complete = isWeekComplete(data);

    setText(
        "#week-status",
        complete
            ? `Week ${data.week} Final`
            : `Week ${data.week} In Progress`,
    );

    renderWeeklySummary(data);
    renderPlayers(players, games, results);
}


function renderWeeklySummary(data) {
    const container = document.querySelector("#weekly-summary");
    const results = data.results;

    container.replaceChildren();

    const playerCount =
        results?.player_count
        ?? data.players?.length
        ?? 0;

    const finalGames =
        data.games?.filter(
            (game) => game.status === "final",
        ).length
        ?? 0;

    const totalGames = data.games?.length ?? 0;

    const winnerText =
        results?.weekly_winners?.length > 0
            ? results.weekly_winners
                .map((id) => getPlayerName(id))
                .join(", ")
            : "TBD";

    const mondayTotal =
        results?.monday_total
        ?? "TBD";

    container.append(
        createSummaryCard(
            String(playerCount),
            "Players",
        ),
        createSummaryCard(
            `${finalGames}/${totalGames}`,
            "Games Final",
        ),
        createSummaryCard(
            winnerText,
            "Winner",
        ),
        createSummaryCard(
            String(mondayTotal),
            "Monday Total",
        ),
    );
}


function createSummaryCard(value, label) {
    const card = document.createElement("div");
    card.className = "summary-card";

    const valueElement = document.createElement("span");
    valueElement.className = "summary-value";
    valueElement.textContent = value;

    const labelElement = document.createElement("span");
    labelElement.className = "summary-label";
    labelElement.textContent = label;

    card.append(valueElement, labelElement);

    return card;
}


function renderPlayers(players, games, results) {
    closeActivePlayerCard();

    const container = document.querySelector("#player-list");
    container.replaceChildren();

    const playersById = new Map(
        players.map((player) => [
            player.id,
            player,
        ]),
    );

    const resultPlayers =
        results?.players
        ?? players.map((player) => ({
            player_id: player.id,
            wins: 0,
            losses: 0,
            ties: 0,
            missed_picks: 0,
            accuracy: null,
            tiebreaker_distance: null,
            weekly_rank: null,
            weekly_winner: false,
        }));

    const completedRanks = resultPlayers
        .map((result) => result.weekly_rank)
        .filter((rank) => rank !== null);

    const lastPlaceRank =
        completedRanks.length > 0
            ? Math.max(...completedRanks)
            : null;

    for (const result of resultPlayers) {
        const player = playersById.get(result.player_id);

        if (!player) {
            continue;
        }

        container.append(
            createPlayerCard(
                player,
                result,
                games,
                lastPlaceRank !== null
                    && result.weekly_rank === lastPlaceRank,
            ),
        );
    }
}


function createPlayerCard(
    player,
    result,
    games,
    isLastPlace,
) {
    const card = document.createElement("article");
    card.className = "player-card";

    const summary = document.createElement("button");
    summary.className = "player-summary";
    summary.type = "button";

    summary.setAttribute("aria-expanded", "false");

    const nameBlock = document.createElement("div");

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = displayName(player);

    if (result.weekly_winner) {
        name.textContent = `🏆 ${name.textContent}`;
    }

    if (isLastPlace) {
        name.textContent = `💩 ${name.textContent}`;
    }

    const record = document.createElement("div");
    record.className = "player-record";
    record.textContent =
        `${result.wins}-${result.losses}-${result.ties}`;

    nameBlock.append(name, record);

    const right = document.createElement("div");
    right.className = "player-summary-right";

    const accuracy = document.createElement("span");
    accuracy.className = "player-accuracy";
    accuracy.textContent = formatAccuracy(result.accuracy);

    right.append(accuracy);

    summary.append(nameBlock, right);

    const body = document.createElement("div");
    body.className = "player-details";

    const bodyInner = document.createElement("div");
    bodyInner.className = "player-details-inner";

    bodyInner.append(
        createPlayerDetailGrid(
            player,
            result,
        ),
        createPickList(
            player,
            games,
        ),
    );

    body.append(bodyInner);

    summary.addEventListener("click", () => {
        openPlayerCard(card);
    });

    card.append(summary, body);

    return card;
}


function openPlayerCard(sourceCard) {
    closeActivePlayerCard();

    const overlay = document.createElement("div");
    overlay.className = "player-card-overlay";

    const raisedCard = sourceCard.cloneNode(true);

    raisedCard.classList.remove("is-selected");

    const raisedSummary =
        raisedCard.querySelector(".player-summary");

    if (raisedSummary !== null) {
        raisedSummary.setAttribute(
            "aria-expanded",
            "true",
        );

        raisedSummary.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();
                closeActivePlayerCard(true);
            },
        );
    }

    raisedCard.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();
        },
    );

    overlay.addEventListener(
        "click",
        () => {
            closeActivePlayerCard();
        },
    );

    overlay.append(raisedCard);
    document.body.append(overlay);

    activePlayerCard = sourceCard;
    activeCardOverlay = overlay;

    sourceCard.classList.add("is-selected");

    const sourceSummary =
        sourceCard.querySelector(".player-summary");

    if (sourceSummary !== null) {
        sourceSummary.setAttribute(
            "aria-expanded",
            "true",
        );
    }

    document.body.classList.add("card-open");

    raisedCard.scrollTop = 0;

    if (raisedSummary !== null) {
        raisedSummary.focus();
    }
}


function closeActivePlayerCard(restoreFocus = false) {
    const sourceCard = activePlayerCard;

    if (activeCardOverlay !== null) {
        activeCardOverlay.remove();
    }

    if (sourceCard !== null) {
        sourceCard.classList.remove("is-selected");

        const sourceSummary =
            sourceCard.querySelector(".player-summary");

        if (sourceSummary !== null) {
            sourceSummary.setAttribute(
                "aria-expanded",
                "false",
            );

            if (restoreFocus) {
                sourceSummary.focus();
            }
        }
    }

    activePlayerCard = null;
    activeCardOverlay = null;

    document.body.classList.remove("card-open");
}


function createPlayerDetailGrid(player, result) {
    const grid = document.createElement("div");
    grid.className = "detail-grid";

    grid.append(
        createDetailBox(
            result.weekly_rank ?? "—",
            "Weekly Rank",
        ),
        createDetailBox(
            player.tiebreaker,
            "Tiebreaker Pick",
        ),
        createDetailBox(
            result.tiebreaker_distance ?? "—",
            "Tiebreaker Distance",
        ),
        createDetailBox(
            formatAccuracy(result.accuracy),
            "Accuracy",
        ),
        createDetailBox(
            result.missed_picks ?? 0,
            "Missed Picks",
        ),
    );

    return grid;
}


function createDetailBox(value, label) {
    const box = document.createElement("div");
    box.className = "detail-box";

    const valueElement = document.createElement("span");
    valueElement.className = "detail-value";
    valueElement.textContent = String(value);

    const labelElement = document.createElement("span");
    labelElement.className = "detail-label";
    labelElement.textContent = label;

    box.append(valueElement, labelElement);

    return box;
}

function formatKickoffTime(scheduledTime) {
    const kickoff = new Date(scheduledTime);

    if (Number.isNaN(kickoff.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
        },
    ).format(kickoff);
}

function formatGameDisplay(game) {
    const away = game.away.abbreviation;
    const home = game.home.abbreviation;

    if (game.status === "live") {
        return `${away} ${game.away_score} @ ${home} ${game.home_score} — Live`;
    }

    if (game.status === "final") {
        return `${away} ${game.away_score} @ ${home} ${game.home_score} — Final`;
    }

    const kickoff = formatKickoffTime(game.scheduled_time);

    return (
        `${away} @ ${home}`
        + (kickoff ? ` — ${kickoff}` : "")
    );
}

function createPickList(player, games) {
    const list = document.createElement("div");
    list.className = "pick-list";

    for (const game of games) {
        const row = document.createElement("div");
        row.className = "pick-row";

        const gameName = document.createElement("div");
        gameName.className = "game-name";

        gameName.textContent = formatGameDisplay(game);

        const pick = document.createElement("div");

        const pickValue = player.picks?.[game.id];

        const status = getPickStatus(
            pickValue,
            game,
        );

        pick.className =
            `pick-value ${status.className}`;

        const statusIcon = document.createElement("span");
        statusIcon.className = "pick-status";
        statusIcon.textContent = status.icon;

        const teamPick = document.createElement("span");
        teamPick.className = "pick-team";
        teamPick.textContent = pickValue ?? "N/P";

        pick.append(statusIcon, teamPick);

        row.append(gameName, pick);
        list.append(row);
    }

    return list;
}

function getPickStatus(pick, game) {
    if (!pick) {
        if (game.status === "final") {
            return {
                icon: "❌",
                className: "pick-wrong",
            };
        }

        return {
            icon: "⏳",
            className: "pick-pending",
        };
    }

    if (game.status === "live") {
        return {
            icon: "🟢",
            className: "pick-live",
        };
    }

    if (game.status !== "final") {
        return {
            icon: "⏳",
            className: "pick-pending",
        };
    }

    if (
        game.away_score === null
        || game.home_score === null
    ) {
        return {
            icon: "⏳",
            className: "pick-pending",
        };
    }

    if (game.away_score === game.home_score) {
        return {
            icon: "➖",
            className: "pick-tie",
        };
    }

    const winner =
        game.away_score > game.home_score
            ? game.away.abbreviation
            : game.home.abbreviation;

    if (pick === winner) {
        return {
            icon: "✅",
            className: "pick-correct",
        };
    }

    return {
        icon: "❌",
        className: "pick-wrong",
    };
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

    const trophy =
        position === 1
            ? "🏆 "
            : "";

    name.textContent =
        `${trophy}${position}. ${getPlayerName(player.player_id)}`;

    const meta = document.createElement("div");
    meta.className = "season-meta";

    const missedPicks = player.missed_picks ?? 0;

    meta.textContent =
        `${player.wins}-${player.losses}-${player.ties}`
        + ` • ${player.weeks_played} week(s)`
        + ` • ${missedPicks} missed`;

    left.append(name, meta);

    const right = document.createElement("div");
    right.className = "season-right";

    const accuracy = document.createElement("div");
    accuracy.className = "season-accuracy";
    accuracy.textContent =
        formatAccuracy(player.accuracy);

    const weeklyWins = document.createElement("div");
    weeklyWins.className = "weekly-wins";
    weeklyWins.textContent =
        `${player.weekly_wins} weekly win(s)`;

    right.append(
        accuracy,
        weeklyWins,
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


function isWeekComplete(data) {
    const games = data.games ?? [];

    return (
        games.length > 0
        && games.every(
            (game) => game.status === "final",
        )
    );
}


function formatAccuracy(value) {
    if (
        value === null
        || value === undefined
    ) {
        return "—";
    }

    return `${Math.round(value * 1000) / 10}%`;
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