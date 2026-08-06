import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { computeClinch } from '../src/utils/clinch.js'
import {
  decideMatch,
  resolveThirdPlaceSlots,
  resolveLockedThirdSlots,
  resolveKnockoutSlots,
  resolveBracket,
} from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

const GROUPS = Object.keys(TEAMS)
const THIRD_SLOT = /^3rd Group [A-F/]+$/
const ANY_PLACEHOLDER =
  /^(Winner|Runner-up) Group [A-F]$|^3rd Group [A-F/]+$|^(Winner|Loser) Match \d+$/
const ALL_NAMES = new Set(Object.values(TEAMS).flat().map((t) => t.name))

// This edition is finished, so the committed schedule already holds every
// result. Tests about "before anything is played" must ask for a blank board.
const BLANK = unscored()

// A complete, tie-free group stage: a strict 9/6/3/0 hierarchy in every group
// (team index 0 strongest … 3 weakest), with the 3rd-vs-4th game won by a
// group-specific margin so each third's goal difference is unique — making the
// best-four cut and the UEFA combination unambiguous.
function buildComplete() {
  const score = {}
  GROUPS.forEach((g, i) => {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of BLANK) {
      if (m.stage !== 'Group' || m.group !== g) continue
      const a = idx[m.t1]
      const b = idx[m.t2]
      const margin = Math.min(a, b) === 2 && Math.max(a, b) === 3 ? i + 1 : 1
      score[m.num] = a < b ? [margin, 0] : [0, margin]
    }
  })
  return BLANK.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

describe('decideMatch — winner/loser of a knockout tie', () => {
  it('takes the side with more goals', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1] })).toEqual({ winner: 'A', loser: 'B' })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 3] })).toEqual({ winner: 'B', loser: 'A' })
  })

  it('breaks a draw on penalties', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1], pens: [5, 4] })).toEqual({
      winner: 'A', loser: 'B',
    })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [0, 0], pens: [2, 4] })).toEqual({
      winner: 'B', loser: 'A',
    })
  })

  it('returns null when not yet settled (drawn w/o pens, live, voided, unplayed)', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1] })).toBeNull() // drawn, no shootout yet
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], live: { clock: "70'" } })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], voided: true })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B' })).toBeNull() // no score
  })

  it('decides the real 2024 shootouts from the committed data', () => {
    const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))
    expect(decideMatch(byNum[41])).toEqual({ winner: 'Portugal', loser: 'Slovenia' })
    expect(decideMatch(byNum[46])).toEqual({ winner: 'France', loser: 'Portugal' })
    expect(decideMatch(byNum[47])).toEqual({ winner: 'England', loser: 'Switzerland' })
    expect(decideMatch(byNum[51])).toEqual({ winner: 'Spain', loser: 'England' })
  })
})

describe('resolveThirdPlaceSlots — fill "3rd Group X/Y/Z" once the group stage is final', () => {
  it('does nothing until every group match is final', () => {
    expect(resolveThirdPlaceSlots(BLANK)).toBe(BLANK) // nothing played
    // One group still live → not complete → untouched.
    const live = buildComplete().map((m) => (m.num === 1 ? { ...m, live: { clock: "80'" } } : m))
    expect(
      resolveThirdPlaceSlots(live).some((m) => THIRD_SLOT.test(m.t1) || THIRD_SLOT.test(m.t2)),
    ).toBe(true)
  })

  it('replaces every Round-of-16 third-place placeholder with a real team', () => {
    const resolved = resolveThirdPlaceSlots(buildComplete())
    const r16 = resolved.filter((m) => m.stage === 'R16')
    for (const m of r16) {
      expect(THIRD_SLOT.test(m.t1)).toBe(false)
      expect(THIRD_SLOT.test(m.t2)).toBe(false)
    }
    // Exactly the four winner-v-third ties got a real third-placed opponent.
    const thirdsPlaced = r16.filter(
      (m) => ALL_NAMES.has(m.t2) && /^Winner Group [A-F]$/.test(BLANK.find((x) => x.num === m.num).t1),
    )
    expect(thirdsPlaced.length).toBe(4)
  })
})

