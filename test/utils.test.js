import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'
import { weekStartOf, addDays } from '../src/utils/week.js'
import {
  dayKey,
  formatTime,
  matchStatus,
  liveState,
  teamLocalKickoffs,
  teamKickoffTooltip,
} from '../src/utils/time.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'
import { ALL_TEAMS } from '../src/data/teams.js'
import { buildICS, webcalUrl, googleCalendarUrl } from '../src/utils/ics.js'
import { computeGroup } from '../src/utils/standings.js'

describe('week utils', () => {
  it('weekStartOf returns the preceding Sunday', () => {
    expect(weekStartOf('2024-06-14')).toBe('2024-06-09') // Fri -> Sun
    expect(weekStartOf('2024-06-09')).toBe('2024-06-09') // Sun -> itself
  })

  it('addDays does calendar math across month boundaries', () => {
    expect(addDays('2024-06-28', 6)).toBe('2024-07-04')
  })

  it('every match falls inside exactly one listed week', () => {
    const tz = 'America/New_York'
    const weeks = [...new Set(MATCHES.map((m) => weekStartOf(dayKey(m.ko, tz))))]
    for (const m of MATCHES) {
      const k = dayKey(m.ko, tz)
      const hits = weeks.filter((w) =>
        Array.from({ length: 7 }, (_, i) => addDays(w, i)).includes(k),
      )
      expect(hits).toHaveLength(1)
    }
  })
})

describe('time utils', () => {
  it('converts the opening match (3pm ET) to other zones', () => {
    const open = MATCHES.find((m) => m.num === 1).ko
    expect(formatTime(open, 'America/New_York')).toBe('3:00 PM')
    expect(formatTime(open, 'America/Los_Angeles')).toBe('12:00 PM')
    expect(formatTime(open, 'Europe/London')).toBe('8:00 PM')
  })

  it('classifies match status by time', () => {
    expect(matchStatus('2024-06-14T19:00:00Z', Date.parse('2024-06-13T00:00:00Z'))).toBe('upcoming')
    expect(matchStatus('2024-06-14T19:00:00Z', Date.parse('2024-06-14T19:30:00Z'))).toBe('live')
    expect(matchStatus('2024-06-14T19:00:00Z', Date.parse('2024-06-15T00:00:00Z'))).toBe('finished')
  })

  it('liveState prefers feed data over the clock', () => {
    const ko = '2024-06-14T19:00:00Z'
    const duringWindow = Date.parse('2024-06-14T19:30:00Z') // time-based "live"
    // A finished match (has a score) reads finished even inside the live window.
    expect(liveState({ ko, score: [2, 0] }, duringWindow)).toBe('finished')
    // ESPN's live flag wins regardless of clock.
    expect(liveState({ ko, score: [1, 0], live: { clock: "HT" } }, duringWindow)).toBe('live')
    // No feed data yet -> fall back to the time-based guess.
    expect(liveState({ ko }, duringWindow)).toBe('live')
    expect(liveState({ ko }, Date.parse('2024-06-13T00:00:00Z'))).toBe('upcoming')
  })
})

