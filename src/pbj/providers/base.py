"""Interfaces for NFL game-data providers."""

from typing import Protocol

from pbj.domain.game import Game


class GameProvider(Protocol):
    """Provider of normalized NFL game data."""

    def get_week(self, season: int, week: int) -> list[Game]:
        """Return the games for an NFL regular-season week."""
        ...
