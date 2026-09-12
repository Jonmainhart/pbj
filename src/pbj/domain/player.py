"""Domain models for pool players."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Player:
    """A player's picks for one football week."""

    id: str
    name: str
    nickname: str | None
    picks: dict[str, str]
    tiebreaker: float
