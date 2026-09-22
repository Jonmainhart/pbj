# PBJ Dashboard Development Notes

PBJ Dashboard is a static dashboard for a weekly football pool.

The commissioner's spreadsheet remains the source for player picks. PBJ
Dashboard consumes CSV exports, obtains NFL data from ESPN, derives weekly and
season results, and publishes the generated data through a static frontend.

## Design Principles

- Preserve the commissioner's spreadsheet workflow.
- Keep hosting and infrastructure simple.
- Prioritize mobile usability.
- Keep authoritative and derived data separate.
- Isolate external services behind provider interfaces.
- Make derived data reproducible.
- Prefer simple designs that are easy to change.

## Architecture

The primary data flow is:

    Spreadsheet → CSV → player data
    ESPN → game data
    Games + players → weekly results → season results

GitHub Actions performs routine production processing. The browser reads
generated JSON and handles presentation only.

## Data

Weekly data is stored in `data/<season>/weekNN.json` and contains:

- `season`
- `week`
- `lock_time`
- `games`
- `players`
- `results`

Season statistics are stored in `data/<season>/season.json`.

### Games

Games use the ESPN event ID as their stable identifier and retain only the
schedule, team, status, and score information PBJ Dashboard needs.

Normalized statuses are `scheduled`, `live`, and `final`.

Game winners are derived from final scores rather than persisted separately.
A score of zero is valid; status determines whether a score is meaningful.

### Players

Players have a stable ID, display name, optional nickname, picks, and a
tiebreaker prediction.

Picks are keyed by game ID and contain the selected team's abbreviation.
An absent game represents N/P.

## CSV Import

The importer matches matchup columns against the normalized NFL schedule and
normalizes known team-abbreviation aliases.

Import rules:

- Picks must match one of the teams playing the game.
- Blank picks are errors.
- Explicit `N/P` is accepted, omitted from normalized picks, and produces a warning.
- Spreadsheet scoring or `CORRECT` data is ignored.

A successful import atomically replaces player data. The week is then rescored
and season statistics are rebuilt so corrections propagate immediately.

A failed import leaves existing weekly data unchanged and preserves the CSV for
correction.

## Data Ownership

Each transformation owns part of the generated data:

- `update_games.py` — games and initial lock time
- `import_picks.py` — players
- `score_week.py` — weekly results
- `aggregate_season.py` — `season.json`
- `app.js` — presentation only

Each transformation must preserve data owned by the others.

Per-pick correctness is not persisted; it is derived from the player's pick and
the authoritative game result.

## Lock Time

Picks lock one hour before the scheduled kickoff of the first game of the week.

The lock time is established when the schedule is created and stored in weekly
data. Later schedule changes do not silently move it.

## Weekly Scoring

Only final games affect player statistics.

For a normal final game:

- Correct pick → win
- Incorrect pick → loss
- N/P → loss and missed pick

For an NFL tie:

- A player who made a pick receives a tie.
- N/P receives a loss and missed pick.

Scheduled and live games do not affect statistics.

`missed_picks` is a subset of losses, not an additional scoring outcome.

### Accuracy

Accuracy is:

    wins / (wins + losses)

NFL ties are excluded. N/P losses are included. Accuracy is null when a player
has no wins or losses.

## Weekly Completion and Ranking

A week is complete only when every game is final.

Until then:

- Final games contribute current statistics.
- Scheduled and live games do not.
- Weekly ranks and winners are unavailable.

Monday games are determined using `America/New_York`. If multiple Monday games
are played, their scores are combined into one Monday total. The total is
unavailable until every Monday game is final.

A player's tiebreaker distance is the absolute difference between their
prediction and the final Monday total.

Completed weeks are ranked by:

1. Most wins.
2. Smallest tiebreaker distance.

Equal wins and distance share a rank. Competition ranking is used, such as
`1, 2, 2, 4`.

Every player ranked first is a weekly winner and receives one weekly win for
season tracking.

Every player sharing the lowest final weekly rank receives a last-place finish.

## Season Aggregation

Completed weeks contribute:

- Weeks played
- Wins
- Losses
- Ties
- Missed picks
- Accuracy
- Weekly wins
- Last-place finishes

