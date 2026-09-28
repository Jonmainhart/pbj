"""BALLDONTLIE implementation of the NFL game-data provider."""

from datetime import datetime
from typing import Any

import requests

from pbj.domain.game import Game, GameStatus, Team

BALLDONTLIE_GAMES_URL = "https://api.balldontlie.io/nfl/v1/games"

_REQUEST_TIMEOUT_SECONDS = 10


class BALLDONTLIEProvider:
    """Retrieve and normalize NFL game data from BALLDONTLIE."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def get_week(self, season: int, week: int) -> list[Game]:
        """Return normalized games for an NFL regular-season week."""

        response = requests.get(
            BALLDONTLIE_GAMES_URL,
            params={
                "seasons[]": season,
                "weeks[]": week,
            },
            headers={
                "Authorization": self._api_key,
            },
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()

        data = response.json()
        games = data["data"]

        return [self._parse_game(game) for game in games]

    def _parse_game(self, game: dict[str, Any]) -> Game:
        """Convert one BALLDONTLIE game into a normalized Game."""

        status = self._parse_status(game["status_state"])
        away_score = game["visitor_team_score"]
        home_score = game["home_team_score"]

        if status is GameStatus.FINAL and (away_score is None or home_score is None):
            raise ValueError("Final BALLDONTLIE game is missing scores")

        return Game(
            id=self._require_id(game, "game"),
            scheduled_time=self._parse_datetime(game["date"]),
            away=self._parse_team(
                self._require_team(game, "visitor_team"),
            ),
            home=self._parse_team(
                self._require_team(game, "home_team"),
            ),
            status=status,
            away_score=away_score,
            home_score=home_score,
        )

    def _parse_team(self, team: dict[str, Any]) -> Team:
        """Convert BALLDONTLIE team data into a normalized Team."""

        return Team(
            id=str(team["id"]),
            abbreviation=team["abbreviation"],
            name=team["full_name"],
        )

    def _parse_datetime(self, value: str) -> datetime:
        """Parse a BALLDONTLIE ISO-8601 timestamp."""

        return datetime.fromisoformat(
            value.replace("Z", "+00:00"),
        )

    def _parse_status(self, state: str) -> GameStatus:
        """Normalize BALLDONTLIE's game state into a PBJ game status."""

        if state == "scheduled":
            return GameStatus.SCHEDULED

        if state == "in_progress":
            return GameStatus.LIVE

        if state == "final":
            return GameStatus.FINAL

        raise ValueError(f"BALLDONTLIE game has unknown status state: {state!r}")

    def _require_id(
        self,
        data: dict[str, Any],
        context: str,
    ) -> str:
        """Return a required BALLDONTLIE ID as a string."""

        value = data.get("id")

        if not isinstance(value, int):
            raise ValueError(f"BALLDONTLIE {context} is missing id")

        return str(value)

    def _require_team(
        self,
        game: dict[str, Any],
        key: str,
    ) -> dict[str, Any]:
        """Return required BALLDONTLIE team data."""

        team = game.get(key)

        if not isinstance(team, dict):
            raise ValueError("BALLDONTLIE game is missing team data")

        return team
