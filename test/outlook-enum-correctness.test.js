import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { enumerateOutlook, ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import { computeQualification, ADVANCING_THIRDS } from '../src/utils/qualification.js'
import { THIRD_PLACE_COMBINATIONS, THIRD_WINNER_ORDER } from '../src/data/thirdPlaceCombinations.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// Each group's final-round (matchday 3) fixtures, read off the real schedule
// rather than hard-coded, so the nightly data refresh can't quietly desync them.
const REM = Object.fromEntries(
  Object.keys(TEAMS).map((g) => [
    g,
    MATCHES.filter((m) => m.stage === 'Group' && m.group === g).slice(-2).map((m) => m.num),
  ]),
)

// Complete every group, then re-open just `keepOpen`'s final round, so the
// enumeration stays small enough to brute-force a second, independent way.
function fixtureKeepingOpen(keepOpen) {
  const open = new Set(keepOpen)
  const scored = { ...GROUP_STAGE_MD3 }
  for (const g of Object.keys(REM)) {
    for (const num of REM[g]) {
      if (open.has(g)) delete scored[num]
      else scored[num] = scored[num] || [1, 0] // arbitrary completed result
    }
  }
  return MATCHES.map((m) => (m.stage === 'Group' && scored[m.num] ? { ...m, score: scored[m.num] } : m))
}

// ---- Independent reference enumerator (deliberately different code path) ----
// Recurses over the remaining games, enumerating each one's MARGIN over the same
// ±CAP range, builds the full synthetic match list (goals = margin), runs the
// production computeQualification, and resolves each R16 slot from scratch — every
// margin combination weighted equally. The production enumerator's weighted
// per-group dedup must reproduce these counts exactly.
const CAP = 2 // small, so the brute force stays tiny but still varies goal difference
const MARGINS = Array.from({ length: 2 * CAP + 1 }, (_, i) => i - CAP)
const scoreForMargin = (d) => (d > 0 ? [d, 0] : d < 0 ? [0, -d] : [0, 0])
const R16_STATIC = MATCHES.filter((m) => m.stage === 'R16')
function parse(label) {
  let m = /^Winner Group ([A-F])$/.exec(label)
  if (m) return { t: 'w', g: m[1] }
  m = /^Runner-up Group ([A-F])$/.exec(label)
  if (m) return { t: 'r', g: m[1] }
  if (/^3rd /.test(label)) return { t: '3' }
  return { t: 'o' }
}

function referenceEnumerate(matches) {
  const remaining = matches.filter(
    (m) => m.stage === 'Group' && !m.voided && !(Array.isArray(m.score) && !m.live),
  )
  const remNums = remaining.map((m) => m.num)
  const counts = {}
  for (const m of R16_STATIC) counts[m.num] = [{}, {}]
  const choice = new Array(remaining.length)
  let total = 0

  const tally = () => {
    total++
    const override = {}
    remNums.forEach((num, i) => (override[num] = scoreForMargin(choice[i])))
    const syn = matches.map((m) => (override[m.num] ? { ...m, score: override[m.num] } : m))
    const q = computeQualification(syn)
    const W = {}
    const R = {}
    const T = {}
    for (const g of Object.keys(TEAMS)) {
      W[g] = q.groups[g][0].name
      R[g] = q.groups[g][1].name
      T[g] = q.groups[g][2].name
    }
    const key = q.thirds.slice(0, ADVANCING_THIRDS).map((t) => t.group).sort().join('')
    const combo = THIRD_PLACE_COMBINATIONS[key]
    const w2t = {}
    if (combo) THIRD_WINNER_ORDER.forEach((w, i) => (w2t[w] = combo[i]))
    for (const m of R16_STATIC) {
      const sides = [parse(m.t1), parse(m.t2)]
      for (let s = 0; s < 2; s++) {
        const sl = sides[s]
        let team = null
        if (sl.t === 'w') team = W[sl.g]
        else if (sl.t === 'r') team = R[sl.g]
        else if (sl.t === '3') {
          const o = sides[1 - s]
          if (o.t === 'w' && w2t[o.g]) team = T[w2t[o.g]]
        }
        if (team) counts[m.num][s][team] = (counts[m.num][s][team] || 0) + 1
      }
    }
  }

  const rec = (i) => {
    if (i === remaining.length) return tally()
    for (const d of MARGINS) {
      choice[i] = d
      rec(i + 1)
    }
  }
  rec(0)
  return { total, counts }
}

// Convert enumerateOutlook output to the reference's {num:[{team:count},{team:count}]} shape.
function toCounts(result) {
  const out = {}
  for (const num of Object.keys(result.perMatch)) {
    out[num] = result.perMatch[num].map((side) =>
      Object.fromEntries(side.candidates.map((c) => [c.team, c.count])),
    )
  }
  return out
}

describe('outlook enumeration — exact correctness vs an independent reference', () => {
  for (const keepOpen of [['A', 'D'], ['A', 'D', 'E'], ['C', 'F']]) {
    it(`matches the brute-force reference with groups ${keepOpen.join(',')} open`, () => {
      const fx = fixtureKeepingOpen(keepOpen)
      const mine = enumerateOutlook(fx, null, CAP)
      const ref = referenceEnumerate(fx)
      expect(mine.total).toBe(ref.total)
      expect(toCounts(mine)).toEqual(ref.counts)
    })
  }

  it('only ever places a team in a slot its group is allowed to fill', () => {
    const fx = fixtureKeepingOpen(['A', 'D', 'E'])
    const { perMatch } = enumerateOutlook(fx, null, CAP)
    const groupOf = (team) =>
      Object.keys(TEAMS).find((g) => TEAMS[g].some((t) => t.name === team))
    for (const m of R16_STATIC) {
      const labels = [m.t1, m.t2]
      labels.forEach((label, side) => {
        const s = parse(label)
        const allowed =
          s.t === 'w' || s.t === 'r'
            ? new Set([s.g])
            : s.t === '3'
              ? new Set(/^3rd Group ([A-F/]+)$/.exec(label)[1].split('/'))
              : null
        if (!allowed) return
        for (const c of perMatch[m.num][side].candidates) {
          expect(allowed.has(groupOf(c.team))).toBe(true)
        }
      })
    }
  })

  it('produces exact rational shares (every count is an integer out of the total)', () => {
    const fx = fixtureKeepingOpen(['A', 'D', 'E'])
    const { total, perMatch } = enumerateOutlook(fx, null, CAP)
    for (const num of Object.keys(perMatch)) {
      for (const side of perMatch[num]) {
        for (const c of side.candidates) {
          expect(Number.isInteger(c.count)).toBe(true)
          expect(c.pct).toBeCloseTo(c.count / total, 12)
        }
      }
    }
  })
})
