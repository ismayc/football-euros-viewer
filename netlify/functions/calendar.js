// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
// Fetches the OpenFootball schedule on each request and emits an .ics, so a
// subscribed calendar shows resolved knockout teams and final scores. Optional
// ?teams=Spain,Scotland filters to specific teams (case-insensitive).

const FEED = 'https://raw.githubusercontent.com/openfootball/euro.json/master/2024/euro.json'
const MATCH_MS = 135 * 60 * 1000

// UEFA published every Euro 2024 kickoff in German local time (CEST = UTC+2) and
// the feed omits the offset, so an offset-less time is read as CEST.
const DEFAULT_UTC_OFFSET = 2

const ALIASES = { 'Czech Republic': 'Czechia', Turkey: 'Türkiye' }
const norm = (n) => (n ? ALIASES[n] || n : n)

// OpenFootball's knockout slot codes (1A, 2B, 3A/B/C/D/F, W39) are cryptic in a
// calendar. Map them to the same friendly wording the app's bracket uses; a
// resolved real team name just passes through (normalised).
export function prettySlot(label) {
  if (!label) return label
  let m = /^1([A-F])$/.exec(label)
  if (m) return `Winner Group ${m[1]}`
  m = /^2([A-F])$/.exec(label)
  if (m) return `Runner-up Group ${m[1]}`
  if (/^3[A-F](\/[A-F])+$/.test(label)) return `3rd place (${label.slice(1)})`
  m = /^W(\d+)$/.exec(label)
  if (m) return `Winner Match ${m[1]}`
  m = /^L(\d+)$/.exec(label)
  if (m) return `Loser Match ${m[1]}`
  return norm(label)
}

// The feed pluralises the knockout rounds ('Quarter-finals'); the app labels them
// in the singular, so the calendar matches what the bracket shows.
const STAGE = {
  'Round of 16': 'Round of 16',
  'Quarter-finals': 'Quarterfinal',
  'Semi-finals': 'Semifinal',
  Final: 'Final',
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function toICSDate(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'
  )
}

// "2024-06-14" + "21:00" -> absolute Date (instant). An explicit "UTC+2" suffix
// wins if the feed ever grows one; otherwise the kickoff is read as CEST.
function toInstant(date, time) {
  const [y, mo, d] = date.split('-').map(Number)
  const m = /(\d{1,2}):(\d{2})(?:\s*UTC([+-]\d{1,2}))?/.exec(time || '')
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  const off = m[3] ? Number(m[3]) : DEFAULT_UTC_OFFSET
  return new Date(Date.UTC(y, mo - 1, d, hh - off, mm))
}

