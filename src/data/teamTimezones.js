// Home timezone(s) for each team's country, keyed by the exact team name used in
// teams.js. Countries that span more than one zone list each one (ordered
// west→east) so a hover can show every local kickoff time a fan back home might
// read off their own clock. Same-offset zones are collapsed at render time (see
// teamLocalKickoffs in utils/time.js), so listing a representative set per
// offset is enough — we don't enumerate every micro-zone or overseas territory.
//
// Every Euro side sits in a single zone except France, whose overseas
// departments span the Atlantic and Indian Oceans; only its metropolitan zone is
// listed, since that is the clock the match was played to.
export const TEAM_TIMEZONES = {
  // Group A
  Germany: ['Europe/Berlin'],
  Scotland: ['Europe/London'],
  Hungary: ['Europe/Budapest'],
  Switzerland: ['Europe/Zurich'],

  // Group B
  Spain: ['Atlantic/Canary', 'Europe/Madrid'],
  Croatia: ['Europe/Zagreb'],
  Italy: ['Europe/Rome'],
  Albania: ['Europe/Tirane'],

  // Group C
  Slovenia: ['Europe/Ljubljana'],
  Denmark: ['Europe/Copenhagen'],
  Serbia: ['Europe/Belgrade'],
  England: ['Europe/London'],

  // Group D
  Poland: ['Europe/Warsaw'],
  Netherlands: ['Europe/Amsterdam'],
  Austria: ['Europe/Vienna'],
  France: ['Europe/Paris'],

  // Group E
  Belgium: ['Europe/Brussels'],
  Slovakia: ['Europe/Bratislava'],
  Romania: ['Europe/Bucharest'],
  Ukraine: ['Europe/Kyiv'],

  // Group F
  Türkiye: ['Europe/Istanbul'],
  Portugal: ['Atlantic/Azores', 'Europe/Lisbon'],
  Czechia: ['Europe/Prague'],
  Georgia: ['Asia/Tbilisi'],
}
