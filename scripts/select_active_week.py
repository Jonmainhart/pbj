"""Select the active football week."""

import argparse
import re
from pathlib import Path

from pbj.active_week import select_active_week
from pbj.domain.game import Game
from pbj.week_data import load_games

WEEK_FILE_PATTERN = re.compile(r"week(\d{2})\.json")


def main() -> int:
    """Select the active week and write GitHub Actions outputs."""
    args = _parse_args()

    season_dir = Path(f"data/{args.season}")
    weeks = _load_weeks(season_dir)
    week = select_active_week(weeks)

    if week is None:
        _write_outputs(
            args.output,
            found=False,
        )
        return 0

    _write_outputs(
        args.output,
        found=True,
        season=args.season,
        week=week,
    )
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Select the active football week.")
    parser.add_argument("season", type=int)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def _load_weeks(
    season_dir: Path,
) -> dict[int, list[Game]]:
    """Load available weekly game data."""
    weeks: dict[int, list[Game]] = {}

    for path in season_dir.glob("week??.json"):
        match = WEEK_FILE_PATTERN.fullmatch(path.name)

        if match is None:
            continue

        week = int(match.group(1))
        weeks[week] = load_games(path)

    return weeks


def _write_outputs(
    path: Path,
    *,
    found: bool,
    season: int | None = None,
    week: int | None = None,
) -> None:
    """Write active-week values as GitHub Actions outputs."""
    lines = [f"found={str(found).lower()}"]

    if found:
        lines.extend(
            [
                f"season={season}",
                f"week={week}",
            ]
        )

    with path.open(
        "a",
        encoding="utf-8",
    ) as output:
        output.write("\n".join(lines))
        output.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