describe('third-place slots on the other side of the tie, and boards with nowhere to put them', () => {
  // The committed 2024 draw happens to put every "3rd Group …" slot second, but
  // both resolvers are written to fill whichever side carries the label — the
  // World Cup's Round of 32 draws it the other way round. Swapping a tie's sides
  // on the board exercises that: the slot LABELS are read from the static
  // schedule by match number, so only the side being rewritten changes.
  const swapSides = (matches, num) =>
    matches.map((m) => (m.num === num ? { ...m, t1: m.t2, t2: m.t1 } : m))

  it('returns the board untouched when a final group stage has no ties to fill', () => {
    // Group results only — the knockout fixtures are published separately and
    // are not on this board, so there is no third-place slot to fill at all.
    const groupsOnly = buildComplete().filter((m) => m.stage === 'Group')
    expect(resolveThirdPlaceSlots(groupsOnly)).toBe(groupsOnly)
  })

  it('fills a third-place slot drawn on the FIRST side of its tie', () => {
    // M39 is "Winner Group B v 3rd Group A/D/E/F"; swap it so the third is t1.
    const swapped = swapSides(buildComplete(), 39)
    const resolved = resolveThirdPlaceSlots(swapped)
    const m39 = resolved.find((m) => m.num === 39)
    expect(ALL_NAMES.has(m39.t1)).toBe(true)
    expect(m39.t2).toBe('Winner Group B')
  })

  it('fills a LOCKED third-place slot drawn on the FIRST side of its tie', () => {
    const snapshot = BLANK.map((m) =>
      m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
    )
    // M43 is the tie the early-lock path fills (Winner Group E v 3rd Group …).
    const resolved = resolveLockedThirdSlots(swapSides(snapshot, 43))
    const m43 = resolved.find((m) => m.num === 43)
    expect(m43.t1).toBe('Netherlands')
    expect(m43.t2).toBe('Winner Group E')
  })

  it('waits for the assigned group to finish before locking its third into a slot', () => {
    // Every group complete except E, which still has its final game to play. The
    // reachable combinations now agree that the Winner-C tie draws group E's
    // third — but E has not finished, so which team that is remains open and the
    // slot must stay a placeholder.
    const board = buildComplete().map((m) =>
      m.num === 34 ? (({ score, ...rest }) => rest)(m) : m,
    )
    const resolved = resolveLockedThirdSlots(board)
    const winnerC = resolved.find(
      (m) => BLANK.find((x) => x.num === m.num)?.t1 === 'Winner Group C',
    )
    expect(THIRD_SLOT.test(winnerC.t2)).toBe(true)
    // Teeth: once E finishes, the very same slot does resolve to a real team.
    const done = resolveLockedThirdSlots(buildComplete())
    expect(ALL_NAMES.has(done.find((m) => m.num === winnerC.num).t2)).toBe(true)
  })
})

describe('resolveKnockoutSlots — propagate winners up the bracket', () => {
  it('fills a "Loser Match N" slot from a finished tie', () => {
    // The Euros have no third-place play-off, but the resolver handles the loser
    // side of a tie the same way it handles the winner — a sibling edition that
    // does draw one gets it for free.
    const ms = [
      { num: 49, stage: 'SF', t1: 'Spain', t2: 'France', score: [1, 0] },
      { num: 50, stage: 'SF', t1: 'Denmark', t2: 'England', score: [0, 0], pens: [2, 4] },
      { num: 60, stage: '3rd', t1: 'Loser Match 49', t2: 'Loser Match 50' },
    ]
    const third = resolveKnockoutSlots(ms).find((m) => m.num === 60)
    expect([third.t1, third.t2]).toEqual(['France', 'Denmark'])
  })

  it('feeds a round’s winners into the next round', () => {
    // Real Euro topology: QF 45 is "Winner Match 39 v Winner Match 37".
    const ms = [
      { num: 37, stage: 'R16', t1: 'Albania', t2: 'Denmark', score: [2, 1] },
      { num: 39, stage: 'R16', t1: 'Spain', t2: 'Germany', score: [0, 0], pens: [4, 3] },
      { num: 45, stage: 'QF', t1: 'Winner Match 39', t2: 'Winner Match 37' },
    ]
    const r = resolveKnockoutSlots(ms)
    const m45 = r.find((m) => m.num === 45)
    expect([m45.t1, m45.t2]).toEqual(['Spain', 'Albania'])
  })

  it('routes semi-final winners into the final', () => {
    const ms = [
      { num: 49, stage: 'SF', t1: 'Spain', t2: 'France', score: [1, 0] },
      { num: 50, stage: 'SF', t1: 'Denmark', t2: 'England', score: [2, 3] },
      { num: 51, stage: 'Final', t1: 'Winner Match 49', t2: 'Winner Match 50' },
    ]
    const r = resolveKnockoutSlots(ms)
    const final = r.find((m) => m.num === 51)
    expect([final.t1, final.t2]).toEqual(['Spain', 'England'])
  })

  it('leaves a slot as a placeholder while its tie is unsettled', () => {
    const ms = [
      { num: 37, stage: 'R16', t1: 'Albania', t2: 'Denmark', score: [1, 1] }, // drawn, no pens
      { num: 45, stage: 'QF', t1: 'Winner Match 39', t2: 'Winner Match 37' },
    ]
    const r = resolveKnockoutSlots(ms)
    expect(r.find((m) => m.num === 45).t2).toBe('Winner Match 37')
    // Original array returned untouched when nothing resolves.
    expect(resolveKnockoutSlots(ms)).toEqual(ms)
  })

  it('does NOT advance a LIVE knockout — even one with a leading score — until full time', () => {
    const live = [
      { num: 37, stage: 'R16', t1: 'Albania', t2: 'Denmark', score: [1, 2], live: { clock: "70'" } },
      { num: 45, stage: 'QF', t1: 'Winner Match 39', t2: 'Winner Match 37' },
    ]
    const r = resolveKnockoutSlots(live)
    expect(r.find((m) => m.num === 45).t2).toBe('Winner Match 37')
    expect(resolveKnockoutSlots(live)).toEqual(live) // nothing resolved → untouched

    // The instant the SAME score goes final (live cleared), it propagates.
    const finalized = live.map((m) => (m.num === 37 ? { ...m, live: undefined } : m))
    expect(resolveKnockoutSlots(finalized).find((m) => m.num === 45).t2).toBe('Denmark')
  })
})

