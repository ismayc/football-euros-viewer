import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MatchDetail from '../src/components/MatchDetail.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A finished mini-tournament so both semifinalists have records. Real Euro
// teams, venues and match numbers, so the component looks everything up the way
// it does in the app.
const allMatches = [
  { num: 1, stage: 'Group', group: 'A', t1: 'Denmark', t2: 'Scotland', venue: 'olympiastadion', ko: '2024-06-15T18:00:00+02:00', score: [2, 0] },
  { num: 2, stage: 'Group', group: 'B', t1: 'France', t2: 'Albania', venue: 'olympiastadion', ko: '2024-06-16T18:00:00+02:00', score: [1, 1] },
  { num: 45, stage: 'QF', t1: 'Denmark', t2: 'Albania', venue: 'olympiastadion', ko: '2024-07-05T18:00:00+02:00', score: [1, 1], pens: [4, 3] },
  { num: 46, stage: 'QF', t1: 'France', t2: 'Scotland', venue: 'olympiastadion', ko: '2024-07-05T21:00:00+02:00', score: [3, 1], cards: { t1: [{ color: 'yellow' }], t2: [] } },
]
const semi = { num: 49, stage: 'SF', t1: 'Denmark', t2: 'France', venue: 'allianz', ko: '2024-07-09T21:00:00+02:00' }

const renderDetail = (props = {}) =>
  render(
    <FollowProvider>
      <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} allMatches={allMatches} {...props} />
    </FollowProvider>,
  )

describe('MatchDetail tale of the tape', () => {
  it('shows both teams’ tournament records for an upcoming knockout tie', () => {
    renderDetail()
    expect(screen.getByText('Tournament so far')).toBeInTheDocument()
    // Denmark 2W (one on pens); France 1W 1D.
    expect(screen.getByText('2–0–0 (1 on pens)')).toBeInTheDocument()
    expect(screen.getByText('1–1–0')).toBeInTheDocument()
    expect(screen.getByText('Qualifiers ranking')).toBeInTheDocument()
    // Card row appears (France has card data) and is flagged best-effort.
    expect(screen.getByText('Cards')).toBeInTheDocument()
    expect(screen.getByText(/best-effort/)).toBeInTheDocument()
  })

  it('a played match shows the records the teams took INTO it, not today’s', () => {
    // Viewing the QF (Jul 5): only the group games (Jun 15/16) predate it —
    // the QF itself must not count toward its own tape.
    renderDetail({ match: allMatches[2] })
    expect(screen.getByText('Going into this match')).toBeInTheDocument()
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
    expect(screen.getByText('1–0–0')).toBeInTheDocument() // Denmark: group win only
    expect(screen.getByText('0–1–0')).toBeInTheDocument() // Albania: group draw only
    expect(screen.queryByText(/on pens/)).not.toBeInTheDocument()
  })

  it('does not render for a group match or a placeholder tie', () => {
    renderDetail({ match: allMatches[0] })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('skips placeholder knockout slots (no real teams yet)', () => {
    renderDetail({ match: { ...semi, t1: 'Winner Match 45', t2: 'Winner Match 46' } })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('hides the records behind a reveal in spoiler-free mode', () => {
    renderDetail({ hideScores: true })
    expect(screen.queryByText('W–D–L')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('🙈 reveal team records'))
    expect(screen.getByText('W–D–L')).toBeInTheDocument()
  })

  it('renders without the section when allMatches is not provided', () => {
    render(
      <FollowProvider>
        <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} />
      </FollowProvider>,
    )
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })
})
