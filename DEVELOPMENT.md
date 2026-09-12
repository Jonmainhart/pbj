# PBJ Dashboard Development Notes

This document describes the architecture, data model, automation, ownership boundaries, and scoring rules for the PBJ Dashboard.

## Design Goals

PBJ Dashboard is intentionally small.

The existing weekly spreadsheet remains the commissioner's source for player picks. The project adds automation and presentation around that workflow rather than replacing it with an account system or online pick-entry application.

Primary goals:

- Preserve the existing workflow.
- Keep hosting free and simple.
- Use static GitHub Pages hosting.
- Make the dashboard excellent on phones.
- Avoid accounts, authentication, databases, and unnecessary infrastructure.
- Keep external APIs isolated behind provider interfaces.
- Make derived data reproducible.
- Make automation observable through Git history.
- Prefer simple, maintainable solutions over clever ones.

## Architecture

The production data flow is:

```text
                ┌───────────────────────┐
                │   Weekly Spreadsheet  │
                └─────────────┬─────────┘
                              │
                         CSV export
                              │
                              ▼
                     import_picks.py
                              │
                              ▼
                           players

ESPN ──► update_games.py ──► games
                              │
                              ▼
                         score_week.py
                              │
                              ▼
                           results
                              │
                              ▼
                    aggregate_season.py
                              │
                              ▼
                         season.json
```

The browser reads the generated JSON and performs presentation-only derivations.

## Repository Layout

```text
.
├── index.html
├── assets
│   ├── app.js
│   ├── style.css
│   ├── announcement-top.txt
│   └── announcement-bottom.txt
├── data
│   └── <season>
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
│       ├── domain
│       │   ├── game.py
│       │   └── player.py
│       ├── importers
│       │   └── numbers.py
│       ├── providers
│       │   ├── base.py
│       │   └── espn.py
│       ├── polling.py
│       ├── scoring.py
│       └── season.py
├── tests
└── .github
    └── workflows
        ├── create-week.yml
        ├── import-picks.yml
        └── poll-games.yml
```

## Weekly Data Model

Normalized weekly data is stored at:

```text
data/<NFL season>/weekNN.json
```

Example:

```text
data/2026/week01.json
```

The top-level structure is:

```json
{
  "season": 2026,
  "week": 1,
  "lock_time": "ISO-8601 timestamp",
  "games": [],
  "players": [],
  "results": {}
}
```

The NFL season year is used for the directory and `season` field.

## Games

Normalized game data has the following shape:

```json
{
  "id": "401872656",
  "scheduled_time": "2026-09-10T00:20:00+00:00",
  "away": {
    "id": "17",
    "abbreviation": "NE",
    "name": "New England Patriots"
  },
  "home": {
    "id": "26",
    "abbreviation": "SEA",
    "name": "Seattle Seahawks"
  },
  "status": "scheduled",
  "away_score": 0,
  "home_score": 0
}
```

Only three normalized statuses exist:

```text
scheduled
live
final
```

The ESPN event ID is retained as the stable game identifier.

Team IDs and abbreviations are retained because they provide stable references for imported picks.

PBJ does not store a provider-supplied winner field. Winners are inferred from final scores.

Scores may be:

```text
integer
null
```

A score of `0` is legitimate data and is not treated as missing. ESPN may also report `0` before a game begins; PBJ intentionally retains that value. Game status determines whether a score is meaningful.

## Players

Player data has the following shape:

```json
{
  "id": "abigail",
  "name": "Abigail",
  "nickname": null,
  "picks": {
    "401872656": "SEA",
    "401872657": "LAR"
  },
  "tiebreaker": 56.0
}
```

Player IDs are stable identifiers independent of display names. Initially they are generated from the player's name.

Picks are keyed by game ID and contain the selected team's abbreviation.

Tiebreakers may contain decimal values.

## Numbers CSV Import