describe('resolveBracket — full pipeline', () => {
  it('leaves all knockout placeholders intact before anything is played', () => {
    expect(resolveBracket(BLANK, {})).toBe(BLANK)
  })

  it('fills the entire Round of 16 once the group stage is complete', () => {
    const complete = buildComplete()
    const clinch = computeClinch(complete)
    const resolved = resolveBracket(complete, clinch)
    for (const m of resolved.filter((m) => m.stage === 'R16')) {
      expect(ANY_PLACEHOLDER.test(m.t1)).toBe(false)
      expect(ANY_PLACEHOLDER.test(m.t2)).toBe(false)
    }
  })

  it('fills a LOCKED third-place opponent early, while a group is still in play', () => {
    // Groups B–F are done; Group A still has its final matchday to play.
    const snapshot = BLANK.map((m) =>
      m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
    )
    const clinch = computeClinch(snapshot)
    const resolved = resolveBracket(snapshot, clinch)

    // Every still-reachable four-thirds combination sends group D's third to M43,
    // and D is final — so the Netherlands are locked in there before Group A has
    // finished, which is the whole point of the early-lock path.
    expect(resolved.find((m) => m.num === 43).t2).toBe('Netherlands')

    // The other three third-place slots are genuinely still open, so they stay
    // placeholders rather than over-claiming.
    const open = resolved.filter((m) => m.stage === 'R16' && THIRD_SLOT.test(m.t2))
    expect(open).toHaveLength(3)
  })

  it('resolveLockedThirdSlots is a no-op before any group is complete', () => {
    expect(resolveLockedThirdSlots(BLANK)).toBe(BLANK)
  })

  it('plays a full bracket end-to-end (incl. a shootout) to a single champion', () => {
    const clinch = computeClinch(buildComplete())
    let cur = resolveBracket(buildComplete(), clinch)

    // Repeatedly: assign a result to every ready-but-unplayed knockout tie, then
    // re-resolve so winners feed the next round. Match 37 and a semi-final go to
    // penalties, exercising the shootout path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        if (m.num === 37 || m.num === 49) return { ...m, score: [1, 1], pens: [4, 2] }
        return { ...m, score: [1, 0] } // home side advances
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    const ko = cur.filter((m) => m.stage !== 'Group')
    expect(ko).toHaveLength(15)
    for (const m of ko) {
      expect(ALL_NAMES.has(m.t1), `M${m.num} t1`).toBe(true)
      expect(ALL_NAMES.has(m.t2), `M${m.num} t2`).toBe(true)
    }
    expect(decideMatch(cur.find((m) => m.stage === 'Final'))).not.toBeNull()
  })

  it('propagates REAL Round-of-16 winners through the bracket (frozen group results)', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const seeded = BLANK.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(seeded)
    let cur = resolveBracket(seeded, clinch)

    // Knockout sim on the REAL group outcome: home side advances, except M39,
    // which goes to a shootout to exercise the penalty path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        return m.num === 39 ? { ...m, score: [1, 1], pens: [4, 2] } : { ...m, score: [1, 0] }
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    const byNum = Object.fromEntries(cur.map((m) => [m.num, m]))
    // The real group stage puts Spain (winner B) against Georgia (3rd F) in M39
    // and Germany (winner A) against Denmark (runner-up C) in M37 — and QF 45 is
    // "Winner Match 39 v Winner Match 37", so the two winners meet there.
    expect([byNum[39].t1, byNum[39].t2]).toEqual(['Spain', 'Georgia'])
    expect([byNum[37].t1, byNum[37].t2]).toEqual(['Germany', 'Denmark'])
    expect([byNum[45].t1, byNum[45].t2]).toEqual(['Spain', 'Germany'])

    for (const m of cur.filter((x) => x.stage !== 'Group')) {
      expect(ALL_NAMES.has(m.t1) && ALL_NAMES.has(m.t2), `M${m.num}`).toBe(true)
    }
    expect(decideMatch(byNum[51])).not.toBeNull()
  })
})
