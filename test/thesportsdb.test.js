import { describe, it, expect, vi } from 'vitest'
import { fetchBackup, sdbFinalScore } from '../src/services/thesportsdb.js'
import { pairKey } from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const match1 = MATCHES.find((m) => m.num === 1) // Germany v Scotland, 14 June

const ev = ({ home, away, hs, as, status, ts }) => ({
  strHomeTeam: home,
  strAwayTeam: away,
  intHomeScore: hs,
  intAwayScore: as,
  strStatus: status,
  strTimestamp: ts,
})

describe('fetchBackup (parsing TheSportsDB shape)', () => {
  it('marks finished matches, parses UTC timestamps, and maps aliases', async () => {
    const feed = {
      events: [
        ev({ home: 'Germany', away: 'Scotland', hs: '2', as: '1', status: 'FT', ts: '2024-06-14T19:00:00' }),
        // Feed spelling normalised: "Turkey" -> "Türkiye"; not started, no score.
        ev({ home: 'Turkey', away: 'Georgia', hs: null, as: null, status: 'NS', ts: '2024-06-18T16:00:00' }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchBackup()

    const done = map.get(pairKey('Germany', 'Scotland'))
    expect(done.final).toBe(true)
    expect(done.score).toEqual([2, 1])
    // strTimestamp is UTC -> same instant as our +02:00 kickoff.
    expect(map.get('inst:' + new Date(match1.ko).getTime())).toBe(done)

    const ns = map.get(pairKey('Türkiye', 'Georgia'))
    expect(ns.final).toBe(false)
    expect(ns.score).toBeNull()
  })

  it('throws when no day in the window returns data (all non-OK)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await expect(fetchBackup()).rejects.toThrow(/Backup request failed/)
  })

  it('tolerates a partial failure — keeps the days that succeeded', async () => {
    const feed = {
      events: [
        { strHomeTeam: 'Germany', strAwayTeam: 'Scotland', intHomeScore: '2', intAwayScore: '0', strStatus: 'FT', strTimestamp: '2024-06-14T19:00:00Z' },
      ],
    }
    let n = 0
    global.fetch = vi.fn(async () => {
      n += 1
      return n === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => feed }
    })
    const map = await fetchBackup(undefined, ['2024-06-13', '2024-06-14', '2024-06-15'])
    expect(map.get(pairKey('Germany', 'Scotland')).score).toEqual([2, 0])
  })
})

describe('sdbFinalScore (getter for the reconciler)', () => {
  it('returns an oriented final only when the source marks it finished', () => {
    const notFinal = new Map([
      [pairKey('Germany', 'Scotland'), { home: 'Germany', away: 'Scotland', final: false, score: [1, 0] }],
    ])
    expect(sdbFinalScore(match1, notFinal)).toBeNull()

    const final = new Map([
      [pairKey('Germany', 'Scotland'), { home: 'Germany', away: 'Scotland', final: true, score: [2, 1] }],
    ])
    expect(sdbFinalScore(match1, final)).toEqual({ home: 'Germany', away: 'Scotland', ft: [2, 1] })
  })
})
