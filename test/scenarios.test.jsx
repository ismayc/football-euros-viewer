import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeQualification } from '../src/utils/qualification.js'
import {
  remainingGroupMatches,
  applyScenarioPicks,
  unpickedCount,
  possibleOrderings,
  pickOutcome,
  groupStageArchived,
  stageArchived,
  PICK_SCORES,
} from '../src/utils/scenarios.js'
import ScenariosView from '../src/components/ScenariosView.jsx'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// Groups B–F complete, Group A's final round (Matches 25 and 26) still to play.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

// The same snapshot with Group B's final round (27, 28) re-opened, and Group A's
// first two matchdays rewritten so Germany win the group with a game to spare.
// That gives the view two in-play groups to draw cards for, one of which has a
// mathematically locked matchup (Germany, as the confirmed Group A winner, meet
// the Group C runner-up, and Group C is already final) while the other does not
// (Group B's winner meets a third-place slot, which can't settle while Group A
// is unfinished).
const twoOpen = (() => {
  const scores = { ...GROUP_STAGE_MD3, 1: [3, 0], 2: [0, 0], 14: [3, 0], 15: [0, 0] }
  delete scores[27]
  delete scores[28]
  return MATCHES.map((m) => (m.stage === 'Group' && scores[m.num] ? { ...m, score: scores[m.num] } : m))
})()

describe('scenarios util', () => {
  it('lists only unplayed group games, grouped by group', () => {
    const rem = remainingGroupMatches(snapshot)
    // Snapshot has exactly one incomplete group, with its final 2 games.
    expect(Object.keys(rem).sort()).toEqual(['A'])
    for (const g of Object.keys(rem)) expect(rem[g]).toHaveLength(2)
    expect(unpickedCount(snapshot, {})).toBe(2)
  })

  it('applies a scoreline pick without mutating input', () => {
    const before = MATCHES.find((m) => m.num === 25)
    const out = applyScenarioPicks(snapshot, { 25: [0, 2] })
    expect(out.find((m) => m.num === 25).score).toEqual([0, 2])
    expect(before.score).toBeUndefined() // original untouched
    expect(unpickedCount(snapshot, { 25: [0, 2] })).toBe(1)
  })

  it('reads the win/draw/loss category of a scoreline', () => {
    expect(pickOutcome(PICK_SCORES.home)).toBe('home')
    expect(pickOutcome([2, 2])).toBe('draw')
    expect(pickOutcome([0, 3])).toBe('away')
    expect(pickOutcome(undefined)).toBeNull()
  })

  it('a chosen result changes the projected standings', () => {
    // Group A, match 25 (Scotland v Hungary): give Scotland the win and they gain points.
    const base = computeQualification(snapshot).groups['A'].find((r) => r.name === 'Scotland')
    const after = computeQualification(applyScenarioPicks(snapshot, { 25: PICK_SCORES.home })).groups[
      'A'
    ].find((r) => r.name === 'Scotland')
    expect(after.Pts).toBe(base.Pts + 3)
  })

  it('counts distinct reachable final standings, collapsing to 1 when fully set', () => {
    // Group A has 2 games left -> several possible orders; pinning both exact
    // scorelines leaves exactly one final standing.
    const open = possibleOrderings('A', snapshot)
    expect(open.count).toBeGreaterThan(1)
    expect(open.decided).toBe(false)
    const set = applyScenarioPicks(snapshot, { 25: [0, 1], 26: [2, 0] })
    expect(possibleOrderings('A', set)).toEqual({ count: 1, decided: true })
  })
})

describe('groupStageArchived', () => {
  const allDone = MATCHES.map((m) => (m.stage === 'Group' ? { ...m, score: m.score || [1, 0] } : m))

  it('is false while any group game is unplayed', () => {
    expect(groupStageArchived(MATCHES)).toBe(false)
  })
  it('is false while a group game is still live (not yet settled)', () => {
    const oneLive = allDone.map((m) => (m.num === 1 ? { ...m, live: { clock: "70'" } } : m))
    expect(groupStageArchived(oneLive)).toBe(false)
  })
  it('is true as soon as every group game is final', () => {
    expect(groupStageArchived(allDone)).toBe(true)
  })
})

describe('stageArchived (generic, per-stage)', () => {
  const r16Done = MATCHES.map((m) => (m.stage === 'R16' ? { ...m, score: [1, 0] } : m))

  it('is false while any of the stage’s games is unplayed', () => {
    expect(stageArchived(MATCHES, 'R16')).toBe(false)
  })
  it('is false while one of the stage’s games is still live', () => {
    const oneLive = r16Done.map((m) => (m.num === 37 ? { ...m, live: { clock: "70'" } } : m))
    expect(stageArchived(oneLive, 'R16')).toBe(false)
  })
  it('is true once every game in the stage is final', () => {
    expect(stageArchived(r16Done, 'R16')).toBe(true)
  })
  it('is false for a stage with no games', () => {
    expect(stageArchived(MATCHES, 'Nope')).toBe(false)
  })
})

describe('ScenariosView', () => {
  it('renders a card per group still in play and reacts to a pick', () => {
    render(<ScenariosView matches={twoOpen} />)
    expect(screen.getByText('4 games still open')).toBeInTheDocument()
    // One card per incomplete group — and none for the four already decided.
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group B')).toBeInTheDocument()
    expect(screen.queryByText('Group C')).toBeNull()
    // Each in-play group reports how many final orders are still possible.
    expect(screen.getAllByText(/possible orders/).length).toBeGreaterThan(0)

    // Picking a result decrements the open-game counter and reveals Clear.
    const firstWin = screen.getAllByTitle(/win$/i)[0]
    fireEvent.click(firstWin)
    expect(screen.getByText('3 games still open')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear picks'))
    expect(screen.getByText('4 games still open')).toBeInTheDocument()
  })

  it('marks a locked projected R16 matchup with a confirmed checkmark', () => {
    // Germany have already won Group A and the Group C runner-up is settled, so
    // Group A's "1st" projected line is confirmed without any picks.
    render(<ScenariosView matches={twoOpen} />)
    const card = screen.getByText('Group A').closest('.sc-card')
    expect(card.querySelector('.sc-r16-lock')).toBeInTheDocument()
    // The bare checkmark carries an accessible label but no "Matchup confirmed" text.
    expect(within(card).getByLabelText('Matchup confirmed')).toBeInTheDocument()
    expect(within(card).queryByText(/Matchup confirmed/)).toBeNull()
    // Group B's winner meets a third-place slot, which can't settle while Group A
    // is unfinished — so that card shows no confirmed matchup yet.
    const open = screen.getByText('Group B').closest('.sc-card')
    expect(open.querySelector('.sc-r16-lock')).toBeNull()
  })

  it('exposes goal steppers once a result is set, and they adjust the score', () => {
    render(<ScenariosView matches={snapshot} />)
    // Set the first fixture to a home win, which reveals the score steppers.
    fireEvent.click(screen.getAllByTitle(/win$/i)[0])
    expect(screen.getByText('1–0')).toBeInTheDocument()
    // Bump the home side to 2 goals.
    fireEvent.click(screen.getAllByLabelText(/goals plus$/i)[0])
    expect(screen.getByText('2–0')).toBeInTheDocument()
  })

  it('shows the all-groups-decided empty state', () => {
    // Every group already complete → no scenarios.
    const allDone = MATCHES.map((m) =>
      m.stage === 'Group' ? { ...m, score: m.score || [1, 0] } : m,
    )
    render(<ScenariosView matches={allDone} />)
    expect(screen.getByText(/Every group is decided/i)).toBeInTheDocument()
  })
})
