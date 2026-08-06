import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import {
  computeClinch,
  resolveClinchedSlots,
  resolveRunnerUpSlots,
  groupRunnersUp,
  groupWinners,
  newlyClinched,
  clinchHeadline,
  clinchBadge,
  goalCap,
  scorelinesUpTo,
} from '../src/utils/clinch.js'

const GROUPS = Object.keys(TEAMS)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule.
function withScores(scoreByNum) {
  return MATCHES.map((m) => (scoreByNum[m.num] ? { ...m, score: scoreByNum[m.num] } : m))
}

describe('clinch — within a single group', () => {
  // Group A fixtures: M1 Germany v Scotland, M2 Hungary v Switzerland,
  // M14 Germany v Hungary, M15 Scotland v Switzerland, M25 Scotland v Hungary,
  // M26 Switzerland v Germany.
  it('flags a guaranteed group winner as won-group', () => {
    // Germany win both their played matches; nobody else can reach 6 points.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Germany 3–0 Scotland
        14: [3, 0], // Germany 3–0 Hungary
        2: [0, 0], // Hungary 0–0 Switzerland
        15: [0, 0], // Scotland 0–0 Switzerland
      }),
    )
    expect(status['Germany']).toBe('won-group')
    // Cross-group race isn't computable (other groups unplayed), so the chasing
    // teams are simply undecided — never falsely "through" or "out".
    expect(status['Switzerland']).toBeNull()
    expect(status['Scotland']).toBeNull()
  })

  it('flags two teams clear of the field as top2 (through, group order open)', () => {
    // Germany and Switzerland both 6 pts; Hungary/Scotland can reach only 3.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Germany 1–0 Scotland
        14: [1, 0], // Germany 1–0 Hungary
        2: [0, 1], // Hungary 0–1 Switzerland
        15: [0, 1], // Scotland 0–1 Switzerland
      }),
    )
    expect(status['Germany']).toBe('top2')
    expect(status['Switzerland']).toBe('top2')
    expect(status['Hungary']).toBeNull()
    expect(status['Scotland']).toBeNull()
  })

  it('flags a team locked into EXACTLY 2nd as the group runner-up (a game still to play)', () => {
    // Germany win all three → 9 pts, 1st locked. Scotland are also done: beat
    // Switzerland and Hungary, lost only to Germany → 6 pts. The one fixture left
    // (Hungary v Switzerland) can lift neither above 3 — so Scotland is pinned to
    // 2nd while a match is still outstanding. 'runner-up', not 'top2'.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Germany 3–0 Scotland
        14: [3, 0], // Germany 3–0 Hungary
        26: [0, 3], // Switzerland 0–3 Germany
        15: [3, 0], // Scotland 3–0 Switzerland
        25: [3, 0], // Scotland 3–0 Hungary
        // M2 Hungary v Switzerland still to play.
      }),
    )
    expect(status['Germany']).toBe('won-group')
    expect(status['Scotland']).toBe('runner-up')
    // The bottom two still contest 3rd/4th; cross-group race not yet computable.
    expect(status['Switzerland']).toBeNull()
    expect(status['Hungary']).toBeNull()
  })

  it('treats a live (in-progress) match as undecided, not a final result', () => {
    // Scores that, if all final, clinch the group for Germany (6 pts; nobody else
    // can reach 6). M14 is Germany's *current* match, shown LIVE at 3–0.
    const scores = {
      1: [3, 0], // Germany 3–0 Scotland (final)
      2: [0, 0], // Hungary 0–0 Switzerland (final)
      15: [0, 0], // Scotland 0–0 Switzerland (final)
      14: [3, 0], // Germany 3–0 Hungary (LIVE — running score)
    }
    // If the live game were counted as final, Germany would read "won-group".
    expect(computeClinch(withScores(scores))['Germany']).toBe('won-group')

    // But while it's live, the result isn't settled — no clinch yet.
    const live = withScores(scores).map((m) =>
      m.num === 14 ? { ...m, live: { clock: "60'", detail: '' } } : m,
    )
    expect(computeClinch(live)['Germany']).toBeNull()
  })

  it('eliminates a team the head-to-head locks out of 3rd, even if it could tie on points', () => {
    // Group C: Serbia have played all three and lost the lot — to England, to
    // Slovenia (the head-to-head that also settles any tie) and to Denmark. With
    // 0 points and no games left they cannot be caught from below, so they are
    // locked into 4th while the group's other places are still open.
    const status = computeClinch(
      withScores({
        7: [0, 2], // Serbia 0–2 England
        16: [2, 0], // Slovenia 2–0 Serbia (head-to-head to Slovenia)
        31: [2, 0], // Denmark 2–0 Serbia
        6: [1, 1], // Slovenia 1–1 Denmark
      }),
    )
    expect(status['Serbia']).toBe('eliminated')
  })

  it('falls back to the points bound for a third-place hope in a group too big to enumerate', () => {
    // Group A with all three of Hungary's games played and the other three teams'
    // round-robin still to come. Three unplayed games at a goal cap of 8 is
    // 81³ scorelines — over the enumeration budget — so the scoreline pass gives
    // up on the group entirely and every verdict has to come from the sound
    // points bounds instead.
    //
    // Hungary drew one and lost two, leaving them on 1 point with nothing left to
    // play. Germany and Switzerland are already above them and cannot come back
    // down, so Hungary can finish no higher than 3rd (out of the top two, but not
    // yet out of the tournament): exactly the case where the best third-place
    // profile has to be taken from the points ceiling rather than from a
    // scoreline enumeration that was never run.
    const status = computeClinch(
      withScores({
        14: [2, 0], // Germany 2–0 Hungary
        2: [0, 2], // Hungary 0–2 Switzerland
        25: [1, 1], // Scotland 1–1 Hungary
        // M1 Germany v Scotland, M15 Scotland v Switzerland and
        // M26 Switzerland v Germany all still to play.
      }),
    )
    // Teeth: the whole point of this board is that the scoreline pass is over
    // budget. If the cap ever shrank, or the budget grew, the group would be
    // enumerable and this test would silently stop exercising the fallback.
    expect(Math.pow(scorelinesUpTo(goalCap([])).length, 3)).toBeGreaterThan(500_000)
    // Not through, and not out either: Hungary's one point could still be a
    // qualifying third if the other five groups fall the right way.
    expect(status['Hungary']).toBeNull()
  })

  it('does not claim a clinch while a rival can still overtake on points', () => {
    // Only matchday 1 played: far too open for anything to be locked.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Germany 1–0 Scotland
        2: [0, 0], // Hungary 0–0 Switzerland
      }),
    )
    for (const t of TEAMS['A']) expect(status[t.name]).toBeNull()
  })
})

