import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { projectKnockout } from '../src/utils/asItStands.js'

// Regression: once a group is clinched, the live feed resolves its R16 slot label
// ("Winner Group A") to the real team ("Germany"). projectKnockout must read the
// slot structure from the STATIC schedule by match number, or it loses that
// winner's 1st projection AND the paired 3rd projection (both came back null).
describe('projectKnockout — resolved winner/third slot labels', () => {
  it('still projects every group when R16 winner slots are resolved to real teams', () => {
    // Resolve the three "winner v third" hosts the way the live feed would once
    // those groups are decided (this is what broke it: M40/M41/M43).
    const resolved = MATCHES.map((m) => {
      if (m.num === 40) return { ...m, t1: 'England' } // was "Winner Group C"
      if (m.num === 41) return { ...m, t1: 'Portugal' } // was "Winner Group F"
      if (m.num === 43) return { ...m, t1: 'Romania' } // was "Winner Group E"
      return m
    })
    const { perGroup } = projectKnockout(resolved)

    // No group's 1st projection is lost…
    for (const g of Object.keys(perGroup)) {
      expect(perGroup[g].first, `group ${g} first`).toBeTruthy()
    }
    // …and the resolved winner hosts still point at their R16 match.
    expect(perGroup.C.first.matchNum).toBe(40)
    expect(perGroup.F.first.matchNum).toBe(41)
    expect(perGroup.E.first.matchNum).toBe(43)

    // The paired 3rd slots (the other side of those matches) also resolve: some
    // qualifying third must be projected into M40 / M41 / M43.
    const thirdMatchNums = Object.values(perGroup)
      .filter((p) => p.thirdQualifies && p.third)
      .map((p) => p.third.matchNum)
    for (const n of [40, 41, 43]) expect(thirdMatchNums, `a third in M${n}`).toContain(n)
  })
})
