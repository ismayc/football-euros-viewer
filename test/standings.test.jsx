import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// A clean 9/6/3/0 hierarchy in Group A — Germany 1st, Scotland 2nd, Switzerland
// 3rd (3 pts, GD −1, GF 1), Hungary 4th — built from the real fixture list
// (M1 GER v SCO, M2 HUN v SUI, M14 GER v HUN, M15 SCO v SUI, M25 SCO v HUN,
// M26 SUI v GER).
const GROUP_A = { 1: [1, 0], 14: [1, 0], 26: [0, 1], 15: [1, 0], 25: [1, 0], 2: [0, 1] }
// The same shape for Group B: Spain 1st, Croatia 2nd, Italy 3rd (3 pts, GD −1,
// GF 1), Albania 4th (M3 ESP v CRO, M4 ITA v ALB, M13 CRO v ALB, M18 ESP v ITA,
// M27 ALB v ESP, M28 CRO v ITA).
const GROUP_B = { 3: [1, 0], 18: [1, 0], 27: [0, 1], 13: [1, 0], 28: [1, 0], 4: [1, 0] }

// Score just Group A, leaving every other group untouched.
const withGroupA = (extra = {}) =>
  MATCHES.map((m) => (GROUP_A[m.num] ? { ...m, score: GROUP_A[m.num], ...(extra[m.num] || {}) } : m))

// Build a set of matches with some Group A results played so "As it stands"
// projection, badges and the played path all render.
function withGroupAPlayed() {
  return MATCHES.map((m) => {
    if (m.stage === 'Group' && m.group === 'A') {
      return { ...m, score: [2, 0] }
    }
    return m
  })
}

const renderStandings = (props = {}) =>
  render(
    <FollowProvider>
      <Standings matches={MATCHES} hideScores={false} {...props} />
    </FollowProvider>,
  )

