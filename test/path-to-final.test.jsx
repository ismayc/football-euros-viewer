import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { knockoutTeams, pathToFinal, matchesByNum } from '../src/utils/bracket.js'
import { PathProvider as PP, usePath } from '../src/context/path.jsx'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

// A blank board with a filled Round-of-16 tie (Match 37: Germany v Albania),
// optionally carrying results down Germany's winner chain 37→45→49→51.
function withPath(overrides = {}) {
  return MATCHES.map((m) => (overrides[m.num] ? { ...m, ...overrides[m.num] } : m))
}
const R16_TEAMS = { 37: { t1: 'Germany', t2: 'Albania' }, 39: { t1: 'Spain', t2: 'Denmark' } }

const renderWith = (ui, { pathTeam } = {}) => {
  if (pathTeam) localStorage.setItem('euros:pathTeam', pathTeam)
  return render(
    <FollowProvider>
      <PathProvider>
        <DetailContext.Provider value={vi.fn()}>{ui}</DetailContext.Provider>
      </PathProvider>
    </FollowProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('pathToFinal + knockoutTeams (util)', () => {
  it('lists the real teams in the Round of 16, sorted', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    expect(knockoutTeams(byNum)).toEqual(['Albania', 'Denmark', 'Germany', 'Spain'])
  })

  it('returns null for a team not (yet) in the Round of 16', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    expect(pathToFinal('Portugal', byNum)).toBeNull()
    expect(pathToFinal(null, byNum)).toBeNull()
  })

  it('traces the full winner route from the Round-of-16 tie to the Final', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    const p = pathToFinal('Germany', byNum)
    expect(p.nums).toEqual([37, 45, 49, 51])
    expect(p.active).toEqual([37, 45, 49, 51]) // alive → whole route lit
    expect(p.here).toEqual([37]) // only the Round-of-16 tie has Germany so far
    expect(p.exitNum).toBeNull()
  })

  it('stops the active stretch at the match where the team was eliminated', () => {
    // Albania beats Germany in the Round-of-16 tie.
    const byNum = matchesByNum(withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [0, 1] } }))
    const p = pathToFinal('Germany', byNum)
    expect(p.exitNum).toBe(37)
    expect(p.active).toEqual([37]) // nothing downstream is lit once out
  })

  it('breaks a Round-of-16 draw on penalties to decide the exit', () => {
    const byNum = matchesByNum(
      withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [1, 1], pens: [3, 4] } }),
    )
    expect(pathToFinal('Germany', byNum).exitNum).toBe(37) // lost the shootout
    expect(pathToFinal('Albania', byNum).exitNum).toBeNull() // advanced
  })

  it('keeps the team alive through a win and follows it into the next round', () => {
    const byNum = matchesByNum(
      withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [2, 0] }, 45: { t2: 'Germany' } }),
    )
    const p = pathToFinal('Germany', byNum)
    expect(p.here).toEqual([37, 45])
    expect(p.exitNum).toBeNull()
    expect(p.active).toEqual([37, 45, 49, 51])
  })

  it('treats a drawn tie with no shootout as unsettled — neither out nor through', () => {
    const byNum = matchesByNum(withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [1, 1] } }))
    // No winner decided yet → the team is neither eliminated nor advanced.
    expect(pathToFinal('Germany', byNum).exitNum).toBeNull()
    expect(pathToFinal('Albania', byNum).exitNum).toBeNull()
  })
})

describe('PathProvider context', () => {
  const wrapper = ({ children }) => <PP>{children}</PP>

  it('persists the selection and clears it from localStorage', () => {
    const { result } = renderHook(() => usePath(), { wrapper })
    act(() => result.current.setPathTeam('Germany'))
    expect(localStorage.getItem('euros:pathTeam')).toBe('Germany')
    act(() => result.current.setPathTeam(null))
    expect(localStorage.getItem('euros:pathTeam')).toBeNull()
  })

  it('falls back to null when reading localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(result.current.pathTeam).toBeNull()
    spy.mockRestore()
  })

  it('swallows localStorage write errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(() => act(() => result.current.setPathTeam('Denmark'))).not.toThrow()
    spy.mockRestore()
  })

  it('returns inert defaults without a provider', () => {
    const { result } = renderHook(() => usePath())
    expect(result.current.pathTeam).toBeNull()
    expect(() => result.current.setPathTeam('x')).not.toThrow()
  })
})

