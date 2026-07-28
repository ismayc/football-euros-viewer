import { describe, it, expect } from 'vitest'
import { MATCHES, STAGE_ORDER } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { TEAMS, ALL_TEAMS } from '../src/data/teams.js'
import { BRACKET } from '../src/utils/bracket.js'
import { slotLabels } from '../src/utils/slots.js'
import {
  OFFICIAL_CEST,
  OFFICIAL_CITY,
  OFFICIAL_GROUPS,
  OFFICIAL_ROUND,
} from './fixtures/official-kickoffs.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'

// Render a kickoff instant as CEST 'YYYY-MM-DD HH:mm' (24h) so it can be
// compared to the authoritative fixture regardless of how `ko` is stored.
function cestKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t) => parts.find((p) => p.type === t).value
  const hour = g('hour') === '24' ? '00' : g('hour') // midnight quirk
  return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}`
}

// The fixture's join key: kickoff date + sorted team pair.
const officialKey = (m) => `${m.ko.slice(0, 10)}|${[m.t1, m.t2].sort().join('|')}`

describe('schedule data integrity', () => {
  it('has all 51 matches', () => {
    expect(MATCHES).toHaveLength(51)
  })

  it('has the correct stage distribution', () => {
    const counts = MATCHES.reduce((a, m) => ((a[m.stage] = (a[m.stage] || 0) + 1), a), {})
    expect(counts).toEqual({ Group: 36, R16: 8, QF: 4, SF: 2, Final: 1 })
  })

  it('has no third-place play-off (the Euro dropped it after 1980)', () => {
    expect(MATCHES.some((m) => m.stage === '3rd')).toBe(false)
    expect(BRACKET.third).toBeUndefined()
  })

  it('has unique match numbers 1–51', () => {
    const nums = MATCHES.map((m) => m.num).sort((a, b) => a - b)
    expect(new Set(nums).size).toBe(51)
    expect(nums[0]).toBe(1)
    expect(nums[50]).toBe(51)
  })

  it('numbers the knockout rounds as UEFA does (R16 37–44, QF 45–48, SF 49–50, Final 51)', () => {
    const nums = (stage) =>
      MATCHES.filter((m) => m.stage === stage).map((m) => m.num).sort((a, b) => a - b)
    expect(nums('R16')).toEqual([37, 38, 39, 40, 41, 42, 43, 44])
    expect(nums('QF')).toEqual([45, 46, 47, 48])
    expect(nums('SF')).toEqual([49, 50])
    expect(nums('Final')).toEqual([51])
  })

  it('references only known venues', () => {
    expect(MATCHES.every((m) => VENUES[m.venue])).toBe(true)
  })

  it('has a parseable kickoff instant for every match', () => {
    expect(MATCHES.every((m) => !Number.isNaN(new Date(m.ko).getTime()))).toBe(true)
  })

  it('stores every kickoff with an explicit +02:00 (CEST) offset', () => {
    const wrong = MATCHES.filter((m) => !m.ko.endsWith('+02:00')).map((m) => `M${m.num}: ${m.ko}`)
    expect(wrong).toEqual([])
  })

  it('carries a unique ESPN event id for every match', () => {
    const missing = MATCHES.filter((m) => !/^\d+$/.test(m.espnId || '')).map((m) => m.num)
    expect(missing).toEqual([])
    expect(new Set(MATCHES.map((m) => m.espnId)).size).toBe(51)
  })

  it('is sorted chronologically', () => {
    for (let i = 1; i < MATCHES.length; i++) {
      expect(new Date(MATCHES[i].ko).getTime()).toBeGreaterThanOrEqual(
        new Date(MATCHES[i - 1].ko).getTime(),
      )
    }
  })

  it('every group match references a real team in its group', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      const names = TEAMS[m.group].map((t) => t.name)
      expect(names).toContain(m.t1)
      expect(names).toContain(m.t2)
    }
  })

  it('has 24 teams across 6 groups', () => {
    expect(Object.keys(TEAMS)).toHaveLength(6)
    expect(ALL_TEAMS).toHaveLength(24)
  })

  it('matches the official group draw', () => {
    for (const g of Object.keys(OFFICIAL_GROUPS)) {
      const ours = TEAMS[g].map((t) => t.name).sort()
      expect(ours, `group ${g}`).toEqual([...OFFICIAL_GROUPS[g]].sort())
    }
  })

  it('has 10 venues', () => {
    expect(Object.keys(VENUES)).toHaveLength(10)
  })

  it('bracket covers every knockout match exactly once', () => {
    const bracketNums = [
      ...BRACKET.left.R16, ...BRACKET.left.QF, ...BRACKET.left.SF,
      ...BRACKET.final,
      ...BRACKET.right.SF, ...BRACKET.right.QF, ...BRACKET.right.R16,
    ].sort((a, b) => a - b)
    const knockoutNums = MATCHES.filter((m) => m.stage !== 'Group')
      .map((m) => m.num)
      .sort((a, b) => a - b)
    expect(bracketNums).toEqual(knockoutNums)
  })

  it('exposes stages in tournament order', () => {
    expect(STAGE_ORDER).toEqual(['Group', 'R16', 'QF', 'SF', 'Final'])
  })
})

// The committed schedule is built from ESPN; the fixture is built from
// OpenFootball. These assertions are the cross-check between the two.
describe('schedule agrees with the independently-sourced official fixture', () => {
  it('covers exactly the same 51 matches', () => {
    expect(MATCHES.map(officialKey).sort()).toEqual(Object.keys(OFFICIAL_CEST).sort())
  })

  it('kicks off every match at the officially published CEST time', () => {
    const wrong = MATCHES.filter((m) => cestKey(m.ko) !== OFFICIAL_CEST[officialKey(m)]).map(
      (m) => `M${m.num} ${m.t1} v ${m.t2}: ${cestKey(m.ko)} ≠ ${OFFICIAL_CEST[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })

  it('plays every match in the officially published host city', () => {
    const wrong = MATCHES.filter((m) => VENUES[m.venue].city !== OFFICIAL_CITY[officialKey(m)]).map(
      (m) => `M${m.num}: ${VENUES[m.venue].city} ≠ ${OFFICIAL_CITY[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })

  it('assigns every match to the officially published round', () => {
    const OF_ROUND = {
      'Matchday 1': 'Group', 'Matchday 2': 'Group', 'Matchday 3': 'Group',
      'Round of 16': 'R16', 'Quarter-finals': 'QF', 'Semi-finals': 'SF', Final: 'Final',
    }
    const wrong = MATCHES.filter((m) => OF_ROUND[OFFICIAL_ROUND[officialKey(m)]] !== m.stage).map(
      (m) => `M${m.num}: ${m.stage} ≠ ${OFFICIAL_ROUND[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })
})

// The tournament is finished, so these are facts, not projections. If a feed
// rewrites history, one of these fails.
describe('the recorded 2024 result', () => {
  const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))

  it('was won by Spain, 2–1 over England in the Berlin final', () => {
    const final = byNum[51]
    expect([final.t1, final.t2]).toEqual(['Spain', 'England'])
    expect(final.score).toEqual([2, 1])
    expect(VENUES[final.venue].city).toBe('Berlin')
  })

  it('has a final score for all 51 matches', () => {
    expect(MATCHES.every((m) => Array.isArray(m.score))).toBe(true)
  })

  it('records the three shootouts, and only those', () => {
    const pens = MATCHES.filter((m) => m.pens).map((m) => `${m.t1} ${m.pens.join('-')} ${m.t2}`)
    expect(pens.sort()).toEqual(
      ['England 5-3 Switzerland', 'Portugal 3-0 Slovenia', 'Portugal 3-5 France'].sort(),
    )
  })

  it('marks extra time wherever the 90 minutes did not settle it', () => {
    const aet = MATCHES.filter((m) => m.aet).map((m) => m.num).sort((a, b) => a - b)
    // The three shootouts went to extra time first (M41, M46, M47), plus the two
    // ties won in ET: England 2–1 Slovakia (M40) and Spain 2–1 Germany (M45).
    expect(aet).toEqual([40, 41, 45, 46, 47])
    expect(MATCHES.filter((m) => m.pens).every((m) => m.aet)).toBe(true)
  })
})

