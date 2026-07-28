import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { lockedOpponent, reachableThirdSets } from '../src/utils/opponentClinch.js'
import { computeClinch } from '../src/utils/clinch.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// A real group-stage snapshot: Groups B–F complete, Group A still to play its
// final matchday (2 games left). Taken from the committed results so the
// cross-group third-place math is exercised against an authentic configuration.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

describe('lockedOpponent — knockout opponent clinch', () => {
  const clinch = computeClinch(snapshot)

  it('locks a winner against a third that every reachable combination pins to the same slot', () => {
    // Romania won Group E, and the Winner-E slot (Match 43) draws a third. Only
    // two best-thirds combinations are still reachable — ADEF and CDEF — and both
    // send group D's third to that slot, so the Netherlands are locked in even
    // though Group A has not finished.
    expect(lockedOpponent(snapshot, 'Romania', clinch)).toEqual({
      opponent: 'Netherlands',
      matchNum: 43,
    })
  })

  it('locks a winner vs runner-up tie once both groups finish', () => {
    // Austria (winner D) vs Türkiye (runner-up F), Match 44 — independent of the
    // thirds race entirely.
    const r = lockedOpponent(snapshot, 'Austria', clinch)
    expect(r?.matchNum).toBe(44)
    expect(r?.opponent).toBe('Türkiye')
  })

  it('locks a runner-up vs runner-up tie once both groups finish', () => {
    // France (runner-up D) vs Belgium (runner-up E), Match 42.
    const r = lockedOpponent(snapshot, 'France', clinch)
    expect(r?.matchNum).toBe(42)
    expect(r?.opponent).toBe('Belgium')
  })

  it('does NOT lock a winner whose opponent is an unresolved third', () => {
    // Spain won Group B, but its Winner-B slot (Match 39) faces "3rd Group
    // A/D/E/F" — and the two reachable combinations put different teams there,
    // so the opponent stays provisional.
    expect(lockedOpponent(snapshot, 'Spain', clinch)).toBeNull()
  })

  it('every still-reachable best-thirds combination keeps group D in the pool', () => {
    const sets = reachableThirdSets(snapshot)
    expect(sets).toEqual(['ADEF', 'CDEF'])
    expect(sets.every((key) => key.includes('D'))).toBe(true)
  })

  it('locks nothing before the tournament starts', () => {
    expect(lockedOpponent(MATCHES, 'Austria')).toBeNull()
    expect(reachableThirdSets(MATCHES).length).toBeGreaterThan(1)
  })
})
