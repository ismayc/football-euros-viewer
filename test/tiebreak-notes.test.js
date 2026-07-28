import { describe, it, expect } from 'vitest'
import { softTiebreaks, softThirdTiebreaks } from '../src/utils/tiebreakNotes.js'

// Group A teams: Germany, Hungary, Scotland, Switzerland. Build a full
// round-robin so we can force exact ties down to the soft criteria.
const A = ['Germany', 'Hungary', 'Scotland', 'Switzerland']
const PAIRS = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
]
function groupA(scores, cards = {}) {
  return PAIRS.map(([i, j], k) => ({
    num: 100 + k,
    stage: 'Group',
    group: 'A',
    t1: A[i],
    t2: A[j],
    score: scores[k],
    cards: cards[k],
  }))
}

describe('softTiebreaks', () => {
  it('flags placings separated only by the qualifying ranking', () => {
    // Every game 0-0: all four level on points, head-to-head, GD and goals, and
    // there are no cards — so the entire order is decided by the qualifying ranking.
    const matches = groupA(PAIRS.map(() => [0, 0]))
    const notes = softTiebreaks('A', matches)
    expect(notes.size).toBe(4)
    for (const name of A) expect(notes.get(name).reason).toBe('ranking')
  })

  it('flags a placing separated by fair-play conduct (cards)', () => {
    // All 0-0, but Switzerland picks up a red card → its conduct is worse, so the
    // pair straddling Switzerland is separated by conduct rather than the ranking.
    const cards = { 2: { t2: [{ color: 'red' }] } } // match Germany v Switzerland, Switzerland carded
    const notes = softTiebreaks('A', groupA(PAIRS.map(() => [0, 0]), cards))
    expect(notes.get('Switzerland').reason).toBe('conduct')
    expect(notes.get('Switzerland').vs).toBeTruthy()
  })

  it('adds no note when placings are separated by points or goal difference', () => {
    // Germany wins all, Switzerland loses all, the middle two split — clear on points
    // and goal difference, so nothing is down to a soft tie-breaker.
    const scores = [
      [1, 0], // MX v SA
      [1, 0], // MX v SK
      [3, 0], // MX v CZ
      [1, 0], // SA v SK
      [2, 0], // SA v CZ
      [2, 0], // SK v CZ
    ]
    const notes = softTiebreaks('A', groupA(scores))
    expect(notes.size).toBe(0)
  })

  it('flags cross-group best-thirds split by conduct or the qualifying ranking', () => {
    const thirds = [
      { name: 'Alpha', group: 'A', Pts: 3, GD: 1, GF: 3, conduct: 0 },
      { name: 'Bravo', group: 'B', Pts: 3, GD: 1, GF: 3, conduct: 0 }, // level with Alpha → ranking
      { name: 'Charlie', group: 'C', Pts: 3, GD: 0, GF: 2, conduct: 0 }, // lower GD, clear vs Bravo
      { name: 'Delta', group: 'D', Pts: 3, GD: 0, GF: 2, conduct: -1 }, // level with Charlie, worse conduct
      { name: 'Echo', group: 'E', Pts: 1, GD: -2, GF: 1, conduct: 0 }, // clear on points
    ]
    const notes = softThirdTiebreaks(thirds)
    expect(notes.get('Alpha').reason).toBe('ranking')
    expect(notes.get('Bravo').reason).toBe('ranking')
    expect(notes.get('Charlie').reason).toBe('conduct')
    expect(notes.get('Delta').reason).toBe('conduct')
    expect(notes.has('Echo')).toBe(false)
  })

  it('does not flag teams that are clear on head-to-head', () => {
    // Germany and Hungary both end on 6 pts with identical GD/GF, but Germany
    // beat Hungary head-to-head — so it's H2H, not a soft tie-breaker.
    const scores = [
      [1, 0], // MX v SA  -> Germany wins the head-to-head
      [2, 0], // MX v SK
      [0, 0], // MX v CZ
      [0, 0], // SA v SK
      [2, 0], // SA v CZ
      [0, 0], // SK v CZ
    ]
    const notes = softTiebreaks('A', groupA(scores))
    expect(notes.has('Germany')).toBe(false)
    expect(notes.has('Hungary')).toBe(false)
  })
})
