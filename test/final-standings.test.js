import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { rankGroup } from '../src/utils/qualification.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { FINAL_GROUP_RESULTS, OFFICIAL_R16 } from './fixtures/final-group-results.js'

// Only the frozen group results are known here — the knockout sides must be
// DERIVED, not read back off the committed schedule, or the test proves nothing.
function fromGroupResultsOnly() {
  const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
  const matches = unscored().map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
  return resolveBracket(matches, computeClinch(matches))
}

// Replays each group's verified final result through the ranking engine and
// asserts the official finishing order — so a tie-breaker regression can't
// quietly send the wrong team into the knockouts.
describe('final group standings — locked against official results', () => {
  const groups = Object.entries(FINAL_GROUP_RESULTS)

  it('guards all six groups', () => {
    expect(groups.map(([g]) => g).sort()).toEqual(Object.keys(TEAMS).sort())
  })

  for (const [group, rec] of groups) {
    it(`Group ${group} finishes in the official order (${rec.sources.join('; ')})`, () => {
      // The locked scores must reference exactly that group's six matches.
      const groupNums = MATCHES.filter((m) => m.stage === 'Group' && m.group === group)
        .map((m) => m.num)
        .sort((a, b) => a - b)
      expect(Object.keys(rec.scores).map(Number).sort((a, b) => a - b)).toEqual(groupNums)

      const matches = MATCHES.map((m) =>
        rec.scores[m.num] ? { ...m, score: rec.scores[m.num] } : m,
      )
      expect(rankGroup(group, matches).map((r) => r.name)).toEqual(rec.order)
    })
  }

  it('decides Group E with all four teams level on points', () => {
    const rows = rankGroup('E', MATCHES)
    expect(rows.every((r) => r.Pts === 4)).toBe(true)
    expect(rows.map((r) => r.name)).toEqual(FINAL_GROUP_RESULTS.E.order)
  })
})

// The cross-group check no per-group order can make: which four thirds advance,
// and which Round-of-16 tie each lands in. That comes from UEFA's combination
// table applied to all six groups at once, so reproducing the real draw from the
// group results alone is what proves the table is right.
describe('Round-of-16 draw — locked against the official bracket', () => {
  it('resolves to the official Round-of-16 matchups from the group results alone', () => {
    const byNum = Object.fromEntries(fromGroupResultsOnly().map((m) => [m.num, m]))
    for (const [num, pair] of Object.entries(OFFICIAL_R16)) {
      expect([byNum[num].t1, byNum[num].t2], `R16 match ${num}`).toEqual(pair)
    }
  })

  it('leaves no placeholder in the Round of 16 once the group stage is complete', () => {
    for (const m of fromGroupResultsOnly().filter((m) => m.stage === 'R16')) {
      expect(/Group|3rd|Match/.test(`${m.t1} ${m.t2}`), `unresolved R16 M${m.num}`).toBe(false)
    }
  })

  it('sends exactly the four real third-placed qualifiers through', () => {
    const resolved = fromGroupResultsOnly()
    const thirds = unscored()
      .filter((m) => m.stage === 'R16' && m.label2.startsWith('3rd Group '))
      .map((m) => resolved.find((x) => x.num === m.num).t2)
    expect(thirds.sort()).toEqual(['Georgia', 'Netherlands', 'Slovakia', 'Slovenia'])
  })
})