The commissioner's Apple Numbers spreadsheet remains the source of player picks.

The exported CSV contains one column per matchup.

A simplified header looks like:

```text
NAME,NE SEA,SF LAR,ATL PIT,...,TIEBREAKER
```

Each player row contains the selected team abbreviation for that matchup:

```text
Abigail,SEA,LAR,PIT,...,56
```

The importer resolves each matchup column against the normalized NFL schedule.

Known team aliases are normalized during import:

```python
TEAM_ALIASES = {
    "JAC": "JAX",
    "WAS": "WSH",
}
```

### Import Rules

A valid pick must match one of the two teams participating in that game.

A blank pick is an import error.

An explicit `N/P` is treated as a non-pick:

- The game is omitted from that player's `picks`.
- A warning is logged.
- It does not count as a win, loss, or tie during scoring.

The spreadsheet's `CORRECT` data, if present, is not authoritative and is ignored.

### Safe Import Behavior

`import_picks.py` validates and parses the CSV before replacing player data.

On success:

1. The `players` section is replaced.
2. The weekly JSON is written atomically.
3. The imported CSV is deleted.

If import fails:

- The weekly JSON is not replaced with partial player data.
- The CSV remains available for correction.
- The GitHub Actions job fails rather than committing invalid data.

This behavior is intentional.

## Data Ownership

Each transformation owns a specific portion of the data.

### `update_games.py`

Owns:

```text
games
```

It also establishes `lock_time` when the value does not already exist.

It must preserve:

```text
players
results
other unrelated top-level data
```

### `import_picks.py`

Owns:

```text
players
```

It must preserve:

```text
games
results
lock_time
other unrelated top-level data
```

### `score_week.py`

Owns:

```text
results
```

It must preserve:

```text
games
players
lock_time
other unrelated top-level data
```

### `aggregate_season.py`

Owns:

```text
data/<season>/season.json
```

The season file is derived entirely from scored weekly files.

### `app.js`

Owns presentation-only derivations.

For example, the browser determines whether a displayed individual pick is:

```text
correct
incorrect
tied
pending
missing
```

Per-pick `correct` flags are intentionally not persisted in JSON.

## Lock Time

Picks lock one hour before the scheduled kickoff of the first game of the football week.

`lock_time` is calculated when the weekly schedule is initially created and stored in the weekly JSON.

It is not continuously recalculated from later schedule updates.

This prevents an external schedule change from silently changing the pool's established lock time.

## Weekly Scoring

Only games with status:

```text
final
```

affect player statistics.

For a player who made a pick:

### Correct Pick

```text
wins += 1
```

### Incorrect Pick

```text
losses += 1
```

### NFL Tie

```text
ties += 1
```

An NFL tie counts as neither a win nor a loss.

### Missing / N/P

A missing pick contributes nothing:

```text
wins   += 0
losses += 0
ties   += 0
```

### Accuracy

Weekly accuracy is:

```text
wins / (wins + losses)
```

NFL ties are excluded from the denominator.

If the player has no wins or losses, accuracy is:

```text
null
```

## Weekly Completion

A week is complete only when every normalized NFL game has status:

```text
final
```

Before the week is complete:

- Final games contribute to current wins, losses, ties, and accuracy.
- Scheduled and live games do not contribute.
- `weekly_winners` is empty.
- Every `weekly_winner` is `false`.
- Every `weekly_rank` is `null`.
- The Monday tiebreaker remains unavailable until all Monday games are final.

A postponed or rescheduled game therefore keeps the football week incomplete until it reaches `final`.

## Monday Tiebreaker

Monday games are identified by converting each kickoff timestamp to:

```text
America/New_York
```

The Eastern local calendar date determines whether a game is a Monday game.

This is intentionally not based on the UTC date.

If one Monday game is played:

```text
monday_total = away_score + home_score
```

If multiple Monday games are played:

