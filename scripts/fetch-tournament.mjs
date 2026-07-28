// Builds the committed tournament snapshot in src/data/ for UEFA Euro 2024.
//
// Two independent public sources, both keyless and free:
//
//   • ESPN (site API, soccer/uefa.euro) — STRUCTURE. Exact kickoff instants,
//     venues, group labels, per-match event ids (which is what lets the match
//     detail modal pull a two-year-old box score at runtime), final scores and
//     shootout scores.
//   • OpenFootball (euro.json, public domain) — GOAL DETAIL. Scorer names and
//     minutes with penalty / own-goal flags, which ESPN's key events carry only
//     inside prose ("Goal! Spain 1, England 0. Nico Williams (Spain) …") with an
//     empty athletesInvolved array on matches this old.
//
// The two are cross-checked against each other: every match's final score must
// agree, or the build fails rather than publishing a quiet disagreement.
//
// Node built-ins only (no imports at all) so the data workflow runs on a bare
// checkout — enforced by test/scripts-runtime.test.js.
//
//   node scripts/fetch-tournament.mjs        # rewrite src/data/*.js
//   node scripts/fetch-tournament.mjs --dry  # report only, write nothing

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.euro'
const OPENFOOTBALL = 'https://raw.githubusercontent.com/openfootball/euro.json/master/2024/euro.json'

// ---------------------------------------------------------------------------
// The edition. Everything below this line is Euro-2024-specific and is what a
// future edition rewrites; the machinery underneath it is format-general.
// ---------------------------------------------------------------------------

const EDITION = {
  year: 2024,
  host: 'Germany',
  window: '20240614-20240715',
  matches: 51,
  teams: 24,
  groups: ['A', 'B', 'C', 'D', 'E', 'F'],
  venues: 10,
  // UEFA published every kickoff in CEST, and the file states it outright
  // ("all times are local, CEST (UTC+2)"). Storing the offset explicitly means
  // `new Date(ko)` is an absolute instant that renders into any timezone.
  tzOffset: '+02:00',
}

// The knockout fixture list, from OpenFootball's euro.txt lineage comments
// (`# Winner Group A - Runner-up Group C`), which carry UEFA's official match
// numbering: 37–44 Round of 16, 45–48 quarter-finals, 49–50 semi-finals, 51 the
// final. Note the Round of 16 is NOT in number order — match 38 kicks off before
// match 37 — so slots are matched to ESPN events by kickoff instant, never by
// sort position.
//
// `t1`/`t2` are the placeholder labels the app resolves at runtime through
// utils/bracketResolve.js. They are replaced with the real teams below for any
// match that has been played, which for a finished edition is all of them; an
// unplayed edition simply keeps the labels.
const KNOCKOUT = [
  { num: 38, stage: 'R16', ko: '2024-06-29T18:00', t1: 'Runner-up Group A', t2: 'Runner-up Group B' },
  { num: 37, stage: 'R16', ko: '2024-06-29T21:00', t1: 'Winner Group A', t2: 'Runner-up Group C' },
  { num: 40, stage: 'R16', ko: '2024-06-30T18:00', t1: 'Winner Group C', t2: '3rd Group D/E/F' },
  { num: 39, stage: 'R16', ko: '2024-06-30T21:00', t1: 'Winner Group B', t2: '3rd Group A/D/E/F' },
  { num: 42, stage: 'R16', ko: '2024-07-01T18:00', t1: 'Runner-up Group D', t2: 'Runner-up Group E' },
  { num: 41, stage: 'R16', ko: '2024-07-01T21:00', t1: 'Winner Group F', t2: '3rd Group A/B/C' },
  { num: 43, stage: 'R16', ko: '2024-07-02T18:00', t1: 'Winner Group E', t2: '3rd Group A/B/C/D' },
  { num: 44, stage: 'R16', ko: '2024-07-02T21:00', t1: 'Winner Group D', t2: 'Runner-up Group F' },
  { num: 45, stage: 'QF', ko: '2024-07-05T18:00', t1: 'Winner Match 39', t2: 'Winner Match 37' },
  { num: 46, stage: 'QF', ko: '2024-07-05T21:00', t1: 'Winner Match 41', t2: 'Winner Match 42' },
  { num: 47, stage: 'QF', ko: '2024-07-06T18:00', t1: 'Winner Match 40', t2: 'Winner Match 38' },
  { num: 48, stage: 'QF', ko: '2024-07-06T21:00', t1: 'Winner Match 43', t2: 'Winner Match 44' },
  { num: 49, stage: 'SF', ko: '2024-07-09T21:00', t1: 'Winner Match 45', t2: 'Winner Match 46' },
  { num: 50, stage: 'SF', ko: '2024-07-10T21:00', t1: 'Winner Match 47', t2: 'Winner Match 48' },
  { num: 51, stage: 'Final', ko: '2024-07-14T21:00', t1: 'Winner Match 49', t2: 'Winner Match 50' },
]