describe('knockout slot labels', () => {
  it('keeps the drawn placeholder for every knockout match, alongside the real teams', () => {
    for (const m of MATCHES.filter((m) => m.stage !== 'Group')) {
      expect(m.label1, `M${m.num}`).toBeTruthy()
      expect(m.label2, `M${m.num}`).toBeTruthy()
      expect(slotLabels(m)).toEqual([m.label1, m.label2])
    }
  })

  it('leaves group matches without placeholders (both teams known at the draw)', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      expect(m.label1).toBeUndefined()
      expect(slotLabels(m)).toEqual([m.t1, m.t2])
    }
  })

  it('every "Winner Match N" reference points to an existing earlier match', () => {
    const nums = new Set(MATCHES.map((m) => m.num))
    const bad = []
    for (const m of MATCHES)
      for (const slot of slotLabels(m)) {
        const r = slot.match(/^(?:Winner|Loser) Match (\d+)$/)
        if (r) {
          const ref = Number(r[1])
          if (!nums.has(ref) || ref >= m.num) bad.push(`M${m.num} → "${slot}"`)
        }
      }
    expect(bad).toEqual([])
  })

  it('routes each group winner and runner-up into exactly one Round-of-16 slot', () => {
    const seen = { winner: new Set(), runner: new Set() }
    for (const m of MATCHES.filter((m) => m.stage === 'R16'))
      for (const s of slotLabels(m)) {
        let hit = /^Winner Group ([A-F])$/.exec(s)
        if (hit) {
          expect(seen.winner.has(hit[1])).toBe(false)
          seen.winner.add(hit[1])
        }
        hit = /^Runner-up Group ([A-F])$/.exec(s)
        if (hit) {
          expect(seen.runner.has(hit[1])).toBe(false)
          seen.runner.add(hit[1])
        }
      }
    expect([...seen.winner].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect([...seen.runner].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('has exactly four "3rd Group …" slots', () => {
    const thirds = MATCHES.filter((m) => m.stage === 'R16')
      .flatMap(slotLabels)
      .filter((s) => s.startsWith('3rd Group '))
    expect(thirds).toHaveLength(4)
  })
})

describe('team home timezones', () => {
  it('maps every qualified team (and nothing else) to ≥1 home zone', () => {
    expect(Object.keys(TEAM_TIMEZONES).sort()).toEqual([...ALL_TEAMS].sort())
    expect(Object.values(TEAM_TIMEZONES).every((z) => z.length > 0)).toBe(true)
  })

  it('uses only valid IANA timezones', () => {
    const bad = []
    for (const [team, zones] of Object.entries(TEAM_TIMEZONES))
      for (const z of zones) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: z })
        } catch {
          bad.push(`${team}: ${z}`)
        }
      }
    expect(bad).toEqual([])
  })
})

