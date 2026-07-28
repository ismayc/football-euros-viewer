# Euro 2024 Schedule Viewer

[![CI](https://github.com/ismayc/football-euros-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/football-euros-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://football-euros-viewer.netlify.app/coverage.json)](https://github.com/ismayc/football-euros-viewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A React + Vite web app showing all 51 matches of UEFA Euro 2024 (Germany) in
**your** timezone, with where to watch, host city/stadium, a bracket, group
standings, and the full tie-breaker and qualification maths.

🔗 **Live:** https://football-euros-viewer.netlify.app · https://ismayc.github.io/football-euros-viewer/

**This is a completed edition.** Euro 2024 finished on 14 July 2024 (Spain 2–1
England), and the schedule ships with every result in it. It is kept here as a
working archive — and as the shape the next European Championship can slot
straight into, since the format (24 teams, six groups, four best thirds) has been
stable since 2016.

## Features

- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable to 20+), with stadium-local time shown when it differs. They were
  published in CEST, the host timezone.
- **Hover for home-country time** — hover a team in any view to see when the
  match kicked off back home.
- **Follow teams** — star any team to highlight it everywhere and filter to a
  one-click "⭐ My Teams" view (saved in your browser).
- **Next-match bar** — a countdown to the next kickoff (prioritising your
  followed teams, or "Live now"), with a jump-to-match button.
- **Goal alerts** — opt-in 🔔 browser notifications when a goal is scored (scorer,
  minute, and the running score), scoped to your followed teams or all matches.
- **Six views** — chronological schedule, a Sunday–Saturday week calendar, group
  standings, the knockout bracket, a radial bracket, and tournament stats.
- **Phone-friendly schedule** — past days collapse to tappable headers by default
  (or hide entirely), so the schedule opens on the day's games rather than a long
  scroll.
- **Match detail** — click any match for full venue/time/broadcast info, the
  status/clock, and a minute-by-minute event timeline (goals ⚽, cards 🟨🟥).
- **How to watch (US)** — English (FOX/FS1) & Spanish (Telemundo/Universo) TV and
  streaming per match; free over-the-air channels flagged.
- **Venues** — all 10 host stadiums with city and region.
- **Filtering** — search, stage, group, team, host country, region, city/stadium,
  timeframe, and broadcast language. The scoped-search syntax (`team: Germany`,
  `city: Munich`, `stage: Final`, `group: C`) works across every view.
- **Group standings & qualification** — all six tables with UEFA's official
  tie-breakers (points → head-to-head points/GD/goals → overall goal difference →
  overall goals → disciplinary points → European Qualifiers ranking), who
  advances, and the four best third-placed teams. A ⚖️ marker (and a
  plain-language note below the third-place table) explains any placing decided by
  a soft tie-breaker, showing both teams' fair-play or ranking values.
- **Clinch & elimination detection** — teams are marked 🥇 Won group / ✅ Through /
  ❌ Out the moment the outcome is mathematically guaranteed, from an exact
  scoreline-enumeration engine that accounts for head-to-head and the cross-group
  third-place race. Shown in the group tables and schedule cards, and resolved
  into the bracket (a clinched "Winner Group X" slot fills in everywhere).
- **"As it stands" Round of 16** — under each group, where its current 1st / 2nd /
  (qualifying) 3rd would land in the knockout, with concrete opponents. The four
  qualifying thirds are placed using **UEFA's official combination table** (all 15
  four-of-six combinations from the regulations). Each projected match number links
  straight to that tie on the bracket, and the whole block can be toggled off.
- **R16 Outlook** — while the group stage is in play, the share of remaining
  outcomes that put each team in each open Round-of-16 slot, computed by
  enumerating every still-possible group result over real **goal differences**
  (not just win/draw/loss), so third-place bubble races get true proportions.
- **Scenarios** — pick results for the remaining group games and watch the tables,
  qualification and projected bracket move with you.
- **Bracket** — two-sided knockout bracket that fills in as teams resolve. Slots
  awaiting a result preview the **potential matchup**: a "Winner Match N" box shows
  the two candidate teams of the tie feeding it, cascading round by round.
- **Radial bracket** — a circular view: the 16 Round-of-16 teams ring the outside
  and each winner advances one ring inward toward the trophy at the centre. The
  champion's route lights up gold once it's decided.
- **Stats** — the Golden Boot race (ties never split, penalties noted, own goals
  excluded) plus tournament totals: matches, goals, goals per match, extra-time
  games and shootouts. Knockout match details add a **tale of the tape** — the two
  teams' tournament records side by side.
