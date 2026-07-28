import { describe, it, expect } from 'vitest'
import { countIterations } from '../src/utils/outlookEnum.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'

const GROUPS = Object.keys(TEAMS)

describe('outlookEnum — chooseCaps fallback', () => {
  it('returns the floor-cap result when every cap overflows MAX_ITERS', () => {
    // Leave the last THREE games of EVERY group unplayed (fill the rest). Each
    // group's own enumeration stays cheap, but the cross-group product of
    // distinct outcomes still exceeds MAX_ITERS (12M) at every cap — so
    // chooseCaps walks each cap from the base down to 3 without an early return
    // and falls through to `return last`. countIterations surfaces that floor
    // count. Six groups make a far smaller space than the World Cup's twelve, so
    // this needs more open games than the sibling app to overflow at all.
    const openNums = new Set()
    for (const g of GROUPS) {
      const nums = MATCHES.filter((m) => m.stage === 'Group' && m.group === g)
        .map((m) => m.num)
        .sort((a, b) => a - b)
      for (const n of nums.slice(-3)) openNums.add(n) // last three stay open
    }
    const matches = MATCHES.map((m) =>
      m.stage === 'Group' && !openNums.has(m.num) ? { ...m, score: [1, 0] } : m,
    )
    const iters = countIterations(matches)
    expect(iters).toBeGreaterThan(12_000_000)
  })
})
