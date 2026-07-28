import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests need a board they control, so they work from a blank one;
// `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import {
  eliminationStatus,
  survivingTeams,
  isAlive,
  thirdRanksAbove,
  thirdPlaceEntrySlots,
  aliveEntrySlots,
  advancementRequirements,
} from '../src/utils/eliminationCheck.js'
import { computeQualification, ADVANCING_THIRDS } from '../src/utils/qualification.js'
import { enumerateOutlook } from '../src/utils/outlookEnum.js'
import { QUALIFIER_RANK } from '../src/data/qualifierRanking.js'

const GROUPS = Object.keys(TEAMS)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule. Matches
// left out of the map stay scoreless = "still to play".
function withScores(map) {
  return MATCHES.map((m) => (map[m.num] ? { ...m, score: map[m.num] } : m))
}

// Per-group result builder. Teams are ranked by their index in TEAMS[g]
// (0 = strongest … 3 = weakest); `template(hi, lo)` decides the result of the
// game between the better-ranked (hi) and worse-ranked (lo) team, then it's
// oriented back to the fixture's t1/t2. Index 2 always finishes third, so a
// template is really a way of dialling in that group's third-place profile.
function groupScores(g, template) {
  const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
  const out = {}
  for (const m of MATCHES) {
    if (m.stage !== 'Group' || m.group !== g) continue
    const a = idx[m.t1]
    const b = idx[m.t2]
    const r = template(Math.min(a, b), Math.max(a, b))
    if (r.draw) out[m.num] = [0, 0]
    else out[m.num] = a < b ? [r.margin, 0] : [0, r.margin] // hi (better rank) wins
  }
  return out
}

// Third place finishes on 4 points with GD 0 → clearly ABOVE a 3-point third.
const STRONG = (hi, lo) => (hi === 0 && lo === 2 ? { draw: true } : { margin: 1 })
// Third place finishes on 3 points but GD −9 (two 5-goal beatings) → clearly
// BELOW a 3-point / −1 third.
const WEAK = (hi, lo) => (lo === 2 && hi <= 1 ? { margin: 5 } : { margin: 1 })
// Every game a 1–0 win for the better-ranked side → third on 3 points, GD −1.
const PLAIN = () => ({ margin: 1 })

describe('thirdRanksAbove — official cross-group third-place order', () => {
  it('orders by points, then GD, then GF, then conduct, then the qualifying ranking', () => {
    const base = { name: 'X', Pts: 3, GD: -3, GF: 1, conduct: 0 }
    expect(thirdRanksAbove({ ...base, Pts: 4 }, base)).toBe(true) // more points
    expect(thirdRanksAbove({ ...base, GD: 0 }, base)).toBe(true) // better GD
    expect(thirdRanksAbove(base, { ...base, GD: 0 })).toBe(false)
    expect(thirdRanksAbove({ ...base, GF: 3 }, base)).toBe(true) // more goals
    expect(thirdRanksAbove({ ...base, conduct: 0 }, { ...base, conduct: -2 })).toBe(true) // fewer cards
    // All equal except name → the European Qualifiers ranking decides.
    expect(QUALIFIER_RANK['Türkiye']).toBeLessThan(QUALIFIER_RANK['Slovenia'])
    expect(thirdRanksAbove({ ...base, name: 'Türkiye' }, { ...base, name: 'Slovenia' })).toBe(true)
    expect(thirdRanksAbove({ ...base, name: 'Slovenia' }, { ...base, name: 'Türkiye' })).toBe(false)
  })
})