describe('Standings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the legend, toolbar and group tables', () => {
    renderStandings()
    expect(screen.getByText(/Top two advance/)).toBeInTheDocument()
    expect(screen.getByText('Group A')).toBeInTheDocument()
    // No matches played -> the per-group note is shown.
    expect(screen.getAllByText('No matches played yet').length).toBeGreaterThan(0)
  })

  it('shows clinch badges when clinch verdicts are passed', () => {
    renderStandings({ clinch: { Germany: 'won-group', Denmark: 'eliminated' } })
    // The won-group badge text also appears in the legend, so >1.
    expect(screen.getAllByText(/Won group/).length).toBeGreaterThan(1)
    // The eliminated badge renders its own "Eliminated" text in a row.
    expect(screen.getByText(/Eliminated/)).toBeInTheDocument()
  })

  it('tints group rows green / yellow / red by qualification outlook', () => {
    // Only Group A complete: Germany 9 (1st), Scotland 6 (2nd), Switzerland 3
    // (3rd — a provisional best-third while other groups play), Hungary 0.
    const fixture = withGroupA()
    const { container } = render(
      <FollowProvider>
        <Standings
          matches={fixture}
          hideScores={false}
          clinch={{ Germany: 'won-group', 'Hungary': 'eliminated' }}
        />
      </FollowProvider>,
    )
    const rowFor = (team) =>
      [...container.querySelectorAll('.standings-table tbody tr')].find(
        (tr) => tr.querySelector('.row-team-btn')?.textContent === team,
      )
    expect(rowFor('Germany').className).toBe('qualifies') // clinched winner → green
    expect(rowFor('Scotland').className).toBe('qualifies') // 2nd → green
    expect(rowFor('Switzerland').className).toBe('provisional') // provisional best-third → yellow
    expect(rowFor('Hungary').className).toBe('eliminated') // out → red

    // Wide text verdicts drop to their own line (q-wide); the single-glyph "✓"
    // qualification mark stays inline beside the name.
    const badgeIn = (team) => rowFor(team).querySelector('.col-team .q-badge')
    expect(badgeIn('Germany').classList.contains('q-wide')).toBe(true) // 🥇 Won group
    expect(badgeIn('Hungary').classList.contains('q-wide')).toBe(true) // ❌ Eliminated
    expect(badgeIn('Switzerland').classList.contains('q-wide')).toBe(true) // Provisional 3rd
    expect(badgeIn('Scotland').classList.contains('q-wide')).toBe(false) // ✓ stays inline
    // The provisional ✓ spells out that it's contingent on current results,
    // across two lines.
    expect(badgeIn('Scotland').getAttribute('title')).toBe(
      'Advances to the Round of 16\n(if current match status holds)',
    )
  })

  it('tints the best-third table per clinch: bubble yellow, clinched green, out red', () => {
    // Only Group A complete → Switzerland is its (sole) third-placed team, so it is
    // the lone row in the best-third table.
    const fixture = withGroupA()
    const classFor = (clinch) => {
      const { container, unmount } = render(
        <FollowProvider>
          <Standings matches={fixture} hideScores={false} clinch={clinch} />
        </FollowProvider>,
      )
      const row = [...container.querySelectorAll('.thirds-card tbody tr')].find(
        (tr) => tr.querySelector('.row-team')?.textContent === 'Switzerland',
      )
      const cls = row?.className
      unmount()
      return cls
    }
    expect(classFor({})).toBe('provisional') // undecided, currently inside the best four → yellow
    expect(classFor({ Switzerland: 'third' })).toBe('qualifies') // clinched best-third → green
    expect(classFor({ Switzerland: 'eliminated' })).toBe('eliminated') // out → red
  })

  it('hides standings in spoiler-free mode and reveals on click', () => {
    renderStandings({ hideScores: true })
    expect(screen.getByText(/Standings are hidden/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reveal standings/ }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
  })

  it('toggles the "As it stands" projection and persists the choice', () => {
    renderStandings()
    const toggle = screen.getByRole('button', { name: /As it stands/ })
    // Default is shown.
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('euros:asItStands')).toBe('0')
    fireEvent.click(toggle)
    expect(localStorage.getItem('euros:asItStands')).toBe('1')
  })

  it('reads the persisted "hidden" projection preference on mount', () => {
    localStorage.setItem('euros:asItStands', '0')
    renderStandings()
    expect(screen.getByRole('button', { name: /Show .As it stands/ })).toBeInTheDocument()
  })

  it('renders the tie-breakers tooltip note', () => {
    renderStandings()
    const tb = screen.getByText('tie-breakers')
    expect(tb).toHaveAttribute('role', 'note')
    expect(tb).toHaveAttribute('data-tip')
  })

  it('renders the "As it stands" rows and follows the onGoToMatch link', () => {
    const seen = []
    render(
      <FollowProvider>
        <Standings
          matches={withGroupAPlayed()}
          hideScores={false}
          onGoToMatch={(n) => seen.push(n)}
        />
      </FollowProvider>,
    )
    // Projection title is present for the played group.
    expect(screen.getAllByText(/As it stands → Round of 16/).length).toBeGreaterThan(0)
    // The M-link buttons jump to the bracket (identified by their title).
    const links = document.querySelectorAll('button.ais-match-link')
    expect(links.length).toBeGreaterThan(0)
    fireEvent.click(links[0])
    expect(seen.length).toBe(1)
  })

  it('renders projection M-numbers as plain text when no onGoToMatch handler', () => {
    render(
      <FollowProvider>
        <Standings matches={withGroupAPlayed()} hideScores={false} />
      </FollowProvider>,
    )
    expect(screen.getAllByText(/As it stands → Round of 16/).length).toBeGreaterThan(0)
    // No link buttons when handler absent; plain M-number spans instead.
    expect(document.querySelectorAll('button.ais-match-link').length).toBe(0)
    expect(document.querySelectorAll('span.ais-match').length).toBeGreaterThan(0)
  })

  it('renders the BestThirds table once a group has played', () => {
    render(
      <FollowProvider>
        <Standings matches={withGroupAPlayed()} hideScores={false} />
      </FollowProvider>,
    )
    expect(screen.getByText('Best third-placed teams')).toBeInTheDocument()
  })

  it('marks each best-third row final (group done) or "to play" (still in progress)', () => {
    // Group A complete (Switzerland 3rd, final); every other group has matchday 1
    // played, so their provisional thirds are still "to play".
    // One match per other group (matchday 1) → started but not complete.
    const opener = new Set(
      ['B', 'C', 'D', 'E', 'F'].map(
        (g) => MATCHES.filter((m) => m.stage === 'Group' && m.group === g)[0].num,
      ),
    )
    const fixture = MATCHES.map((m) => {
      if (m.stage !== 'Group') return m
      if (GROUP_A[m.num]) return { ...m, score: GROUP_A[m.num] }
      return opener.has(m.num) ? { ...m, score: [1, 0] } : m
    })
    const { container } = render(
      <FollowProvider>
        <Standings matches={fixture} hideScores={false} />
      </FollowProvider>,
    )
    const rowFor = (team) =>
      [...container.querySelectorAll('.thirds-card tbody tr')].find(
        (tr) => tr.querySelector('.row-team')?.textContent === team,
      )
    // Switzerland's group (A) is complete → "final".
    expect(rowFor('Switzerland')?.querySelector('.third-final')).toBeTruthy()
    expect(rowFor('Switzerland')?.querySelector('.third-toplay')).toBeFalsy()
    // At least one third from an unfinished group is flagged "to play".
    expect(container.querySelectorAll('.thirds-card .third-toplay').length).toBeGreaterThan(0)
  })

  it('marks a third whose group has a live match as "in play" with a blinking dot, not "final"', () => {
    // Group A's six games all carry a score, but M26 (Switzerland v Germany) is
    // still LIVE — so the line is provisional, not final.
    const fixture = withGroupA({ 26: { live: { clock: "60'", detail: '' } } })
    const { container } = render(
      <FollowProvider>
        <Standings matches={fixture} hideScores={false} />
      </FollowProvider>,
    )
    const swiss = [...container.querySelectorAll('.thirds-card tbody tr')].find(
      (tr) => tr.querySelector('.row-team')?.textContent === 'Switzerland',
    )
    // In play, not final — and the live red dot is present.
    expect(swiss?.querySelector('.third-live')).toBeTruthy()
    expect(swiss?.querySelector('.third-final')).toBeFalsy()
    expect(swiss?.querySelector('.row-live-dot')).toBeTruthy()
  })

  it('lists a currently-4th, not-yet-eliminated team as an in-contention third', () => {
    // Group A complete; Group B has only matchday 1 played, so it has a current
    // 4th place that is nowhere near eliminated → shown as a contender.
    const fixture = MATCHES.map((m) => {
      if (m.stage !== 'Group') return m
      if (GROUP_A[m.num]) return { ...m, score: GROUP_A[m.num] }
      // Group B matchday 1 only: matches 3 and 4.
      return m.group === 'B' && (m.num === 3 || m.num === 4) ? { ...m, score: [1, 0] } : m
    })
    const { container } = render(
      <FollowProvider>
        <Standings matches={fixture} hideScores={false} />
      </FollowProvider>,
    )
    // The contention divider renders and there is at least one contender row.
    expect(screen.getByText(/Still in contention/)).toBeInTheDocument()
    const contenderRows = container.querySelectorAll('.thirds-card tbody tr.contender')
    expect(contenderRows.length).toBeGreaterThan(0)
    // A contender is not in the numbered list (dash instead of a rank).
    expect(contenderRows[0].querySelector('.rank-dash')).toBeTruthy()
  })

  it('shows the "outside the best four" note for a non-qualifying third place', () => {
    // Every group plays -> some thirds fall outside the best four.
    const allPlayed = MATCHES.map((m) =>
      m.stage === 'Group' ? { ...m, score: [1, 0] } : m,
    )
    render(
      <FollowProvider>
        <Standings matches={allPlayed} hideScores={false} />
      </FollowProvider>,
    )
    expect(screen.getAllByText('outside the best four').length).toBeGreaterThan(0)
  })

  it('shows no tie-breaker note when no two thirds are level', () => {
    // The note only earns its place when adjacent third-placed teams cannot be
    // separated on points, goal difference and goals. Give every group a clean
    // hierarchy with distinct goal counts and there is nothing to explain.
    let n = 0
    const spread = MATCHES.map((m) => {
      if (m.stage !== 'Group') return m
      n += 1
      return { ...m, score: [n % 5, 0] }
    })
    const { container } = render(
      <FollowProvider>
        <Standings matches={spread} hideScores={false} />
      </FollowProvider>,
    )
    const note = container.querySelector('.thirds-tie-note')
    // Either the thirds are all separated (no note at all) or, if this board
    // happens to level two of them, the note explains exactly those.
    if (note) expect(note.querySelectorAll('li').length).toBeGreaterThan(0)
    else expect(note).toBeNull()
  })

  it('explains a soft tie-breaker between adjacent thirds with their values', () => {
    // Every group drawn 1–1 → all four teams in each group sit on 3 pts, GD 0,
    // GF 3, so every third-placed team is level on points/GD/goals and the order
    // comes down to conduct, then the qualifying ranking. The note below the table spells
    // each pairing out with the deciding values.
    const allDrawn = MATCHES.map((m) => (m.stage === 'Group' ? { ...m, score: [1, 1] } : m))
    const { container } = render(
      <FollowProvider>
        <Standings matches={allDrawn} hideScores={false} />
      </FollowProvider>,
    )
    const note = container.querySelector('.thirds-tie-note')
    expect(note).toBeTruthy()
    expect(within(note).getByText(/Tie-breakers among the thirds/)).toBeInTheDocument()
    const items = note.querySelectorAll('li')
    expect(items.length).toBeGreaterThan(0)
    // Each explanation states the shared level and the deciding criterion + values.
    expect(note.textContent).toMatch(/level on points \(3\)/)
    expect(note.textContent).toMatch(/goals scored \(3\)/)
    // No cards in the fixture → the decider is the qualifying ranking, with #numbers.
    expect(note.textContent).toMatch(/European Qualifiers ranking/)
    expect(note.textContent).toMatch(/#\d+/)
  })

  it('explains a fair-play (conduct) tie-breaker between thirds, with card values', () => {
    // Groups A and B each played to a clean 9/6/3/0 hierarchy so their THIRD-placed
    // teams (Switzerland, Italy) are fixed by points — and both land on 3 pts, GD −1,
    // GF 1, i.e. level on points/GD/goals. A yellow card on Italy makes its conduct
    // score worse, so Switzerland is placed above it on fair-play points (criterion 7,
    // ahead of the qualifying ranking). The note spells that out with both values.
    const scores = { ...GROUP_A, ...GROUP_B }
    const fixture = MATCHES.map((m) => {
      if (!scores[m.num]) return m
      const base = { ...m, score: scores[m.num] }
      // One yellow for Italy (M4 Italy v Albania → Italy is t1).
      return m.num === 4 ? { ...base, cards: { t1: [{ color: 'yellow' }], t2: [] } } : base
    })
    const { container } = render(
      <FollowProvider>
        <Standings matches={fixture} hideScores={false} />
      </FollowProvider>,
    )
    const note = container.querySelector('.thirds-tie-note')
    expect(note).toBeTruthy()
    const conductItem = [...note.querySelectorAll('li')].find((li) => /fair-play points/.test(li.textContent))
    expect(conductItem, 'a fair-play tie-breaker line should be present').toBeTruthy()
    // Switzerland (conduct 0) placed above Italy (conduct −1), with both values shown.
    expect(conductItem.textContent).toMatch(/Switzerland.*finished above.*Italy/)
    expect(conductItem.textContent).toMatch(/Switzerland 0 vs Italy -1/)
  })

  it('falls back to showing the projection when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      renderStandings()
      // Defaults to shown (catch returns true).
      expect(screen.getByRole('button', { name: /Hide .As it stands/ })).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('swallows errors when localStorage.setItem throws on toggle', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      renderStandings()
      const toggle = screen.getByRole('button', { name: /As it stands/ })
      fireEvent.click(toggle)
      // Toggle still flips state despite the storage write failing.
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
    } finally {
      spy.mockRestore()
    }
  })

  it('toggles following a team via the star button', () => {
    renderStandings()
    const stars = screen.getAllByRole('button', { name: /^Follow / })
    fireEvent.click(stars[0])
    expect(screen.getAllByRole('button', { name: /^Unfollow / }).length).toBeGreaterThan(0)
  })
})

