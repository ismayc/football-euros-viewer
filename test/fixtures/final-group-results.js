// Official FINAL group results and finishing orders for UEFA Euro 2024, frozen
// so the standings / tie-breaker engine can't silently drift from the real
// outcome — the results parallel of official-kickoffs.js.
//
// `scores` restates the committed result for each of a group's six matches, so a
// silent rewrite of src/data/matches.js fails here too. `order` is the official
// finishing order, and it comes from OUTSIDE this repo:
//
//   • 1st and 2nd, and the qualifying 3rd, are the "Qualified teams" table of
//     the Euro 2024 knockout phase (winners GER/ESP/ENG/AUT/ROU/POR, runners-up
//     SUI/ITA/DEN/FRA/BEL/TUR, qualifying thirds SVN/NED/SVK/GEO).
//   • In Groups A and B the third-placed side did not qualify, so its position
//     comes from the tournament's ranking of third-placed teams, which placed
//     Hungary 5th and Croatia 6th of the six.
//   • 4th is then the remaining team.
//
// test/final-standings.test.js replays `scores` through rankGroup and asserts the
// finishing order matches `order` exactly — so a tie-breaker regression is caught
// against the real tournament rather than against a synthetic case. Group E is
// the one that matters most: all four teams finished on 4 points.
//
// Euro tie-breakers in effect: points → head-to-head → goal difference → goals →
// disciplinary points → European Qualifiers ranking.

export const FINAL_GROUP_RESULTS = {
  A: {
    scores: { 1: [5, 1], 2: [1, 3], 14: [2, 0], 15: [1, 1], 25: [0, 1], 26: [1, 1] },
    order: ['Germany', 'Switzerland', 'Hungary', 'Scotland'],
    sources: ['knockout-phase qualified-teams table', 'ranking of third-placed teams'],
  },
  B: {
    // Spain won all three; Italy edged Croatia, who went out on the last kick.
    scores: { 3: [3, 0], 4: [2, 1], 13: [2, 2], 18: [1, 0], 27: [0, 1], 28: [1, 1] },
    order: ['Spain', 'Italy', 'Croatia', 'Albania'],
    sources: ['knockout-phase qualified-teams table', 'ranking of third-placed teams'],
  },
  C: {
    // Three teams on 3 points behind England; Denmark ahead of Slovenia on goals
    // scored, Serbia last.
    scores: { 6: [1, 1], 7: [0, 1], 16: [1, 1], 17: [1, 1], 31: [0, 0], 32: [0, 0] },
    order: ['England', 'Denmark', 'Slovenia', 'Serbia'],
    sources: ['knockout-phase qualified-teams table'],
  },
  D: {
    // The "group of death": Austria topped it ahead of France and the Netherlands.
    scores: { 5: [1, 2], 10: [0, 1], 20: [1, 3], 21: [0, 0], 29: [1, 1], 30: [2, 3] },
    order: ['Austria', 'France', 'Netherlands', 'Poland'],
    sources: ['knockout-phase qualified-teams table'],
  },
  E: {
    // ALL FOUR finished on 4 points — the sternest test of the tie-breakers.
    // Romania and Belgium both +1 on goal difference, split by goals scored
    // (4 v 2); Slovakia (0) then Ukraine (−2).
    scores: { 8: [3, 0], 9: [0, 1], 19: [1, 2], 24: [2, 0], 33: [1, 1], 34: [0, 0] },
    order: ['Romania', 'Belgium', 'Slovakia', 'Ukraine'],
    sources: ['knockout-phase qualified-teams table'],
  },
  F: {
    // Portugal and Türkiye both on 6; Portugal ahead on goal difference.
    scores: { 11: [3, 1], 12: [2, 1], 22: [1, 1], 23: [0, 3], 35: [1, 2], 36: [2, 0] },
    order: ['Portugal', 'Türkiye', 'Georgia', 'Czechia'],
    sources: ['knockout-phase qualified-teams table'],
  },
}

// The official Round-of-16 draw: match number -> [t1, t2], as played.
//
// This is the cross-group check no per-group order can make. Which four thirds
// advance, and which tie each lands in, comes from UEFA's combination table
// (src/data/thirdPlaceCombinations.js) applied to the six groups at once — so
// reproducing these eight pairings from the group results alone is what proves
// that table is right. Source: the Euro 2024 knockout-phase bracket.
export const OFFICIAL_R16 = {
  37: ['Germany', 'Denmark'],
  38: ['Switzerland', 'Italy'],
  39: ['Spain', 'Georgia'],
  40: ['England', 'Slovakia'],
  41: ['Portugal', 'Slovenia'],
  42: ['France', 'Belgium'],
  43: ['Romania', 'Netherlands'],
  44: ['Austria', 'Türkiye'],
}
