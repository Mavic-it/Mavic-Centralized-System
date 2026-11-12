import { describe, it, expect } from 'vitest';
import { calculateDtr } from '../dtr.calculator.js';
import type { DtrSource } from '../dtr.types.js';
const schedule = {
  timeZone: 'Asia/Manila',
  workDays: [1, 2, 3, 4, 5],
  shiftStart: '09:00',
  shiftEnd: '18:00',
  breakMinutes: 60,
  graceMinutes: 15,
};
const ob = (start = '09:00', end = '18:00', officeContinuity = false) => ({
  id: 'request',
  start: `2026-11-06T${start}:00+08:00`,
  end: `2026-11-06T${end}:00+08:00`,
  destination: 'Client office',
  officeContinuity,
  schedule,
});
const input = {
  workDate: '2026-11-06',
  schedule,
  policy: {
    breakStart: '12:00',
    breakEnd: '13:00',
    lateGraceMinutes: 15,
    minimumOtMinutes: 50,
    otIncrementMinutes: 60,
  },
  pairing: 'STRICT' as const,
  override: {},
  active: true,
  leaveUnits: 0,
  holiday: null,
  sources: [] as DtrSource[],
  now: new Date('2026-11-07T00:00:00Z'),
};
const daily = (actualIn: string, actualOut: string | null): DtrSource => ({
  sheet: 'Sheet',
  row: 1,
  key: 'id',
  kind: 'DAILY',
  identifier: '',
  name: '',
  device: '',
  date: '2026-11-06',
  punch: null,
  direction: 'UNKNOWN',
  actualIn,
  actualOut,
  shiftStart: null,
  shiftEnd: null,
  status: '',
  raw: {},
  errors: [],
});
describe('approved OB coverage', () => {
  it('handles an overnight shift with an explicit next-day end',()=>{
    const night={...schedule,shiftStart:'22:00',shiftEnd:'06:00',breakMinutes:0};
    const c=calculateDtr({...input,schedule:night,officialBusiness:[{...ob(),schedule:night,start:'2026-11-06T22:00:00+08:00',end:'2026-11-07T06:00:00+08:00'}]});
    expect(c.workedMinutes).toBe(480);expect(c.payrollReady).toBe(true);
  });
  it('does not credit leave conflicts or rest-day assignments',()=>{
    expect(calculateDtr({...input,leaveUnits:0.5,officialBusiness:[ob()]}).payrollReady).toBe(false);
    expect(calculateDtr({...input,schedule:{...schedule,workDays:[]},officialBusiness:[ob()]}).payrollReady).toBe(false);
  });
  it('credits a no-punch full day without manufacturing punches', () => {
    const c = calculateDtr({ ...input, officialBusiness: [ob()] });
    expect(c.workedMinutes).toBe(480);
    expect(c.actualIn).toBeNull();
    expect(c.actualOut).toBeNull();
    expect(c.payrollReady).toBe(true);
    expect(c.statuses).toContain('OB');
  });
  it('credits office plus afternoon OB only with explicit continuity confirmation', () => {
    const base = { ...input, sources: [daily('09:00', null)] };
    const unresolved = calculateDtr({
      ...base,
      officialBusiness: [ob('13:00', '18:00')],
    });
    expect(unresolved.workedMinutes).toBe(300);
    expect(unresolved.payrollReady).toBe(false);
    const c = calculateDtr({
      ...base,
      officialBusiness: [ob('13:00', '18:00', true)],
    });
    expect(c.workedMinutes).toBe(480);
    expect(c.payrollReady).toBe(true);
    expect(c.actualOut).toBeNull();
  });
  it('does not double count overlap or grant overtime', () => {
    const c = calculateDtr({
      ...input,
      sources: [daily('09:00', '20:00')],
      officialBusiness: [ob('13:00', '18:00')],
    });
    expect(c.workedMinutes).toBe(480);
    expect(c.obCreditedMinutes).toBe(300);
    expect(c.potentialOtMinutes).toBe(0);
  });
  it('retains uncovered time and changed-schedule conflicts', () => {
    expect(
      calculateDtr({ ...input, officialBusiness: [ob('15:00', '18:00')] })
        .payrollReady,
    ).toBe(false);
    expect(
      calculateDtr({
        ...input,
        schedule: { ...schedule, shiftStart: '08:00' },
        officialBusiness: [ob()],
      }).exceptions,
    ).toContain('OB schedule changed: cancel and refile for review');
  });
});
