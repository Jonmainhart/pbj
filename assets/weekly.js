"use strict";

import {
    closeActivePlayerCard,
    openPlayerCard,
} from "./player-card.js";

import { displayName } from "./players.js";

export function renderWeeklyView(data, getPlayerName) {
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

    renderWeeklySummary(data, getPlayerName);
    renderPlayers(players, games, results);
}


function renderWeeklySummary(data, getPlayerName) {
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


function isWeekComplete(data) {
    const games = data.games ?? [];

    return (
        games.length > 0
        && games.every(
            (game) => game.status === "final",
        )
    );
}


export function formatAccuracy(value) {
    if (
        value === null
        || value === undefined
    ) {
        return "—";
    }

    return `${Math.round(value * 1000) / 10}%`;
}


function setText(selector, text) {
    const element = document.querySelector(selector);

    element.textContent = text;
}