describe('PathPicker', () => {
  const fullRun = {
    37: { t1: 'Germany', t2: 'Albania', score: [2, 0] },
    45: { t2: 'Germany', score: [0, 1] },
    49: { t1: 'Germany', score: [1, 0] },
    51: { t1: 'Germany', score: [1, 0] },
  }

  it('renders nothing until the Round of 16 has real teams', () => {
    const { container } = renderWith(<PathPicker byNum={matchesByNum(MATCHES)} />)
    expect(container.querySelector('.path-picker')).toBeNull()
  })

  it('selecting a team from the dropdown sets the path and shows a status', () => {
    renderWith(<PathPicker byNum={matchesByNum(withPath(R16_TEAMS))} />)
    fireEvent.change(screen.getByLabelText(/Path to the Final/), { target: { value: 'Germany' } })
    expect(screen.getByText(/Up next/)).toBeInTheDocument()
    // Clearing removes the status.
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument()
  })

  it('clears the path by picking the empty option back out of the dropdown', () => {
    // The "Pick a team…" entry carries an empty value; choosing it has to clear
    // the highlight rather than trace a team with no name.
    renderWith(<PathPicker byNum={matchesByNum(withPath(R16_TEAMS))} />)
    const select = screen.getByLabelText(/Path to the Final/)
    fireEvent.change(select, { target: { value: 'Germany' } })
    expect(screen.getByText(/Up next/)).toBeInTheDocument()
    fireEvent.change(select, { target: { value: '' } })
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument()
    expect(select.value).toBe('')
  })

  it('summarizes a team that has reached the Final but not yet played it', () => {
    // Everything up to the Final is decided and the team is in it — one step
    // short of the champions line, which only lands once the Final is final.
    const inTheFinal = { ...fullRun, 51: { t1: 'Germany', t2: 'Denmark' } }
    renderWith(<PathPicker byNum={matchesByNum(withPath(inTheFinal))} />, { pathTeam: 'Germany' })
    expect(screen.getByText(/In the Final/)).toBeInTheDocument()
    expect(screen.queryByText(/Champions/)).toBeNull()
  })

  it('summarizes "through to the next round" after winning its deepest match', () => {
    // Won the R16 (37) and the QF (45); the semi-final (49) doesn't list Germany
    // yet → "through to the Semi-final".
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [2, 0] }, 45: { t2: 'Germany', score: [0, 1] } }))} />,
      { pathTeam: 'Germany' },
    )
    expect(screen.getByText(/Through to the Semi-final/)).toBeInTheDocument()
  })

  it('summarizes elimination', () => {
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [0, 2] } }))} />,
      { pathTeam: 'Germany' },
    )
    expect(screen.getByText(/Out — lost in the Round of 16/i)).toBeInTheDocument()
  })

  it('summarizes a live match and the champion', () => {
    // Live in the Round of 16.
    const { unmount } = renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 37: { t1: 'Germany', t2: 'Albania', live: true } }))} />,
      { pathTeam: 'Germany' },
    )
    expect(screen.getByText(/Playing now/)).toBeInTheDocument()
    unmount()
    // Won the Final → champions.
    renderWith(<PathPicker byNum={matchesByNum(withPath(fullRun))} />, { pathTeam: 'Germany' })
    expect(screen.getByText(/Champions/)).toBeInTheDocument()
  })

  it('offers a quick chip for a followed knockout team', () => {
    localStorage.setItem('euros:followed', JSON.stringify(['Germany']))
    renderWith(<PathPicker byNum={matchesByNum(withPath(R16_TEAMS))} />)
    const chip = screen.getByRole('button', { name: /Germany/ })
    fireEvent.click(chip)
    expect(chip.className).toMatch(/active/)
    fireEvent.click(chip) // toggles back off
    expect(chip.className).not.toMatch(/active/)
  })
})

describe('Bracket path highlight', () => {
  it('marks the route boxes on-path and dims the rest', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(R16_TEAMS)} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Germany' },
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeTruthy()
    for (const n of [37, 45, 49, 51]) {
      expect(document.getElementById(`bx-m${n}`).classList.contains('on-path')).toBe(true)
    }
    expect(document.getElementById('bx-m40').classList.contains('on-path')).toBe(false)
    // The traced team's name is emphasized inside its box.
    expect(document.querySelector('#bx-m37 .bx-side.on-path-team')).toBeTruthy()
  })

  it('flags the elimination box with the exit style and lights nothing beyond it', () => {
    renderWith(
      <Bracket matches={withPath({ 37: { t1: 'Germany', t2: 'Albania', score: [0, 1] } })} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Germany' },
    )
    const exit = document.getElementById('bx-m37')
    expect(exit.classList.contains('on-path')).toBe(true)
    expect(exit.classList.contains('path-exit')).toBe(true)
    expect(document.getElementById('bx-m45').classList.contains('on-path')).toBe(false)
  })

  it('shows no highlight when no team is selected', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(R16_TEAMS)} tz="America/New_York" hideScores={false} />,
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeNull()
    expect(document.querySelector('.bx-match.on-path')).toBeNull()
  })
})

describe('RadialBracket path highlight', () => {
  it('lights the route connectors and the team flags, dims the rest', () => {
    const { container } = renderWith(
      <RadialBracket matches={withPath(R16_TEAMS)} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Germany' },
    )
    expect(container.querySelector('.radial-wrap.has-path')).toBeTruthy()
    // At least the Round of 16 matchup and Germany's outer flag are on the route.
    expect(container.querySelectorAll('.rb-matchup.on-path').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.rb-node.on-path').length).toBeGreaterThan(0)
  })
})
