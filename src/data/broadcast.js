// US broadcast & streaming for UEFA Euro 2024.
//
// FOX Sports held the English-language US rights and carried every match across
// FOX and FS1; TelevisaUnivision held the Spanish-language rights (UniMás/TUDN
// on TV, ViX streaming). Five group matches also went out on Fubo, which was a
// rights holder in its own right rather than just a carrier:
//   Switzerland v Hungary, Romania v Ukraine, Türkiye v Georgia,
//   Slovakia v Ukraine, Georgia v Czechia.
//
// Coverage is stated tournament-wide rather than per match because both feeds
// carried all 51. ESPN's own per-match channel field is deliberately NOT
// committed: it intermittently drops and restores that field on matches this
// old, so a regeneration would flap against itself for no gain.
export const US_BROADCAST = {
  english: {
    language: 'English',
    tv: ['FOX', 'FS1'],
    freeOverTheAir: 'FOX',
    streaming: ['Fubo', 'YouTube TV', 'Hulu + Live TV', 'Sling TV'],
  },
  spanish: {
    language: 'Spanish',
    tv: ['UniMás', 'TUDN'],
    freeOverTheAir: 'UniMás',
    streaming: ['ViX', 'Fubo'],
  },
}
