import { describe, it, expect, vi } from 'vitest'
import {
  openFootballFinalScore,
  applyResults,
  fetchResults,
  isRealTeam,
  matchKey,
  pairKey,
} from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const match1 = MATCHES.find((m) => m.num === 1) // Germany v Scotland, 14 June
const DATE = String(match1.ko).slice(0, 10)
// Records are keyed by DATE + team pair, so a synthetic feed row has to carry a
// date or it is skipped as unmatchable.
const dayKey = (date, a, b) => `${date}|${pairKey(a, b)}`

describe('openFootballFinalScore (getter for the reconciler)', () => {
  it('returns null when there is no map', () => {
    expect(openFootballFinalScore(match1, null)).toBeNull()
  })

  it('returns null when the record has no final score', () => {
    const map = new Map([[matchKey(match1), { home: 'Germany', away: 'Scotland', score: null }]])
    expect(openFootballFinalScore(match1, map)).toBeNull()
  })

  it('returns an oriented final when the record has a ft score', () => {
    const map = new Map([
      [matchKey(match1), { home: 'Germany', away: 'Scotland', score: { ft: [2, 1] } }],
    ])
    expect(openFootballFinalScore(match1, map)).toEqual({ home: 'Germany', away: 'Scotland', ft: [2, 1] })
  })
})

describe('fetchResults (goal parsing + error branches)', () => {
  it('parses goals (player/offset/penalty/owngoal) for both teams', async () => {
    const feed = {
      matches: [
        {
          round: 'Matchday 1',
          date: DATE,
          team1: 'Germany',
          team2: 'Scotland',
          score: { ft: [1, 1] },
          goals1: [{ player: 'Scorer One', offset: 23, penalty: true }],
          goals2: [{ name: 'Scorer Two', minute: 67, owngoal: true }],
        },
        // goals not an array -> parseGoals returns []
        { round: 'Matchday 1', date: DATE, team1: 'Spain', team2: 'Italy', score: { ft: [0, 0] }, goals1: null },
        // apiKey returns null (no date) -> skipped
        { round: 'Matchday 1', team1: 'X', team2: 'Y' },
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchResults()
    const rec = map.get(dayKey(DATE, 'Germany', 'Scotland'))
    expect(rec.g1).toEqual([{ name: 'Scorer One', minute: 23, penalty: true, og: false }])
    expect(rec.g2).toEqual([{ name: 'Scorer Two', minute: 67, penalty: false, og: true }])

    const spain = map.get(dayKey(DATE, 'Spain', 'Italy'))
    expect(spain.g1).toEqual([])

    expect(map.has(dayKey(DATE, 'X', 'Y'))).toBe(false)
  })

  it('handles a goal with no name/minute (empty-name, null minute defaults)', async () => {
    const feed = {
      matches: [
        { round: 'Matchday 1', date: DATE, team1: 'Germany', team2: 'Scotland', score: { ft: [1, 0] }, goals1: [{}] },
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchResults()
    expect(map.get(dayKey(DATE, 'Germany', 'Scotland')).g1).toEqual([
      { name: '', minute: null, penalty: false, og: false },
    ])
  })

  it('throws when the body is not valid JSON', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json')
      },
    }))
    await expect(fetchResults()).rejects.toThrow(/not valid JSON/)
  })

  it('throws when matches[] is missing', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ notMatches: [] }) }))
    await expect(fetchResults()).rejects.toThrow(/missing a matches/)
  })

  it('parses a bare-array score (score is itself the ft pair)', async () => {
    const feed = {
      matches: [{ round: 'Matchday 1', date: DATE, team1: 'Germany', team2: 'Scotland', score: [3, 2] }],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchResults()
    expect(map.get(dayKey(DATE, 'Germany', 'Scotland')).score.ft).toEqual([3, 2])
  })

  it('treats a score object with no ft pair at all as no score', async () => {
    // Half-time only: upstream posts `ht` the moment the whistle goes and fills
    // `ft` later. Neither shape the parser understands is there, so the record
    // carries no score rather than a half-time one masquerading as final.
    const feed = {
      matches: [{ round: 'Matchday 1', date: DATE, team1: 'Germany', team2: 'Scotland', score: { ht: [0, 0] } }],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchResults()
    expect(map.get(dayKey(DATE, 'Germany', 'Scotland')).score).toBeNull()
  })

  it('treats an incomplete ft (null element) as no score', async () => {
    const feed = {
      matches: [{ round: 'Matchday 1', date: DATE, team1: 'Germany', team2: 'Scotland', score: { ft: [1, null] } }],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchResults()
    expect(map.get(dayKey(DATE, 'Germany', 'Scotland')).score).toBeNull()
  })
})

describe('isRealTeam', () => {
  it('false for placeholders, true for qualified sides', () => {
    expect(isRealTeam('2A')).toBe(false)
    expect(isRealTeam('Germany')).toBe(true)
  })
})

describe('a record with no result in it', () => {
  it('leaves a group match alone when the record carries no score', () => {
    // A fixture line with no result yet: the record exists (so the teams are
    // known) but writing it back would blank the board rather than fill it.
    const base = { num: 1, stage: 'Group', group: 'A', t1: 'Alpha', t2: 'Beta', ko: '2024-06-14T19:00:00Z' }
    const map = new Map([[matchKey(base), { home: 'Alpha', away: 'Beta' }]])
    const [out] = applyResults([base], map)
    expect(out).toBe(base)
  })
})

describe('applyResults — a knockout tie the feed has only half of', () => {
  // A drawn tie whose sides the feed still names with placeholders, and one it
  // has named but not yet played. Each side is written independently, so
  // neither guards the other, and a record with no score must not blank the
  // fixture.
  const tie = {
    num: 900,
    stage: 'R16',
    t1: 'Germany',
    t2: 'Denmark',
    ko: '2024-06-29T19:00:00Z',
  }
  const withRec = (rec) => applyResults([tie], new Map([[matchKey(tie), rec]]))[0]

  it('leaves a side alone when the feed has no real name for it', () => {
    const homeUnknown = withRec({ home: 'Winner Group A', away: 'Denmark', g1: [], g2: [] })
    expect(homeUnknown.t1).toBe('Germany') // untouched by the feed's placeholder
    expect(homeUnknown.t2).toBe('Denmark')

    const awayUnknown = withRec({ home: 'Spain', away: '2A', g1: [], g2: [] })
    expect(awayUnknown.t1).toBe('Spain') // the feed's real name won
    expect(awayUnknown.t2).toBe('Denmark') // the drawn away side, untouched
  })

  it('fills in the names but no result when the tie has not been played', () => {
    const out = withRec({ home: 'Germany', away: 'Denmark', g1: [], g2: [] })
    expect(out.score).toBeUndefined()
    expect(out.goals).toBeUndefined()
  })

  it('records a knockout won inside 90 minutes without marking it a.e.t.', () => {
    const out = withRec({ home: 'Germany', away: 'Denmark', score: { ft: [2, 0] }, g1: [], g2: [] })
    expect(out.score).toEqual([2, 0])
    expect(out.aet).toBeUndefined()
    expect(out.pens).toBeUndefined()
  })
})
