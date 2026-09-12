# PBJ Dashboard

PBJ Dashboard is a lightweight, static dashboard for tracking a weekly NFL pick'em pool.

It takes the commissioner's existing Numbers spreadsheet, combines the weekly picks with NFL game results, calculates weekly and season standings, and publishes the results through GitHub Pages.

The goal is simple:

> **Keep the commissioner's existing workflow intact while making the pool results easier to track and share.**

## How It Works

The commissioner continues to maintain the pool in Apple Numbers just as she always has.

Each week:

```text
Apple Numbers
     │
     │ CSV export
     ▼
Local Python Import
     │
     │ validate + normalize
     ▼
Weekly JSON
     │
     ├──────────────► GitHub
     │
     ▼
Scoring Engine
     │
     ▼
Weekly Results
     │
     ▼
GitHub Pages Dashboard
```

NFL game schedules and results are initially provided by the ESPN public scoreboard API. ESPN-specific code is isolated so another provider can be substituted later if necessary.

## Weekly Workflow

### Before the Week

1. The commissioner prepares the weekly picks in Numbers.
2. The Numbers spreadsheet is exported to CSV.
3. The local Python import process:

   * Reads the CSV.
   * Identifies players and picks.
   * Imports Monday-game tiebreaker predictions.
   * Matches the spreadsheet's games to the NFL schedule.
   * Validates the imported data.
4. The normalized weekly data is written to:

```text
data/<season>/weekNN.json
```

5. The validated weekly data is committed and pushed to GitHub.

Picks lock one hour before the kickoff of the first game of the football week.

The application does not replace Numbers and does not require the commissioner to enter picks through a website.

### During the Week

GitHub Actions periodically retrieves updated NFL game information.

Polling becomes more frequent around game time and while games are being played. Final games no longer need to be repeatedly updated.

The game provider data is normalized before it reaches the rest of the application.

### After Games Finish

The scoring engine calculates player results from the picks and final game scores.

Only games with a `final` status affect scoring.

* A correct pick is a win.
* An incorrect pick is a loss.
* A tied NFL game is neither a win nor a loss.
* Scheduled and live games do not affect the current accuracy calculation.
* Tied games are excluded from the accuracy denominator.

Accuracy is calculated as:

```text
wins / (wins + losses)
```

The weekly winner is determined by the highest number of wins.

If players are tied, the Monday-game tiebreaker is used. When there are multiple Monday games, their final scores are combined into a single total.

If the tiebreaker is also tied, the weekly result is split.

A weekly winner is not declared until every scheduled game for the week has reached a final result. Until then, the dashboard may display provisional standings.

### Season Tracking

Completed weekly results are used to calculate season-long statistics, including:

* Weeks played
* Total wins
* Total losses
* Total ties
* Overall accuracy
* Weekly wins
* Weekly winner count

There is no playoff pool.

## Privacy

The public dashboard does **not** publish individual winnings, pot amounts, or other private financial information.

The public data only needs to identify weekly winner(s) and the number of players participating that week.

Any separate winnings calculation remains private.

## Technology

PBJ Dashboard is intentionally simple:

* Python for local data processing and scoring
* JSON for normalized application data
* ESPN for initial NFL game data
* GitHub for source and data storage
* GitHub Actions for scheduled game updates
* GitHub Pages for public hosting
* HTML, CSS, and JavaScript for the dashboard

There is no database server, user account system, authentication system, or online pick submission system.

## Development

The detailed application design, data model, development milestones, testing requirements, and implementation decisions are documented in [`README.dev`](README.dev).

`README.dev` is the primary development reference for contributors.

The project follows a **Document Driven Design** and **Test Driven Development** approach. Changes to the scoring rules and data model should be documented and tested before expanding the application.

## License

PBJ Dashboard is licensed under the [Apache License, Version 2.0](LICENSE).

Copyright © 2026 PBJ Dashboard contributors.