// Flag emoji per team. England, Scotland and Wales need the subdivision tag
// sequences rather than a regional-indicator pair.
const FLAGS = {
  Albania: '🇦🇱',
  Austria: '🇦🇹',
  Belgium: '🇧🇪',
  Croatia: '🇭🇷',
  Czechia: '🇨🇿',
  Denmark: '🇩🇰',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  France: '🇫🇷',
  Georgia: '🇬🇪',
  Germany: '🇩🇪',
  Hungary: '🇭🇺',
  Italy: '🇮🇹',
  Netherlands: '🇳🇱',
  Poland: '🇵🇱',
  Portugal: '🇵🇹',
  Romania: '🇷🇴',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Serbia: '🇷🇸',
  Slovakia: '🇸🇰',
  Slovenia: '🇸🇮',
  Spain: '🇪🇸',
  Switzerland: '🇨🇭',
  Türkiye: '🇹🇷',
  Ukraine: '🇺🇦',
}

// Venue metadata keyed by ESPN's venue id, because ESPN's own city field is
// wrong for two of the ten: it files SIGNAL IDUNA PARK under "Aue" (it is in
// Dortmund, 400km away) and Volksparkstadion under "Hamburg Norderstedt".
// Taking ESPN's city verbatim would print those errors in the UI, so the city,
// the display name and the region are stated here and ESPN supplies only the
// match→venue mapping.
const VENUE_META = {
  334: { key: 'olympiastadion', name: 'Olympiastadion Berlin', city: 'Berlin', region: 'East' },
  1791: { key: 'veltins', name: 'Arena AufSchalke', city: 'Gelsenkirchen', region: 'West' },
  1935: { key: 'allianz', name: 'Munich Football Arena', city: 'Munich', region: 'South' },
  2315: { key: 'signaliduna', name: 'BVB Stadion Dortmund', city: 'Dortmund', region: 'West' },
  2318: { key: 'waldstadion', name: 'Frankfurt Arena', city: 'Frankfurt', region: 'Central' },
  2319: { key: 'mhp', name: 'Stuttgart Arena', city: 'Stuttgart', region: 'South' },
  2995: { key: 'volkspark', name: 'Volksparkstadion Hamburg', city: 'Hamburg', region: 'North' },
  3719: { key: 'merkur', name: 'Düsseldorf Arena', city: 'Düsseldorf', region: 'West' },
  3857: { key: 'rheinenergie', name: 'Cologne Stadium', city: 'Cologne', region: 'West' },
  4237: { key: 'redbull', name: 'Leipzig Stadium', city: 'Leipzig', region: 'East' },
}

// OpenFootball spellings that differ from the app's canonical names (which
// follow ESPN and UEFA). Mirrors src/services/results.js so the join lines up.
const ALIASES = { 'Czech Republic': 'Czechia', Turkey: 'Türkiye' }
const canon = (name) => ALIASES[name] || name

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1s, 2s, 4s, 8s, plus up to 500ms of jitter so parallel callers don't all retry
// in lockstep and re-create the burst that caused the failure.
const backoffMs = (attempt) => 2 ** attempt * 1000 + Math.random() * 500

