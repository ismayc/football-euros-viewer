// "As it stands" — project the Round of 16 from the CURRENT group standings, so
// each group can show where its 1st / 2nd / (qualifying) 3rd would land right now.
//
// Winner and runner-up slots resolve directly from the live standings. The 3rd-
// place slots ("3rd Group A/D/E/F") are assigned per UEFA's official combination
// table (data/thirdPlaceCombinations.js): given which four of the six groups
// currently produce a qualifying third, the table says which third each of the
// four "winner v third" hosts plays. If fewer than four thirds have data yet
// (early in the group stage) the combination isn't in the table, so we fall back
// to constraint-matching the candidate-group lists — always a valid bracket.

import { MATCHES } from '../data/matches.js'
import { TEAMS } from '../data/teams.js'
import { computeQualification, ADVANCING_THIRDS } from './qualification.js'
import { THIRD_PLACE_COMBINATIONS, THIRD_WINNER_ORDER } from '../data/thirdPlaceCombinations.js'
import { entryMatches, slotLabels, WINNER_GROUP, RUNNERUP_GROUP, THIRD_GROUP } from './slots.js'

const GROUPS = Object.keys(TEAMS)

// The slot labels ("Winner Group A", "3rd Group A/D/E/F") are invariant, but the
// LIVE matches we're handed have clinched winners already resolved to real teams
// (e.g. "Winner Group E" → "Germany") — which would no longer parse as a slot.
// So read each entry-round match's slot labels from the STATIC schedule, by
// match number.
const ENTRY_SLOTS = new Map(entryMatches(MATCHES).map((m) => [m.num, slotLabels(m)]))

function parseSlot(label) {
  let m = WINNER_GROUP.exec(label)
  if (m) return { type: 'winner', group: m[1] }
  m = RUNNERUP_GROUP.exec(label)
  if (m) return { type: 'runner', group: m[1] }
  m = THIRD_GROUP.exec(label)
  if (m) return { type: 'third', groups: m[1].split('/') }
  return { type: 'other', label }
}

// Fallback only: bipartite matching (Kuhn's) of qualifying third-place groups to
// 3rd-place slots over the candidate lists. Used when the current combination
// isn't a complete 4-group set the UEFA table covers.
export function matchThirds(groups, slots) {
  const groupForSlot = new Map()
  const assign = (group, visited) => {
    for (const s of slots) {
      if (!s.slot.groups.includes(group) || visited.has(s)) continue
      visited.add(s)
      if (!groupForSlot.has(s) || assign(groupForSlot.get(s), visited)) {
        groupForSlot.set(s, group)
        return true
      }
    }
    return false
  }
  for (const g of groups) assign(g, new Set())
  return groupForSlot
}

// Returns { perGroup, complete, official } where perGroup[g] = {
//   first / second / third: { team, opponent, matchNum } | null,
//   thirdTeam, thirdQualifies,
// }. `official` is true when the third-place slots came from the UEFA table.
export function projectKnockout(matches) {
  const qual = computeQualification(matches)
  const first = {}
  const second = {}
  const third = {}
  for (const g of GROUPS) {
    first[g] = qual.groups[g]?.[0] || null
    second[g] = qual.groups[g]?.[1] || null
    third[g] = qual.groups[g]?.[2] || null
  }

  const qualifyingThirdGroups = qual.thirds.slice(0, ADVANCING_THIRDS).map((t) => t.group)
  const qualifyingSet = new Set(qualifyingThirdGroups)

  // Every entry-round side, with its parsed slot, indexed by match.
  const sides = []
  for (const m of entryMatches(matches)) {
    const [t1, t2] = ENTRY_SLOTS.get(m.num) || slotLabels(m)
    sides.push({ matchNum: m.num, sideIdx: 0, slot: parseSlot(t1) })
    sides.push({ matchNum: m.num, sideIdx: 1, slot: parseSlot(t2) })
  }
  const byMatch = new Map()
  for (const s of sides) {
    if (!byMatch.has(s.matchNum)) byMatch.set(s.matchNum, [])
    byMatch.get(s.matchNum).push(s)
  }
  const thirdSides = sides.filter((s) => s.slot.type === 'third')

  // Resolve each third-slot to a group: prefer the official UEFA table.
  const thirdSlotGroup = new Map()
  let official = false
  const key = qualifyingThirdGroups.length === ADVANCING_THIRDS ? [...qualifyingThirdGroups].sort().join('') : null
  const combo = key ? THIRD_PLACE_COMBINATIONS[key] : null
  if (combo) {
    official = true
    const winnerToThird = {}
    THIRD_WINNER_ORDER.forEach((w, i) => (winnerToThird[w] = combo[i]))
    for (const s of thirdSides) {
      const winnerSide = (byMatch.get(s.matchNum) || []).find((o) => o.slot.type === 'winner')
      const w = winnerSide?.slot.group
      if (w && winnerToThird[w]) thirdSlotGroup.set(s, winnerToThird[w])
    }
  } /* v8 ignore start */ else {
    // Unreachable via the public API: the UEFA table holds all C(6,4)=15
    // four-group combos, and there are always exactly 6 thirds (one per real
    // group), so a combo is always found. matchThirds is unit-tested directly.
    for (const [s, g] of matchThirds(qualifyingThirdGroups, thirdSides)) thirdSlotGroup.set(s, g)
  } /* v8 ignore stop */

  const teamForSide = (s) => {
    /* v8 ignore next -- unreachable: every entry match pushes exactly two sides, so opponentOf's find() always returns the sibling */
    if (!s) return null
    if (s.slot.type === 'winner') return first[s.slot.group]
    if (s.slot.type === 'runner') return second[s.slot.group]
    if (s.slot.type === 'third') {
      const g = thirdSlotGroup.get(s)
      return g ? third[g] : null
    }
    return null
  }
  const opponentOf = (s) => teamForSide((byMatch.get(s.matchNum) || []).find((o) => o !== s))

  const perGroup = {}
  for (const g of GROUPS) {
    perGroup[g] = {
      first: null,
      second: null,
      thirdTeam: third[g]?.name || null,
      thirdQualifies: qualifyingSet.has(g),
      third: null,
    }
  }
  let complete = true
  for (const s of sides) {
    const opp = opponentOf(s)
    if (s.slot.type === 'winner') {
      perGroup[s.slot.group].first = { team: first[s.slot.group]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
      if (!teamForSide(s) || !opp) complete = false
    } else if (s.slot.type === 'runner') {
      perGroup[s.slot.group].second = { team: second[s.slot.group]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
      if (!teamForSide(s) || !opp) complete = false
    } else if (s.slot.type === 'third') {
      const g = thirdSlotGroup.get(s)
      if (g) perGroup[g].third = { team: third[g]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
    }
  }
  return { perGroup, complete, official }
}
