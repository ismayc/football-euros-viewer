# NEWS

A dated changelog for the Euro 2024 Schedule Viewer. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-29

- **Fixed: the Calendar modal offered "All 104 matches".** 104 is the World Cup
  2026 total; Euro 2024 has 51. This was the same World Cup constant that produced
  the champion-banner bug above, surviving in a second file. A test asserted the
  wrong label, so it was covered rather than caught.
- **Fixed: live scores could not load at all.** The browser code called
  `site.api.espn.com`, which now 403s any request with a browser User-Agent and
  returns no CORS headers with it. Moved to `site.web.api`, which serves the
  identical routes.
- **Fixed: the champion banner never appeared.** Spain won Euro 2024 and the app
  never said so. `App.jsx` looked for the Final as `m.num === 104`, the number of
  the World Cup 2026 Final in the sibling repo this one was scaffolded from. Euro
  2024 ends at match 51, so the lookup found nothing and the banner silently
  rendered as nothing. It now reads the Final from `BRACKET.final[0]`, the same way
  the Women's World Cup and Copa América siblings already did.
- The existing `champion-banner` test could not have caught this: it renders the
  component directly with a fabricated match, so it only ever proved the component
  works. A new `champion-wiring` test renders the real App against the real
  committed board and asserts Spain is crowned, and it was confirmed to fail
  against the old hardcoded 104.
- Rewrote the repo's `verify` skill, which was a byte-identical copy of the World
  Cup viewer's and described that app instead of this one.
- **Repo-level guards now run in the test suite.** New `test/guards.test.js`, ported from
  the FIBA viewer, which was the only repo that had one. It pins the invariants that have
  already broken a viewer in this family. The ESPN host must be `site.web.api` everywhere it
  appears: `site.api` serves the same routes but 403s on a browser User-Agent with no CORS
  headers, so it reads as healthy from curl while every deployed page loses live scores. The
  data scripts must import only Node built-ins and in-repo source, because they run in CI
  with no `npm install` of the app dependencies. Every localStorage key must carry this
  app's `euros:` prefix and never a sibling's, because the hub and all eleven viewers are
  served from one origin and therefore share localStorage. Finally, the generated data files
  must keep their do-not-edit banner, since a hand edit to one is silently reverted by the
  next refresh run. Each guard was checked by reintroducing the bug it describes and
  confirming it fails.
- **CI now uses a per-ref concurrency group, with a repo-wide lock only on the Pages
  deploy.** This workflow had no concurrency control at all, so two pushes in quick
  succession could run their Pages deploys against each other. The naive fix, one static
  group for the whole workflow, is worse: GitHub keeps one running plus one pending run
  per group and each new arrival cancels the pending one, so a busy PR branch starves
  main's CI and its deploy. That is what happened to the NBA viewer on August 13, 2026.
  The group is now `ci-${{ github.ref }}`, giving each branch its own slot, and the
  deploy job alone carries a job-level `pages` group so Pages publishes stay serialized.
  The eight sibling repos and the workflow template in `sports-viewer-meta` already had
  this shape; these four viewers were the last without it.
- **Fixed World Cup details left in the TheSportsDB adapter's comments.** The header
  claimed the feed "carries the 2026 schedule", and the worked `strTimestamp` example was
  the World Cup 2026 opener. Both came from the viewer this file was scaffolded from. The
  example is now Germany vs Scotland, the real Euro 2024 opener, checked against this
  repo's own committed kickoff. The note about the eventsSEASON endpoint stalling is real
  but was observed in the World Cup viewer, and now says so instead of implying it was
  seen here. Comments only; no code changed.
- **Fixed a racy assertion in the StatsView override test.** The test waits for a player's
  name, then reads his assists and minutes cells. The name appears as soon as the aggregate
  fetch resolves, but the values under test come from a second fetch that lands a render
  later, so on a loaded runner the assertion read the pre-override numbers. It failed once
  in three full local runs today. The assertion now waits for the overridden values instead
  of the name. Confirmed with teeth: with the override deliberately delayed the old
  assertion fails and the new one passes.

## 2026-08-16

- **The data scripts now fetch from `site.web.api.espn.com`.** ESPN's edge started
  refusing `site.api.espn.com` for requests coming from datacenter IPs — which is
  every unattended run — while answering normally from a home connection. This
  viewer's tournament is between editions, so nothing was broken today, but the
  next rebuild would have failed with `HTTP 403`. Its sibling `site.web.api` serves
  the identical routes with identical payloads and no block.
- Nothing about the app changed — same committed data, same tests.

## 2026-08-10

- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.

## 2026-08-09

- **Backfill days now follow the family's Eastern-day convention.** ESPN
  buckets `dates=` queries by the US-Eastern day; Euro 2024's CEST kickoffs
  never cross the UTC/Eastern boundary so nothing was ever missed here, but
  `historyDates` now computes days in America/New_York to match the fix that
  landed in the World Cup, Copa, and Women's World Cup viewers today.
