import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'

const count = (q) => {
  const p = parseQuery(q)
  return MATCHES.filter((m) => matchesSearch(m, VENUES[m.venue], p)).length
}

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Germany')).toEqual({ free: 'Germany', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Germany')).toEqual({ free: '', tokens: [{ field: 'team', value: 'Germany' }] })
  })

  it('parses multiple tokens, with or without spaces after the colon', () => {
    expect(parseQuery('team:Germany city:Munich')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'Germany' },
        { field: 'city', value: 'Munich' },
      ],
    })
  })

  it('maps field aliases (venue -> stadium, host -> country)', () => {
    expect(parseQuery('venue: Olympia').tokens[0].field).toBe('stadium')
    expect(parseQuery('host: Germany').tokens[0].field).toBe('country')
  })
})

describe('matchesSearch counts', () => {
  it('team: Germany -> 3 group matches', () => {
    expect(count('team: Germany')).toBe(3)
  })
  it('city: Munich -> 6 (the Munich Football Arena hosts the most, jointly)', () => {
    expect(count('city: Munich')).toBe(6)
  })
  it('country: Germany -> all 51 (a single-host tournament)', () => {
    expect(count('country: Germany')).toBe(51)
  })
  it('group: C -> 6', () => {
    expect(count('group: C')).toBe(6)
  })
  it('stage: Final -> 1', () => {
    expect(count('stage: Final')).toBe(1)
  })
  it('stadium: Olympia -> 6', () => {
    expect(count('stadium: Olympia')).toBe(6)
  })
  it('combines tokens: team: Denmark stage: group -> 3', () => {
    expect(count('team: Denmark stage: group')).toBe(3)
  })
  it('stage synonyms work (semi -> SF -> 2)', () => {
    expect(count('stage: semi')).toBe(2)
  })
  it('no-space form team:Germany city:Munich -> 1', () => {
    expect(count('team:Germany city:Munich')).toBe(1)
  })
})
