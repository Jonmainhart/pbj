"""Generate the available-week manifest."""

import argparse
import json
import os
import re
import tempfile
from pathlib import Path

WEEK_FILE_PATTERN = re.compile(r"week(\d{2})\.json")


def build_manifest(
    data_dir: Path,
) -> dict[str, list[int]]:
    """Build a manifest of available weeks by season."""
    manifest: dict[str, list[int]] = {}

    for season_dir in sorted(data_dir.iterdir()):
        if not season_dir.is_dir():
            continue

        weeks: list[int] = []

        for path in season_dir.glob("week??.json"):
            match = WEEK_FILE_PATTERN.fullmatch(path.name)

            if match is not None:
                weeks.append(int(match.group(1)))

        if weeks:
            manifest[season_dir.name] = sorted(weeks)

    return manifest


def main() -> int:
    """Generate the available-week manifest."""
    args = _parse_args()

    manifest = build_manifest(args.data_dir)
    output_path = args.data_dir / "available-weeks.json"

    _write_manifest(output_path, manifest)

    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the available-week manifest.")
    parser.add_argument(
        "data_dir",
        type=Path,
        nargs="?",
        default=Path("data"),
    )
    return parser.parse_args()


def _write_manifest(
    path: Path,
    manifest: dict[str, list[int]],
) -> None:
    """Write the manifest atomically."""
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
    ) as temporary:
        json.dump(
            manifest,
            temporary,
            indent=2,
        )
        temporary.write("\n")
        temporary_path = Path(temporary.name)

    os.replace(temporary_path, path)


if __name__ == "__main__":
    raise SystemExit(main())
