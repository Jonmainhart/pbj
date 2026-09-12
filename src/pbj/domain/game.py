"""Domain models for NFL games."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class GameStatus(StrEnum):
    """Normalized game statuses used by the application."""

    SCHEDULED = "scheduled"
    LIVE = "live"
    FINAL = "final"


@dataclass(frozen=True)
class Team:
    """An NFL team."""

    id: str
    abbreviation: str
    name: str


@dataclass(frozen=True)
class Game:
    """A normalized NFL game."""

    id: str
    scheduled_time: datetime
    away: Team
    home: Team
    status: GameStatus
    away_score: int | None
    home_score: int | None
