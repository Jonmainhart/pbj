"""Import PBJ picks from an Apple Numbers CSV export."""

import csv
import logging
import re
import unicodedata
from collections.abc import Sequence
from typing import TextIO

from pbj.domain.game import Game
from pbj.domain.player import Player

logger = logging.getLogger(__name__)

NON_PICK = "N/P"

# Commissioner-friendly aliases mapped to PBJ's canonical ESPN abbreviations.
TEAM_ALIASES = {
    "JAC": "JAX",
    "WAS": "WSH",
}


def import_players(
    csv_file: TextIO,
    games: Sequence[Game],
) -> list[Player]:
    """Import player picks from a Numbers CSV export."""
    rows = list(csv.reader(csv_file))

    header_index = _find_header_row(rows)

    headers = [cell.strip() for cell in rows[header_index]]
    headers = _headers_through_correct(headers)
    game_columns = _resolve_game_columns(headers, games)

    players: list[Player] = []

    for row_number, values in enumerate(
        rows[header_index + 1 :],
        start=header_index + 2,
    ):
        if _row_is_empty(values):
            continue

        row = _row_to_dict(headers, values)

        name = _required_value(
            row.get("NAME"),
            f"row {row_number} is missing player name",
        )

        tiebreaker = _parse_tiebreaker(
            row.get("TIEBREAKER"),
            name,
        )

        picks: dict[str, str] = {}

        for column, game in game_columns.items():
            raw_pick = _required_value(
                row.get(column),
                f"{name} is missing pick for {column!r}",
            )

            pick = raw_pick.upper()

            if pick == NON_PICK:
                logger.warning(
                    "%s has no pick for %s vs %s",
                    name,
                    game.away.abbreviation,
                    game.home.abbreviation,
                )
                continue

            pick = _normalize_team_abbreviation(pick)

            valid_picks = {
                game.away.abbreviation.upper(),
                game.home.abbreviation.upper(),
            }

            if pick not in valid_picks:
                raise ValueError(
                    f"{name} has invalid pick {pick!r} for "
                    f"{game.away.abbreviation} vs {game.home.abbreviation}"
                )

            picks[game.id] = pick

        players.append(
            Player(
                id=_player_id(name),
                name=name,
                nickname=None,
                picks=picks,
                tiebreaker=tiebreaker,
            )
        )

    return players


def _find_header_row(rows: list[list[str]]) -> int:
    """Find the real Numbers table header."""
    for index, row in enumerate(rows):
        if row and row[0].strip().upper() == "NAME":
            return index

    raise ValueError("CSV is missing NAME header row")


def _headers_through_correct(
    headers: list[str],
) -> list[str]:
    """Return spreadsheet headers through the CORRECT column."""
    for index, header in enumerate(headers):
        if header.upper() == "CORRECT":
            return headers[: index + 1]

    return headers


def _row_to_dict(
    headers: list[str],
    values: list[str],
) -> dict[str, str]:
    """Convert one CSV row into a normalized header/value mapping."""
    padded = values + [""] * max(0, len(headers) - len(values))

    return {header: value.strip() for header, value in zip(headers, padded, strict=False)}


def _resolve_game_columns(
    fieldnames: Sequence[str],
    games: Sequence[Game],
) -> dict[str, Game]:
    """Resolve spreadsheet matchup columns to normalized games."""
    resolved: dict[str, Game] = {}

    ignored_columns = {
        "NAME",
        "TIEBREAKER",
        "CORRECT",
        "",
    }

    for fieldname in fieldnames:
        normalized_name = fieldname.strip()

        if normalized_name.upper() in ignored_columns:
            continue

        teams = normalized_name.upper().split()

        if len(teams) != 2:
            raise ValueError(f"invalid matchup column {fieldname!r}")

        normalized_teams = {_normalize_team_abbreviation(team) for team in teams}

        matching_games = [
            game
            for game in games
            if {
                game.away.abbreviation.upper(),
                game.home.abbreviation.upper(),
            }
            == normalized_teams
        ]

        if len(matching_games) != 1:
            raise ValueError(f"could not resolve matchup {teams[0]} vs {teams[1]}")

        resolved[fieldname] = matching_games[0]

    if len(resolved) != len(games):
        raise ValueError(
            f"spreadsheet contains {len(resolved)} resolved games; "
            f"schedule contains {len(games)}"
        )

    return resolved


def _normalize_team_abbreviation(abbreviation: str) -> str:
    """Normalize commissioner team abbreviations to ESPN abbreviations."""
    normalized = abbreviation.strip().upper()
    return TEAM_ALIASES.get(normalized, normalized)


def _parse_tiebreaker(
    value: str | None,
    player_name: str,
) -> float:
    """Parse a player's Monday tiebreaker prediction."""
    cleaned = _required_value(
        value,
        f"{player_name} is missing tiebreaker",
    )

    try:
        return float(cleaned)
    except ValueError as exc:
        raise ValueError(f"{player_name} has invalid tiebreaker {cleaned!r}") from exc


def _required_value(
    value: str | None,
    message: str,
) -> str:
    """Return a stripped required CSV value."""
    if value is None or not value.strip():
        raise ValueError(message)

    return value.strip()


def _row_is_empty(
    row: Sequence[str],
) -> bool:
    """Return True when a CSV row contains no values."""
    return all(not value.strip() for value in row)


def _player_id(name: str) -> str:
    """Generate the initial stable identifier for a player name."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(
        r"[^a-z0-9]+",
        "-",
        ascii_name.lower(),
    ).strip("-")

    if not slug:
        raise ValueError(f"cannot generate player ID from name {name!r}")

    return slug