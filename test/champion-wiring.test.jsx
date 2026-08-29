// The champion banner's WIRING, not the component.
//
// champion-banner.test.jsx renders <ChampionBanner> directly with a fabricated
// match, so it passed while the banner was dead in the real app: App.jsx looked
// for `m.num === 104`, the number of the World Cup 2026 Final in the sibling this
// repo was scaffolded from. Euro 2024 ends at match 51, so the lookup found
// nothing, `match` was undefined, and Spain never got a banner. A unit test of the
// component can never catch that. This renders the real App against the real
// committed board instead.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES } from '../src/data/matches.js'
import { BRACKET } from '../src/utils/bracket.js'

beforeEach(() => {
  // Node 18+ defines fetch, so an `if (!global.fetch)` guard would never fire and
  // an unmocked test would hit the network for real. Always assign.
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('champion banner wiring', () => {
  // The guard against re-introducing the sibling's match number. 104 is not a
  // match in this tournament at all.
  it('takes the Final from BRACKET, which is this tournament’s last match', () => {
    expect(BRACKET.final).toEqual([51])
    expect(MATCHES).toHaveLength(51)
    expect(Math.max(...MATCHES.map((m) => m.num))).toBe(BRACKET.final[0])
    expect(MATCHES.some((m) => m.num === 104)).toBe(false)
  })

  // The banner's name sits inside a <strong>, so match on the element's whole
  // text rather than a single text node.
  it('crowns Spain from the real committed board', async () => {
    const { container } = render(
      <FollowProvider>
        <App />
      </FollowProvider>,
    )
    await waitFor(() => {
      expect(container.querySelector('.results-bar')).toBeTruthy()
    })
    const banner = container.querySelector('.champ-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toMatch(/Spain/)
    expect(banner.textContent).toMatch(/Euro 2024 Champions/)
  })
})