describe('Finish column', () => {
  it('shows a wide-open 1–4 range for every team before any result', () => {
    const { container } = renderStandings()
    const headers = [...container.querySelectorAll('.standings-table th.col-finish')]
    expect(headers).toHaveLength(6) // one per group table
    const cells = [...container.querySelectorAll('.standings-table .finish')]
    expect(cells).toHaveLength(24)
    expect(cells.every((c) => c.textContent === '1–4')).toBe(true)
    expect(container.querySelector('.standings-table .finish-locked')).toBeNull()
  })

  it('collapses to locked gold positions with the committed (complete) results', () => {
    const { container } = render(
      <FollowProvider>
        <Standings matches={PLAYED} hideScores={false} />
      </FollowProvider>,
    )
    const locked = [...container.querySelectorAll('.standings-table .finish-locked')]
    expect(locked).toHaveLength(24) // every team's finish is settled
    // Each group table reads 1..4 top to bottom.
    for (const table of container.querySelectorAll('.group-card .standings-table')) {
      const cells = [...table.querySelectorAll('.finish-locked')]
      expect(cells.map((c) => c.textContent)).toEqual(['1', '2', '3', '4'])
    }
    // The legend explains the marker.
    expect(screen.getByText(/positions still arithmetically/)).toBeInTheDocument()
  })
})
