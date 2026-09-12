"""Polling decisions for weekly NFL game updates."""

from datetime import datetime, timedelta

from pbj.domain.game import Game, GameStatus

POLL_LEAD_TIME = timedelta(minutes=15)
POLL_GAME_WINDOW = timedelta(hours=6)


def should_poll(
    games: list[Game],
    now: datetime,
) -> bool:
    """Return whether the current week needs an ESPN update."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    for game in games:
        if game.status is GameStatus.LIVE:
            return True

        if game.status is not GameStatus.SCHEDULED:
            continue

        start = game.scheduled_time - POLL_LEAD_TIME
        end = game.scheduled_time + POLL_GAME_WINDOW

        if start <= now <= end:
            return True

    return False