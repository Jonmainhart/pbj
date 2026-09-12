"""ESPN implementation of the NFL game-data provider."""

from datetime import datetime
from typing import Any

import requests

from pbj.domain.game import Game, GameStatus, Team

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"

_REQUEST_TIMEOUT_SECONDS = 10


class ESPNProvider:
    """Retrieve and normalize NFL game data from ESPN."""

    def get_week(self, season: int, week: int) -> list[Game]:
        """Return normalized games for an NFL regular-season week."""

        response = requests.get(
            ESPN_SCOREBOARD_URL,
            params={
                "year": season,
                "seasontype": 2,
                "week": week,
            },
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()

        data = response.json()

        if not isinstance(data, dict):
            raise ValueError("ESPN scoreboard response must be an object")

        events = data.get("events")

        if not isinstance(events, list):
            raise ValueError("ESPN scoreboard response is missing events")

        return [self._parse_event(event) for event in events]

    def _parse_event(self, event: Any) -> Game:
        """Convert one ESPN event into a normalized Game."""

        if not isinstance(event, dict):
            raise ValueError("ESPN event must be an object")

        game_id = self._require_string(event, "id", "event")

        scheduled_time = self._parse_datetime(
            self._require_string(event, "date", f"event {game_id}")
        )

        status = self._parse_status(event, game_id)

        competitions = event.get("competitions")

        if not isinstance(competitions, list) or not competitions:
            raise ValueError(f"ESPN event {game_id} is missing competition data")

        competition = competitions[0]

        if not isinstance(competition, dict):
            raise ValueError(f"ESPN event {game_id} has invalid competition data")

        competitors = competition.get("competitors")

        if not isinstance(competitors, list):
            raise ValueError(f"ESPN event {game_id} is missing competitors")

        home_competitor = self._find_competitor(competitors, "home", game_id)
        away_competitor = self._find_competitor(competitors, "away", game_id)

        home = self._parse_team(home_competitor, game_id)
        away = self._parse_team(away_competitor, game_id)

        home_score = self._parse_score(home_competitor, game_id)
        away_score = self._parse_score(away_competitor, game_id)

        if status is GameStatus.FINAL and (home_score is None or away_score is None):
            raise ValueError(f"Final ESPN event {game_id} is missing scores")

        return Game(
            id=game_id,
            scheduled_time=scheduled_time,
            away=away,
            home=home,
            status=status,
            away_score=away_score,
            home_score=home_score,
        )

    def _parse_status(self, event: dict[str, Any], game_id: str) -> GameStatus:
        """Normalize ESPN's event state into a PBJ game status."""

        status = event.get("status")

        if not isinstance(status, dict):
            raise ValueError(f"ESPN event {game_id} is missing status")

        status_type = status.get("type")

        if not isinstance(status_type, dict):
            raise ValueError(f"ESPN event {game_id} is missing status type")

        state = status_type.get("state")

        if state == "pre":
            return GameStatus.SCHEDULED

        if state == "in":
            return GameStatus.LIVE

        if state == "post":
            return GameStatus.FINAL

        raise ValueError(f"ESPN event {game_id} has unknown status state: {state!r}")

    def _find_competitor(
        self,
        competitors: list[Any],
        home_away: str,
        game_id: str,
    ) -> dict[str, Any]:
        """Find the requested home or away competitor."""

        for competitor in competitors:
            if isinstance(competitor, dict) and competitor.get("homeAway") == home_away:
                return competitor

        raise ValueError(f"ESPN event {game_id} is missing {home_away} competitor")

    def _parse_team(
        self,
        competitor: dict[str, Any],
        game_id: str,
    ) -> Team:
        """Convert ESPN team data into a normalized Team."""

        team = competitor.get("team")

        if not isinstance(team, dict):
            raise ValueError(f"ESPN event {game_id} has missing team data")

        return Team(
            id=self._require_string(team, "id", f"event {game_id} team"),
            abbreviation=self._require_string(
                team,
                "abbreviation",
                f"event {game_id} team",
            ),
            name=self._require_string(
                team,
                "displayName",
                f"event {game_id} team",
            ),
        )

    def _parse_score(
        self,
        competitor: dict[str, Any],
        game_id: str,
    ) -> int | None:
        """Parse an ESPN score while preserving unknown scores as None."""

        score = competitor.get("score")

        if score is None or score == "":
            return None

        if not isinstance(score, str):
            raise ValueError(f"ESPN event {game_id} has invalid score: {score!r}")

        try:
            return int(score)
        except ValueError as exc:
            raise ValueError(f"ESPN event {game_id} has invalid score: {score!r}") from exc

    def _parse_datetime(self, value: str) -> datetime:
        """Parse an ESPN ISO-8601 timestamp."""

        try:
            scheduled_time = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"ESPN event has invalid scheduled time: {value!r}") from exc

        if scheduled_time.tzinfo is None:
            raise ValueError("ESPN scheduled time must include a timezone")

        return scheduled_time

    def _require_string(
        self,
        data: dict[str, Any],
        key: str,
        context: str,
    ) -> str:
        """Return a required non-empty string field."""

        value = data.get(key)

        if not isinstance(value, str) or not value:
            raise ValueError(f"ESPN {context} is missing {key}")

        return value
