# NEWS

A dated changelog for the Euro 2024 Schedule Viewer. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-07-28

First release. Built from the sibling
[`world-cup-viewer`](https://github.com/ismayc/world-cup-viewer), re-pointed at a
completed edition so the next European Championship can slot straight in.

### Data

- **Euro 2024 schedule and results.** `scripts/fetch-tournament.mjs` generates
  `src/data/{matches,teams,venues}.js` from ESPN's `uefa.euro` scoreboard
  (structure, event ids, kickoffs, scores) merged with OpenFootball's
  `euro.json` (goal scorers) — and fails the build if the two disagree on any
  score. All 51 matches, 24 teams, 10 German venues.
- **Kickoffs stored in CEST (`+02:00`)**, the offset UEFA published them in.
- **Corrected two wrong ESPN venue cities by hand** in the generator's
  `VENUE_META`: Signal Iduna Park was filed under "Aue" and Volksparkstadion
  under "Hamburg Norderstedt".
- **`test/fixtures/official-kickoffs.js` is generated from OpenFootball only**,
  deliberately a different source from the schedule generator's, so the
  comparison between them is a real cross-check rather than a tautology.

### Format changes from the World Cup

- **Six groups of four, four best thirds** (was twelve groups and eight thirds).
  `ADVANCING_THIRDS` in `utils/qualification.js` is the single source of truth
  the clinch, elimination and projection engines all read.
- **UEFA tie-breakers** replace FIFA's: points → head-to-head points/GD/goals
  (re-applied to any subset still level) → overall GD → overall goals →
  disciplinary points → European Qualifiers ranking.
- **`src/data/qualifierRanking.js`** replaces `fifaRanking.js` — the 20 teams
  that qualified through the group stage, with their seeding-pot positions.
  Germany (hosts) and the three play-off winners have no position and fall
  through to a stable alphabetical fallback; it never triggers for 2024.
- **`src/data/thirdPlaceCombinations.js`** is UEFA's 15-row four-of-six table
  (was FIFA's 495-row one). Cross-checked two ways: each column's reachable
  letters match the "3rd Group X/Y/Z" placeholder its host was drawn against, and
  the `CDEF` row reproduces the four ties actually played.
- **No third-place play-off** — the Euro dropped it after 1980 — so it is gone
  from the bracket, radial view and stage list.
- **`src/utils/slots.js`** is new: `ENTRY_ROUND`, `slotLabels()`,
  `entryMatches()` and the slot-label regexes, built from this edition's actual
  group letters. Knockout records keep the real teams in `t1`/`t2` **and** the
  drawn placeholders in `label1`/`label2`, so a finished edition still knows each
  slot's provenance; anything reading slot labels goes through `slotLabels()`.

### Removed

- **The live-tournament monitoring subsystem** (11 scripts, 7 test files, 3
  workflows: FIFA schedule-drift checking, OpenFootball score push-back,
  feed-freshness, `cuptxt`, outlook snapshots). It validates a movable schedule
  against a governing body's live calendar API — there is no UEFA equivalent, and
  a completed edition cannot drift.

### Fixed (bugs the ported test suite caught)

- **`utils/outlookEnum.js` never filled a single third-place slot.** It sliced
  the best *eight* thirds out of a *twelve*-element array, so the combination-table
  key was six letters long, matched nothing, and every "winner v third" slot in
  the R16 Outlook came back empty. Now driven by `ADVANCING_THIRDS` and
  `GROUPS.length`. Verified against an independent brute-force enumerator across
  three open-group configurations.
- **`components/Standings.jsx` marked all six thirds as on-the-bubble** — the
  best-third table hard-coded `i < 8`. Now `i < ADVANCING_THIRDS`.
- **`components/Filters.jsx` offered filter options that matched nothing** — the
  host-country dropdown listed USA/Canada/Mexico and the region dropdown
  Western/Central/Eastern. Both are now derived from the venue data itself, so
  they cannot desync from the grounds in use.
- **`utils/ics.js` identified every downloaded calendar as `World Cup 2026
  Viewer`** in its `PRODID`. Fixed, and pinned by a test.
- **`netlify/functions/calendar.js` was missing entirely** despite `netlify.toml`
  routing `/calendar.ics` to it. Ported and adapted: the Euro feed uses plural
  round names, carries no match numbers, and states kickoffs without a UTC offset
  (read as CEST).
- **`utils/outlookEnum.js` parsed slot labels with its own `[A-L]` regexes**
  while importing the shared ones and never using them.
- **`utils/search.js` carried a dead USA-synonym branch.** Replaced with host
  synonyms that mean something here (`deutschland`, `ger`, `de`).

### Identity

- **Icon**: ⚽ on a navy saltire (`#0a1430` ground, `#16255c` saltire), nodding to
  the Euro 2028 hosts. Rasterised with headless Chrome — ImageMagick silently
  drops SVG text and paints gradient fills black.
- **Accent** `#4f8cff` (5.65:1 on the page background, 4.70:1 on cards);
  `#1f5bd7` in the light theme.

### Tests

- **86 files, 822 tests, all green**; `npm run coverage:badge` reports 100%,
  with the same per-file residue as `world-cup-viewer` (v8 counts the same
  defensive paths in `App.jsx`, `PlayerDetail.jsx` and the ESPN stats services).
- The ported suite was rebuilt onto the real Euro topology throughout: real Group
  A fixtures, real match numbers (R16 37–44, QF 45–48, SF 49–50, Final 51), real
  venues and real teams. Several inherited tests were asserting against World Cup
  data that no longer existed and so were passing vacuously.
- **Feed team-name fixtures re-captured** from both live feeds across the whole
  tournament. ESPN names all 24 sides exactly as we do; TheSportsDB differs only
  on "Czech Republic" and "Turkey", which `normalizeTeam` already handles — so
  both alias tables are now empty, and a test asserts no table carries an entry
  that never appears in its feed.
- **App-level tests run against a pre-tournament board** (the schedule module is
  mocked to strip results). With every match scored, the live overlay always
  defers to the recorded score, which would leave the whole live subsystem — and
  the group-stage tools — unreachable from `<App/>`.

### Published

- **Repo created** at [`ismayc/football-euros-viewer`](https://github.com/ismayc/football-euros-viewer)
  (public) and pushed; CI's test & build job green on the first run.
- **Live on GitHub Pages**: https://ismayc.github.io/football-euros-viewer/
  (Pages enabled with the Actions build type).
- **Registered in the family hub**, commented out in `src/data/viewers.js`
  alongside the World Cup — both cover a completed tournament whose next edition
  is years off, so an enabled tile would read "Offseason" until then. Hub icon
  added at `public/icons/euros.png`.
- **Netlify deploy is still red**, and will stay red until `NETLIFY_AUTH_TOKEN`
  and `NETLIFY_SITE_ID` are set as repo secrets (the site also has to be created
  in the Netlify account first). Nothing else in CI depends on it.

### Verified

- The engines reconstruct the real 2024 tournament from the committed group
  results alone: Group E with all four teams on 4 points orders ROU/BEL/SVK/UKR
  correctly, and the third-place table sends NED/GEO/SVK/SVN into exactly the real
  Round-of-16 ties via UEFA's official combination row (not the fallback).
- Bracket, Radial and Groups views checked in a real browser.
