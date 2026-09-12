# PBJ Dashboard

A lightweight, mobile-friendly dashboard for the PBJ Football pool.

The dashboard keeps the existing weekly workflow intact while adding automatic game updates, scoring, season statistics, and a simple public website.

## What It Does

Each week, players pick the winner of every NFL game and provide a tiebreaker prediction for the combined score of the Monday night game or games.

PBJ Dashboard automatically:

- Creates the weekly NFL schedule.
- Imports picks exported from Apple Numbers.
- Updates NFL game scores and statuses.
- Calculates weekly records and accuracy.
- Determines weekly winners.
- Applies the Monday night tiebreaker when necessary.
- Tracks season-long statistics.
- Publishes the results through a mobile-friendly GitHub Pages dashboard.

The commissioner can continue managing picks in Apple Numbers. The dashboard does not require player accounts, online pick submission, or a database.

## Weekly Workflow

Most routine processing is handled by GitHub Actions.

### 1. Weekly Schedule

Every Tuesday morning, GitHub Actions creates the next week's JSON file using the NFL schedule provided by ESPN.

The resulting file is stored at:

```text
data/<season>/weekNN.json
```

For example:

```text
data/2026/week02.json
```

### 2. Import Picks

The commissioner exports the weekly Numbers sheet as CSV and adds it to the corresponding season directory:

```text
data/2026/week02.csv
```

When the CSV is pushed to GitHub, the import workflow automatically:

1. Validates the CSV against the week's NFL schedule.
2. Imports the players, picks, and tiebreakers.
3. Updates the `players` section of the weekly JSON.
4. Deletes the successfully imported CSV.
5. Commits the updated weekly data.

Invalid imports fail without replacing the weekly JSON or deleting the CSV.

### 3. Game Updates

During NFL game windows, GitHub Actions periodically checks whether the current week needs an update.

Polling is schedule-aware, so ESPN is queried only when:

- A scheduled game is within the polling window around kickoff, or
- A game is currently live.

When game data changes, the workflow:

1. Updates the game's status and score.
2. Commits the game-state update.
3. Recalculates weekly scoring.
4. Commits any scoring changes.
5. Rebuilds season statistics.
6. Commits any season changes.

Each meaningful transformation receives its own Git commit.

## Pool Rules

A correct pick counts as one win.

An incorrect pick counts as one loss.

If an NFL game ends in a tie, the game counts as neither a win nor a loss for the player. It is tracked separately as a tie and excluded from the accuracy denominator.

A missing or explicit non-pick does not count as a win, loss, or tie.

Weekly accuracy is:

```text
wins / (wins + losses)
```

NFL ties are excluded from the denominator.

### Weekly Winner

The weekly winner is determined by:

1. Most wins.
2. If tied, closest Monday night tiebreaker prediction.
3. If still tied, the weekly win is split.

If multiple Monday games are played, their final scores are combined into a single Monday total.

A split weekly win counts as one weekly win for each winning player in the season statistics.

Weekly winners are not declared until every NFL game for the week is final.

## Season Statistics

The dashboard tracks:

- Weeks played
- Wins
- Losses
- Ties
- Overall accuracy
- Weekly wins

Season accuracy is calculated from cumulative results:

```text
total wins / (total wins + total losses)
```

Season statistics are rebuilt from completed weekly files rather than incrementally modified. This allows a corrected or rescored week to propagate cleanly into the season standings.

## Dashboard

The public site is a static HTML/CSS/JavaScript application designed primarily for phones.

Features include:

- Weekly and season views
- Week selector
- Current game progress
- Weekly winner display
- Monday tiebreaker results
- Expandable player cards
- Individual picks and results
- Season statistics
- Optional announcements
- No login or account required

Individual picks display their current state using simple indicators:

- `✅` Correct
- `❌` Incorrect
- `➖` NFL tie
- `⏳` Pending
- `— N/P` No pick

Weekly winners are marked with `🏆`.

## Announcements

Optional announcement text can be placed in:

```text
assets/announcement-top.txt
assets/announcement-bottom.txt
```

An announcement is displayed only when the corresponding file contains text.

## Project Structure

```text
.
├── index.html
├── assets
│   ├── app.js
│   ├── style.css
│   ├── announcement-top.txt
│   └── announcement-bottom.txt
├── data
│   └── 2026
│       ├── week01.json
│       ├── week02.json
│       └── season.json
├── scripts
│   ├── aggregate_season.py
│   ├── import_picks.py
│   ├── score_week.py
│   ├── should_poll.py
│   └── update_games.py
├── src
│   └── pbj
├── tests
├── .github
│   └── workflows
│       ├── create-week.yml
│       ├── import-picks.yml
│       └── poll-games.yml
├── DEVELOPMENT.md
├── LICENSE
└── README.md
```

## Local Development

Create and activate a virtual environment, then install the project:

```bash
python -m pip install ".[dev]"
```

Run the tests:

```bash
pytest
```

Run static type checking:

```bash
mypy src tests
```

Run linting:

```bash
ruff check .
```

The dashboard can be served locally with:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The command-line scripts can also be run manually for development, testing, or recovery. Normal production processing is handled by GitHub Actions.

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture, data ownership, scoring rules, and automation details.

## Data Source

NFL schedules, game statuses, and scores are obtained from ESPN's public scoreboard endpoint through a provider abstraction.

ESPN is treated as an external provider rather than part of the PBJ domain model. Only the data required by PBJ Dashboard is retained in the normalized weekly files.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.