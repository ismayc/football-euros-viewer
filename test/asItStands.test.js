import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
import { TEAMS } from '../src/data/teams.js'
import { projectKnockout } from '../src/utils/asItStands.js'
import { ADVANCING_THIRDS } from '../src/utils/qualification.js'
import { entryMatches, slotLabels } from '../src/utils/slots.js'
import {
  THIRD_PLACE_COMBINATIONS,
  THIRD_WINNER_ORDER,
} from '../src/data/thirdPlaceCombinations.js'

// This edition is finished, so the committed schedule ships with every result in
// it; these tests project from a blank board seeded with synthetic results.
const MATCHES = unscored(PLAYED)
const GROUPS = Object.keys(TEAMS)

// Round-of-16 match number for each "winner v third" host (Winner Group W).
function winnerMatchNum(w) {
  const m = entryMatches(MATCHES).find((x) => slotLabels(x).includes(`Winner Group ${w}`))
  return m?.num
}

// A complete group stage with a strict 9/6/3/0 hierarchy per group; the 3rd-vs-
// 4th margin varies by group so every third place has a distinct goal difference
// (the best-four cut is then unambiguous).
function buildComplete() {
  const score = {}
  GROUPS.forEach((g, i) => {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of MATCHES) {
      if (m.stage !== 'Group' || m.group !== g) continue
      const a = idx[m.t1]
      const b = idx[m.t2]
      const hi = Math.min(a, b)
      const lo = Math.max(a, b)
      const margin = hi === 2 && lo === 3 ? i + 1 : 1
      score[m.num] = a < b ? [margin, 0] : [0, margin]
    }
  })
  return MATCHES.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

// Candidate group lists for each third-place slot, parsed from the bracket.
function thirdSlots() {
  const slots = []
  for (const m of entryMatches(MATCHES)) {
    for (const side of slotLabels(m)) {
      const hit = /^3rd Group ([A-F/]+)$/.exec(side)
      if (hit) slots.push({ matchNum: m.num, groups: hit[1].split('/') })
    }
  }
  return slots
}

describe('projectKnockout — "as it stands" Round of 16', () => {
  const complete = buildComplete()
  const { perGroup, complete: resolved, official } = projectKnockout(complete)

  it('resolves a full, complete bracket from the official table', () => {
    expect(resolved).toBe(true)
    expect(official).toBe(true)
  })

  it('assigns thirds exactly per UEFA’s table for the current combination', () => {
    const qualifying = GROUPS.filter((g) => perGroup[g].thirdQualifies)
    const key = [...qualifying].sort().join('')
    const combo = THIRD_PLACE_COMBINATIONS[key]
    expect(combo, `the table must contain combination ${key}`).toBeTruthy()
    // For each winner W facing a third, that third's group is combo[i]; its
    // destination must be W's match, facing W's group winner (team index 0 here).
    THIRD_WINNER_ORDER.forEach((w, i) => {
      const thirdGroup = combo[i]
      const dest = perGroup[thirdGroup].third
      expect(dest, `3rd of ${thirdGroup} should have a destination`).toBeTruthy()
      expect(dest.matchNum).toBe(winnerMatchNum(w))
      expect(dest.opponent).toBe(TEAMS[w][0].name)
    })
  })

  it("places each group's 1st and 2nd against a concrete opponent", () => {
    for (const g of GROUPS) {
      expect(perGroup[g].first?.team).toBeTruthy()
      expect(perGroup[g].first?.opponent).toBeTruthy()
      expect(perGroup[g].second?.team).toBeTruthy()
      expect(perGroup[g].second?.opponent).toBeTruthy()
    }
  })

  it('assigns exactly four qualifying thirds, each to a slot whose candidate list allows it', () => {
    const slots = thirdSlots()
    const qualifying = GROUPS.filter((g) => perGroup[g].thirdQualifies)
    expect(qualifying).toHaveLength(ADVANCING_THIRDS)
    const usedMatches = new Set()
    for (const g of qualifying) {
      const dest = perGroup[g].third
      expect(dest, `group ${g} third should have a destination`).toBeTruthy()
      const slot = slots.find((s) => s.matchNum === dest.matchNum)
      expect(slot, `M${dest.matchNum} should be a third-place slot`).toBeTruthy()
      // The per-slot candidate list must include this group.
      expect(slot.groups).toContain(g)
      usedMatches.add(dest.matchNum)
    }
    // No two thirds share a slot.
    expect(usedMatches.size).toBe(ADVANCING_THIRDS)
  })

  it('marks the non-qualifying thirds as outside the best four (no destination)', () => {
    const out = GROUPS.filter((g) => !perGroup[g].thirdQualifies)
    expect(out).toHaveLength(GROUPS.length - ADVANCING_THIRDS)
    for (const g of out) expect(perGroup[g].third).toBeNull()
  })
})

describe('UEFA third-place combinations table', () => {
  // The candidate groups each "winner v third" host was drawn against, read off
  // the bracket itself rather than restated — so the table and the fixture list
  // are checked against each other, not against one hand-typed constant.
  const CAND = Object.fromEntries(
    THIRD_WINNER_ORDER.map((w) => {
      const m = entryMatches(MATCHES).find((x) => slotLabels(x).includes(`Winner Group ${w}`))
      const label = slotLabels(m).find((s) => s.startsWith('3rd Group '))
      return [w, label.replace('3rd Group ', '').split('/')]
    }),
  )

  it('has all 15 combinations of the six groups taken four at a time', () => {
    const keys = Object.keys(THIRD_PLACE_COMBINATIONS)
    expect(keys).toHaveLength(15)
    for (const k of keys) {
      // key is four distinct group letters, sorted
      expect(k).toMatch(/^[A-F]{4}$/)
      expect(new Set(k).size).toBe(4)
      expect([...k].join('')).toBe([...k].sort().join(''))
    }
  })

  it('every row assigns each winner a third within its candidate list, and the thirds are the key set', () => {
    for (const [key, val] of Object.entries(THIRD_PLACE_COMBINATIONS)) {
      expect(val).toMatch(/^[A-F]{4}$/)
      // the four assigned thirds are exactly the four groups in the key
      expect([...val].sort().join('')).toBe(key)
      // each winner's assigned third is permitted by the drawn candidate list
      THIRD_WINNER_ORDER.forEach((w, i) => expect(CAND[w]).toContain(val[i]))
    }
  })

  it('reaches every candidate group listed on the bracket (no dead options)', () => {
    // The union of a column's assignments across all 15 rows must be exactly the
    // candidate list its host was drawn against. A narrower union would mean the
    // bracket promises a matchup the table can never actually produce.
    THIRD_WINNER_ORDER.forEach((w, i) => {
      const reached = new Set(Object.values(THIRD_PLACE_COMBINATIONS).map((v) => v[i]))
      expect([...reached].sort()).toEqual([...CAND[w]].sort())
    })
  })
})