- **Spain are no longer the "2026 World Champions".** The champion banner and
  the Next Match champion card still carried the World Cup scaffold's title
  string — live on the site since launch — and the two tests that touch those
  components locked the wrong words in. Both now crown the Euro 2024
  Champions, tests updated in the same change.

- **Finish column in the group tables.** Each standings row now ends with a
  "Fin" column showing the final group positions still arithmetically possible
  (e.g. `1–3`), collapsing to a single gold number once the finish is locked.
  The bounds come from the clinch engine's own enumeration — exact (goal
  difference and head-to-head included) whenever the group's remaining
  scorelines are enumerable, sound points-only bounds otherwise — via a new
  `groupPositionBounds` export, so the column can never contradict the badges.
  With the committed Euro 2024 results every one of the six groups is final, so
  all 24 cells read a locked gold position. Ported from the World Cup viewer;
  mirrors the Finish column the WNBA/NBA/NFL viewers carry.

## 2026-08-08

- **Condensed view strip.** Once the header's view switch scrolls out of view, a
  slim fixed strip pins to the top showing the current view; tapping it drops
  down the full tab set, so switching views never means scrolling back to the
  top. The sticky filters panel and Week column heads offset beneath it. Rolled
  out family-wide from the WNBA/NBA viewers.

## 2026-08-05

- **Toolchain upgrade.** Vite 5 → 8 (Rolldown), Vitest + coverage-v8 2 → 4,
  `@vitejs/plugin-react` 4 → 6, jsdom 25 → 30, React 18 → 19, jest-dom 6 → 7.
- **Coverage badge back to 100%.** Vitest 4's v8 provider counts arms Vitest 2
  skipped, so the badge slipped on the upgrade. Nothing had regressed; the drift
  had simply been invisible, and it was closed with tests rather than waved
  through.
- **Room for the full-app tests on a loaded runner.** The App suite mounts the
  whole page and drives several poll cycles, which under v8 instrumentation
  brushed Vitest's default 5s ceiling on a busy GitHub runner — two tests timed
  out there while passing locally in a fraction of the time. `testTimeout` is
  now 15s, matching the siblings.
- **100% on every metric, and a gate that keeps it there.** Branch coverage
  joined statements, functions and lines at 100%, and `vite.config.js` now
  carries a `thresholds` block so the suite (and CI's `coverage:badge` step)
  fails the moment any of the four slips.
- **The best-thirds machinery is now covered end to end.** That was the last of
  the gap, and it needed real boards rather than counter-chasing: a third-place
  tie between two teams the European Qualifiers ranking has no number for (the
  hosts and a play-off entrant), a group still playing whose fourth-placed side
  is already out, a third-placed team whose match is suspended rather than
  merely live, a third-place slot drawn on the FIRST side of its tie, a locked
  third whose assigned group has not finished yet, a "Loser Match N" feed slot,
  a third-place slot with no group winner opposite it, a group too large to
  enumerate falling back to the points bounds, a rival group too open to count
  towards the four-thirds cut, and the requirement text in both of its awkward
  forms — a positive goal difference that must keep its sign, and a single point
  that must not read "1 points".
- **Two guards removed rather than half-tested.** `parseSlot` no longer carries
  an "other" arm in either engine: an entry-round label is always a group
  winner, a runner-up or a third-place slot, so the fallthrough was dead and the
  dead `else` it forced downstream went with it. Everything else that genuinely
  cannot be reached is documented in place with the reason — the committed draw
  pairs every "3rd Group …" slot with a winner from the Annexe C host list, the
  ranker seeds every group so a finished group always has a third, and all
  fifteen four-group combinations are in the UEFA table — never waved through
  with a lowered threshold.

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
- **Netlify builds this repo straight from Git** (site linked in the Netlify UI),
  so CI's `netlify-cli` deploy job is gone — it was redundant with the Git build
  and permanently red without deploy secrets. The badge JSON it used to produce
  now comes from Netlify's own build: `netlify.toml`'s command is
  `npm run coverage:badge && npm run build`.
- **Fixed the calendar function on the Git-build path.** `netlify/functions/
  calendar.js` used CommonJS (`exports.handler`), which Netlify's runtime rejects
  under this package's `"type": "module"` — `/calendar.ics` returned a 502
  `module is not defined in ES module scope`. Now a real ES module. (The sibling
  world-cup-viewer has the same CommonJS file but deploys through `netlify-cli`,
  which bundles it, so it never hit this.)

### Verified

- The engines reconstruct the real 2024 tournament from the committed group
  results alone: Group E with all four teams on 4 points orders ROU/BEL/SVK/UKR
  correctly, and the third-place table sends NED/GEO/SVK/SVN into exactly the real
  Round-of-16 ties via UEFA's official combination row (not the fallback).
- Bracket, Radial and Groups views checked in a real browser.