describe('schedule internal consistency', () => {
  const groupMatches = MATCHES.filter((m) => m.stage === 'Group')
  const ms = (iso) => new Date(iso).getTime()
  const teamSet = new Set(ALL_TEAMS)

  it('each group is a complete round-robin (6 games, every pair once, 3 per team)', () => {
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g)
      expect(gm, `group ${g} game count`).toHaveLength(6)
      const teams = TEAMS[g].map((t) => t.name).sort()
      const pairs = new Set(gm.map((m) => [m.t1, m.t2].sort().join(' v ')))
      const expected = []
      for (let i = 0; i < teams.length; i++)
        for (let j = i + 1; j < teams.length; j++)
          expected.push([teams[i], teams[j]].sort().join(' v '))
      expect([...pairs].sort(), `group ${g} pairings`).toEqual(expected.sort())
      const counts = {}
      for (const m of gm) for (const t of [m.t1, m.t2]) counts[t] = (counts[t] || 0) + 1
      expect(Object.values(counts), `group ${g} games per team`).toEqual([3, 3, 3, 3])
    }
  })

  it("each group's final two matches kick off simultaneously", () => {
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g).sort((a, b) => ms(a.ko) - ms(b.ko))
      const [a, b] = gm.slice(-2)
      expect(a.ko, `group ${g} matchday-3 simultaneity`).toBe(b.ko)
    }
  })

  it('no team plays two matches less than 48h apart', () => {
    const byTeam = {}
    for (const m of MATCHES)
      for (const t of [m.t1, m.t2])
        if (teamSet.has(t)) (byTeam[t] ||= []).push(m)
    const tooClose = []
    for (const [t, arr] of Object.entries(byTeam)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 48) tooClose.push(`${t}: M${arr[i - 1].num}→M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(tooClose).toEqual([])
  })

  it('no venue hosts two matches with overlapping (3h) windows', () => {
    const byVenue = {}
    for (const m of MATCHES) (byVenue[m.venue] ||= []).push(m)
    const clashes = []
    for (const [v, arr] of Object.entries(byVenue)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 3) clashes.push(`${v}: M${arr[i - 1].num}/M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(clashes).toEqual([])
  })
})