describe('resolveClinchedSlots — fill knockout placeholders in the data', () => {
  it('rewrites "Winner Group X" to the clinched winner in every match (so all views agree)', () => {
    const clinch = { Germany: 'won-group' }
    expect(groupWinners(clinch)).toEqual({ A: 'Germany' })

    const resolved = resolveClinchedSlots(MATCHES, clinch)
    // M37's first side was the "Winner Group A" placeholder — now the data
    // itself says Germany, so the bracket AND the detail modal show the same.
    expect(resolved.find((m) => m.num === 37).t1).toBe('Germany')
    // Unclinched slots untouched.
    expect(resolved.find((m) => m.num === 39).t1).toBe('Winner Group B')
    // No "Winner Group A" placeholder remains anywhere.
    expect(resolved.some((m) => m.t1 === 'Winner Group A' || m.t2 === 'Winner Group A')).toBe(false)
  })

  it('returns the original array untouched when nothing is clinched', () => {
    expect(resolveClinchedSlots(MATCHES, {})).toBe(MATCHES)
  })
})

describe('resolveRunnerUpSlots — fill the runner-up once a group is fully final', () => {
  // Group A all six matches final: Germany 9, Scotland 6, Hungary 3,
  // Switzerland 0 — so Scotland is the unambiguous runner-up (no tie-breaker).
  const groupAFinal = { 1: [2, 0], 14: [2, 0], 26: [0, 2], 15: [2, 0], 25: [2, 0], 2: [2, 0] }

  it('rewrites "Runner-up Group A" to the real team in every match', () => {
    const matches = withScores(groupAFinal)
    expect(groupRunnersUp(matches)).toEqual({ A: 'Scotland' })

    const resolved = resolveRunnerUpSlots(matches)
    // M38 = "Runner-up Group A" vs "Runner-up Group B".
    const m38 = resolved.find((m) => m.num === 38)
    expect(m38.t1).toBe('Scotland')
    // Group B isn't final, so its runner-up slot stays a placeholder.
    expect(m38.t2).toBe('Runner-up Group B')
    expect(resolved.some((m) => m.t1 === 'Runner-up Group A' || m.t2 === 'Runner-up Group A')).toBe(false)
  })

  it('does NOT resolve while any group match is still live (score provisional)', () => {
    const live = withScores(groupAFinal).map((m) =>
      m.num === 26 ? { ...m, live: { clock: "70'", detail: '' } } : m,
    )
    expect(groupRunnersUp(live)).toEqual({})
    expect(resolveRunnerUpSlots(live).find((m) => m.num === 38).t1).toBe('Runner-up Group A')
  })

  it('returns the original array untouched when no group has settled', () => {
    expect(resolveRunnerUpSlots(MATCHES)).toBe(MATCHES)
  })
})