`season.json` is a deterministic derived cache. It is rebuilt from completed
weekly results rather than incrementally patched.

Corrections to an earlier week therefore require rescoring that week and
rebuilding the season.

## ESPN Provider

ESPN access is isolated behind the provider layer.

The provider converts ESPN-specific responses into PBJ domain objects. Scoring,
season aggregation, and presentation should not depend directly on ESPN
response structures.

## Automation

Production processing uses:

- `create-week.yml`
- `import-picks.yml`
- `poll-games.yml`

The normal lifecycle is:

1. Create the weekly schedule.
2. Import the commissioner's CSV.
3. Update game data around NFL game times.
4. Score changed weekly data.
5. Rebuild season statistics.

Meaningful generated-data changes are committed by the workflows.

The 2026 season is currently explicit in the workflows.

### Polling

`poll-games.yml` is triggered every five minutes by an external scheduler using
GitHub's `workflow_dispatch` event. PBJ Dashboard then determines whether game
data actually needs to be refreshed.

Polling is required when:

- A scheduled game is between 15 minutes before and six hours after kickoff.
- Any game is live.

Final games do not independently require polling.

The active week is the earliest weekly file containing an unfinished game.
This prevents a future weekly file from blocking updates to an earlier
unfinished week.

Manual workflow dispatch can still be used when needed.

## Frontend

The frontend consists of `index.html`, `assets/style.css`, and native JavaScript
modules under `assets/`, with no frontend framework or build step.

Phone usability is the primary design requirement.

Player cards show compact weekly information and expand to show detailed picks.
Presentation state is derived in JavaScript:

- Scheduled pick → `⏳`
- Live pick → `🟢`
- Final correct pick → `✅`
- Final incorrect pick → `❌`
- NFL tie → `➖`
- Scheduled/live N/P → `⏳ N/P`
- Final N/P → `❌ N/P`

Scheduled games show localized kickoff times. Live and final games show scores.

During an incomplete week, the frontend derives mathematical elimination from
the current wins, remaining games, and player picks. A player remains in
contention if any possible combination of remaining game winners allows that
player to finish tied for the most wins.

Players still in contention are displayed first, followed by an `ELIMINATED`
divider and the remaining players. Within each group, players are sorted by
current wins.

Elimination is presentation-only state. It is not persisted and does not
participate in official scoring or tiebreaker calculations. Once the week is
complete, `weekly_rank` is authoritative.

Completed weekly winners are marked with `🏆`; players sharing the lowest final
rank are marked with `💩`.

The season view uses `👑` for the current first-place player, `🏆` for weekly
win counts, and `💩` for nonzero last-place-finish counts.

Python scoring remains authoritative. JavaScript presents the underlying state.

The season view is presentation-sorted by weekly wins, accuracy, then wins.
This is not an official season-champion rule.

## Announcements

Optional announcements are read from:

- `assets/announcement-top.txt`
- `assets/announcement-bottom.txt`

Empty files remain hidden. Existing line breaks are preserved.

## Development

Install or reinstall the project and development dependencies with:

    python -m pip install ".[dev]"

The project uses a `src/` layout and a non-editable install. Reinstall after
source changes when testing the installed package.

Do not use `PYTHONPATH=src` as part of the normal workflow.

### Manual Commands

    python scripts/update_games.py <season> <week>
    python scripts/import_picks.py <season> <week>
    python scripts/score_week.py <season> <week>
    python scripts/aggregate_season.py <season>
    python scripts/should_poll.py <season> <week>

For `should_poll.py`, exit code 0 means polling is required and exit code 1
means it is not. Other nonzero codes indicate errors.

### Testing and Quality

Before committing Python changes:

    pytest
    mypy src tests
    ruff check .

Coverage can be checked with:

    pytest --cov=pbj

Production code should contain no `print()` calls. Use logging for operational
messages and exceptions for failures.

Development follows a relaxed TDD cadence: add meaningful tests, implement the
behavior, run the checks, and refactor while keeping the suite green.

## License

PBJ Dashboard is licensed under the Apache License 2.0.