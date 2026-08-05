import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
import { TEAMS } from '../src/data/teams.js'
import { countIterations, enumerateOutlook } from '../src/utils/outlookEnum.js'

const ALL = unscored(PLAYED)
const GROUPS = Object.keys(TEAMS)

// Every group's final-round fixtures, read off the real schedule so a data
// refresh cannot desync them.
const LAST_TWO = Object.fromEntries(
  GROUPS.map((g) => [
    g,
    ALL.filter((m) => m.stage === 'Group' && m.group === g)
      .slice(-2)
      .map((m) => m.num),
  ]),
)

// A board where every group is decided except the final round of `keepOpen`.
function boardWithOpen(keepOpen) {
  const open = new Set(keepOpen.flatMap((g) => LAST_TWO[g]))
  return PLAYED.map((m) => {
    if (m.stage !== 'Group' || !open.has(m.num)) return m
    const { score, pens, aet, goals, live, statusLabel, cards, ...rest } = m
    return rest
  })
}

/**
 * enumerateOutlook reports progress every 50,000 combinations so the worker can
 * drive a progress bar on a wide-open group stage. Every other test here runs a
 * board small enough to finish inside one step, so the heartbeat never fires.
 *
 * Rather than hard-code how many open groups clear 50,000 — which depends on how
 * many distinct outcomes each group has, and so on the committed board — grow the
 * open set until the count says it will, and use the first size that does.
 */
const STEP = 50_000
const smallestOpenSetOverStep = () => {
  for (let n = 1; n <= GROUPS.length; n++) {
    const keep = GROUPS.slice(0, n)
    const board = boardWithOpen(keep)
    if (countIterations(board) >= STEP) return board
  }
  return null
}

describe('outlook enumeration progress', () => {
  it('reports progress every 50,000 combinations, and once more at the end', () => {
    const board = smallestOpenSetOverStep()
    expect(board).not.toBeNull()

    const calls = []
    const { total } = enumerateOutlook(board, (done, iters) => calls.push([done, iters]))

    // At least one mid-run heartbeat plus the final one.
    expect(calls.length).toBeGreaterThan(1)
    const [firstDone] = calls[0]
    expect(firstDone).toBe(STEP)
    expect(firstDone % STEP).toBe(0)

    // Every heartbeat reports against the same total, and the last one is the
    // completion ping rather than another multiple of the step.
    const iters = calls[0][1]
    expect(calls.every(([, n]) => n === iters)).toBe(true)
    expect(calls[calls.length - 1][0]).toBe(iters)
    expect(total).toBeGreaterThan(0)
  })
})
