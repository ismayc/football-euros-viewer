// The Netlify calendar function's handler and event builder.
//
// `prettySlot` had tests (calendar-slots.test.js); everything around it did not,
// and the whole file sat outside `coverage.include`, which was `src/**`. That
// left the endpoint a subscriber's calendar actually polls measured by nothing.
//
// The upstream here is OpenFootball's euro.json, not ESPN, so these payloads
// are in OpenFootball's shape: a `matches` array with `date`, `time` carrying its
// own UTC offset, `team1`/`team2` that may still be knockout slot codes, and a
// `score` with separate full-time, extra-time and penalty arrays.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { handler } from '../netlify/functions/calendar.js'

const ok = (payload) =>
  vi.fn(async () => ({ ok: true, json: async () => payload }))

const match = (over = {}) => ({
  num: 1,
  round: 'Matchday 1',
  group: 'Group A',
  date: '2024-06-14',
  time: '21:00',
  team1: 'Germany',
  team2: 'Scotland',
  ground: 'Fußball Arena München',
  ...over,
})

const events = (body) => (body.match(/BEGIN:VEVENT/g) || []).length

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the calendar handler', () => {
  it('serves a calendar naming this tournament', async () => {
    global.fetch = ok({ matches: [match()] })
    const res = await handler({ queryStringParameters: {} })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/)
    expect(res.body).toContain('X-WR-CALNAME:Euro 2024')
    expect(events(res.body)).toBe(1)
    expect(res.body).toContain('SUMMARY:Euro 2024: Germany vs Scotland')
    expect(res.body).toContain('LOCATION:Fußball Arena München')
    expect(res.body).toContain('DESCRIPTION:Group A')
  })

  it('reads an offset-less kickoff as German local time', async () => {
    // UEFA published every Euro 2024 kickoff in German local time and the feed
    // omits the offset, so an offset-less 21:00 is CEST, i.e. 19:00 UTC. Reading
    // it as UTC would put every match in a subscriber's calendar two hours out.
    global.fetch = ok({ matches: [match()] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('DTSTART:20240614T190000Z')
  })

  it('filters to the requested teams', async () => {
    global.fetch = ok({ matches: [match(), match({ num: 2, team1: 'Spain', team2: 'Italy' })] })
    const res = await handler({ queryStringParameters: { teams: 'spain' } })
    expect(events(res.body)).toBe(1)
    expect(res.body).toContain('Spain')
    expect(res.body).toContain('My Teams')
  })

  it('labels a knockout round rather than a matchday, and expands slot codes', async () => {
    global.fetch = ok({
      matches: [
        match({ num: 39, round: 'Round of 16', group: undefined, team1: '1A', team2: '3C/D/F' }),
        match({ num: 49, round: 'Semi-finals', group: undefined, team1: 'W45', team2: 'W46' }),
        match({ num: 45, round: 'Quarter-finals', group: undefined, team1: '1A', team2: '2B' }),
      ],
    })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('DESCRIPTION:Round of 16')
    // Euro 2024 has six groups, so a third-place slot names a subset of A-F.
    expect(body).toContain('SUMMARY:Euro 2024: Winner Group A vs 3rd place (C/D/F)')
    expect(body).toContain('SUMMARY:Euro 2024: Winner Match 45 vs Winner Match 46')
    expect(body).toContain('DESCRIPTION:Semifinal')
    expect(body).toContain('SUMMARY:Euro 2024: Winner Group A vs Runner-up Group B')
    expect(body).toContain('DESCRIPTION:Quarterfinal')
  })

  it('shows a finished score, and notes extra time and penalties', async () => {
    global.fetch = ok({
      matches: [
        match({ num: 2, score: { ft: [1, 1] } }),
        match({ num: 3, score: { ft: [1, 1], et: [2, 1] } }),
        match({ num: 4, score: { ft: [0, 0], et: [0, 0], p: [4, 3] } }),
      ],
    })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('(1–1)')
    expect(body).toContain('(2–1 AET)')
    expect(body).toContain('(0–0 AET p4–3)')
  })

  it('skips a match with no usable kickoff rather than emitting a broken event', async () => {
    global.fetch = ok({ matches: [match({ time: undefined }), match({ num: 5 })] })
    expect(events((await handler({ queryStringParameters: {} })).body)).toBe(1)
  })

  it('identifies a match with no number by its teams and date', async () => {
    global.fetch = ok({ matches: [match({ num: undefined, round: 'Final' })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toMatch(/UID:euro2024-Final-Germany-Scotland-2024-06-14@euroviewer/)
  })

  it('serves an empty calendar rather than failing when the feed has no matches', async () => {
    global.fetch = ok({})
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(200)
    expect(events(res.body)).toBe(0)
  })

  it('reports an upstream failure instead of an empty calendar', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    expect((await handler({ queryStringParameters: {} })).statusCode).toBe(502)
  })

  it('reports a thrown error', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    const res = await handler({ queryStringParameters: {} })
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatch(/offline/)
  })

  it('normalizes the team spellings the feed and the app disagree about', async () => {
    // OpenFootball writes "Czech Republic" and "Turkey"; the app uses the names
    // those associations use. A mismatch here silently drops a ?teams= filter.
    global.fetch = ok({ matches: [match({ team1: 'Czech Republic', team2: 'Turkey' })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('SUMMARY:Euro 2024: Czechia vs Türkiye')
  })

  it('reads an explicit offset when the feed states one', async () => {
    // The default only applies when the feed omits the offset.
    global.fetch = ok({ matches: [match({ time: '18:00 UTC+1' })] })
    expect((await handler({ queryStringParameters: {} })).body).toContain('DTSTART:20240614T170000Z')
  })

  it('falls back to a generic group label, and to no venue at all', async () => {
    // Both are shapes OpenFootball actually produces mid-tournament: a matchday
    // row before the group is filled in, and a fixture with no ground yet.
    global.fetch = ok({ matches: [match({ group: undefined, ground: undefined })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('DESCRIPTION:Group stage')
    expect(body).toContain('LOCATION:')
  })

  it('keeps an unrecognized round label as the feed wrote it', async () => {
    global.fetch = ok({ matches: [match({ round: 'Play-off', group: undefined })] })
    expect((await handler({ queryStringParameters: {} })).body).toContain('DESCRIPTION:Play-off')
  })

  it('still emits an event when the feed has a score object with no result in it', async () => {
    // OpenFootball writes the score object as soon as a match starts, before
    // either full-time or extra-time arrays exist.
    global.fetch = ok({ matches: [match({ num: 6, score: {} })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(events(body)).toBe(1)
    expect(body).not.toMatch(/SUMMARY:.*\(/)
  })

  it('builds an id for a match with neither a number nor a named side', async () => {
    global.fetch = ok({ matches: [match({ num: undefined, team1: undefined, round: 'Final' })] })
    expect((await handler({ queryStringParameters: {} })).body).toContain('@euroviewer')
  })

  it('expands a loser-of-match slot as well', async () => {
    // Euro 2024 plays no third-place match, so no fixture uses an L code, but
    // the mapping is there and a future edition or a feed quirk can reach it.
    global.fetch = ok({ matches: [match({ round: 'Final', group: undefined, team1: 'L51', team2: 'L52' })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('Loser Match 51 vs Loser Match 52')
  })
})
