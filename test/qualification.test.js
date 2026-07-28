import { describe, it, expect } from 'vitest'
import { rankGroup, computeQualification, groupComplete, ADVANCING_THIRDS } from '../src/utils/qualification.js'
import { TEAMS } from '../src/data/teams.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored, onlyGroupScores, groupTeams } from './helpers/tournament.js'
import { QUALIFIER_RANK, UNRANKED_REASON, byQualifierRank } from '../src/data/qualifierRanking.js'

// This edition is finished, so the committed schedule ships with every result in
// it. Tie-breaker tests need a board they control, so they build one from an
// unscored schedule; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Group C — Denmark, England, Serbia, Slovenia — is the workhorse for the
// tie-breaker cases: all four are ranked in the European Qualifiers table, so
// even a dead-even tie resolves to a definite order rather than a fallback.
const scoreC = (results) => onlyGroupScores('C', results)

describe('European Qualifiers ranking data', () => {
  it('ranks the 20 teams that qualified through the group stage, with unique positions', () => {
    expect(Object.keys(QUALIFIER_RANK)).toHaveLength(20)
    expect(new Set(Object.values(QUALIFIER_RANK)).size).toBe(20) // no duplicate positions
  })

  it('leaves exactly the hosts and the three play-off winners unranked, each with a reason', () => {
    const all = Object.values(TEAMS).flat().map((t) => t.name)
    expect(all).toHaveLength(24)
    const unranked = all.filter((n) => QUALIFIER_RANK[n] === undefined)
    expect(new Set(unranked)).toEqual(new Set(['Germany', 'Georgia', 'Poland', 'Ukraine']))
    for (const n of unranked) expect(UNRANKED_REASON[n], `missing reason for ${n}`).toBeTypeOf('string')
  })

  it('places any ranked team ahead of an unranked one, and orders two unranked alphabetically', () => {
    expect(byQualifierRank('Portugal', 'Germany')).toBeLessThan(0)
    expect(byQualifierRank('Germany', 'Portugal')).toBeGreaterThan(0)
    expect(byQualifierRank('Georgia', 'Poland')).toBeLessThan(0)
    expect(byQualifierRank('Poland', 'Georgia')).toBeGreaterThan(0)
  })
})

