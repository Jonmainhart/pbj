"""Domain logic for aggregating PBJ season statistics."""

from collections.abc import Sequence
from dataclasses import dataclass

from pbj.scoring import WeekResult


@dataclass(frozen=True)
class SeasonPlayerResult:
    """Aggregated season statistics for one player."""

    player_id: str
    weeks_played: int
    wins: int
    losses: int
    ties: int
    missed_picks: int
    accuracy: float | None
    weekly_wins: int


@dataclass(frozen=True)
class SeasonResult:
    """Aggregated statistics for one PBJ season."""

    season: int
    weeks_scored: tuple[int, ...]
    players: tuple[SeasonPlayerResult, ...]


@dataclass
class _SeasonTotals:
    """Mutable totals used while building season results."""

    weeks_played: int = 0
    wins: int = 0
    losses: int = 0
    ties: int = 0
    missed_picks: int = 0
    weekly_wins: int = 0


def aggregate_season(
    season: int,
    weeks: Sequence[tuple[int, WeekResult]],
) -> SeasonResult:
    """Aggregate completed weekly results into season statistics."""
    totals: dict[str, _SeasonTotals] = {}
    weeks_scored: list[int] = []
    seen_weeks: set[int] = set()

    for week_number, result in sorted(
        weeks,
        key=lambda item: item[0],
    ):
        if week_number in seen_weeks:
            raise ValueError(f"duplicate week {week_number}")

        seen_weeks.add(week_number)

        if not _week_is_complete(result):
            continue

        weeks_scored.append(week_number)

        for player in result.players:
            player_totals = totals.setdefault(
                player.player_id,
                _SeasonTotals(),
            )

            player_totals.weeks_played += 1
            player_totals.wins += player.wins
            player_totals.losses += player.losses
            player_totals.ties += player.ties
            player_totals.missed_picks += player.missed_picks

            if player.weekly_winner:
                player_totals.weekly_wins += 1

    players = tuple(
        _build_player_result(
            player_id=player_id,
            totals=player_totals,
        )
        for player_id, player_totals in sorted(totals.items())
    )

    return SeasonResult(
        season=season,
        weeks_scored=tuple(weeks_scored),
        players=players,
    )


def _week_is_complete(
    result: WeekResult,
) -> bool:
    """Return whether weekly results represent a completed week."""
    return (
        bool(result.players)
        and bool(result.weekly_winners)
        and all(
            player.weekly_rank is not None
            for player in result.players
        )
    )


def _build_player_result(
    player_id: str,
    totals: _SeasonTotals,
) -> SeasonPlayerResult:
    """Build immutable season statistics from accumulated totals."""
    denominator = totals.wins + totals.losses

    accuracy = (
        totals.wins / denominator
        if denominator
        else None
    )

    return SeasonPlayerResult(
        player_id=player_id,
        weeks_played=totals.weeks_played,
        wins=totals.wins,
        losses=totals.losses,
        ties=totals.ties,
        missed_picks=totals.missed_picks,
        accuracy=accuracy,
        weekly_wins=totals.weekly_wins,
    )