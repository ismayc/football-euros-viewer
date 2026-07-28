import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAG_BY_TEAM } from '../src/data/teams.js'
import { normEspn, ESPN_ALIASES } from '../src/services/espn.js'
import { normSdb, SDB_ALIASES } from '../src/services/thesportsdb.js'
import { normalizeTeam } from '../src/services/results.js'

// An external feed spelling that no normalizer maps to our canonical name fails
// SILENTLY: the lookup returns a non-team and the match is quietly dropped from
// the live overlay. These tests pin every REAL captured feed spelling to a real
// team, so a drift in either feed is a red test rather than a missing score.
//
// The fixtures are captures of the whole 2024 tournament:
//   espn: site.api.espn.com/apis/site/v2/sports/soccer/uefa.euro/scoreboard
//         ?dates=20240614-20240715&limit=100  → competitors[].team.displayName
//   sdb:  thesportsdb.com/api/v1/json/3/eventsday.php?d=<match date>&l=4502
//         → strHomeTeam / strAwayTeam, over every match date

const here = dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(resolve(here, 'fixtures', f), 'utf8'))
const espnNames = load('espn-team-names.json')
const sdbNames = load('sdb-team-names.json')

// Canonical team names = the 24 real finalists.
const canonical = new Set(Object.keys(FLAG_BY_TEAM))

describe('team name resolution from real feed spellings', () => {
  it('every ESPN spelling resolves to a real team', () => {
    const bad = espnNames.filter((n) => !canonical.has(normEspn(n))).map((n) => `${n} → ${normEspn(n)}`)
    expect(bad, `ESPN spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('every TheSportsDB spelling resolves to a real team', () => {
    const bad = sdbNames.filter((n) => !canonical.has(normSdb(n))).map((n) => `${n} → ${normSdb(n)}`)
    expect(bad, `TheSportsDB spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('both snapshots cover all 24 teams (no team left without a known spelling)', () => {
    // A team missing here is a spelling we have never seen — the exact gap that
    // silently drops its live score.
    for (const [label, names, norm] of [
      ['ESPN', espnNames, normEspn],
      ['TheSportsDB', sdbNames, normSdb],
    ]) {
      const covered = new Set(names.map(norm))
      const missing = [...canonical].filter((t) => !covered.has(t))
      expect(missing, `teams with no captured ${label} spelling: ${missing.join(', ')}`).toEqual([])
      expect(names).toHaveLength(24)
    }
  })

  it('regression: TheSportsDB’s two off-spellings resolve', () => {
    // This feed still uses the pre-rename forms; both are carried by
    // normalizeTeam, which is why SDB_ALIASES has nothing left to add.
    expect(normSdb('Czech Republic')).toBe('Czechia')
    expect(normSdb('Turkey')).toBe('Türkiye')
    expect(sdbNames).toContain('Czech Republic')
    expect(sdbNames).toContain('Turkey')
  })

  it('ESPN needs no renaming at all — it already uses the canonical forms', () => {
    expect(espnNames).toContain('Türkiye')
    expect(espnNames).toContain('Czechia')
    expect(espnNames.every((n) => canonical.has(n))).toBe(true)
  })
})

describe('alias tables carry no dead entries', () => {
  // Both maps are empty for this edition. The risk they guard against is the
  // opposite of a gap: an inherited entry for a team that is not in this
  // tournament, which reads as coverage while mapping nothing. Any entry must
  // earn its place by appearing in the corresponding capture.
  it.each([
    ['ESPN', ESPN_ALIASES, () => espnNames],
    ['TheSportsDB', SDB_ALIASES, () => sdbNames],
  ])('every %s alias key appears in the captured feed spellings', (_label, map, names) => {
    const unused = Object.keys(map).filter((k) => !names().includes(k))
    expect(unused, `alias keys never seen in the feed: ${unused.join(', ')}`).toEqual([])
  })

  it.each([
    ['ESPN', ESPN_ALIASES],
    ['TheSportsDB', SDB_ALIASES],
  ])('every %s alias target is a canonical team name', (_label, map) => {
    for (const target of Object.values(map)) expect(canonical.has(normalizeTeam(target))).toBe(true)
  })
})
