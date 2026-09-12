# PBJ Dashboard

PBJ Dashboard is a lightweight, mobile-friendly dashboard for our weekly
football pool.

The commissioner's spreadsheet remains the source for player picks. PBJ
Dashboard consumes a CSV export and adds automatic game updates, scoring,
season statistics, and a simple public website.

No player accounts, online pick submission, or database are required.

## What It Does

Each week, players pick the winner of every NFL game and provide a tiebreaker
prediction for the combined score of the Monday night game or games.

PBJ Dashboard:

- Creates the weekly NFL schedule.
- Imports player picks from CSV.
- Updates game scores and statuses.
- Calculates weekly records and accuracy.
- Determines weekly winners.
- Applies the Monday night tiebreaker when necessary.
- Tracks season statistics.
- Publishes results through GitHub Pages.

Routine production processing is automated with GitHub Actions.

## Pool Rules

Only final games affect player statistics.

- A correct pick is a win.
- An incorrect pick is a loss.
- An NFL tie is recorded as a tie for players who made a pick.
- A missing or explicit N/P is a loss and a missed pick once the game is final.
- Scheduled and live games do not yet affect statistics.

Missed picks are included in losses and are also tracked separately.

Accuracy is based on wins and losses. NFL ties are excluded from the
calculation.

### Weekly Winner

The weekly winner is determined by:

1. Most wins.
2. Closest Monday night tiebreaker prediction.
3. A split win if both remain equal.

If multiple Monday games are played, their final scores are combined into one
Monday total.

Each player in a split receives one weekly win for season tracking.

Winners are not declared until every game for the week is final.

## Season Statistics

The dashboard tracks:

- Weeks played
- Wins
- Losses
- Ties
- Missed picks
- Accuracy
- Weekly wins

Season statistics are rebuilt from completed weekly results, allowing
corrections to earlier weeks to propagate cleanly.

## Dashboard

The public site is a static HTML, CSS, and JavaScript application designed
primarily for phones.

It provides weekly and season views, game progress, weekly winners, player
records, individual picks, tiebreaker results, and optional announcements.

Player cards remain compact until selected, then open to show detailed
statistics and picks.

Pick indicators include:

- `✅` Correct
- `❌` Incorrect
- `➖` NFL tie
- `⏳` Pending
- `⏳ N/P` Pending non-pick
- `❌ N/P` Final non-pick

Weekly winners are marked with `🏆`.

## Weekly Workflow

The normal workflow is:

1. PBJ Dashboard creates the week's NFL schedule.
2. The commissioner exports player picks to CSV.
3. Pushing the CSV imports the picks.
4. Game data is updated automatically around NFL game times.
5. Weekly results are recalculated as games finish.
6. Season statistics are rebuilt after scoring changes.

Invalid CSV imports do not replace existing player data.

Generated weekly data is stored under `data/<season>/`.

## Announcements

Optional announcements can be placed in:

- `assets/announcement-top.txt`
- `assets/announcement-bottom.txt`

Empty announcement files remain hidden.

## Local Development

Install the project and development dependencies:

    python -m pip install ".[dev]"

Run the quality checks:

    pytest
    mypy src tests
    ruff check .

Serve the dashboard locally:

    python -m http.server 8000

Then open `http://localhost:8000`.

Normal production processing is handled by GitHub Actions.

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture, data ownership,
scoring rules, automation, and development details.

## Data Source

NFL schedules, statuses, and scores are obtained from ESPN through an isolated
provider layer.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.