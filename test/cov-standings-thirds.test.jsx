import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
import { computeClinch } from '../src/utils/clinch.js'

// This edition is finished, so the committed schedule ships with every result in
// it. These boards are built from a blank one so each group can be driven to the
// exact shape the best-thirds card needs.
const BLANK = unscored(PLAYED)

// Apply a { matchNum: score } map, plus optional per-match overrides.
const board = (scores, over = {}) =>
  BLANK.map((m) =>
    over[m.num]
      ? { ...m, ...over[m.num] }
      : scores[m.num]
        ? { ...m, score: scores[m.num] }
        : m,
  )

const renderStandings = (matches, clinch) =>
  render(
    <FollowProvider>
      <Standings matches={matches} hideScores={false} clinch={clinch ?? computeClinch(matches)} />
    </FollowProvider>,
  )

// Group A driven so Germany finish third on 3 points with a POSITIVE goal
// difference: they thump Hungary and lose both other games by one.
//   14 Germany 3-0 Hungary · 1 Germany 0-1 Scotland · 26 Switzerland 1-0 Germany
// Scotland and Switzerland take 7 apiece, Hungary none.
const GROUP_A = { 14: [3, 0], 1: [0, 1], 15: [0, 0], 25: [1, 0], 2: [0, 1], 26: [1, 0] }
// Group D, the same shape, so Poland finish third on exactly Germany's numbers.
//   20 Poland 3-0 Austria · 5 Poland 0-1 Netherlands · 29 France 1-0 Poland
const GROUP_D = { 20: [3, 0], 5: [0, 1], 21: [0, 0], 30: [1, 0], 10: [0, 1], 29: [1, 0] }

describe('Best thirds — a tie neither the table nor the ranking can explain away', () => {
  // Germany and Poland are the only two Euro 2024 teams in these groups that
  // carry no European Qualifiers rank (hosts and play-off entrant), so a tie
  // between them is the one case where the note has no number to print.
  const matches = board({ ...GROUP_A, ...GROUP_D })

  it('names the qualifiers ranking, and prints a dash for teams it has no number for', () => {
    const { container } = renderStandings(matches)
    const note = container.querySelector('.thirds-tie-note')
    expect(note).toBeTruthy()
    const li = [...note.querySelectorAll('li')].find(
      (n) => /Germany/.test(n.textContent) && /Poland/.test(n.textContent),
    )
    expect(li, 'a tie-note line pairing Germany with Poland').toBeTruthy()
    // Level on points, GD and goals, and level on conduct too — so the note has
    // to fall through to the ranking rather than to fair play.
    expect(li.textContent).toMatch(/European Qualifiers ranking/)
    // Neither side has a qualifying rank: both print the em-dash placeholder.
    expect(li.textContent).toMatch(/Germany #—/)
    expect(li.textContent).toMatch(/Poland #—/)
    // A positive goal difference is signed in the note itself...
    expect(li.textContent).toMatch(/goal difference \(\+1\)/)
  })

  it('signs a positive goal difference in the best-thirds table', () => {
    const { container } = renderStandings(matches)
    const row = [...container.querySelectorAll('.thirds-card tbody tr')].find(
      (tr) => /Germany/.test(tr.textContent),
    )
    expect(row, "Germany's row in the best-thirds table").toBeTruthy()
    expect([...row.querySelectorAll('td')].map((td) => td.textContent)).toContain('+1')
  })
})

describe('Best thirds — a group still playing whose fourth is already out', () => {
  // Group A with its last game in progress AND paused, so the group is not
  // final: the card looks for a fourth-placed side that could still climb into
  // a third-place spot. Hungary lost all three, so they are eliminated and the
  // card must NOT offer them as a contender.
  const matches = board(
    { ...GROUP_A, ...GROUP_D },
    { 26: { score: [1, 0], live: { delayed: true, label: 'Suspended' } } },
  )

  it('leaves an eliminated fourth-placed team off the contenders list', () => {
    const clinch = computeClinch(matches)
    expect(clinch['Hungary']).toBe('eliminated')
    const { container } = renderStandings(matches, clinch)
    const thirds = container.querySelector('.thirds-card')
    expect(thirds.textContent).not.toMatch(/Hungary/)
  })

  it('goes gold on a third-placed team whose match is paused, not merely live', () => {
    const { container } = renderStandings(matches)
    // Germany sit third in A and are the away side of the suspended game.
    const row = [...container.querySelectorAll('.thirds-card tbody tr')].find(
      (tr) => /Germany/.test(tr.textContent),
    )
    const dot = row.querySelector('.row-live-dot')
    expect(dot).toBeTruthy()
    expect(dot).toHaveClass('delayed')
    expect(dot.getAttribute('title')).toBe('Suspended — score is provisional')
  })
})
