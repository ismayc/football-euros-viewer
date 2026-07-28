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

// The feed carries no match numbers, so a UID is built from the fixture itself.
function uid(m) {
  return `euro2024-${m.round}-${norm(m.team1)}-${norm(m.team2)}-${m.date}@euroviewer`.replace(/\s+/g, '_')
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
