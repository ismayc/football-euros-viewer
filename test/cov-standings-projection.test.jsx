import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeClinch } from '../src/utils/clinch.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

// Clicking a team name opens the per-team group modal, which renders that team's
// projected knockout matchup via Standings' `teamKnockout` — exercising the `dest`
// selector (won-group → proj.first, runner-up → proj.second, else by current rank
// → first/second/third). We click teams of each clinched status to cover every arm.
// Standings takes `clinch` as a prop (App supplies it); teamKnockout returns null
// without it, so the projection selector is only reachable when it's passed.
const renderWith = (matches) =>
  render(
    <FollowProvider>
      <Standings matches={matches} hideScores={false} clinch={computeClinch(matches)} />
    </FollowProvider>,
  )

const clickTeam = (container, name) => {
  const btn = [...container.querySelectorAll('.row-team-btn')].find(
    (b) => b.textContent.trim() === name,
  )
  expect(btn, `clickable team button for ${name}`).toBeTruthy()
  fireEvent.click(btn)
}

describe('Standings — projected-matchup dest selector', () => {
  it('covers the runner-up and best-third arms on a completed group stage', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const complete = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(complete)
    const runnerUp = Object.keys(clinch).find((n) => clinch[n] === 'runner-up')
    const third = Object.keys(clinch).find((n) => clinch[n] === 'third')
    expect(runnerUp).toBeTruthy()
    expect(third).toBeTruthy()

    const { container } = renderWith(complete)
    // Opening each team's modal runs teamKnockout → the dest selector.
    clickTeam(container, runnerUp) // status 'runner-up' → proj.second
    clickTeam(container, third) // status 'third', rank 3 → proj.third
  })

  it('covers the top-2 (order-open) rank-1 and rank-2 arms', () => {
    // Group A only: Germany and Scotland each beat the other two and have not yet
    // met (nor have the bottom two), so both are guaranteed top-2 with order open
    // ('top2'). Germany's bigger margins make it the current rank 1, Scotland rank 2.
    const scores = {
      14: [2, 0], // Germany 2–0 Hungary
      26: [0, 2], // Switzerland 0–2 Germany
      15: [1, 0], // Scotland 1–0 Switzerland
      25: [1, 0], // Scotland 1–0 Hungary
      // M1 (Germany v Scotland) and M2 (Hungary v Switzerland) unplayed.
    }
    const fixture = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(fixture)
    expect(clinch['Germany']).toBe('top2')
    expect(clinch['Scotland']).toBe('top2')

    const { container } = renderWith(fixture)
    clickTeam(container, 'Germany') // top2, current rank 1 → proj.first
    clickTeam(container, 'Scotland') // top2, current rank 2 → proj.second
  })
})

describe('Standings — projection off, and a clinch the table cannot place', () => {
  it('hides the "as it stands" block when the projection is switched off', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const complete = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))

    const { container: on } = renderWith(complete)
    expect(on.querySelector('.as-it-stands')).toBeTruthy()

    // The preference persists across visits, so a returning viewer who turned it
    // off last time gets a table with no projection attached.
    localStorage.setItem('euros:asItStands', '0')
    const { container: off } = renderWith(complete)
    expect(off.querySelector('.as-it-stands')).toBeNull()
    localStorage.removeItem('euros:asItStands')
  })

  it('offers no projected matchup for a clinched team the group table does not list', () => {
    // clinch arrives as a prop from App. If it ever names a team that is not in
    // the computed group rows — a stale verdict against a refreshed board — the
    // projection has nothing to hang off and must simply not be offered.
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const complete = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = { ...computeClinch(complete), 'Nowhere United': 'won-group' }
    const { container } = render(
      <FollowProvider>
        <Standings matches={complete} hideScores={false} clinch={clinch} />
      </FollowProvider>,
    )
    // The phantom team is not in any group, so nothing about it is rendered.
    expect(container.textContent).not.toMatch(/Nowhere United/)
  })
})

describe('Standings — what "as it stands" shows when the bracket cannot answer', () => {
  // A full Group A round-robin, every game 0-0, so the table is level all the
  // way down to the soft criteria and no group but A has anything on it.
  const A = ['Germany', 'Hungary', 'Scotland', 'Switzerland']
  const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
  const groupA = () =>
    PAIRS.map(([i, j], k) => ({
      num: 100 + k,
      stage: 'Group',
      group: 'A',
      t1: A[i],
      t2: A[j],
      ko: `2024-06-2${k}T15:00:00Z`,
      score: [0, 0],
    }))

  it('shows TBD when the tie a qualifier feeds into has no group slot opposite', () => {
    const board = [
      ...groupA(),
      { num: 900, stage: 'R16', t1: 'Winner Group A', t2: 'Winner Match 5', ko: '2024-07-05T15:00:00Z' },
    ]
    const { container } = render(
      <FollowProvider>
        <Standings matches={board} hideScores={false} clinch={computeClinch(board)} />
      </FollowProvider>,
    )
    const row = container.querySelector('.ais-row')
    expect(row.querySelector('.ais-opp').textContent).toBe('TBD')
  })

  it('offers a through team no matchup at all when neither source can name one', () => {
    // A board with no knockout fixtures on it (they are published later) and a
    // team the clinch prop calls top-two while the table still has it 4th — the
    // rank ladder has no destination to offer, and neither has the locked
    // opponent, so the modal opens on the clinch verdict alone.
    // Germany carries no European Qualifiers rank (they were hosts), so on a
    // table that is level throughout they sort last.
    const board = groupA()
    const clinch = { Germany: 'top2' }
    const { container } = render(
      <FollowProvider>
        <Standings matches={board} hideScores={false} clinch={clinch} />
      </FollowProvider>,
    )
    // Teeth: the whole point is that Germany is OUTSIDE the top three, so the
    // rank ladder falls off its end. If the table ever ranked them 1-3 this test
    // would pass for the wrong reason.
    const gerRow = [...container.querySelectorAll('tr')].find((tr) =>
      tr.querySelector('.row-team')?.textContent.trim() === 'Germany',
    )
    expect(gerRow.querySelector('.rank').textContent).toBe('4')

    clickTeam(container, 'Germany')
    expect(document.querySelector('.gg-ko-tbd').textContent).toBe('To be determined')
    expect(document.querySelector('.gg-ko-num')).toBeNull()
  })
})