describe('eliminationStatus — exactness vs the qualification picture (complete stage)', () => {
  // A complete, tie-free group stage: every group runs 9/6/3/0, and the third-
  // placed team's goal difference is made unique per group so the best-4-of-6
  // cut is unambiguous (third GD = group index − 1, so the four highest-indexed
  // groups' thirds advance).
  function buildComplete() {
    const score = {}
    GROUPS.forEach((g, i) => {
      const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        const a = idx[m.t1]
        const b = idx[m.t2]
        const margin = Math.min(a, b) === 2 && Math.max(a, b) === 3 ? i + 1 : 1
        score[m.num] = a < b ? [margin, 0] : [0, margin]
      }
    })
    return withScores(score)
  }

  it('marks top-two as alive, the four best thirds alive, and everyone else eliminated', () => {
    const matches = buildComplete()
    const status = eliminationStatus(matches)
    const qual = computeQualification(matches)

    GROUPS.forEach((g, i) => {
      const [first, second, third, fourth] = TEAMS[g].map((t) => t.name)
      expect(status[first]).toBe('alive')
      expect(status[second]).toBe('alive')
      // Third GD = i − 1; the four highest (i = 2..5) make the cut.
      expect(status[third], `${g} third`).toBe(i >= GROUPS.length - ADVANCING_THIRDS ? 'alive' : 'eliminated')
      expect(status[fourth]).toBe('eliminated')
    })

    // The alive thirds must be exactly computeQualification's best four.
    const aliveThirds = GROUPS.map((g) => TEAMS[g][2].name).filter((n) => status[n] === 'alive')
    expect(new Set(aliveThirds)).toEqual(qual.bestThirds)
  })
})