// ESPN 500s at random under load; retry only what's worth retrying (5xx, 429, or
// a network-level error). A 404 is a real answer and fails immediately rather
// than sleeping 15 seconds first.
async function getJson(url, tries = 5) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(backoffMs(attempt - 1))

    let res
    try {
      res = await fetch(url)
    } catch (err) {
      lastErr = err
      continue
    }

    if (res.ok) return await res.json()
    if (res.status < 500 && res.status !== 429) throw new Error(`${url}\n  HTTP ${res.status}`)
    lastErr = new Error(`HTTP ${res.status}`)
  }
  throw new Error(`${url}\n  ${lastErr.message} — still failing after ${tries} attempts`)
}

// ---------------------------------------------------------------------------
// ESPN → normalized events
// ---------------------------------------------------------------------------

// "EURO, Group A" → "A"; "EURO, Round of 16" → null.
function groupOf(competition) {
  const note = competition.altGameNote || ''
  const m = note.match(/Group ([A-L])\s*$/)
  return m ? m[1] : null
}

const STAGE_BY_SLUG = {
  'group-stage': 'Group',
  'round-of-16': 'R16',
  quarterfinals: 'QF',
  semifinals: 'SF',
  '3rd-place-match': '3rd',
  final: 'Final',
}

// ESPN's `date` is a UTC instant; re-express it in the tournament's own
// publication timezone so the committed string reads like the official fixture
// list (and so a human diff of this file is meaningful).
function toEditionOffset(iso) {
  const offsetMin =
    (EDITION.tzOffset.startsWith('-') ? -1 : 1) *
    (Number(EDITION.tzOffset.slice(1, 3)) * 60 + Number(EDITION.tzOffset.slice(4, 6)))
  const local = new Date(new Date(iso).getTime() + offsetMin * 60_000)
  return local.toISOString().slice(0, 19) + EDITION.tzOffset
}

// Kickoff key used to line an ESPN event up with a KNOCKOUT slot: the local
// wall-clock date and time, which is how the official fixture list states it.
const koKey = (iso) => toEditionOffset(iso).slice(0, 16)

function normalizeEvent(event) {
  const c = event.competitions[0]
  const stage = STAGE_BY_SLUG[event.season?.slug]
  if (!stage) throw new Error(`Unknown stage slug "${event.season?.slug}" on event ${event.id}`)

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  const venueId = Number(c.venue?.id)
  if (!VENUE_META[venueId]) {
    throw new Error(`Unknown venue ${venueId} (${c.venue?.fullName}) on event ${event.id}`)
  }

  const scored = home.score !== '' && home.score != null && c.status?.type?.completed
  const pens =
    home.shootoutScore != null && away.shootoutScore != null
      ? [Number(home.shootoutScore), Number(away.shootoutScore)]
      : null

  return {
    espnId: event.id,
    stage,
    group: groupOf(c),
    ko: toEditionOffset(c.date),
    koKey: koKey(c.date),
    venue: VENUE_META[venueId].key,
    t1: home.team.displayName,
    t2: away.team.displayName,
    score: scored ? [Number(home.score), Number(away.score)] : null,
    pens,
    // "FT-Pens" and "AET" both mean the 90 minutes did not settle it.
    aet: /AET|Pens/i.test(c.status?.type?.detail || ''),
  }
}

// ---------------------------------------------------------------------------
// OpenFootball → goal detail, keyed by kickoff date + team pair
// ---------------------------------------------------------------------------

const pairKey = (a, b) => [canon(a), canon(b)].sort().join('|')
const ofKey = (date, a, b) => `${date}|${pairKey(a, b)}`

function parseGoals(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map((g) => ({
    name: g.name || g.player || '',
    minute: g.minute ?? g.offset ?? null,
    penalty: Boolean(g.penalty),
    og: Boolean(g.owngoal),
  }))
}

