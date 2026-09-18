"use strict";

let activePlayerCard = null;
let activeCardOverlay = null;


export function initializePlayerCardInteractions() {
    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape"
            && activeCardOverlay !== null
        ) {
            closeActivePlayerCard(true);
        }
    });
}


export function isPlayerCardOpen() {
    return activeCardOverlay !== null;
}


export function openPlayerCard(sourceCard) {
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


export function closeActivePlayerCard(restoreFocus = false) {
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