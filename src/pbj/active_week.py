"""Selection of the active football week."""

from pbj.domain.game import Game, GameStatus


def select_active_week(
    weeks: dict[int, list[Game]],
) -> int | None:
    """Return the earliest week containing an unfinished game."""
    for week in sorted(weeks):
        games = weeks[week]

        if any(game.status is not GameStatus.FINAL for game in games):
            return week

    return None
