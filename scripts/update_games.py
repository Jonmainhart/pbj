"""Fetch and update ESPN game data for one PBJ week."""

import argparse
import json
import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

from pbj.domain.game import Game
from pbj.providers.base import GameProvider
from pbj.providers.espn import ESPNProvider

logger = logging.getLogger(__name__)


def main() -> None:
    """Update game data for one NFL week."""
    args = _parse_args()

    week_path = Path(f"data/{args.season}/week{args.week:02d}.json")

    update_week(
        path=week_path,
        season=args.season,
        week=args.week,
        provider=ESPNProvider(),
    )


def update_week(
    path: Path,
    season: int,
    week: int,
    provider: GameProvider,
) -> None:
    """Fetch game data and update only the game-owned weekly fields."""
    week_data = _load_or_create_week(
        path=path,
        season=season,
        week=week,
    )

    games = provider.get_week(
        season=season,
        week=week,
    )

    if not games:
        raise ValueError(f"provider returned no games for {season} week {week}")

    games = sorted(
        games,
        key=lambda game: game.scheduled_time,
    )

    week_data["season"] = season
    week_data["week"] = week
    week_data["games"] = [_game_to_dict(game) for game in games]

    # The lock time is established from the original schedule and then
    # preserved. Later ESPN schedule changes must not silently move it.
    if "lock_time" not in week_data:
        week_data["lock_time"] = (games[0].scheduled_time - timedelta(hours=1)).isoformat()

    _write_json_atomic(
        path=path,
        data=week_data,
    )

    logger.info(
        "Updated %d games for %d week %d",
        len(games),
        season,
        week,
    )

    logger.info("Updated %s", path)


def _parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Update ESPN game data for one PBJ week.")

    parser.add_argument(
        "season",
        type=int,
        help="NFL season year",
    )

    parser.add_argument(
        "week",
        type=int,
        help="NFL regular-season week",
    )

    return parser.parse_args()


def _load_or_create_week(
    path: Path,
    season: int,
    week: int,
) -> dict[str, Any]:
    """Load existing weekly data or create a new weekly document."""
    if not path.exists():
        return {
            "season": season,
            "week": week,
        }

    try:
        with path.open(encoding="utf-8") as file:
            data = json.load(file)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} does not contain valid JSON") from exc

    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")

    existing_season = data.get("season")
    existing_week = data.get("week")

    if existing_season is not None and existing_season != season:
        raise ValueError(f"{path} contains season {existing_season}, expected {season}")

    if existing_week is not None and existing_week != week:
        raise ValueError(f"{path} contains week {existing_week}, expected {week}")

    return data


def _game_to_dict(
    game: Game,
) -> dict[str, Any]:
    """Convert a normalized Game into weekly JSON data."""
    return {
        "id": game.id,
        "scheduled_time": game.scheduled_time.isoformat(),
        "away": {
            "id": game.away.id,
            "abbreviation": game.away.abbreviation,
            "name": game.away.name,
        },
        "home": {
            "id": game.home.id,
            "abbreviation": game.home.abbreviation,
            "name": game.home.name,
        },
        "status": game.status.value,
        "away_score": game.away_score,
        "home_score": game.home_score,
    }


def _write_json_atomic(
    path: Path,
    data: dict[str, Any],
) -> None:
    """Write weekly JSON without risking a partial file."""
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temp_path = path.with_suffix(".json.tmp")

    with temp_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            data,
            file,
            indent=2,
            ensure_ascii=False,
        )
        file.write("\n")

    temp_path.replace(path)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    main()
