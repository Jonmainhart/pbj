"""Load weekly game data into domain objects."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pbj.domain.game import Game, GameStatus, Team


def load_games(path: Path) -> list[Game]:
    """Load games from weekly data file."""
    if not path.exists():
        raise FileNotFoundError(f"Weekly data does not exist: {path}")

    raw: Any = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(raw, dict):
        raise ValueError("Weekly JSON must contain an object")

    games = raw.get("games")

    if not isinstance(games, list):
        raise ValueError("Weekly JSON does not contain game data")

    return [_parse_game(game) for game in games]


def _parse_game(raw: Any) -> Game:
    if not isinstance(raw, dict):
        raise ValueError("Game must be an object")

    return Game(
        id=str(raw["id"]),
        scheduled_time=datetime.fromisoformat(str(raw["scheduled_time"])),
        away=_parse_team(raw["away"]),
        home=_parse_team(raw["home"]),
        status=GameStatus(str(raw["status"])),
        away_score=_optional_int(raw.get("away_score")),
        home_score=_optional_int(raw.get("home_score")),
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