function indexOpenFootball(doc) {
  if (!Array.isArray(doc.matches)) throw new Error('OpenFootball feed has no matches[] array')
  const map = new Map()
  for (const m of doc.matches) {
    map.set(ofKey(m.date, m.team1, m.team2), {
      team1: canon(m.team1),
      team2: canon(m.team2),
      ft: m.score?.ft || null,
      et: m.score?.et || null,
      p: m.score?.p || null,
      g1: parseGoals(m.goals1),
      g2: parseGoals(m.goals2),
    })
  }
  return map
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

function buildMatches(events, ofIndex) {
  assert(
    events.length === EDITION.matches,
    `Expected ${EDITION.matches} matches from ESPN, got ${events.length}. ` +
      `A short read is indistinguishable from a quiet tournament — refusing to write.`,
  )

  const groupEvents = events
    .filter((e) => e.stage === 'Group')
    .sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.group.localeCompare(b.group))
  const knockoutEvents = events.filter((e) => e.stage !== 'Group')

  assert(
    knockoutEvents.length === KNOCKOUT.length,
    `Expected ${KNOCKOUT.length} knockout matches, got ${knockoutEvents.length}`,
  )

  // Group matches take UEFA's chronological numbering; simultaneous kickoffs on
  // the final matchday are ordered by group letter, as the official list does.
  const numbered = groupEvents.map((e, i) => ({ ...e, num: i + 1, ...{} }))

  // Knockout slots are matched by kickoff instant, never by sort position.
  const byKo = new Map(knockoutEvents.map((e) => [e.koKey, e]))
  for (const slot of KNOCKOUT) {
    const event = byKo.get(slot.ko)
    assert(event, `No ${slot.stage} event kicking off at ${slot.ko} for match ${slot.num}`)
    assert(
      event.stage === slot.stage,
      `Match ${slot.num} expected stage ${slot.stage}, ESPN says ${event.stage}`,
    )
    numbered.push({
      ...event,
      num: slot.num,
      // Placeholder labels survive only while a match is unplayed; once it has a
      // result the real teams are what ESPN reports.
      label1: slot.t1,
      label2: slot.t2,
    })
  }
  assert(
    new Set(numbered.map((m) => m.num)).size === EDITION.matches,
    'Duplicate match numbers after numbering',
  )

  // Attach goal detail and cross-check the score against OpenFootball.
  const disagreements = []
  const enriched = numbered.map((m) => {
    const date = m.ko.slice(0, 10)
    const rec = ofIndex.get(ofKey(date, m.t1, m.t2))
    const out = { ...m }
    if (!rec) return out

    // Orient OpenFootball's (team1, team2) onto our (t1, t2).
    const aligned = rec.team1 === m.t1
    const decisive = rec.et || rec.ft
    if (decisive && m.score) {
      const theirs = aligned ? decisive : [decisive[1], decisive[0]]
      if (theirs[0] !== m.score[0] || theirs[1] !== m.score[1]) {
        disagreements.push(
          `match ${m.num} ${m.t1} v ${m.t2}: ESPN ${m.score.join('-')} vs OpenFootball ${theirs.join('-')}`,
        )
      }
    }
    const g1 = aligned ? rec.g1 : rec.g2
    const g2 = aligned ? rec.g2 : rec.g1
    if (g1.length || g2.length) out.goals = { t1: g1, t2: g2 }
    return out
  })

  assert(
    disagreements.length === 0,
    `ESPN and OpenFootball disagree on ${disagreements.length} final score(s):\n  ` +
      disagreements.join('\n  '),
  )

  return enriched.sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)
}

function buildTeams(matches) {
  const groups = {}
  for (const m of matches) {
    if (m.stage !== 'Group') continue
    for (const name of [m.t1, m.t2]) {
      assert(FLAGS[name], `No flag for team "${name}" — add it to FLAGS`)
      groups[m.group] ??= []
      if (!groups[m.group].some((t) => t.name === name)) {
        groups[m.group].push({ name, flag: FLAGS[name] })
      }
    }
  }
  const letters = Object.keys(groups).sort()
  assert(
    letters.join('') === EDITION.groups.join(''),
    `Expected groups ${EDITION.groups.join('')}, got ${letters.join('')}`,
  )
  for (const g of letters) {
    assert(groups[g].length === 4, `Group ${g} has ${groups[g].length} teams, expected 4`)
    groups[g].sort((a, b) => a.name.localeCompare(b.name))
  }
  const total = letters.reduce((n, g) => n + groups[g].length, 0)
  assert(total === EDITION.teams, `Expected ${EDITION.teams} teams, got ${total}`)
  // Emit in group order, not in the order the fixture list happened to introduce
  // them — Object.keys(TEAMS) is the group order the whole app iterates in.
  return Object.fromEntries(letters.map((g) => [g, groups[g]]))
}

