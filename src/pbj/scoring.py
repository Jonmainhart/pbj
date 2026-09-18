"""Domain logic for scoring a PBJ football week."""

from dataclasses import dataclass, replace
from datetime import datetime
from zoneinfo import ZoneInfo

from pbj.domain.game import Game, GameStatus
from pbj.domain.player import Player

EASTERN = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class PlayerResult:
    """Derived weekly scoring results for one player."""

    player_id: str
    wins: int
    losses: int
    ties: int
    missed_picks: int
    accuracy: float | None
    tiebreaker_distance: float | None
    weekly_rank: int | None
    weekly_winner: bool


@dataclass(frozen=True)
class WeekResult:
    """Derived scoring results for one football week."""

    monday_total: int | None
    player_count: int
    weekly_winners: tuple[str, ...]
    players: tuple[PlayerResult, ...]


def score_week(
    games: list[Game],
    players: list[Player],
) -> WeekResult:
    """Score one football week from normalized games and player picks."""
    monday_total = _monday_total(games)

    player_results = [
        _score_player(
            player=player,
            games=games,
            monday_total=monday_total,
        )
        for player in players
    ]

    if not _week_is_complete(games):
        return WeekResult(
            monday_total=monday_total,
            player_count=len(players),
            weekly_winners=(),
            players=tuple(player_results),
        )

    ranked_results = _rank_players(player_results)

    winners = tuple(result.player_id for result in ranked_results if result.weekly_winner)

    return WeekResult(
        monday_total=monday_total,
        player_count=len(players),
        weekly_winners=winners,
        players=tuple(ranked_results),
    )


def _score_player(
    player: Player,
    games: list[Game],
    monday_total: int | None,
) -> PlayerResult:
    """Calculate one player's results from final games."""
    wins = 0
    losses = 0
    ties = 0
    missed_picks = 0

    for game in games:
        if game.status != GameStatus.FINAL:
            continue

        if game.away_score is None or game.home_score is None:
            raise ValueError(f"final game {game.id} is missing a score")

        pick = player.picks.get(game.id)

        if pick is None:
            losses += 1
            missed_picks += 1
            continue

        if game.away_score == game.home_score:
            ties += 1
            continue

        winning_team = (
            game.away.abbreviation if game.away_score > game.home_score else game.home.abbreviation
        )

        if pick == winning_team:
            wins += 1
        else:
            losses += 1

    denominator = wins + losses

    accuracy = wins / denominator if denominator else None

    tiebreaker_distance = (
        abs(player.tiebreaker - monday_total) if monday_total is not None else None
    )

    return PlayerResult(
        player_id=player.id,
        wins=wins,
        losses=losses,
        ties=ties,
        missed_picks=missed_picks,
        accuracy=accuracy,
        tiebreaker_distance=tiebreaker_distance,
        weekly_rank=None,
        weekly_winner=False,
    )


def _week_is_complete(
    games: list[Game],
) -> bool:
    """Return True only when every game is final."""
    return bool(games) and all(game.status == GameStatus.FINAL for game in games)


def _monday_total(
    games: list[Game],
) -> int | None:
    """Return the combined score of all Monday games once final."""
    monday_games = [game for game in games if _is_monday(game.scheduled_time)]

    if not monday_games:
        return None

    if any(game.status != GameStatus.FINAL for game in monday_games):
        return None

    total = 0

    for game in monday_games:
        if game.away_score is None or game.home_score is None:
            raise ValueError(f"final Monday game {game.id} is missing a score")

        total += game.away_score + game.home_score

    return total


def _is_monday(
    scheduled_time: datetime,
) -> bool:
    """Return whether kickoff occurs on Monday in U.S. Eastern time."""
    if scheduled_time.tzinfo is None:
        raise ValueError("game scheduled time must contain timezone information")

    eastern_time = scheduled_time.astimezone(EASTERN)

    return eastern_time.weekday() == 0


def _rank_players(
    players: list[PlayerResult],
) -> list[PlayerResult]:
    """Assign final ranks and determine the weekly winner or winners."""
    if not players:
        return []

    ordered = sorted(
        players,
        key=_ranking_key,
    )

    ranked: list[PlayerResult] = []

    previous_key: tuple[int, float] | None = None
    previous_rank = 0

    for position, result in enumerate(
        ordered,
        start=1,
    ):
        key = _ranking_key(result)

        if key != previous_key:
            previous_rank = position
            previous_key = key

        ranked.append(
            replace(
                result,
                weekly_rank=previous_rank,
                weekly_winner=previous_rank == 1,
            )
        )

    return ranked


def _ranking_key(
    result: PlayerResult,
) -> tuple[int, float]:
    """Return a sortable weekly ranking key."""
    distance = (
        result.tiebreaker_distance if result.tiebreaker_distance is not None else float("inf")
    )

    return (
        -result.wins,
        distance,
    )