describe('newlyClinched — announce what a result settled (for the email)', () => {
  it('reports a team the latest result pushed over the line, with phrasing', () => {
    // Group A part-played; then M14 (Germany beat Hungary) is the freshly-synced
    // result that wins Germany the group.
    const before = withScores({ 1: [2, 0], 2: [1, 1], 15: [1, 1] })
    const after = withScores({ 1: [2, 0], 2: [1, 1], 15: [1, 1], 14: [1, 0] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Germany', group: 'A', status: 'won-group' })
    expect(clinchHeadline({ team: 'Germany', group: 'A', status: 'won-group' })).toBe(
      '🥇 Germany have WON Group A',
    )
    expect(clinchHeadline({ team: 'Albania', group: 'B', status: 'runner-up' })).toBe(
      '🥈 Albania are THROUGH as Group B RUNNERS-UP',
    )
  })

  it('does not repeat a clinch that was already true before the result', () => {
    const settled = withScores({ 1: [2, 0], 2: [2, 1], 25: [1, 1], 28: [1, 0] })
    expect(newlyClinched(settled, settled)).toEqual([])
  })
})

describe('clinch — full group stage, cross-group third place', () => {
  // Build a complete, tie-free group stage with a strict 9/6/3/0 hierarchy in
  // every group (team index 0 strongest … 3 weakest). The third-placed team's
  // goal difference is made distinct per group so the best-4-of-6 cut is
  // unambiguous, letting us assert exact clinch statuses.
  function buildComplete() {
    const score = {}
    GROUPS.forEach((g, i) => {
      const names = TEAMS[g].map((t) => t.name)
      const idx = Object.fromEntries(names.map((n, k) => [n, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        const a = idx[m.t1]
        const b = idx[m.t2]
        const hi = Math.min(a, b)
        const lo = Math.max(a, b)
        // The 3rd-vs-4th game (indices 2 v 3) wins by a group-specific margin so
        // every group's third place has a unique goal difference.
        const margin = hi === 2 && lo === 3 ? i + 1 : 1
        score[m.num] = a < b ? [margin, 0] : [0, margin]
      }
    })
    return withScores(score)
  }

  it('marks a team THROUGH via the best-third bound even when its group is too lopsided to enumerate exactly', () => {
    // Every group except D finished with a strict hierarchy, so each of their
    // thirds has only 3 points — none can reach 6.
    const score = {}
    for (const g of GROUPS) {
      if (g === 'D') continue
      const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
      }
    }
    // Group D left wide open: Austria beat both France and the Netherlands by a
    // margin, leaving them on 6 with a big goal difference and games still to
    // play — too many high-cap scorelines to enumerate, so the points-based path
    // must carry it.
    for (const m of MATCHES) {
      if (m.stage === 'Group' && m.group === 'D') delete score[m.num]
    }
    const dFix = MATCHES.filter((m) => m.stage === 'Group' && m.group === 'D')
    const byPair = (a, b) =>
      dFix.find((m) => (m.t1 === a && m.t2 === b) || (m.t1 === b && m.t2 === a))
    const put = (a, b, ga, gb) => {
      const m = byPair(a, b)
      score[m.num] = m.t1 === a ? [ga, gb] : [gb, ga]
    }
    put('Austria', 'France', 4, 1)
    put('Netherlands', 'Poland', 2, 0)
    put('Austria', 'Netherlands', 2, 0)
    const status = computeClinch(withScores(score))
    // Austria can still finish 3rd in their group, but a 6-point third is guaranteed
    // top-8 here (no other group can produce a 6-point third) → THROUGH.
    expect(status['Austria']).toBe('third')
  })

  it('matches the final qualification picture for every team', () => {
    const status = computeClinch(buildComplete())
    GROUPS.forEach((g, i) => {
      const [first, second, third, fourth] = TEAMS[g].map((t) => t.name)
      expect(status[first]).toBe('won-group')
      expect(status[second]).toBe('runner-up')
      // Each group's 3rd-vs-4th game is won by margin i+1, so the third-placed
      // team's goal difference grows with the group index. The best four thirds
      // are therefore the last four groups (C–F); A and B miss out.
      expect(status[third]).toBe(i >= 2 ? 'third' : 'eliminated')
      expect(status[fourth]).toBe('eliminated')
    })
  })
})

describe('clinchBadge', () => {
  it('maps each status to a distinct badge, and unknown → null', () => {
    expect(clinchBadge('won-group')).toMatchObject({ cls: 'c-won', label: '🥇', text: 'Won group' })
    expect(clinchBadge('runner-up')).toMatchObject({ cls: 'c-silver', label: '🥈', text: 'Group runner-up' })
    expect(clinchBadge('top2')).toMatchObject({ cls: 'c-in', text: 'Through' })
    expect(clinchBadge('third')).toMatchObject({ cls: 'c-in', text: 'Through (3rd)' })
    expect(clinchBadge('eliminated')).toMatchObject({ cls: 'c-out', text: 'Eliminated' })
    expect(clinchBadge(null)).toBeNull()
    expect(clinchBadge(undefined)).toBeNull()
    expect(clinchBadge('weird')).toBeNull()
  })
})

describe('groupWinners', () => {
  it('maps only won-group teams to their group letter', () => {
    const winners = groupWinners({ Germany: 'won-group', Denmark: 'won-group', Austria: 'top2', Serbia: 'eliminated' })
    expect(winners).toEqual({ A: 'Germany', C: 'Denmark' }) // Germany→A, Denmark→C; top2/eliminated excluded
  })
  it('returns an empty object when nothing is clinched', () => {
    expect(groupWinners({})).toEqual({})
    expect(groupWinners(null)).toEqual({})
  })
})

describe('resolveClinchedSlots — leaves runner-up / third slots alone', () => {
  it('fills only the clinched Winner Group X slot, not runner-up or third slots', () => {
    const resolved = resolveClinchedSlots(MATCHES, { Germany: 'won-group', Spain: 'won-group' })
    const find = (num) => resolved.find((m) => m.num === num)
    expect(find(37).t1).toBe('Germany') // Winner Group A
    expect(find(39).t1).toBe('Spain') // Winner Group B
    // Runner-up and third placeholders are untouched.
    expect(find(38).t1).toBe('Runner-up Group A')
    expect(find(39).t2).toBe('3rd Group A/D/E/F')
  })
})

describe('newlyClinched — detects new verdicts and upgrades', () => {
  it('reports a newly eliminated team', () => {
    // Serbia lose to England, then to Slovenia and Denmark — three defeats, no
    // games left, so the last result locks them into 4th.
    const before = withScores({ 7: [0, 2], 6: [1, 1] })
    const after = withScores({ 7: [0, 2], 6: [1, 1], 16: [2, 0], 31: [2, 0] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Serbia', group: 'C', status: 'eliminated' })
  })

  it('reports an upgrade from top2 to won-group', () => {
    // before: Germany & Switzerland both through (top2). after: Germany has won the group.
    const before = withScores({ 1: [1, 0], 14: [1, 0], 2: [0, 1], 15: [0, 1] })
    const after = withScores({ 1: [3, 0], 14: [3, 0], 2: [0, 0], 15: [0, 0] })
    expect(computeClinch(before)['Germany']).toBe('top2')
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Germany', group: 'A', status: 'won-group' })
  })
})