describe('rankGroup — UEFA tie-breakers', () => {
  it('orders by points when points are distinct', () => {
    const rows = rankGroup('C', scoreC([
      ['Denmark', 'England', 2, 0],
      ['Denmark', 'Serbia', 3, 0],
      ['Denmark', 'Slovenia', 1, 0],
      ['England', 'Serbia', 2, 1],
      ['England', 'Slovenia', 1, 0],
      ['Slovenia', 'Serbia', 2, 0],
    ]))
    expect(rows.map((r) => r.name)).toEqual(['Denmark', 'England', 'Slovenia', 'Serbia'])
    expect(rows[0].Pts).toBe(9)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('applies head-to-head BEFORE overall goal difference', () => {
    // Denmark and England both finish on 6 points. Denmark has a far better
    // OVERALL goal difference (+9 to +1), but England beat Denmark head-to-head.
    // Under UEFA's order head-to-head wins, so England ranks above Denmark —
    // the exact case a GD-first order gets wrong.
    const rows = rankGroup('C', scoreC([
      ['England', 'Denmark', 1, 0], // H2H: England beat Denmark
      ['Denmark', 'Serbia', 5, 0],
      ['Denmark', 'Slovenia', 5, 0], // Denmark runs up a big overall GD
      ['England', 'Serbia', 1, 0],
      ['Slovenia', 'England', 1, 0], // keeps England on 6 with a slim GD
      ['Serbia', 'Slovenia', 1, 0],
    ]))
    const den = rows.find((r) => r.name === 'Denmark')
    const eng = rows.find((r) => r.name === 'England')
    expect([den.Pts, eng.Pts]).toEqual([6, 6])
    expect(den.GD).toBeGreaterThan(eng.GD) // Denmark far better on overall GD…
    expect(rows.slice(0, 2).map((r) => r.name)).toEqual(['England', 'Denmark']) // …yet England first
  })

  it('resolves a 3-way head-to-head cycle by overall goal difference', () => {
    // Denmark, England and Slovenia each beat one and lose one among themselves
    // (a perfect cycle → identical head-to-head sub-table), but beat Serbia by
    // different margins, so overall GD separates them.
    const rows = rankGroup('C', scoreC([
      ['Denmark', 'England', 1, 0],
      ['England', 'Slovenia', 1, 0],
      ['Slovenia', 'Denmark', 1, 0],
      ['Denmark', 'Serbia', 5, 0],
      ['England', 'Serbia', 3, 0],
      ['Slovenia', 'Serbia', 1, 0],
    ]))
    expect(rows.slice(0, 3).every((r) => r.Pts === 6)).toBe(true) // all level on points
    expect(rows.map((r) => r.name)).toEqual(['Denmark', 'England', 'Slovenia', 'Serbia'])
  })

  it('splits two teams level on points and head-to-head by overall goal difference', () => {
    // Denmark and England both on 4 points and drew head-to-head, so the
    // sub-table can't separate them and it falls through to overall GD.
    const rows = rankGroup('C', scoreC([
      ['Denmark', 'England', 0, 0], // head-to-head draw
      ['Slovenia', 'Denmark', 1, 0],
      ['Slovenia', 'England', 1, 0],
      ['Slovenia', 'Serbia', 1, 0],
      ['Denmark', 'Serbia', 3, 0], // Denmark's overall GD is better
      ['England', 'Serbia', 1, 0],
    ]))
    const den = rows.find((r) => r.name === 'Denmark')
    const eng = rows.find((r) => r.name === 'England')
    expect(den.Pts).toBe(eng.Pts)
    expect(den.GD).toBeGreaterThan(eng.GD)
    expect(rows.map((r) => r.name)).toEqual(['Slovenia', 'Denmark', 'England', 'Serbia'])
  })

  // Denmark and England finish identical on points, GD and goals scored, and
  // drew head-to-head — so the only things left are disciplinary points and then
  // the European Qualifiers ranking. The tests below share this board and differ
  // only in whether cards are attached.
  const DEAD_EVEN = [
    ['Denmark', 'England', 0, 0], // head-to-head draw
    ['Denmark', 'Serbia', 1, 0],
    ['Slovenia', 'Denmark', 1, 0],
    ['England', 'Serbia', 1, 0],
    ['Slovenia', 'England', 1, 0],
    ['Serbia', 'Slovenia', 1, 0],
  ]

  // Attach cards to England in the Denmark–England match, whichever way round
  // the real fixture lists the two sides.
  const cardEngland = (cards) =>
    scoreC(DEAD_EVEN).map((m) =>
      m.stage === 'Group' && m.group === 'C' &&
      [m.t1, m.t2].includes('Denmark') && [m.t1, m.t2].includes('England')
        ? { ...m, cards: { [m.t1 === 'England' ? 't1' : 't2']: cards } }
        : m,
    )

  it('breaks a dead-even tie by the European Qualifiers ranking when no cards are recorded', () => {
    const rows = rankGroup('C', scoreC(DEAD_EVEN))
    const den = rows.find((r) => r.name === 'Denmark')
    const eng = rows.find((r) => r.name === 'England')
    expect([den.Pts, den.GD, den.GF]).toEqual([eng.Pts, eng.GD, eng.GF]) // level on every match criterion
    // England is 5th in the qualifying ranking, Denmark 9th → England ahead.
    expect(QUALIFIER_RANK.England).toBeLessThan(QUALIFIER_RANK.Denmark)
    expect(eng.rank).toBeLessThan(den.rank)
  })

  it('uses disciplinary points BEFORE the qualifying ranking', () => {
    // Same board, but England picked up two yellows in the head-to-head. Fewer
    // disciplinary points wins, so Denmark now goes ahead — reversing the order
    // the qualifying ranking produced above.
    const rows = rankGroup('C', cardEngland([{ color: 'yellow' }, { color: 'yellow' }]))
    const den = rows.find((r) => r.name === 'Denmark')
    const eng = rows.find((r) => r.name === 'England')
    expect([den.Pts, den.GD, den.GF]).toEqual([eng.Pts, eng.GD, eng.GF]) // still level on goals
    expect(eng.conduct).toBe(-2)
    expect(den.conduct).toBe(0)
    expect(den.rank).toBeLessThan(eng.rank) // fair play puts Denmark ahead
  })

  it('scores a red card heavier than a yellow', () => {
    expect(rankGroup('C', cardEngland([{ color: 'red' }])).find((r) => r.name === 'England').conduct).toBe(-3)
  })

  it('puts a ranked team ahead of the unranked hosts in a dead-even tie', () => {
    // Group A: Germany (hosts, unranked — UEFA would have drawn lots) finishes
    // level with Switzerland on every computable criterion, so Switzerland goes
    // ahead rather than the order falling to chance.
    const rows = rankGroup('A', onlyGroupScores('A', [
      ['Germany', 'Switzerland', 0, 0], // head-to-head draw
      ['Germany', 'Scotland', 1, 0],
      ['Hungary', 'Germany', 1, 0],
      ['Switzerland', 'Scotland', 1, 0],
      ['Hungary', 'Switzerland', 1, 0],
      ['Scotland', 'Hungary', 1, 0],
    ]))
    const ger = rows.find((r) => r.name === 'Germany')
    const sui = rows.find((r) => r.name === 'Switzerland')
    expect([ger.Pts, ger.GD, ger.GF]).toEqual([sui.Pts, sui.GD, sui.GF])
    expect(QUALIFIER_RANK.Germany).toBeUndefined()
    expect(sui.rank).toBeLessThan(ger.rank)
  })

  it('with no results, ranks all four teams 1–4 by the qualifying ranking', () => {
    const rows = rankGroup('C', [])
    // England 5 < Denmark 9 < Slovenia 15 < Serbia 19.
    expect(rows.map((r) => r.name)).toEqual(['England', 'Denmark', 'Slovenia', 'Serbia'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => r.Pts === 0)).toBe(true)
  })

  it('ignores a voided match', () => {
    const board = scoreC([['Denmark', 'England', 3, 0]]).map((m) =>
      m.stage === 'Group' && m.group === 'C' && m.score ? { ...m, voided: true } : m,
    )
    expect(rankGroup('C', board).every((r) => r.P === 0)).toBe(true)
  })
})

describe('computeQualification', () => {
  it('with no results, has six groups, six thirds and nothing complete', () => {
    const q = computeQualification(MATCHES)
    expect(Object.keys(q.groups)).toHaveLength(6)
    expect(q.thirds).toHaveLength(6)
    expect(q.allComplete).toBe(false)
    expect(Object.values(q.completion).every((c) => c === false)).toBe(true)
  })

  it('always names four best third-placed teams, ordered by points then GD then goals', () => {
    const q = computeQualification(MATCHES)
    expect(ADVANCING_THIRDS).toBe(4)
    expect(q.bestThirds.size).toBe(4)
    for (let i = 1; i < q.thirds.length; i++) {
      const [a, b] = [q.thirds[i - 1], q.thirds[i]]
      expect(b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF).toBeLessThanOrEqual(0)
    }
  })

  it('every group has its four teams ranked 1–4', () => {
    const q = computeQualification(MATCHES)
    for (const g of Object.keys(TEAMS)) {
      expect(q.groups[g].map((r) => r.rank)).toEqual([1, 2, 3, 4])
      expect(q.groups[g].map((r) => r.name).sort()).toEqual([...groupTeams(g)].sort())
    }
  })

  it('flags completion per group and overall', () => {
    const scored = MATCHES.map((m) =>
      m.stage === 'Group' && m.group === 'C' ? { ...m, score: [1, 0] } : m,
    )
    const q = computeQualification(scored)
    expect(q.completion.C).toBe(true)
    expect(q.completion.A).toBe(false)
    expect(q.allComplete).toBe(false)
    expect(computeQualification(PLAYED).allComplete).toBe(true)
  })

  it('reproduces the real Euro 2024 group winners and best thirds from the committed results', () => {
    const q = computeQualification(PLAYED)
    expect(Object.fromEntries(Object.entries(q.groups).map(([g, rows]) => [g, rows[0].name]))).toEqual({
      A: 'Germany', B: 'Spain', C: 'England', D: 'Austria', E: 'Romania', F: 'Portugal',
    })
    // Netherlands, Slovakia, Slovenia and Georgia went through as best thirds;
    // Hungary and Croatia did not.
    expect([...q.bestThirds].sort()).toEqual(['Georgia', 'Netherlands', 'Slovakia', 'Slovenia'])
  })
})

describe('groupComplete', () => {
  it('is true only once all six group matches are scored', () => {
    const cMatches = MATCHES.filter((m) => m.stage === 'Group' && m.group === 'C')
    expect(cMatches).toHaveLength(6)
    expect(groupComplete('C', [])).toBe(false)
    const five = cMatches.slice(0, 5).map((m) => ({ ...m, score: [1, 0] }))
    expect(groupComplete('C', five)).toBe(false)
    expect(groupComplete('C', cMatches.map((m) => ({ ...m, score: [1, 0] })))).toBe(true)
  })
})