describe('team local kickoff tooltip', () => {
  const open = MATCHES.find((m) => m.num === 1).ko // the opener, 21:00 CEST

  it('gives a single home-time line for a single-zone country', () => {
    // Abbrev rendering of Europe/London varies by ICU build (BST vs GMT+1), so
    // assert the wall-clock and that exactly one line comes back.
    const lines = teamLocalKickoffs(open, 'England')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^Jun 14, 8:00 PM /)
  })

  it('lists one line per distinct wall-clock for a multi-zone country', () => {
    // Spain spans the Canaries (UTC+1 in June) and the mainland (UTC+2), so the
    // 21:00 CEST kickoff reads an hour apart at home. Abbreviations outside the
    // US render inconsistently across ICU builds, so assert the wall-clocks.
    expect(TEAM_TIMEZONES.Spain).toHaveLength(2)
    const lines = teamLocalKickoffs(open, 'Spain')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^Jun 14, 8:00 PM /)
    expect(lines[1]).toMatch(/^Jun 14, 9:00 PM /)
  })

  it('collapses zones that read the same clock at the instant', () => {
    // Portugal lists the Azores (UTC+0) and Lisbon (UTC+1) — genuinely distinct —
    // while a single-zone country always collapses to one line.
    expect(TEAM_TIMEZONES.Portugal).toHaveLength(2)
    expect(teamLocalKickoffs(open, 'Portugal')).toHaveLength(2)
    expect(TEAM_TIMEZONES.Germany).toHaveLength(1)
    expect(teamLocalKickoffs(open, 'Germany')).toHaveLength(1)
  })

  it('returns empty for unknown teams (e.g. knockout placeholders)', () => {
    expect(teamLocalKickoffs(open, 'Winner Group A')).toEqual([])
    expect(teamKickoffTooltip(open, 'Winner Group A')).toBe('')
  })

  it('builds a labelled multi-line tooltip', () => {
    expect(teamKickoffTooltip(open, 'England')).toMatch(/^Kickoff in England:\nJun 14, 8:00 PM /)
    expect(teamKickoffTooltip(open, 'Spain')).toMatch(/^Kickoff in Spain \(local times\):\n/)
  })

  it('has a timezone entry for every qualified team', () => {
    for (const name of ALL_TEAMS) {
      expect(TEAM_TIMEZONES[name], `${name} missing a home timezone`).toBeTruthy()
      expect(TEAM_TIMEZONES[name].length).toBeGreaterThan(0)
    }
  })
})

describe('ICS export', () => {
  it('emits a valid VEVENT with correct UTC start/end', () => {
    const final = MATCHES.find((m) => m.stage === 'Final')
    const ics = buildICS(final)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20240714T190000Z') // 21:00 CEST -> 19:00 UTC
    expect(ics).toContain('DTEND:20240714T211500Z') // +2h15m
    expect(ics).toContain('LOCATION:Olympiastadion Berlin')
    expect(ics).toContain('END:VCALENDAR')
  })
})

describe('calendar subscription links', () => {
  const FEED = 'https://world-cup-viewer.netlify.app/calendar.ics'

  it('webcalUrl swaps the scheme to webcal', () => {
    expect(webcalUrl(FEED)).toBe('webcal://world-cup-viewer.netlify.app/calendar.ics')
    expect(webcalUrl('http://x/y.ics')).toBe('webcal://x/y.ics')
  })

  it('googleCalendarUrl uses a raw webcal:// cid (not https, not percent-encoded)', () => {
    const link = googleCalendarUrl(FEED)
    expect(link).toBe(
      'https://www.google.com/calendar/render?cid=webcal://world-cup-viewer.netlify.app/calendar.ics',
    )
    // The old bug: an https/encoded cid that Google rejects with "check the URL".
    expect(link).not.toContain('cid=https')
    expect(link).not.toContain('%3A')
  })

  it('preserves the ?teams= query string for the my-teams feed', () => {
    const myFeed = `${FEED}?teams=Germany,Denmark`
    const link = googleCalendarUrl(myFeed)
    expect(link).toContain('cid=webcal://world-cup-viewer.netlify.app/calendar.ics?teams=Germany,Denmark')
    expect(link).not.toContain('%3F') // the "?" stays raw so Google keeps the query
  })
})

describe('standings', () => {
  it('tallies points, GD and ordering from scored matches', () => {
    const scored = MATCHES.map((m) =>
      m.num === 1 ? { ...m, score: [2, 1] } : m, // Germany 2-1 Scotland
    )
    const table = computeGroup('A', scored)
    const ger = table.find((r) => r.name === 'Germany')
    const sco = table.find((r) => r.name === 'Scotland')
    expect(ger.Pts).toBe(3)
    expect(ger.GD).toBe(1)
    expect(sco.Pts).toBe(0)
    expect(sco.GD).toBe(-1)
    expect(table[0].name).toBe('Germany') // sorted to top
  })
})

describe('venue timezones', () => {
  it('every venue has a valid IANA timezone', () => {
    for (const v of Object.values(VENUES)) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: v.tz })).not.toThrow()
    }
  })
})
