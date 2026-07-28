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
