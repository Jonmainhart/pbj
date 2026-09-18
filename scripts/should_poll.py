"""Determine whether a weekly NFL schedule needs polling."""

import argparse
import logging
from datetime import UTC, datetime
from pathlib import Path

from pbj.polling import should_poll
from pbj.week_data import load_games

LOGGER = logging.getLogger(__name__)


def main() -> int:
    """Run the polling decision for one football week."""
    args = _parse_args()

    path = Path(f"data/{args.season}/week{args.week:02d}.json")

    games = load_games(path)

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
    parser = argparse.ArgumentParser(description="Determine whether an NFL week needs polling.")
    parser.add_argument("season", type=int)
    parser.add_argument("week", type=int)
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    raise SystemExit(main())
