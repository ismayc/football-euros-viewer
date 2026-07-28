// UEFA Euro — the 15 combinations of the four best third-placed teams and the
// Round-of-16 ties they land in. Each key is the SET of the four groups that
// produced a qualifying third (the group letters, sorted); the value gives which
// third-place group each of the four "winner v third" hosts plays, in WINNER
// order [B, C, E, F].
//
// Example: key 'CDEF', value 'FEDC' → Winner B plays 3rd F, Winner C plays 3rd E,
// Winner E plays 3rd D, Winner F plays 3rd C. That is the row Euro 2024 actually
// landed on: Spain v Georgia, England v Slovakia, Romania v Netherlands and
// Portugal v Slovenia.
//
// Source: Regulations of the UEFA European Football Championship 2022-24, as
// reproduced in the "Combinations of matches in the round of 16" table for Euro
// 2024. Cross-checked two ways: each column's set of reachable letters equals the
// "3rd Group X/Y/Z" placeholder its host was drawn against (1B: A/D/E/F, 1C:
// D/E/F, 1E: A/B/C/D, 1F: A/B/C), and the CDEF row reproduces the four ties that
// were actually played.
//
// The format has been stable since Euro 2016 (24 teams, six groups, four best
// thirds). Re-verify against the regulations if UEFA changes the field size.
export const THIRD_WINNER_ORDER = ['B', 'C', 'E', 'F']

export const THIRD_PLACE_COMBINATIONS = {
  ABCD: 'ADBC',
  ABCE: 'AEBC',
  ABCF: 'AFBC',
  ABDE: 'DEAB',
  ABDF: 'DFAB',
  ABEF: 'EFBA',
  ACDE: 'EDCA',
  ACDF: 'FDCA',
  ACEF: 'EFCA',
  ADEF: 'EFDA',
  BCDE: 'EDBC',
  BCDF: 'FDCB',
  BCEF: 'FECB',
  BDEF: 'FEDB',
  CDEF: 'FEDC',
}
