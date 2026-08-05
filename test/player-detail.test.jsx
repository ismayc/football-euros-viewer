import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PlayerDetail from '../src/components/PlayerDetail.jsx'
import { DetailContext } from '../src/context/detail.js'
import { fetchMatchLines } from '../src/services/espnMatchStats.js'

vi.mock('../src/services/espnMatchStats.js', () => ({ fetchMatchLines: vi.fn() }))

// Synthetic fixtures on the real Euro topology (Group F, the Round of 16 it
// feeds, and an unplayed quarter-final). Arda Güler is the scorer because ESPN
// writes him accentless — the case the name matching has to survive.
const matches = [
  {
    num: 21, stage: 'Group', group: 'F', t1: 'Türkiye', t2: 'Georgia',
    ko: '2024-06-18T18:00:00+02:00', espnId: 'e1', score: [3, 1],
    goals: { t1: [{ name: 'Arda Güler', minute: 12 }, { name: 'Arda Güler', minute: 55, penalty: true }], t2: [] },
  },
  {
    num: 40, stage: 'R16', t1: 'Austria', t2: 'Türkiye',
    ko: '2024-07-02T21:00:00+02:00', espnId: 'e2', score: [1, 1], pens: [3, 4],
    goals: { t1: [], t2: [{ name: 'Arda Guler', minute: 88 }] }, // ESPN spelling, no accents
  },
  { num: 8, stage: 'Group', group: 'B', t1: 'Spain', t2: 'Italy', ko: '2024-06-20T21:00:00+02:00', espnId: 'e9', score: [1, 1], goals: { t1: [], t2: [] } },
  { num: 47, stage: 'QF', t1: 'Türkiye', t2: 'Portugal', ko: '2024-07-06T21:00:00+02:00' }, // unplayed → excluded
]

const scorer = { name: 'Arda Güler', team: 'Türkiye', goals: 3, pens: 1, assists: 2, minutes: 300 }

const renderPD = (onOpen = vi.fn()) => {
  const onClose = vi.fn()
  render(
    <DetailContext.Provider value={onOpen}>
      <PlayerDetail scorer={scorer} matches={matches} onClose={onClose} />
    </DetailContext.Provider>,
  )
  return { onOpen, onClose }
}

beforeEach(() => {
  fetchMatchLines.mockReset()
  fetchMatchLines.mockImplementation(async (id) =>
    id === 'e1'
      ? { length: 90, byName: { 'arda guler': { played: true, minutes: 90, assists: 1 } } }
      : { length: 120, byName: { 'arda guler': { played: true, minutes: 120, assists: 0 } } },
  )
})

describe('PlayerDetail', () => {
  it('lists only the team’s played matches with goals, results, assists and minutes', async () => {
    renderPD()
    expect(screen.getByText('Arda Güler')).toBeInTheDocument()
    expect(screen.getByText(/⚽ 3 \(1 pen\) · 2 assists · 300′ played/)).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2) // Spain–Italy and the unplayed quarter-final excluded
    // Group game: two goals (one pen), W 2–1, then per-match A/Min after load.
    expect(rows[0]).toHaveTextContent('vs')
    expect(rows[0]).toHaveTextContent('Georgia')
    expect(rows[0]).toHaveTextContent('W 3–1')
    expect(rows[0]).toHaveTextContent('⚽ 12’')
    expect(rows[0]).toHaveTextContent('55’')
    expect(rows[0]).toHaveTextContent('pen')
    // Round of 16 as t2: drawn, won on pens → W, goal at 88' despite the accentless feed spelling.
    expect(rows[1]).toHaveTextContent('W 1–1')
    expect(rows[1]).toHaveTextContent('p4–3')
    expect(rows[1]).toHaveTextContent('⚽ 88’')
    await waitFor(() => expect(rows[0]).toHaveTextContent('90′'))
    expect(rows[0].cells[3]).toHaveTextContent('1') // assists in that match
    expect(rows[1]).toHaveTextContent('120′')
  })

  it('shows dashes when a match’s ESPN lines can’t load', async () => {
    fetchMatchLines.mockImplementation(async () => {
      throw new Error('offline')
    })
    renderPD()
    const rows = screen.getAllByRole('row').slice(1)
    await waitFor(() => expect(rows[0].cells[4]).toHaveTextContent('—'))
    expect(rows[0]).toHaveTextContent('⚽ 12’') // local goal data still renders
  })

  it('leaves the row alone when the request was aborted rather than failing', async () => {
    // Unmount/re-run aborts the in-flight lookup. That is this effect being
    // superseded, not the data failing, so the row must not be marked in error —
    // the successor run is what fills it in.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchMatchLines.mockImplementation(async () => {
      throw abort
    })
    renderPD()
    const rows = screen.getAllByRole('row').slice(1)
    // Local goal data still renders, and the minutes cell stays on its loading
    // placeholder instead of flipping to the error dash.
    await waitFor(() => expect(rows[0]).toHaveTextContent('⚽ 12’'))
    expect(rows[0].cells[4]).not.toHaveTextContent('—')
  })

  it('clicking a match row opens that match’s detail', async () => {
    const { onOpen } = renderPD()
    fireEvent.click(screen.getAllByTitle('Open match details')[0])
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ num: 21 }))
  })
})
