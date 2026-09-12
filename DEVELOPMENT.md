# PBJ Dashboard Development Notes

PBJ Dashboard is a small, static dashboard for the weekly football pool.

The commissioner's spreadsheet remains the source for player picks. PBJ
Dashboard consumes a CSV export and adds automated game updates, scoring,
season statistics, and a mobile-friendly presentation layer.

## Design Principles

- Preserve the commissioner's spreadsheet workflow.
- Keep hosting free and simple with GitHub Pages.
- Make the dashboard excellent on phones.
- Avoid accounts, authentication, databases, and unnecessary infrastructure.
- Isolate external services behind provider interfaces.
- Keep authoritative and derived data clearly separated.
- Make derived data reproducible.
- Prefer simple, maintainable solutions.

## Architecture

The primary data flow is:

Spreadsheet → CSV → player data

ESPN → game data

Games + players → weekly results → season results

GitHub Actions performs routine production processing. The browser reads the
generated JSON and handles presentation only.

## Data

Weekly data is stored in `data/<season>/weekNN.json`.

Each weekly file contains:

- `season`
- `week`
- `lock_time`
- `games`
- `players`
- `results`

Season statistics are stored in `data/<season>/season.json`.

### Games

Games use the ESPN event ID as their stable identifier.

PBJ Dashboard retains only the game information it needs, including teams,
scheduled time, status, and scores.

Normalized game statuses are:

- `scheduled`
- `live`
- `final`

PBJ Dashboard does not persist a provider-supplied winner. The winner is
derived from final scores.

A score of zero is valid. Game status determines whether a score is
meaningful.

### Players

Players have a stable ID, display name, optional nickname, picks, and a
tiebreaker prediction.

Picks are keyed by game ID and contain the selected team's abbreviation.

The absence of a game from a player's picks represents N/P.

## CSV Import

The CSV contains one column per matchup and one row per player.

The importer matches matchup columns against the normalized NFL schedule and
normalizes known team-abbreviation aliases.

Import rules:

- A pick must match one of the teams playing that game.
- A blank pick is an error.
- Explicit `N/P` is accepted and omitted from the normalized picks.
- N/P produces a warning.
- Spreadsheet scoring or `CORRECT` data is ignored.

On successful import, player data is replaced atomically and the imported CSV
is deleted.

On failure, the existing weekly data remains intact and the CSV remains
available for correction.

## Data Ownership

Each transformation owns a specific part of the generated data.

`update_games.py`
: Owns games and establishes the initial lock time.

`import_picks.py`
: Owns players.

`score_week.py`
: Owns weekly results.

`aggregate_season.py`
: Owns `season.json`.

`app.js`
: Owns presentation only.

Each transformation must preserve data owned by the others.

Per-pick correctness is not persisted. It can be derived from the player's
pick and authoritative game result.

## Lock Time

Picks lock one hour before the scheduled kickoff of the first game of the
football week.

The lock time is established when the weekly schedule is created and stored
in the weekly data. Later schedule changes do not silently move the established
pool lock time.

## Weekly Scoring

Only final games affect player statistics.

For a normal final game:

- Correct pick → win.
- Incorrect pick → loss.
- N/P → loss and missed pick.

For an NFL tie:

- A player who made a pick receives a tie.
- N/P receives a loss and missed pick.

Scheduled and live games do not yet affect statistics, including N/Ps.

`missed_picks` is a subset of losses. It is tracked separately for visibility
but is not an additional scoring outcome.

### Accuracy

Accuracy is wins divided by wins plus losses.

NFL ties are excluded from the denominator.

N/P losses are included in the denominator.

If a player has no wins or losses, accuracy is null.

## Weekly Completion

A week is complete only when every game is final.

Before completion:

- Final games contribute current statistics.
- Scheduled and live games do not.
- Weekly winners are not declared.
- Weekly ranks are unavailable.
- The Monday tiebreaker is unavailable until all Monday games are final.

A postponed or rescheduled game therefore keeps the week incomplete.

## Monday Tiebreaker

Monday games are determined using the kickoff's local calendar date in
`America/New_York`.

If multiple Monday games are played, the actual Monday total is the combined
score of all Monday games.

The total is unavailable until every Monday game is final.

A player's tiebreaker distance is the absolute difference between their
prediction and the actual Monday total.

## Weekly Winner

Weekly winners are determined only after the entire week is complete.

Ranking is:

1. Most wins.
2. Smallest Monday tiebreaker distance.
3. Equal wins and distance result in split winners.

Competition ranking is used.

Every split winner receives one weekly win for season tracking.

Winnings and pot amounts are private and are not stored in public dashboard
data.

## Weekly Results

Weekly results contain:

- Monday total
- Player count
- Weekly winner IDs
- Wins
- Losses
- Ties
- Missed picks
- Accuracy
- Tiebreaker distance
- Weekly rank
- Weekly winner status