function esc(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Match numbers, keyed by the two teams. The download stamps a UID of
// `euro2024-match-<num>@footballeurosviewer` (src/utils/ics.js, from
// LEAGUE.ics); this feed used to build a UID out of the round, teams and date
// instead, so subscribing AND downloading put two events in the calendar for
// every fixture. The bodies now agree, and test/calendar-feed.test.js asserts
// that against the download path rather than against a second copy of the
// literal.
//
// The table is a restatement of src/data/matches.js, in the same spirit as
// VENUE_ALIASES in the sibling viewers: a Netlify function is kept
// self-contained, and a test rebuilds this map from the app's own data so a
// regenerated fixture list cannot drift away from it silently.
//
// A pair is unique across the 51 matches of a single-round-robin group stage
// plus a knockout bracket, and Euro 2024 has no repeated meeting. The keys are
// the app's spellings (Czechia, Türkiye), so `norm` is applied before lookup.
const MATCH_NUMS = {
  "Germany~Scotland"     : 1,
  "Hungary~Switzerland"  : 2,
  "Croatia~Spain"        : 3,
  "Albania~Italy"        : 4,
  "Netherlands~Poland"   : 5,
  "Denmark~Slovenia"     : 6,
  "England~Serbia"       : 7,
  "Romania~Ukraine"      : 8,
  "Belgium~Slovakia"     : 9,
  "Austria~France"       : 10,
  "Georgia~Türkiye"      : 11,
  "Czechia~Portugal"     : 12,
  "Albania~Croatia"      : 13,
  "Germany~Hungary"      : 14,
  "Scotland~Switzerland" : 15,
  "Serbia~Slovenia"      : 16,
  "Denmark~England"      : 17,
  "Italy~Spain"          : 18,
  "Slovakia~Ukraine"     : 19,
  "Austria~Poland"       : 20,
  "France~Netherlands"   : 21,
  "Czechia~Georgia"      : 22,
  "Portugal~Türkiye"     : 23,
  "Belgium~Romania"      : 24,
  "Hungary~Scotland"     : 25,
  "Germany~Switzerland"  : 26,
  "Albania~Spain"        : 27,
  "Croatia~Italy"        : 28,
  "France~Poland"        : 29,
  "Austria~Netherlands"  : 30,
  "Denmark~Serbia"       : 31,
  "England~Slovenia"     : 32,
  "Romania~Slovakia"     : 33,
  "Belgium~Ukraine"      : 34,
  "Czechia~Türkiye"      : 35,
  "Georgia~Portugal"     : 36,
  "Denmark~Germany"      : 37,
  "Italy~Switzerland"    : 38,
  "Georgia~Spain"        : 39,
  "England~Slovakia"     : 40,
  "Portugal~Slovenia"    : 41,
  "Belgium~France"       : 42,
  "Netherlands~Romania"  : 43,
  "Austria~Türkiye"      : 44,
  "Germany~Spain"        : 45,
  "France~Portugal"      : 46,
  "England~Switzerland"  : 47,
  "Netherlands~Türkiye"  : 48,
  "France~Spain"         : 49,
  "England~Netherlands"  : 50,
  "England~Spain"        : 51,
}

// The pair key both sides agree on. Sorted, so home/away order cannot matter:
// OpenFootball and the app disagree on which side is listed first for some
// fixtures, and the identity of a match does not depend on that.
function pairKey(a, b) {
  return [a, b].sort().join('~')
}

// The feed carries no match numbers of its own, so the number is recovered from
// the fixture's teams. An unrecognized fixture (a feed that grew a match the
// committed data has never seen) falls back to the old descriptive body rather
// than risk colliding with a real match's UID.
function uid(m) {
  const num = MATCH_NUMS[pairKey(norm(m.team1), norm(m.team2))]
  if (num != null) return `euro2024-match-${num}@footballeurosviewer`
  return `euro2024-${m.round}-${norm(m.team1)}-${norm(m.team2)}-${m.date}@footballeurosviewer`.replace(
    /\s+/g,
    '_',
  )
}

function vevent(m) {
  const start = toInstant(m.date, m.time)
  if (!start) return null
  const end = new Date(start.getTime() + MATCH_MS)
  const stage = m.round && m.round.startsWith('Matchday') ? (m.group || 'Group stage') : STAGE[m.round] || m.round
  // Final score: prefer the extra-time score (a knockout won in ET has a level
  // `ft`); note AET / penalty shootouts so the calendar shows the real result.
  const fin = m.score && (Array.isArray(m.score.et) ? m.score.et : Array.isArray(m.score.ft) ? m.score.ft : null)
  const pens = m.score && Array.isArray(m.score.p) ? ` p${m.score.p[0]}–${m.score.p[1]}` : ''
  const aet = m.score && Array.isArray(m.score.et) ? ' AET' : ''
  const ft = fin ? ` (${fin[0]}–${fin[1]}${aet}${pens})` : ''
  const summary = `Euro 2024: ${prettySlot(m.team1)} vs ${prettySlot(m.team2)}${ft}`
  return [
    'BEGIN:VEVENT',
    `UID:${uid(m)}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(m.ground || '')}`,
    `DESCRIPTION:${esc(stage)}`,
    'END:VEVENT',
  ].join('\r\n')
}

export const handler = async (event) => {
  try {
    const res = await fetch(FEED)
    if (!res.ok) return { statusCode: 502, body: `Upstream ${res.status}` }
    const data = await res.json()
    let matches = data.matches || []

    const teamsParam = (event.queryStringParameters && event.queryStringParameters.teams) || ''
    let calName = 'Euro 2024'
    if (teamsParam) {
      const want = new Set(teamsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
      matches = matches.filter(
        (m) => want.has(norm(m.team1)?.toLowerCase()) || want.has(norm(m.team2)?.toLowerCase()),
      )
      calName = 'Euro 2024 — My Teams'
    }

    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Euro 2024 Viewer//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      'X-PUBLISHED-TTL:PT2H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
      ...matches.map(vevent).filter(Boolean),
      'END:VCALENDAR',
    ].join('\r\n')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="euro-2024.ics"',
        'Cache-Control': 'public, max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` }
  }
}
