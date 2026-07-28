import { describe, it, expect, vi } from 'vitest'
import { applyResults, matchKey, fetchResults } from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'

// This edition is finished, so the committed schedule ships with every result in
// it. These tests exercise the merge that fills a BLANK board from the feed.
const MATCHES = unscored(PLAYED)

// Match 1 is Germany v Scotland in Munich on 14 June 2024.
const M1_KEY = '2024-06-14|pair:' + ['Germany', 'Scotland'].sort().join('|')
const FINAL_KEY = '2024-07-14|pair:' + ['Spain', 'England'].sort().join('|')

describe('results merge (applyResults)', () => {
  it('returns the input unchanged when there are no results', () => {
    expect(applyResults(MATCHES, null)).toBe(MATCHES)
    expect(applyResults(MATCHES, new Map())).toBe(MATCHES)
  })

  it('keys a match by its kickoff date and team pair', () => {
    expect(matchKey(MATCHES.find((m) => m.num === 1))).toBe(M1_KEY)
  })

  it('has no key for a knockout tie whose sides are still placeholders', () => {
    // The Euro feed carries no match numbers, so the pair is the only thing to
    // key on — and an undrawn tie has no pair yet.
    expect(matchKey(MATCHES.find((m) => m.stage === 'Final'))).toBeNull()
    // …but the real, played Final does have one.
    expect(matchKey(PLAYED.find((m) => m.stage === 'Final'))).toBe(FINAL_KEY)
  })

  it('merges a group score oriented to our team order', () => {
    const map = new Map([[M1_KEY, { home: 'Scotland', away: 'Germany', score: { ft: [1, 5] } }]])
    const merged = applyResults(MATCHES, map)
    const m = merged.find((x) => x.num === 1) // our order: Germany v Scotland
    expect(m.score).toEqual([5, 1]) // flipped to match (Germany, Scotland)
  })

  it('does NOT write a reversed score when the record home matches neither team', () => {
    // A normalization gap could leave rec.home as a name that is neither of ours.
    // Bare-equality orientation would treat it as the away team and write the
    // score backwards; it must skip instead.
    const map = new Map([
      [M1_KEY, { home: 'Deutschland', away: 'Schottland', score: { ft: [3, 1] } }],
    ])
    const merged = applyResults(MATCHES, map)
    expect(merged.find((m) => m.num === 1).score).toBeUndefined() // skipped, not reversed
  })

  it('records pens and AET on a knockout tie once both sides are real', () => {
    const drawn = MATCHES.map((m) => (m.num === 51 ? { ...m, t1: 'Spain', t2: 'England' } : m))
    const map = new Map([
      [FINAL_KEY, { home: 'Spain', away: 'England', score: { ft: [2, 2], pens: [4, 2], aet: true } }],
    ])
    const final = applyResults(drawn, map).find((m) => m.stage === 'Final')
    expect(final.score).toEqual([2, 2])
    expect(final.pens).toEqual([4, 2])
    expect(final.aet).toBe(true)
  })

  it('uses the extra-time score for a knockout decided in ET (no shootout)', () => {
    // OpenFootball reports ft = the level 90-minute score and et = the decisive
    // ET score. Using ft alone would leave the tie — and the rest of the bracket
    // — unresolved.
    const drawn = MATCHES.map((m) => (m.num === 51 ? { ...m, t1: 'Spain', t2: 'England' } : m))
    const map = new Map([
      [FINAL_KEY, { home: 'Spain', away: 'England', score: { ft: [1, 1], et: [2, 1], aet: true } }],
    ])
    const final = applyResults(drawn, map).find((m) => m.stage === 'Final')
    expect(final.score).toEqual([2, 1]) // ET result, not the level 90-minute score
    expect(final.aet).toBe(true)
    expect(final.pens).toBeUndefined()
  })

  it('does not mutate the static MATCHES array', () => {
    const before = MATCHES.find((m) => m.num === 1)
    const map = new Map([[M1_KEY, { home: 'Germany', away: 'Scotland', score: { ft: [1, 0] } }]])
    applyResults(MATCHES, map)
    expect(MATCHES.find((m) => m.num === 1)).toBe(before)
    expect(before.score).toBeUndefined()
  })
})

describe('fetchResults (parsing the OpenFootball shape)', () => {
  it('parses scores, pens/AET, and normalizes team-name aliases', async () => {
    const feed = {
      matches: [
        { round: 'Matchday 1', date: '2024-06-14', team1: 'Germany', team2: 'Scotland', score: { ft: [5, 1] } },
        { round: 'Round of 16', date: '2024-07-01', team1: 'Portugal', team2: 'Slovenia', score: { ft: [0, 0], et: [0, 0], p: [3, 0] } },
        { round: 'Quarter-finals', date: '2024-07-05', team1: 'Spain', team2: 'Germany', score: { ft: [1, 1], et: [2, 1] } },
        { round: 'Matchday 1', date: '2024-06-18', team1: 'Turkey', team2: 'Czech Republic' }, // aliases, no score
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchResults()

    expect(map.get(M1_KEY).score.ft).toEqual([5, 1])

    const shootout = map.get('2024-07-01|pair:' + ['Portugal', 'Slovenia'].sort().join('|'))
    expect(shootout.score.ft).toEqual([0, 0])
    expect(shootout.score.et).toEqual([0, 0]) // level after ET → went to the shootout
    expect(shootout.score.pens).toEqual([3, 0])
    expect(shootout.score.aet).toBe(true)

    const inEt = map.get('2024-07-05|pair:' + ['Spain', 'Germany'].sort().join('|'))
    expect(inEt.score.et).toEqual([2, 1]) // decided in ET, no shootout
    expect(inEt.score.aet).toBe(true)
    expect(inEt.score.pens).toBeUndefined()

    // "Turkey" → "Türkiye" and "Czech Republic" → "Czechia"; unplayed → null score.
    const alias = map.get('2024-06-18|pair:' + ['Türkiye', 'Czechia'].sort().join('|'))
    expect(alias.score).toBeNull()
  })

  it('throws on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    await expect(fetchResults()).rejects.toThrow(/503/)
  })
})
