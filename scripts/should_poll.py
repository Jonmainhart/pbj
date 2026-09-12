"""Determine whether a weekly NFL schedule needs polling."""

import argparse
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pbj.domain.game import Game, GameStatus, Team
from pbj.polling import should_poll

LOGGER = logging.getLogger(__name__)


def main() -> int:
    """Run the polling decision for one football week."""
    args = _parse_args()

    path = Path(
        f"data/{args.season}/week{args.week:02d}.json"
    )

    games = _load_games(path)

    now = datetime.now(UTC)

    if should_poll(games, now):
        LOGGER.info(
            "Season %d week %d is inside a polling window",
            args.season,
            args.week,
        )
        return 0

    LOGGER.info(
        "Season %d week %d does not need polling",
        args.season,
        args.week,
    )
    return 1


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Determine whether an NFL week needs polling."
    )
    parser.add_argument("season", type=int)
    parser.add_argument("week", type=int)
    return parser.parse_args()


def _load_games(path: Path) -> list[Game]:
    if not path.exists():
        raise FileNotFoundError(
            f"Weekly data does not exist: {path}"
        )

    raw: Any = json.loads(
        path.read_text(encoding="utf-8")
    )

    if not isinstance(raw, dict):
        raise ValueError(
            "Weekly JSON must contain an object"
        )

    games = raw.get("games")

    if not isinstance(games, list):
        raise ValueError(
            "Weekly JSON does not contain game data"
        )

    return [
        _parse_game(game)
        for game in games
    ]


def _parse_game(raw: Any) -> Game:
    if not isinstance(raw, dict):
        raise ValueError("Game must be an object")

    return Game(
        id=str(raw["id"]),
        scheduled_time=datetime.fromisoformat(
            str(raw["scheduled_time"])
        ),
        away=_parse_team(raw["away"]),
        home=_parse_team(raw["home"]),
        status=GameStatus(str(raw["status"])),
        away_score=_optional_int(
            raw.get("away_score")
        ),
        home_score=_optional_int(
            raw.get("home_score")
        ),
    )


def _parse_team(raw: Any) -> Team:
    if not isinstance(raw, dict):
        raise ValueError("Team must be an object")

    return Team(
        id=str(raw["id"]),
        abbreviation=str(raw["abbreviation"]),
        name=str(raw["name"]),
    )


def _optional_int(
    value: Any,
) -> int | None:
    if value is None:
        return None

    return int(value)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    raise SystemExit(main())