```text
monday_total =
    sum(all away scores and home scores for Monday games)
```

The Monday total remains `null` until every Monday game is final.

Each player's distance is:

```text
abs(player.tiebreaker - monday_total)
```

## Weekly Winner

Weekly winners are determined only after the entire week is complete.

Ranking criteria are:

1. Most wins.
2. If wins are equal, smallest Monday tiebreaker distance.
3. If both are equal, the players split the weekly win.

Each player in a split receives one weekly win for season tracking.

Competition ranking is used.

Example:

```text
1
1
3
4
```

rather than:

```text
1
1
2
3
```

## Weekly Results

Derived weekly results are persisted in the weekly JSON:

```json
{
  "results": {
    "monday_total": 47,
    "player_count": 36,
    "weekly_winners": [
      "abigail"
    ],
    "players": [
      {
        "player_id": "abigail",
        "wins": 12,
        "losses": 4,
        "ties": 0,
        "accuracy": 0.75,
        "tiebreaker_distance": 9.0,
        "weekly_rank": 1,
        "weekly_winner": true
      }
    ]
  }
}
```

Winnings and pot amounts are intentionally not public dashboard data.

## Season Aggregation

Season statistics are stored at:

```text
data/<season>/season.json
```

Tracked player statistics are:

```text
weeks_played
wins
losses
ties
accuracy
weekly_wins
```

Season accuracy is:

```text
total_wins / (total_wins + total_losses)
```

### Deterministic Rebuild

Season statistics are never incrementally patched.

`aggregate_season.py` performs a complete deterministic rebuild from scored weekly files every time it runs.

Conceptually:

```text
week01.json
week02.json
week03.json
     │
     ▼
aggregate_season.py
     │
     ▼
season.json
```

If an earlier week is corrected:

1. Correct the source data.
2. Rescore that week.
3. Run season aggregation again.

The resulting season file reflects the corrected history without requiring compensating updates.

Only completed/scored weeks contribute to season statistics. Partial current-week scoring does not affect the season totals.

## ESPN Provider

ESPN access is isolated behind the provider layer.

The current implementation uses ESPN's public NFL scoreboard endpoint.

The provider converts ESPN-specific data into PBJ domain objects.

The rest of the application should not depend directly on ESPN response structures.

This boundary makes it possible to replace the provider later without rewriting scoring or season logic.

Only fields required by PBJ are retained.

## GitHub Actions

Routine production processing is controlled by GitHub Actions.

There are three workflows:

```text
create-week.yml
import-picks.yml
poll-games.yml
```

## Weekly Automation Lifecycle

The normal production lifecycle is:

```text
Tuesday morning
    │
    ▼
create-week.yml
    │
    ▼
update_games.py
    │
    ▼
commit weekly schedule


weekNN.csv pushed
    │
    ▼
import-picks.yml
    │
    ▼
import_picks.py
    │
    ├── update players
    └── delete CSV
    │
    ▼
commit imported picks


NFL game window
    │
    ▼
poll-games.yml
    │
    ▼
should_poll.py
    │
    ▼
update_games.py
    │
    ▼
commit game changes
    │
    ▼
score_week.py
    │
    ▼
commit scoring changes
    │
    ▼
aggregate_season.py
    │
    ▼
commit season changes
```

## Schedule Creation Workflow

`.github/workflows/create-week.yml` creates the next weekly schedule.

It runs Tuesday morning during the NFL season and can also be started manually.

The workflow:

1. Determines the highest existing `weekNN.json`.
2. Selects the next week number.
3. Stops after Week 18.
4. Runs `update_games.py`.
5. Stages the newly created weekly file.
6. Commits the schedule if a file was created or changed.
7. Pushes the commit.

The 2026 season is currently explicit in the workflow.

The workflow uses a scheduled UTC cron expression. The current Tuesday schedule corresponds to 8:00 AM Eastern while daylight saving time is active. DST handling can be revisited if exact local-time execution becomes important.