function buildVenues(matches) {
  const used = new Set(matches.map((m) => m.venue))
  assert(used.size === EDITION.venues, `Expected ${EDITION.venues} venues, got ${used.size}`)
  const out = {}
  for (const meta of Object.values(VENUE_META)) {
    if (!used.has(meta.key)) continue
    out[meta.key] = {
      name: meta.name,
      city: meta.city,
      country: EDITION.host,
      countryFlag: FLAGS[EDITION.host],
      tz: 'Europe/Berlin',
      region: meta.region,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const BANNER = (what) =>
  `// GENERATED by scripts/fetch-tournament.mjs — do not edit by hand.\n` +
  `// ${what}\n` +
  `// Sources: ESPN (structure, ids, scores) + OpenFootball (goal detail).\n` +
  `// Regenerate with: npm run fetch:tournament\n`

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function goalLiteral(g) {
  const bits = [`name: ${q(g.name)}`, `minute: ${g.minute}`]
  if (g.penalty) bits.push('penalty: true')
  if (g.og) bits.push('og: true')
  return `{ ${bits.join(', ')} }`
}

function matchLiteral(m) {
  const bits = [`num: ${m.num}`, `stage: ${q(m.stage)}`]
  if (m.group) bits.push(`group: ${q(m.group)}`)
  bits.push(`t1: ${q(m.t1)}`, `t2: ${q(m.t2)}`)
  if (m.label1) bits.push(`label1: ${q(m.label1)}`, `label2: ${q(m.label2)}`)
  bits.push(`venue: ${q(m.venue)}`, `ko: ${q(m.ko)}`, `espnId: ${q(m.espnId)}`)
  if (m.score) bits.push(`score: [${m.score.join(', ')}]`)
  if (m.aet) bits.push('aet: true')
  if (m.pens) bits.push(`pens: [${m.pens.join(', ')}]`)
  let line = `  { ${bits.join(', ')} }`
  if (m.goals) {
    const t1 = m.goals.t1.map(goalLiteral).join(', ')
    const t2 = m.goals.t2.map(goalLiteral).join(', ')
    line =
      `  {\n    ${bits.join(', ')},\n` +
      `    goals: { t1: [${t1}], t2: [${t2}] },\n  }`
  }
  return line
}

function renderMatches(matches) {
  const champion = championOf(matches)
  return (
    BANNER(`All ${matches.length} matches of UEFA Euro ${EDITION.year} in ${EDITION.host}.`) +
    `//\n` +
    `// \`ko\` is the kickoff instant as an ISO 8601 string with an explicit\n` +
    `// ${EDITION.tzOffset} offset (CEST, the timezone UEFA published every kickoff in).\n` +
    `// Because the offset is explicit, \`new Date(ko)\` resolves to the correct\n` +
    `// absolute instant and can be formatted into ANY timezone — that is what\n` +
    `// powers the "in your timezone" display.\n` +
    `//\n` +
    `// \`label1\`/\`label2\` on a knockout match are the bracket placeholders the\n` +
    `// fixture list was drawn with ("Winner Group A"). They are kept alongside the\n` +
    `// resolved teams so the bracket can show a slot's provenance, and so an\n` +
    `// unplayed edition renders from the same records.\n` +
    `//\n` +
    `// \`espnId\` is the ESPN event id, which the match detail modal uses to fetch\n` +
    `// that match's lineups and box score on demand rather than committing them.\n` +
    `//\n` +
    `// Champion: ${champion}.\n` +
    `\n` +
    `export const STAGE_LABELS = {\n` +
    `  Group: 'Group Stage',\n` +
    `  R16: 'Round of 16',\n` +
    `  QF: 'Quarter-final',\n` +
    `  SF: 'Semi-final',\n` +
    `  Final: 'Final',\n` +
    `}\n\n` +
    `export const STAGE_ORDER = ['Group', 'R16', 'QF', 'SF', 'Final']\n\n` +
    `export const MATCHES = [\n` +
    matches.map(matchLiteral).join(',\n') +
    `,\n].sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)\n`
  )
}

function championOf(matches) {
  const final = matches.find((m) => m.stage === 'Final')
  if (!final?.score) return 'not yet decided'
  const [a, b] = final.pens || final.score
  return a === b ? 'not yet decided' : a > b ? final.t1 : final.t2
}

function renderTeams(groups) {
  const body = Object.entries(groups)
    .map(
      ([g, teams]) =>
        `  ${g}: [\n` +
        teams.map((t) => `    { name: ${q(t.name)}, flag: ${q(t.flag)} },`).join('\n') +
        `\n  ],`,
    )
    .join('\n')
  return (
    BANNER(
      `The ${EDITION.teams} teams of Euro ${EDITION.year}, in their group-stage groups.`,
    ) +
    `\nexport const TEAMS = {\n${body}\n}\n\n` +
    `// Flat lookup: team name -> flag emoji.\n` +
    `export const FLAG_BY_TEAM = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .reduce((acc, t) => {\n` +
    `    acc[t.name] = t.flag\n` +
    `    return acc\n` +
    `  }, {})\n\n` +
    `// Sorted list of all team names (for the team filter).\n` +
    `export const ALL_TEAMS = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .map((t) => t.name)\n` +
    `  .sort((a, b) => a.localeCompare(b))\n`
  )
}

function renderVenues(venues) {
  const body = Object.entries(venues)
    .map(
      ([key, v]) =>
        `  ${key}: {\n` +
        `    name: ${q(v.name)},\n` +
        `    city: ${q(v.city)},\n` +
        `    country: ${q(v.country)},\n` +
        `    countryFlag: ${q(v.countryFlag)},\n` +
        `    tz: ${q(v.tz)},\n` +
        `    region: ${q(v.region)},\n` +
        `  },`,
    )
    .join('\n')
  return (
    BANNER(`The ${EDITION.venues} host venues of Euro ${EDITION.year}.`) +
    `// \`tz\` is the IANA timezone of the stadium, used to show local kickoff time.\n` +
    `// \`region\` groups the host cities geographically for the venue filter.\n` +
    `\nexport const VENUES = {\n${body}\n}\n`
  )
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Euro ${EDITION.year} — fetching ESPN + OpenFootball…`)

  const [espnDoc, ofDoc] = await Promise.all([
    getJson(`${ESPN}/scoreboard?dates=${EDITION.window}&limit=200`),
    getJson(OPENFOOTBALL),
  ])

  const events = (espnDoc.events || []).map(normalizeEvent)
  const ofIndex = indexOpenFootball(ofDoc)
  console.log(`  ESPN: ${events.length} events · OpenFootball: ${ofIndex.size} matches`)

  const matches = buildMatches(events, ofIndex)
  const teams = buildTeams(matches)
  const venues = buildVenues(matches)

  const withGoals = matches.filter((m) => m.goals).length
  console.log(
    `  ${matches.length} matches · ${Object.keys(teams).length} groups · ` +
      `${Object.keys(venues).length} venues · ${withGoals} with goal detail`,
  )
  console.log(`  Champion: ${championOf(matches)}`)

  const files = [
    ['src/data/matches.js', renderMatches(matches)],
    ['src/data/teams.js', renderTeams(teams)],
    ['src/data/venues.js', renderVenues(venues)],
  ]

  for (const [rel, text] of files) {
    const path = join(ROOT, rel)
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // new file
    }
    if (before === text) {
      console.log(`  = ${rel} unchanged`)
      continue
    }
    if (DRY) {
      console.log(`  ~ ${rel} would change (${before.length} → ${text.length} bytes)`)
      continue
    }
    writeFileSync(path, text)
    console.log(`  ✓ ${rel} written (${text.length} bytes)`)
  }
}

main().catch((err) => {
  console.error(`\nfetch-tournament failed:\n  ${err.message}\n`)
  process.exit(1)
})
