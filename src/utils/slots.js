// How to read a knockout match's ORIGINAL bracket slot labels, and which round
// the group stage feeds into.
//
// A match record carries its slot labels in one of two ways, and every engine
// that reasons about the bracket needs the same answer from both:
//
//   • Before it is played, `t1`/`t2` ARE the labels ("Winner Group A"), exactly
//     as the fixture list was drawn. This is how a live edition arrives.
//   • Once it is played, `t1`/`t2` hold the real teams and the labels move to
//     `label1`/`label2`, so a finished edition still knows the provenance of
//     each slot — which is what lets the bracket say "Winner Group C" under
//     England, and what the projection engines parse.
//
// Reading `t1` directly would therefore work only for an unplayed tournament,
// and would silently stop matching the moment a result landed.

import { TEAMS } from '../data/teams.js'

// The knockout round the group stage feeds into. For the 24-team Euro format
// that is the Round of 16 (six group winners, six runners-up, four best thirds);
// the World Cup's equivalent is its Round of 32.
export const ENTRY_ROUND = 'R16'

// Group letters actually in use, as a regex character class — so a stray label
// naming a group this edition doesn't have fails to parse instead of resolving
// to nothing halfway through.
export const GROUP_CLASS = `[${Object.keys(TEAMS).join('')}]`

export const WINNER_GROUP = new RegExp(`^Winner Group (${GROUP_CLASS})$`)
export const RUNNERUP_GROUP = new RegExp(`^Runner-up Group (${GROUP_CLASS})$`)
export const THIRD_GROUP = new RegExp(`^3rd Group (${GROUP_CLASS}(?:/${GROUP_CLASS})*)$`)
export const WINNER_MATCH = /^Winner Match (\d+)$/
export const LOSER_MATCH = /^Loser Match (\d+)$/

// The two slot labels a match was drawn with, whether or not it has been played.
export function slotLabels(m) {
  return [m.label1 ?? m.t1, m.label2 ?? m.t2]
}

// Every match of the knockout round the groups feed into.
export function entryMatches(matches) {
  return matches.filter((m) => m.stage === ENTRY_ROUND)
}