## Picks Import Workflow

`.github/workflows/import-picks.yml` is triggered when a weekly CSV is pushed under:

```text
data/2026/week*.csv
```

It can also be run manually.

For each matching CSV, the workflow:

1. Determines the week number from the filename.
2. Runs `import_picks.py`.
3. Updates the corresponding weekly JSON.
4. Deletes the successfully imported CSV.
5. Stages both changes.
6. Creates one import commit per week.
7. Pushes the result.

If the importer fails, the workflow stops before the commit.

The CSV therefore remains in the branch and the previous weekly JSON remains intact.

## Schedule-Aware Polling

`.github/workflows/poll-games.yml` runs every 15 minutes during broad NFL game windows.

The cron schedule intentionally provides broad coverage. `should_poll.py` makes the actual decision about whether ESPN needs to be queried.

This avoids repeatedly requesting ESPN data when no game is near kickoff or in progress.

### Polling Gate

For each game:

- A `live` game always requires polling.
- A `scheduled` game requires polling from 15 minutes before kickoff through six hours after its scheduled kickoff.
- A `final` game does not independently require polling.

In simplified form:

```text
scheduled:
    kickoff - 15 minutes
        through
    kickoff + 6 hours

live:
    always poll

final:
    do not poll
```

If any game requires polling, the current week is updated.

The `live` rule intentionally overrides the six-hour window so an unusually long or delayed game continues to update.

Broad workflow windows currently cover the normal Thursday-through-Monday NFL schedule, including Friday and Saturday games.

Unusual Tuesday or Wednesday games can currently be handled using `workflow_dispatch`.

## Polling Commit Sequence

When polling is required, the workflow executes transformations sequentially:

```text
update_games.py
score_week.py
aggregate_season.py
```

Each meaningful transformation receives its own Git commit.

For example:

```text
Update week 4 games
Score week 4
Update 2026 season standings
```

A transformation that produces no data change produces no commit.

The sequence is important:

```text
game state
    ↓
weekly scoring
    ↓
season aggregation
```

Any committed game state should therefore be followed by scoring against that same state.

Git identity is configured once near the beginning of the polling job so that the game, scoring, and season commit steps are independent of one another.

## Git as Operational History

Git history is part of the operational design.

Rather than combining an entire polling cycle into one opaque commit, meaningful state transitions are committed independently.

This provides:

- A readable history of automated changes.
- Easier debugging.
- Easier rollback.
- Clear separation between external game data, scoring, and season aggregation.

The GitHub Actions bot is used as the commit identity for automated changes.

## GitHub Actions Push Behavior

Automated commits use the repository's `GITHUB_TOKEN`.

Pushes made using the standard GitHub Actions token generally do not recursively trigger additional push workflows.

This prevents an automated import or game update from creating an unintended workflow loop.

The workflow itself is responsible for completing all required downstream transformations within its job.

## Manual Commands

The automation uses the same Python commands available locally.

### Create or Update Games

```bash
python scripts/update_games.py <season> <week>
```

Example:

```bash
python scripts/update_games.py 2026 2
```

### Import Picks

With:

```text
data/2026/week02.csv
```

run:

```bash
python scripts/import_picks.py 2026 2
```

The CSV is deleted after a successful import.

### Score a Week

```bash
python scripts/score_week.py 2026 2
```

### Rebuild Season Statistics

```bash
python scripts/aggregate_season.py 2026
```

### Check Polling

```bash
python scripts/should_poll.py 2026 2
```

Exit code:

```text
0 = polling required
1 = polling not required
```

Other non-zero exit codes represent errors.

These commands are primarily useful for development, testing, debugging, and recovery. GitHub Actions is the normal production execution environment.

## Atomic Writes

Scripts that modify JSON use atomic writes.

The intended pattern is:

1. Generate the complete new representation.
2. Write it to a temporary file.
3. Replace the destination only after the write succeeds.

