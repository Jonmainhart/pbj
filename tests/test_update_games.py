"""Unit tests for the weekly game-update workflow."""

import json
from datetime import UTC, datetime

import pytest

from pbj.domain.game import Game, GameStatus, Team
from scripts.update_games import update_week


def _game(
    *,
    game_id: str = "game-1",
    scheduled_time: datetime | None = None,
    status: GameStatus = GameStatus.SCHEDULED,
    away_score: int | None = None,
    home_score: int | None = None,
) -> Game:
    """Build a normalized game for update tests."""
    if scheduled_time is None:
        scheduled_time = datetime(
            2026,
            9,
            10,
            0,
            15,
            tzinfo=UTC,
        )

    return Game(
        id=game_id,
        scheduled_time=scheduled_time,
        away=Team(
            id="1",
            abbreviation="NE",
            name="New England Patriots",
        ),
        home=Team(
            id="26",
            abbreviation="SEA",
            name="Seattle Seahawks",
        ),
        status=status,
        away_score=away_score,
        home_score=home_score,
    )


def _provider(mocker, games):
    """Return a mocked game provider."""
    provider = mocker.Mock()
    provider.get_week.return_value = games
    return provider


@pytest.mark.unit
def test_update_week_creates_week_file(tmp_path, mocker):
    """Game updates create a new weekly JSON file."""
    path = tmp_path / "2026" / "week01.json"

    provider = _provider(
        mocker,
        [_game()],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["season"] == 2026
    assert data["week"] == 1
    assert len(data["games"]) == 1

    game = data["games"][0]

    assert game["id"] == "game-1"
    assert game["away"]["abbreviation"] == "NE"
    assert game["home"]["abbreviation"] == "SEA"
    assert game["status"] == "scheduled"
    assert game["away_score"] is None
    assert game["home_score"] is None


@pytest.mark.unit
def test_update_week_requests_correct_season_and_week(
    tmp_path,
    mocker,
):
    """The workflow requests the specified provider week."""
    path = tmp_path / "week01.json"

    provider = _provider(
        mocker,
        [_game()],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    provider.get_week.assert_called_once_with(
        season=2026,
        week=1,
    )


@pytest.mark.unit
def test_update_week_sets_lock_time_from_first_game(
    tmp_path,
    mocker,
):
    """A new week locks one hour before its earliest scheduled game."""
    path = tmp_path / "week01.json"

    first_game = _game(
        game_id="early",
        scheduled_time=datetime(
            2026,
            9,
            10,
            17,
            0,
            tzinfo=UTC,
        ),
    )

    later_game = _game(
        game_id="late",
        scheduled_time=datetime(
            2026,
            9,
            10,
            20,
            0,
            tzinfo=UTC,
        ),
    )

    provider = _provider(
        mocker,
        [later_game, first_game],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["lock_time"] == "2026-09-10T16:00:00+00:00"
    assert data["games"][0]["id"] == "early"
    assert data["games"][1]["id"] == "late"


@pytest.mark.unit
def test_update_week_preserves_existing_lock_time(
    tmp_path,
    mocker,
):
    """Schedule changes do not silently change an established lock time."""
    path = tmp_path / "week01.json"

    path.write_text(
        json.dumps(
            {
                "season": 2026,
                "week": 1,
                "lock_time": "2026-09-10T16:00:00+00:00",
            }
        )
    )

    rescheduled_game = _game(
        scheduled_time=datetime(
            2026,
            9,
            10,
            19,
            0,
            tzinfo=UTC,
        ),
    )

    provider = _provider(
        mocker,
        [rescheduled_game],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["lock_time"] == "2026-09-10T16:00:00+00:00"


@pytest.mark.unit
def test_update_week_preserves_players(
    tmp_path,
    mocker,
):
    """Updating ESPN game data does not modify commissioner picks."""
    path = tmp_path / "week01.json"

    players = [
        {
            "id": "abigail",
            "name": "Abigail",
            "nickname": None,
            "picks": {
                "game-1": "SEA",
            },
            "tiebreaker": 56.0,
        }
    ]

    path.write_text(
        json.dumps(
            {
                "season": 2026,
                "week": 1,
                "players": players,
            }
        )
    )

    provider = _provider(
        mocker,
        [_game()],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["players"] == players


@pytest.mark.unit
def test_update_week_preserves_results(
    tmp_path,
    mocker,
):
    """Updating game data does not directly modify derived results."""
    path = tmp_path / "week01.json"

    results: dict[str, object] = {
        "monday_total": None,
        "player_count": 1,
        "weekly_winners": [],
        "players": [],
    }

    path.write_text(
        json.dumps(
            {
                "season": 2026,
                "week": 1,
                "results": results,
            }
        )
    )

    provider = _provider(
        mocker,
        [_game()],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["results"] == results


@pytest.mark.unit
def test_update_week_replaces_only_game_data(
    tmp_path,
    mocker,
):
    """A later ESPN update replaces existing normalized game data."""
    path = tmp_path / "week01.json"

    path.write_text(
        json.dumps(
            {
                "season": 2026,
                "week": 1,
                "games": [
                    {
                        "id": "game-1",
                        "status": "scheduled",
                        "away_score": None,
                        "home_score": None,
                    }
                ],
                "players": [{"id": "abigail"}],
            }
        )
    )

    provider = _provider(
        mocker,
        [
            _game(
                status=GameStatus.FINAL,
                away_score=17,
                home_score=24,
            )
        ],
    )

    update_week(
        path=path,
        season=2026,
        week=1,
        provider=provider,
    )

    data = json.loads(path.read_text())

    assert data["games"][0]["status"] == "final"
    assert data["games"][0]["away_score"] == 17
    assert data["games"][0]["home_score"] == 24

    assert data["players"] == [{"id": "abigail"}]


@pytest.mark.unit
def test_update_week_rejects_empty_schedule(
    tmp_path,
    mocker,
):
    """An empty provider response must not overwrite existing data."""
    path = tmp_path / "week01.json"

    original_data = {
        "season": 2026,
        "week": 1,
        "games": [{"id": "existing-game"}],
    }

    path.write_text(json.dumps(original_data))

    provider = _provider(
        mocker,
        [],
    )

    with pytest.raises(
        ValueError,
        match="returned no games",
    ):
        update_week(
            path=path,
            season=2026,
            week=1,
            provider=provider,
        )

    assert json.loads(path.read_text()) == original_data


@pytest.mark.unit
def test_update_week_rejects_wrong_existing_season(
    tmp_path,
    mocker,
):
    """An existing file for another season is not overwritten."""
    path = tmp_path / "week01.json"

    path.write_text(
        json.dumps(
            {
                "season": 2025,
                "week": 1,
            }
        )
    )

    provider = _provider(
        mocker,
        [_game()],
    )

    with pytest.raises(
        ValueError,
        match="season 2025",
    ):
        update_week(
            path=path,
            season=2026,
            week=1,
            provider=provider,
        )


@pytest.mark.unit
def test_update_week_rejects_wrong_existing_week(
    tmp_path,
    mocker,
):
    """An existing file for another week is not overwritten."""
    path = tmp_path / "week01.json"

    path.write_text(
        json.dumps(
            {
                "season": 2026,
                "week": 2,
            }
        )
    )

    provider = _provider(
        mocker,
        [_game()],
    )

    with pytest.raises(
        ValueError,
        match="week 2",
    ):
        update_week(
            path=path,
            season=2026,
            week=1,
            provider=provider,
        )
