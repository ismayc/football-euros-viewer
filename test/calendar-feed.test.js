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
import { buildICS } from '../src/utils/ics.js'
import { MATCHES } from '../src/data/matches.js'

// The UID domain the DOWNLOADED file stamps. Read out of the download path rather
// than written here, so this file states the invariant (both sources agree) rather
// than a second copy of the literal.
const UID_DOMAIN = buildICS({
  num: 1,
  stage: 'Group',
  group: 'A',
  t1: 'Germany',
  t2: 'Scotland',
  venue: 'olympiastadion',
  ko: '2024-06-14T19:00:00Z',
})
  .match(/UID:[^\s]*@([^\s\r]+)/)[1]
  .trim()

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

  it('falls back to teams and date for a fixture the committed data has never seen', async () => {
    // Only reachable if the feed grows a match this edition never played. A
    // recognized pair takes its number from MATCH_NUMS instead; see the
    // agreement test at the bottom of this file.
    global.fetch = ok({
      matches: [match({ num: undefined, round: 'Final', team1: 'Narnia', team2: 'Gondor' })],
    })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toMatch(new RegExp(`UID:euro2024-Final-Narnia-Gondor-2024-06-14@${UID_DOMAIN}`))
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
    expect((await handler({ queryStringParameters: {} })).body).toContain(`@${UID_DOMAIN}`)
  })

  it('stamps feed events with the same UID domain the downloaded file uses', async () => {
    // The two used to disagree (@euroviewer here, @footballeurosviewer there). It
    // was invisible because the UID bodies differ too, so both sources produce
    // separate calendar entries regardless. Derive the domain from the download
    // path so the pair cannot drift apart again.
    global.fetch = ok({ matches: [match({ num: 12 })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain(`@${UID_DOMAIN}`)
    expect(body).not.toMatch(/UID:[^\s]*@(?!footballeurosviewer)/)
  })

  it('expands a loser-of-match slot as well', async () => {
    // Euro 2024 plays no third-place match, so no fixture uses an L code, but
    // the mapping is there and a future edition or a feed quirk can reach it.
    global.fetch = ok({ matches: [match({ round: 'Final', group: undefined, team1: 'L51', team2: 'L52' })] })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).toContain('Loser Match 51 vs Loser Match 52')
  })

  // The bug this pair of tests exists for: the feed and the download used to
  // stamp different UID bodies for the same fixture, so a subscriber who had
  // also downloaded a match saw it twice in their calendar. A UID is the only
  // thing a calendar client uses to decide "same event", so the two sources
  // have to agree on all 51 of them, not just on the domain half.

  it('gives every committed fixture the same UID the download would', async () => {
    global.fetch = ok({
      matches: MATCHES.map((m) => ({
        round: m.stage === 'Group' ? 'Matchday 1' : m.stage,
        group: m.group,
        date: m.ko.slice(0, 10),
        time: '21:00',
        team1: m.t1,
        team2: m.t2,
      })),
    })
    const body = (await handler({ queryStringParameters: {} })).body
    const fromFeed = [...body.matchAll(/UID:(\S+)/g)].map((x) => x[1].trim())
    const fromDownload = MATCHES.map((m) => buildICS(m).match(/UID:(\S+)/)[1].trim())

    expect(fromFeed).toHaveLength(MATCHES.length)
    expect(new Set(fromFeed).size).toBe(MATCHES.length)
    expect([...fromFeed].sort()).toEqual([...fromDownload].sort())
  })

  it('resolves a number for every fixture the real upstream feed publishes', async () => {
    // MATCH_NUMS is a restatement of src/data/matches.js, so it can drift from
    // it. Rebuilding the map here from the app's own data is what catches a
    // regenerated fixture list: a missing or renumbered pair fails this, not a
    // subscriber's calendar. It also pins the shape the feed is keyed on, since
    // OpenFootball lists some fixtures in the opposite home/away order.
    const pairs = MATCHES.map((m) => [m.t1, m.t2].sort().join('~'))
    expect(new Set(pairs).size).toBe(MATCHES.length)

    global.fetch = ok({
      matches: MATCHES.map((m) => ({
        round: 'Matchday 1',
        group: 'Group A',
        date: m.ko.slice(0, 10),
        time: '21:00',
        // Reversed on purpose: identity must not depend on which side is first.
        team1: m.t2,
        team2: m.t1,
      })),
    })
    const body = (await handler({ queryStringParameters: {} })).body
    expect(body).not.toMatch(/UID:euro2024-Matchday/)
    expect([...body.matchAll(/UID:euro2024-match-(\d+)@/g)].map((x) => Number(x[1])).sort((a, b) => a - b))
      .toEqual(MATCHES.map((m) => m.num).sort((a, b) => a - b))
  })
})
