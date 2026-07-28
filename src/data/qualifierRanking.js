// Position in the European Qualifiers overall ranking — the last of UEFA's
// group tie-breakers for Euro 2024 (Article 20.01, criterion 8), applied once
// points, head-to-head, overall goal difference, overall goals and disciplinary
// points are all level.
//
// Source: the seeding pots for the final draw (2 December 2023), which list each
// qualified team against its European Qualifiers overall ranking position.
//
// Two teams are deliberately absent, and both absences are faithful to the
// regulations rather than gaps in the data:
//
//   • Germany qualified as hosts and has no position in the ranking. The
//     regulation says the tie would be settled "by drawing of lots if hosts
//     Germany had been involved" — which is not something a viewer can compute,
//     so Germany falls through to the stable alphabetical fallback below and the
//     Standings panel says the tie would go to lots.
//   • Georgia, Poland and Ukraine came through the play-offs and so were not yet
//     identified when the pots were published. They are unranked here and also
//     fall through to the alphabetical fallback.
//
// Lower number = higher-ranked = placed ahead.
export const QUALIFIER_RANK = {
  Portugal: 1,
  France: 2,
  Spain: 3,
  Belgium: 4,
  England: 5,
  Hungary: 6,
  Türkiye: 7,
  Romania: 8,
  Denmark: 9,
  Albania: 10,
  Austria: 11,
  Netherlands: 12,
  Scotland: 13,
  Croatia: 14,
  Slovenia: 15,
  Slovakia: 16,
  Czechia: 17,
  Italy: 18,
  Serbia: 19,
  Switzerland: 20,
}

// Teams with no position in the ranking, and why — surfaced by the tie-break
// explainer so a reader isn't told a tie was decided by a number that does not
// exist.
export const UNRANKED_REASON = {
  Germany: 'hosts — a tie involving Germany would have been drawn by lots',
  Georgia: 'play-off winner — not yet identified when the ranking was published',
  Poland: 'play-off winner — not yet identified when the ranking was published',
  Ukraine: 'play-off winner — not yet identified when the ranking was published',
}

// Compare two teams by European Qualifiers ranking (better/lower rank first),
// falling back to a stable alphabetical order if a team isn't listed.
export function byQualifierRank(a, b) {
  const ra = QUALIFIER_RANK[a] ?? Infinity
  const rb = QUALIFIER_RANK[b] ?? Infinity
  return ra - rb || a.localeCompare(b)
}
