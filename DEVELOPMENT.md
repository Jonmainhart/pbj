## Data ownership

PBJ Dashboard treats imported source data and derived data as separate concerns.

Each workflow owns only the portion of the data it is responsible for:

- `update_games.py`
  - owns weekly `games`
  - establishes `lock_time` when the weekly schedule is first created
  - preserves `players`, `results`, and existing `lock_time`

- `import_picks.py`
  - owns weekly `players`
  - preserves `games`, `results`, and shared metadata

- `score_week.py`
  - owns weekly `results`
  - derives weekly player statistics and weekly winner information from
    canonical `games` and `players`
  - preserves source data

- `aggregate_season.py`
  - owns `season.json`
  - derives season statistics from completed weekly results

- `app.js`
  - owns presentation-only derivations
  - may determine whether an individual displayed pick was correct,
    incorrect, tied, pending, or missing by comparing canonical picks
    against game data
  - must not be the authoritative implementation of pool scoring rules

Source data should remain independent. Correcting commissioner picks must not
overwrite ESPN game data, and refreshing ESPN game data must not overwrite
commissioner picks.

Derived data should be reproducible from its source data.


## Weekly scoring

Weekly scoring is performed after game data has been updated.

Only games with `status == "final"` affect player statistics.

For each player:

- A correct pick counts as one win.
- An incorrect pick counts as one loss.
- A final NFL game that ends in a tie counts as one tie.
- Tied NFL games do not count as either wins or losses.
- A missing pick, including an imported `N/P`, does not count as a win,
  loss, or tie.
- Accuracy is:

      wins / (wins + losses)

- Ties are excluded from the accuracy denominator.
- If a player has no wins or losses, accuracy is `null`.

Individual pick correctness is not persisted in weekly JSON. It is trivial
derived presentation data and may be calculated by `app.js` when rendering
the dashboard.


## Weekly completion

A football week is complete only when every scheduled game in the week's
normalized game data has `status == "final"`.

Before the week is complete:

- final games may contribute to current wins, losses, ties, and accuracy
- `weekly_winners` is empty
- `weekly_winner` is `false` for every player
- final weekly ranking is not assigned
- Monday tiebreaker information remains unavailable until all Monday games
  are final

Postponed or rescheduled games therefore keep the football week incomplete.

Cancelled games are outside the initial project scope.


## Monday tiebreaker

The weekly tiebreaker is the player's prediction for the combined final
score of all Monday games.

Monday games are determined from their scheduled timestamps using the NFL
week's U.S. Eastern local date.

If more than one game is played Monday:

    monday_total =
        sum(home_score + away_score for every Monday game)

`monday_total` remains `null` until all Monday games are final.

For each player:

    tiebreaker_distance =
        abs(player.tiebreaker - monday_total)

`tiebreaker_distance` remains `null` until `monday_total` is known.


## Weekly winner

The weekly winner is determined only after the entire football week is
complete.

Players are first compared by number of wins.

If multiple players share the highest number of wins, the player with the
smallest Monday `tiebreaker_distance` wins.

If multiple players are still tied after the tiebreaker, all remaining
players are weekly winners and split the weekly pool.

Each player in a split receives one weekly win for season aggregation.

Weekly winnings and pot amounts are private and are not stored in the
public dashboard data.


## Weekly results

`score_week.py` writes derived results into the weekly JSON file.

Example:

```json
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
```

Weekly results are derived data. Running `score_week.py` again replaces only
`results` and does not modify `games` or `players`.


## Season aggregation

Season statistics are stored separately in:

    data/<season>/season.json

`aggregate_season.py` derives season statistics from scored weekly files.

The season file is an aggregate/cache. It does not duplicate individual
picks or game results.

Season player statistics include:

- `weeks_played`
- `wins`
- `losses`
- `ties`
- `accuracy`
- `weekly_wins`

Overall season accuracy is calculated from cumulative totals:

    total_wins / (total_wins + total_losses)

rather than averaging weekly accuracy percentages.

A split weekly victory counts as one `weekly_win` for every player included
in the split.

The aggregator must be deterministic and safe to rerun. It rebuilds season
statistics from weekly results rather than incrementally adding values from
a previous `season.json`. This prevents duplicate statistics when a corrected
week is rescored.


## End-of-week workflow

The normal completed-week workflow is:

1. Refresh ESPN game data:

       python scripts/update_games.py <season> <week>

2. Score the completed week:

       python scripts/score_week.py <season> <week>

3. Rebuild season aggregates:

       python scripts/aggregate_season.py <season>

These operations are intentionally separate and may later be performed by
GitHub Actions.


## Development order

1. Normalized weekly JSON schema
2. ESPN provider/adapter
3. Numbers CSV importer
4. Weekly JSON generation
5. Weekly scoring domain logic
6. Comprehensive weekly scoring tests
7. `score_week.py`
8. Season aggregation domain logic
9. `aggregate_season.py`
10. Static dashboard
11. GitHub Actions polling and end-of-week automation
12. Validation, manual refresh, and polish