describe('eliminationStatus — a bubble third that only survives on goal difference', () => {
  // Frozen scenario. Serbia finish Group C third on 3 pts / −1 GD. Of the other
  // five groups, three field a third clearly above that (STRONG, 4 pts) and one
  // clearly below (WEAK, 3 pts / −9). The sixth, Group F, is the swing: Portugal
  // have won it, but Czechia and Georgia are level on 3 pts / +1 with their
  // meeting (Match 22) still to play. The loser finishes third on 3 points with
  // GD 1 − margin, so:
  //   a 1- or 2-goal defeat  → third on GD 0 or −1 but with more goals scored
  //                            → ABOVE Serbia → four thirds above → Serbia out.
  //   a 3-goal-or-worse defeat → third on GD −2 or lower → BELOW Serbia
  //                            → only three above → Serbia take the last spot.
  // So Serbia are alive, but only down heavy-scoreline paths that a one-goal
  // win/draw/loss model cannot represent — which is the whole reason this module
  // exists alongside the Outlook.
  const SWING_F = { 12: [1, 0], 36: [0, 1], 23: [0, 1], 35: [2, 0], 11: [0, 2] } // Match 22 left

  function scenario(strong, weak) {
    const scores = { ...groupScores('C', PLAIN), ...SWING_F }
    for (const g of strong) Object.assign(scores, groupScores(g, STRONG))
    for (const g of weak) Object.assign(scores, groupScores(g, WEAK))
    return withScores(scores)
  }

  const STRONG_3 = ['A', 'B', 'D']
  const WEAK_1 = ['E']

  it('leaves exactly one group match unplayed', () => {
    const matches = scenario(STRONG_3, WEAK_1)
    expect(matches.filter((m) => m.stage === 'Group' && !m.score).map((m) => m.num)).toEqual([22])
  })

  it('reports Serbia as still alive (the exact check finds the heavy-defeat path)', () => {
    const matches = scenario(STRONG_3, WEAK_1)
    expect(isAlive(matches, 'Serbia')).toBe(true)
    expect(survivingTeams(matches)).toContain('Serbia')
  })

  it('the goal-difference enumeration surfaces Serbia with a real share', () => {
    // Under a one-goal model Serbia would tally 0% and vanish. The margin
    // enumeration walks the heavy-defeat paths, so Serbia appear as a genuine
    // candidate in the third-place slot they can reach (Match 41, v Winner F).
    const matches = scenario(STRONG_3, WEAK_1)
    const { perMatch, total } = enumerateOutlook(matches)
    let serbiaCount = 0
    const shown = new Set()
    for (const sides of Object.values(perMatch)) {
      for (const s of sides) {
        if (s.locked) shown.add(s.locked)
        for (const c of s.candidates) {
          shown.add(c.team)
          if (c.team === 'Serbia') serbiaCount += c.count
        }
      }
    }
    expect(shown.has('Serbia')).toBe(true)
    // Match 22 is enumerated over margins −8…+8 = 17 outcomes; Serbia advance on
    // the 12 where the margin is at least 3 either way.
    expect(total).toBe(17)
    expect(serbiaCount).toBe(12)
    expect(serbiaCount).toBeLessThan(total) // a path, not a lock
    expect(survivingTeams(matches)).toContain('Serbia')
  })

  it('reports where Serbia would play if they advanced (third-place entry slots)', () => {
    const matches = scenario(STRONG_3, WEAK_1)
    const slots = thirdPlaceEntrySlots(matches, 'Serbia')
    expect(slots.length).toBeGreaterThan(0)
    // A Group C third can only face the winners whose entry-round third slot
    // lists C — Match 41 (Winner F, "3rd Group A/B/C") and Match 43 (Winner E,
    // "3rd Group A/B/C/D"). On this board only the Match 41 combination is still
    // reachable.
    for (const s of slots) {
      expect([41, 43]).toContain(s.matchNum)
      expect(['E', 'F']).toContain(s.winnerGroup)
    }
    expect(slots).toEqual([{ winnerGroup: 'F', matchNum: 41 }])
    // The batch form keys the same data by team.
    expect(aliveEntrySlots(matches, survivingTeams(matches))['Serbia']).toEqual(slots)
  })

  it('spells out the goal-difference requirements to advance', () => {
    const matches = scenario(STRONG_3, WEAK_1)
    const req = advancementRequirements(matches, 'Serbia')
    expect(req).toBeTruthy()
    expect(req.profile).toMatchObject({ Pts: 3, GD: -1 })
    expect(req.ownGroupComplete).toBe(true) // Group C is done
    // Three groups are already ahead and one already below, so only Group F —
    // the one with a game left — is in the balance, and Serbia need it to go
    // their way: "needs at least 1 of these 1".
    expect(req.forcedAbove).toBe(3)
    expect(req.forcedBelow).toBe(1)
    expect(req.variable.map((v) => v.group)).toEqual(['F'])
    expect(req.needAtLeast).toBe(1)
    // The condition is phrased in goal-difference terms relative to Serbia.
    expect(req.variable[0].condition).toMatch(/fewer than 3 points/)
    expect(req.variable[0].condition).toMatch(/worse than -1/)
  })

  it('frames a team whose own group is still playing as the GD race (no fixed checklist)', () => {
    // Czechia's Group F still has a game to play, so their points and goal
    // difference as a third aren't settled — the requirements must NOT be a fixed
    // "needs N (GD threshold)" checklist but the two-step "finish 3rd, then win
    // the GD race" framing.
    const matches = scenario(STRONG_3, WEAK_1)
    const req = advancementRequirements(matches, 'Czechia')
    expect(req).toBeTruthy()
    expect(req.ownGroupComplete).toBe(false)
    expect(req.ownGroup).toBe('F')
    expect(typeof req.thirdPts).toBe('number')
    expect(Array.isArray(req.unresolvedGroups)).toBe(true)
    // The fixed-checklist fields are absent in this mode.
    expect(req.variable).toBeUndefined()
    expect(req.needAtLeast).toBeUndefined()
  })

  it('flips to eliminated once a fourth group is forced above Serbia', () => {
    // Promote Group E from weak to strong → four thirds always above Serbia.
    const matches = scenario(['A', 'B', 'D', 'E'], [])
    expect(isAlive(matches, 'Serbia')).toBe(false)
    expect(eliminationStatus(matches)['Serbia']).toBe('eliminated')
  })
})

describe('eliminationStatus — basic verdicts', () => {
  it('eliminates a team locked into 4th and keeps a top-two team alive', () => {
    // Group C: Serbia lose to England, Slovenia and Denmark, so they are locked
    // into 4th; Denmark are cruising at the top.
    const matches = withScores({ 7: [0, 1], 16: [1, 0], 31: [3, 0], 6: [1, 1] })
    const status = eliminationStatus(matches)
    expect(status['Serbia']).toBe('eliminated')
    expect(status['Denmark']).toBe('alive')
  })

  it('never over-claims while the field is too open to enumerate', () => {
    // Only matchday 1 in Group A (Germany v Scotland, Hungary v Switzerland) →
    // everything still alive.
    const matches = withScores({ 1: [1, 0], 2: [0, 0] })
    for (const t of TEAMS['A']) expect(isAlive(matches, t.name)).toBe(true)
  })
})