- **Add to calendar** — per-match `.ics` download, plus a `webcal://` subscription
  feed (all matches or just your teams).
- **Spoiler-free mode** — hide scores globally, per day, or per match.
- **Light/dark theme** — follows your system preference, with no flash on load.
- **Shareable URLs** — view, timezone, spoiler mode, and filters persist to the
  query string; links unfurl with a title/description preview in chat apps.
- **Accessible** — keyboard-navigable, focus-trapped modals that restore focus on
  close, and screen-reader labels on live/score badges.

### The live layer

The app keeps its full live-results layer even though this edition is finished,
so a future tournament's data drops in without re-plumbing: final scores from
[OpenFootball](https://github.com/openfootball/euro.json) (public domain, no API
key), a live in-match score + clock overlaid from
[ESPN](https://www.espn.com/soccer/) while games are underway, and final scores
cross-checked against [TheSportsDB](https://www.thesportsdb.com/) — each match
shows how many independent sources confirm the result.

## Develop

```bash
npm install
npm run dev             # http://localhost:5173
npm run build           # production build to dist/
npm run preview         # preview the production build
npm test                # run the Vitest suite
npm run coverage:badge  # tests + coverage, and refresh the badge endpoint
npm run check:bracket   # verify the knockout slot references are consistent
```

Every push runs the tests + build in GitHub Actions; pushes to `main` deploy to
Netlify and GitHub Pages only if they pass.

New to the code? [`ARCHITECTURE.md`](./ARCHITECTURE.md) maps the modules and how
data flows from the static schedule + live feeds through the standings, clinch,
projection and bracket-resolution layers to the views.

## Regenerating the data

```bash
npm run fetch:tournament   # rebuild src/data/{matches,teams,venues}.js
npm run fixture:official   # rebuild test/fixtures/official-kickoffs.js
```

`scripts/fetch-tournament.mjs` builds the committed schedule from **ESPN**
(structure, event ids, kickoffs, scores) and **OpenFootball** (goal scorers), and
**fails the build if the two disagree on any score** — so a silent data drift
can't land. `scripts/make-official-fixture.mjs` builds the kickoff fixture from
OpenFootball *only*, deliberately a different source, so the `data.test.js` check
comparing the two is a real cross-check rather than a tautology.

Two ESPN venue-city values are wrong (Signal Iduna Park filed under "Aue",
Volksparkstadion under "Hamburg Norderstedt") and are corrected by hand in the
generator's `VENUE_META`.

## Data sources

- **Schedule, groups, venues** — ESPN's `uefa.euro` scoreboard, cross-checked
  against OpenFootball and frozen into
  [`test/fixtures/official-kickoffs.js`](./test/fixtures/official-kickoffs.js).
  The suite asserts every match's kickoff (to the minute, in CEST), venue,
  knockout-bracket slot, and group assignment, plus structural invariants
  (complete round-robins, simultaneous final-matchday kickoffs, no team
  double-booked, valid bracket references).
- **Results (source of record)** — OpenFootball `euro.json` (public domain),
  final scores and goal timelines.
- **Live in-match scores** — ESPN's public scoreboard API (free, no API key,
  CORS-open). Used only while a match is underway, or just finished and
  OpenFootball hasn't posted yet; OpenFootball always wins once it has the score.
- **Backup & score cross-check** — [TheSportsDB](https://www.thesportsdb.com/)
  (free, CORS-open, public test key), an independent third source of final scores.

### A note on the final tie-breaker

UEFA's last group tie-breaker is position in the European Qualifiers overall
ranking. Germany qualified as hosts and Georgia, Poland and Ukraine came through
the play-offs, so none of the four has a position — a tie involving Germany would
have been settled by drawing lots, which a viewer can't compute. Those four fall
through to a stable alphabetical fallback, documented in
[`src/data/qualifierRanking.js`](./src/data/qualifierRanking.js). It never
triggers for 2024.

See [`NEWS.md`](./NEWS.md) for the changelog.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/football-euros-viewer).

The soccer ball in the app icons and share image is from
[Google Noto Emoji](https://github.com/googlefonts/noto-emoji)
(Apache License 2.0).

## Disclaimer

An unofficial, non-commercial fan project. **Not affiliated with, endorsed by, or
sponsored by UEFA.** “EURO”, and team, broadcaster, and tournament names are
trademarks of their respective owners. Schedule and results data come from the
public-domain [OpenFootball](https://github.com/openfootball/euro.json) project;
live in-match scores come from [ESPN](https://www.espn.com/soccer/); final scores
are cross-checked against [TheSportsDB](https://www.thesportsdb.com/).