A failed transformation should not leave a partially written JSON file.

## Reproducibility

Derived state should always be reproducible from its authoritative inputs.

Examples:

```text
games
    ← ESPN

players
    ← Numbers CSV

results
    ← games + players

season.json
    ← completed weekly results
```

The browser should not become an authoritative source for scoring data.

Likewise, season totals should never become the only surviving representation of weekly results.

## Frontend

The frontend is static:

```text
index.html
assets/style.css
assets/app.js
```

No frontend framework is required.

The browser loads weekly and season JSON directly from the repository's published static files.

### Mobile First

Phone usability is a primary design requirement.

The interface should avoid:

- Wide spreadsheet-style layouts.
- Horizontal scrolling.
- Requiring pinch-to-zoom.
- Dense tables that make it difficult to track a player.

Player information uses native expandable `<details>` elements.

The current responsive layout uses:

- One player-card column on phones.
- Two columns at wider viewport sizes.

## Player Pick Presentation

Individual pick state is derived in JavaScript.

Display rules:

```text
missing pick     → — N/P
pending game     → ⏳
NFL tie          → ➖
correct pick     → ✅
incorrect pick   → ❌
```

This information is not persisted in the weekly JSON because it is presentation state derived from authoritative game and pick data.

## Season Presentation

The season view reads `season.json`.

Display names can be resolved from weekly player data because the season aggregate intentionally uses stable player IDs rather than duplicating profile information.

Current frontend sorting is presentation-only:

1. Weekly wins descending.
2. Accuracy descending.
3. Wins descending.

This is not an official season-champion rule.

No official season champion rule has been established.

## Announcements

The frontend checks:

```text
assets/announcement-top.txt
assets/announcement-bottom.txt
```

Each file is fetched as plain text.

Whitespace is trimmed.

If the resulting text is empty, the corresponding announcement area remains hidden.

This keeps announcements simple and avoids requiring JSON or HTML changes for routine messages.

## Testing

The project uses `pytest`.

Tests cover domain behavior and script boundaries, including:

- ESPN normalization.
- Numbers import.
- Invalid picks.
- Explicit non-picks.
- Weekly scoring.
- NFL ties.
- Monday tiebreakers.
- Multiple Monday games.
- Weekly completion.
- Competition ranking.
- Split winners.
- Season aggregation.
- Polling decisions.
- Script ownership boundaries.
- Atomic update behavior.

Run:

```bash
pytest
```

## Static Type Checking

Run:

```bash
mypy src tests
```

## Linting

Run:

```bash
ruff check .
```

Production code should contain no `print()` calls.

Use:

- `logging` for operational messages.
- Exceptions for failure conditions.
- Exit codes where scripts need to communicate status to automation.

## Development Installation

The project uses a `src/` package layout.

The reliable development installation is currently:

```bash
python -m pip install ".[dev]"
```

If only the runtime package is needed:

```bash
python -m pip install .
```

Source changes may require reinstalling the package before running commands against the installed version.

Do not rely on:

```text
PYTHONPATH=src
```

as part of the normal development or production workflow.

## Development Approach

Use domain-driven boundaries where they provide value without overengineering the project.

Testing follows a relaxed TDD cadence:

1. Add a meaningful batch of tests.
2. Implement the coherent behavior.
3. Run tests.
4. Run mypy.
5. Run ruff.
6. Refactor while keeping the suite green.

Prefer explicit, boring, maintainable code.

The project is small enough that clarity is more valuable than abstraction for its own sake.

## Pre-Commit Check

Before committing Python changes:

```bash
pytest
mypy src tests
ruff check .
```

For workflow changes, also review:

```bash
git diff --check
git diff
```

When practical, test GitHub Actions behavior on a disposable branch before merging workflow changes to `main`.

## License

PBJ Dashboard is licensed under the Apache License 2.0.