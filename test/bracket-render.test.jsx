import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { STAGE_LABELS } from '../src/data/matches.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored, playedUpTo } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

// Decorate a few knockout matches with scores/pens/aet/live so the score-display
// branches render.
function withScores() {
  return MATCHES.map((m) => {
    if (m.num === 51) return { ...m, score: [1, 1], pens: [4, 2] } // Final w/ pens
    if (m.num === 44) return { ...m, score: [2, 1], aet: true } // R16 won in ET
    if (m.num === 40) return { ...m, score: [3, 0] } // plain score
    if (m.num === 38) return { ...m, live: true, score: [0, 0] } // live
    return m
  })
}

const renderBracket = (matches, props = {}) => {
  const openDetail = vi.fn()
  render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <Bracket matches={matches} tz="America/New_York" hideScores={false} {...props} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail }
}

describe('Bracket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders every round from the Round of 16 to the Final', () => {
    renderBracket(MATCHES)
    expect(screen.getAllByText(/Final/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Round of 16/).length).toBeGreaterThan(0)
    // The Euro has no third-place play-off, so no such column exists.
    expect(screen.queryByText(/Third-place/)).toBeNull()
  })

  it('renders scores, penalties, AET, and the live badge', () => {
    renderBracket(withScores())
    expect(screen.getByText('1–1')).toBeInTheDocument() // final score
    expect(screen.getByText(/\(p 4–2\)/)).toBeInTheDocument() // pens
    expect(screen.getByText('2–1')).toBeInTheDocument() // the tie won in ET
    expect(screen.getByText(/AET/)).toBeInTheDocument()
    expect(screen.getByText('3–0')).toBeInTheDocument() // plain
  })

  it('hides scores when hideScores is set', () => {
    renderBracket(withScores(), { hideScores: true })
    expect(screen.queryByText('3–0')).not.toBeInTheDocument()
  })

  it('opens detail on click and on keyboard activation', () => {
    const { openDetail } = renderBracket(MATCHES)
    const card = document.getElementById('bx-m40')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'Escape' }) // ignored branch
    expect(openDetail).toHaveBeenCalledTimes(3)
  })

  it('expands a QF slot into the two feeding Round-of-16 teams as a potential matchup', () => {
    // QF 45 is fed by Round-of-16 matches 39 and 37. Once those ties have real
    // teams, the QF box should read "TeamA / TeamB" instead of "Winner Match 39".
    const matches = MATCHES.map((m) => {
      if (m.num === 39) return { ...m, t1: 'Germany', t2: 'Albania' }
      if (m.num === 37) return { ...m, t1: 'Spain', t2: 'Denmark' }
      return m
    })
    renderBracket(matches)
    const m45 = document.getElementById('bx-m45')
    expect(m45.textContent).not.toMatch(/Winner Match/)
    expect(m45.querySelectorAll('.bx-side-feeder').length).toBe(2)
    for (const t of ['Germany', 'Albania', 'Spain', 'Denmark']) {
      expect(within(m45).getByText(t)).toBeInTheDocument()
    }
    // Each pair joins its two teams with "/"; the two pairs are joined by a single
    // "vs" divider (wide layout, hidden on mobile via CSS).
    expect(m45.querySelectorAll('.bx-side-feeder .bx-slash').length).toBe(2)
    const vs = m45.querySelectorAll('.bx-vs-divider')
    expect(vs.length).toBe(1)
    expect(vs[0].textContent).toBe('vs')
  })

  // The feeder expansion is round-agnostic: a "Winner/Loser Match N" slot shows
  // its pair the moment match N has two real teams. So as each round is played and
  // the next round's teams get confirmed, that next round renders "pair vs pair"
  // exactly like the Round of 16 does today — with no per-round special-casing.
  describe('cascades to later rounds as teams are confirmed', () => {
    // QF 45 ← R16 39/37 · SF 49 ← QF 45/46 · Final 51 ← SF 49/50.
    const cases = [
      { round: 'Quarter-final', box: 45, feeders: [39, 37] },
      { round: 'Semi-final', box: 49, feeders: [45, 46] },
      { round: 'Final', box: 51, feeders: [49, 50] },
    ]
    const teams = ['Germany', 'Albania', 'Spain', 'Denmark']
    for (const { round, box, feeders } of cases) {
      it(`${round} box shows pair vs pair once its feeders have teams`, () => {
        const matches = MATCHES.map((m) => {
          if (m.num === feeders[0]) return { ...m, t1: teams[0], t2: teams[1] }
          if (m.num === feeders[1]) return { ...m, t1: teams[2], t2: teams[3] }
          return m
        })
        renderBracket(matches)
        const el = document.getElementById(`bx-m${box}`)
        expect(el.querySelectorAll('.bx-side-feeder').length).toBe(2)
        expect(el.querySelector('.bx-vs-divider')).toBeTruthy()
        for (const t of teams) expect(within(el).getByText(t)).toBeInTheDocument()
      })
    }
  })

  it('populates a slot from partial results — no waiting for the whole previous round', () => {
    // Only the feeders for ONE semi-final side are in: QF 45 has its two teams,
    // but QF 46 is still a placeholder. The ready side shows its candidate pair
    // immediately; the pending side stays a label and there's no divider yet.
    const matches = MATCHES.map((m) => (m.num === 45 ? { ...m, t1: 'Germany', t2: 'Albania' } : m))
    renderBracket(matches)
    const m49 = document.getElementById('bx-m49')
    expect(m49.querySelectorAll('.bx-side-feeder').length).toBe(1) // only the ready side
    expect(within(m49).getByText('Germany')).toBeInTheDocument()
    expect(within(m49).getByText('Albania')).toBeInTheDocument()
    expect(within(m49).getByText('Winner Match 46')).toBeInTheDocument() // pending side
    expect(m49.querySelector('.bx-vs-divider')).toBeNull()
  })

  it('shows no "vs" divider when only one QF side is a resolved pair', () => {
    // Only match 39 resolved → QF 45 has one feeder side and one plain
    // "Winner Match 37" placeholder, so there is no all-four-teams "vs" divider.
    const matches = MATCHES.map((m) => (m.num === 39 ? { ...m, t1: 'Germany', t2: 'Albania' } : m))
    renderBracket(matches)
    const m45 = document.getElementById('bx-m45')
    expect(m45.querySelector('.bx-vs-divider')).toBeNull()
    expect(m45.querySelectorAll('.bx-side-feeder').length).toBe(1)
  })

  it('leaves a feed slot as its plain label while the source tie is unresolved', () => {
    // Blank board: the Round of 16 still holds group placeholders, so the QF
    // can't expand yet.
    renderBracket(MATCHES)
    const m45 = document.getElementById('bx-m45')
    expect(within(m45).getByText('Winner Match 39')).toBeInTheDocument()
    expect(m45.querySelector('.bx-side-feeder')).toBeNull()
  })

  it('scrolls a focused match into view and calls onFocusHandled', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 40, onFocusHandled })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('handles a focusMatch that does not exist (no element)', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 99999, onFocusHandled })
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('does nothing when focusMatch is null', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: null, onFocusHandled })
    expect(onFocusHandled).not.toHaveBeenCalled()
  })

  it('clears the focus highlight after the timeout', () => {
    vi.useFakeTimers()
    try {
      renderBracket(MATCHES, { focusMatch: 40 })
      const el = document.getElementById('bx-m40')
      expect(el.classList.contains('bx-focus')).toBe(true)
      vi.advanceTimersByTime(2300)
      expect(el.classList.contains('bx-focus')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Bracket — mobile round view', () => {
  let originalMM
  beforeEach(() => {
    vi.clearAllMocks()
    originalMM = window.matchMedia
    // Force the mobile branch (narrow viewport).
    window.matchMedia = (q) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })
  afterEach(() => {
    window.matchMedia = originalMM
  })

  it('shows a round selector and only one round at a time (no wide bracket)', () => {
    renderBracket(MATCHES)
    // A pill per round.
    expect(screen.getByRole('tab', { name: STAGE_LABELS.R16 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: STAGE_LABELS.QF })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: STAGE_LABELS.Final })).toBeInTheDocument()
    // Nothing decided yet → defaults to the R16: its matches render, later rounds don't.
    expect(screen.getByRole('tab', { name: STAGE_LABELS.R16 }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('bx-m37')).toBeInTheDocument() // R16
    expect(document.getElementById('bx-m45')).toBeNull() // QF hidden
    expect(document.getElementById('bx-m51')).toBeNull() // Final hidden
  })

  it('switches the visible round when a pill is tapped', () => {
    renderBracket(MATCHES)
    fireEvent.click(screen.getByRole('tab', { name: STAGE_LABELS.QF }))
    expect(document.getElementById('bx-m45')).toBeInTheDocument() // QF shown
    expect(document.getElementById('bx-m37')).toBeNull() // R16 no longer rendered
  })

  it('opens to the target round when arriving via a focus link', () => {
    renderBracket(MATCHES, { focusMatch: 45 }) // a QF match
    expect(screen.getByRole('tab', { name: STAGE_LABELS.QF }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('bx-m45')).toBeInTheDocument()
  })
})

describe('Bracket with pieces missing', () => {
  it('leaves a slot blank when the board has no match for it', () => {
    // The bracket lays out every knockout slot from the format, not from the
    // data, so a board that has not published a given match yet must render an
    // empty position rather than throw on the missing record.
    const knockoutless = MATCHES.filter((m) => m.stage === 'Group')
    expect(() => renderBracket(knockoutless)).not.toThrow()
    expect(document.querySelector('.bracket, .bk, .br')).toBeTruthy()
  })

  it('renders on a platform with no matchMedia', () => {
    // The responsive hook is the only thing that touches matchMedia; where it is
    // absent the bracket still has to render at its default width.
    const real = window.matchMedia
    delete window.matchMedia
    try {
      expect(() => renderBracket(MATCHES)).not.toThrow()
      expect(screen.getAllByText(/Final/i).length).toBeGreaterThan(0)
    } finally {
      window.matchMedia = real
    }
  })

  it('highlights a followed team as a bracket side and as a feeder candidate', () => {
    // Mid-tournament: the entry round is played and the round after it is still
    // reading "Winner Match N", so the same team appears twice — once as a
    // resolved side of its own tie and once as a candidate inside the tie it
    // feeds. Following it has to light up both.
    localStorage.setItem('euros:followed', JSON.stringify(['Germany']))
    try {
      renderBracket(playedUpTo(44))
      expect(document.querySelector('.bx-side.followed')).toBeTruthy()
      expect(document.querySelector('.bx-feeder-team.followed')).toBeTruthy()
    } finally {
      localStorage.clear()
    }
  })
})