Weekly results are derived data and may be regenerated from games and players.

## Season Aggregation

Season statistics track:

- Weeks played
- Wins
- Losses
- Ties
- Missed picks
- Accuracy
- Weekly wins

Season accuracy uses cumulative wins and losses. N/P losses therefore affect
season accuracy normally.

Missed picks are summed separately.

Only completed, scored weeks contribute to season statistics.

`season.json` is a derived cache. It is rebuilt deterministically from weekly
results rather than incrementally patched.

If an earlier week changes, rescore that week and rebuild the season.

## ESPN Provider

ESPN access is isolated behind the provider layer.

The provider converts ESPN-specific responses into PBJ domain objects. Other
parts of the application should not depend directly on ESPN response
structures.

This boundary allows the provider to be replaced without changing scoring or
season logic.

## Automation

Routine production processing uses:

- `create-week.yml`
- `import-picks.yml`
- `poll-games.yml`

The normal lifecycle is:

1. Create the weekly schedule.
2. Import the commissioner's CSV.
3. Poll ESPN around game times.
4. Update game data.
5. Score the week.
6. Rebuild season statistics.

Each meaningful transformation receives its own Git commit. A transformation
that produces no change produces no commit.

The 2026 season is currently explicit in the workflows.

### Schedule Creation

The schedule workflow runs Tuesday morning and can also be started manually.

It creates the next regular-season week and stops after Week 18.

### Pick Import

Pushing a matching weekly CSV triggers the import workflow.

A successful import updates the weekly player data, removes the CSV, and
commits the result.

A failed import does not commit partial data.

### Schedule-Aware Polling

The polling workflow runs during broad NFL game windows.

ESPN polling is required when:

- A scheduled game is between 15 minutes before and six hours after kickoff.
- Any game is live.

Final games do not independently require polling.

The live-game rule intentionally overrides the six-hour window.

Manual workflow dispatch can handle unusual game schedules.

### Known Polling Limitation

The current workflow selects the active week using the highest existing weekly
file.

Creating a future week's file too early can therefore prevent an unfinished
earlier week from being selected for polling.

Active-week selection should eventually be based on game schedule and status
rather than the highest week number.

## Frontend

The frontend consists of `index.html`, `assets/style.css`, and
`assets/app.js`.

It uses no frontend framework.

Phone usability is a primary design requirement. Avoid wide tables,
horizontal scrolling, pinch-to-zoom requirements, and dense spreadsheet-style
layouts.

Players appear as compact cards. Selecting a player opens a raised card with
detailed statistics and picks.

Individual pick presentation is derived in JavaScript:

- N/P on a scheduled or live game → pending N/P.
- N/P on a final game → incorrect N/P.
- Pending pick → pending.
- NFL tie → tie.
- Correct pick → correct.
- Incorrect pick → incorrect.

Python scoring remains authoritative. JavaScript only presents the underlying
state.

The season view is presentation-sorted by weekly wins, accuracy, then wins.
This is not an official season-champion rule.

## Announcements

Optional announcements are read from:

- `assets/announcement-top.txt`
- `assets/announcement-bottom.txt`

Empty announcement files remain hidden.

## Reproducibility

Authoritative inputs are:

- ESPN for game data.
- CSV for player picks.

Weekly results are derived from games and players.

Season results are derived from completed weekly results.

Derived JSON should always be reproducible from those inputs.

Scripts that modify JSON use atomic writes so failed transformations do not
leave partially written files.

## Development

Install development dependencies with:

    python -m pip install ".[dev]"

The project uses a `src/` package layout. Source changes may require
reinstalling the package before running against the installed version.

Do not use `PYTHONPATH=src` as part of the normal development or production
workflow.

### Manual Commands

Create or update games:

    python scripts/update_games.py <season> <week>

Import picks:

    python scripts/import_picks.py <season> <week>

Score a week:

    python scripts/score_week.py <season> <week>

Rebuild season statistics:

    python scripts/aggregate_season.py <season>

Check whether polling is required:

    python scripts/should_poll.py <season> <week>

For `should_poll.py`, exit code 0 means polling is required and exit code 1
means it is not required. Other non-zero codes indicate errors.

GitHub Actions is the normal production execution environment.

## Testing and Quality

The project uses pytest, mypy, and Ruff.

Before committing Python changes:

    pytest
    mypy src tests
    ruff check .

Production code should contain no `print()` calls. Use logging for operational
messages and exceptions for failures.

Testing follows a relaxed TDD cadence:

1. Add meaningful tests.
2. Implement the behavior.
3. Run the tests and static checks.
4. Refactor while keeping the suite green.

Prefer explicit, boring, maintainable code.

## License

PBJ Dashboard is licensed under the Apache License 2.0.