import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { enumerateOutlook, countRemaining, countIterations, ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// The snapshot has Groups B–F complete and Group A's final round (Matches 25
// and 26) still to play — small enough to enumerate exactly, while still
// exercising the cross-group third race over real goal differences.
const reduced = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

// Fixed margin cap so the weighted space is deterministic: Group A has two games
// left, so the space is (2·CAP+1)^2 equally-weighted margin combinations.
const CAP = 5
const SPACE = (2 * CAP + 1) ** 2 // 11^2 = 121

describe('outlook enumeration (exact, goal-difference)', () => {
  it('reports the remaining-games count', () => {
    expect(countRemaining(reduced)).toBe(2) // Group A's last two games
    expect(countIterations(reduced)).toBeGreaterThan(0)
  })

  it('enumerates the full weighted margin space; every slot sums to the total', () => {
    const { total, cap, perMatch } = enumerateOutlook(reduced, null, CAP)
    expect(cap).toBe(CAP)
    expect(total).toBe(SPACE)
    for (const num of Object.keys(ENTRY_SLOT_LABELS)) {
      for (const side of perMatch[num]) {
        const sum = side.candidates.reduce((s, c) => s + c.count, 0)
        expect(sum).toBe(total) // a fully-resolvable bracket fills every slot
      }
    }
  })

  it('locks a slot fed by a completed group (Winner Group B → Match 39)', () => {
    const { perMatch } = enumerateOutlook(reduced, null, CAP)
    // Group B is complete in the snapshot, so its winner fills Match 39 in 100%
    // of outcomes regardless of the remaining margins.
    expect(perMatch[39][0].locked).toBeTruthy()
  })

  it('gives exact rational shares and reports progress to completion', () => {
    let lastDone = 0
    let lastTotal = 0
    const { perMatch, total } = enumerateOutlook(
      reduced,
      (done, t) => {
        lastDone = done
        lastTotal = t
      },
      CAP,
    )
    expect(lastDone).toBe(lastTotal) // final progress callback fires at 100%
    // Every candidate share is an exact count/total fraction.
    for (const side of perMatch[41]) {
      for (const c of side.candidates) {
        expect(Number.isInteger(c.count)).toBe(true)
        expect(c.pct).toBeCloseTo(c.count / total, 12)
      }
    }
  })
})
