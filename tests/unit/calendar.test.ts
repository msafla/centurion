import { describe, expect, it } from 'vitest';
import { addMonthsClamped, translateCivilDate } from '../../src/server/domain/civil-date';
import { generateDates, translateDefinitionDates } from '../../src/server/domain/schedule';

const noWindow = { active_from: null, active_to: null };

describe('generateDates', () => {
  it('generates a quarterly series from 31/03/2028', () => {
    expect(generateDates(2028, { kind: 'quarterly', anchorDate: '2028-03-31' }, noWindow)).toEqual([
      '2028-03-31',
      '2028-06-30',
      '2028-09-30',
      '2028-12-31',
    ]);
  });

  it('keeps the original day and clamps February for a monthly series', () => {
    expect(
      generateDates(2028, { kind: 'monthly', anchorDate: '2028-01-31' }, noWindow).slice(0, 3),
    ).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('produces a single annual date', () => {
    expect(generateDates(2028, { kind: 'annual', anchorDate: '2028-07-01' }, noWindow)).toEqual([
      '2028-07-01',
    ]);
  });

  it('sorts and deduplicates explicit dates', () => {
    expect(
      generateDates(
        2028,
        { kind: 'explicit', dates: ['2028-05-01', '2028-01-01', '2028-05-01'] },
        noWindow,
      ),
    ).toEqual(['2028-01-01', '2028-05-01']);
  });

  it('applies the activity window inclusively', () => {
    expect(
      generateDates(
        2028,
        { kind: 'monthly', anchorDate: '2028-01-31' },
        { active_from: '2028-02-29', active_to: '2028-03-31' },
      ),
    ).toEqual(['2028-02-29', '2028-03-31']);
  });

  it('does not backfill before the anchor', () => {
    expect(generateDates(2028, { kind: 'monthly', anchorDate: '2028-10-15' }, noWindow)).toEqual([
      '2028-10-15',
      '2028-11-15',
      '2028-12-15',
    ]);
  });

  it('returns zero occurrences for an empty window', () => {
    expect(
      generateDates(
        2028,
        { kind: 'monthly', anchorDate: '2028-01-31' },
        { active_from: '2028-06-01', active_to: '2028-05-31' },
      ),
    ).toEqual([]);
  });

  it('drops definition dates outside the plan year', () => {
    expect(generateDates(2029, { kind: 'annual', anchorDate: '2028-07-01' }, noWindow)).toEqual([]);
  });
});

describe('civil date helpers', () => {
  it('clamps to the last day of the target month', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2028-01-31', 2)).toBe('2028-03-31');
    expect(addMonthsClamped('2029-01-31', 1)).toBe('2029-02-28');
  });

  it('translates 29/02 to 28/02', () => {
    expect(translateCivilDate('2028-02-29', 2029)).toBe('2029-02-28');
    expect(translateCivilDate('2028-02-29', 2032)).toBe('2032-02-29');
  });
});

describe('translateDefinitionDates', () => {
  it('translates schedule, explicit dates and activity bounds', () => {
    const translated = translateDefinitionDates(
      {
        schedule: { kind: 'explicit', dates: ['2028-02-29', '2028-12-31', '2028-02-29'] },
        active_from: '2028-03-01',
        active_to: '2028-06-30',
      },
      2029,
    );
    expect(translated.schedule).toEqual({ kind: 'explicit', dates: ['2029-02-28', '2029-12-31'] });
    expect(translated.active_from).toBe('2029-03-01');
    expect(translated.active_to).toBe('2029-06-30');
  });
});
