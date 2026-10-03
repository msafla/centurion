import { describe, expect, it } from 'vitest';
import {
  CivilDateSchema,
  CodeSchema,
  ControlMetadataSchema,
  CreateControlInputSchema,
  FilterInputSchema,
  PageInputSchema,
  ScheduleSchema,
  StatusInputSchema,
  isAllowedGithubUrl,
} from '../../src/shared/schemas';

const metadataBase = {
  title: 'Titre',
  description: 'Description',
  referentials: ['iso_27001'] as const,
  reference: 'REF',
  domain: 'Domaine',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: null,
};

describe('civil dates', () => {
  it('accepts a leap day and rejects nonexistent or malformed dates', () => {
    expect(CivilDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(CivilDateSchema.safeParse('2023-02-29').success).toBe(false);
    expect(CivilDateSchema.safeParse('2028-04-31').success).toBe(false);
    expect(CivilDateSchema.safeParse('2028-13-01').success).toBe(false);
    expect(CivilDateSchema.safeParse('28-01-01').success).toBe(false);
    expect(CivilDateSchema.safeParse('2028-1-01').success).toBe(false);
  });
});

describe('code normalization', () => {
  it('trims, uppercases and enforces the pattern and length', () => {
    expect(CodeSchema.parse(' ab-1 ')).toBe('AB-1');
    expect(CodeSchema.safeParse('A B').success).toBe(false);
    expect(CodeSchema.safeParse('_A').success).toBe(false);
    expect(CodeSchema.safeParse('A'.repeat(25)).success).toBe(false);
    expect(CodeSchema.safeParse('A'.repeat(24)).success).toBe(true);
  });
});

describe('control character policy', () => {
  it('rejects newlines in single-line fields and allows them in description', () => {
    expect(
      ControlMetadataSchema.safeParse({ ...metadataBase, title: 'a\nb', description: 'ok' }).success,
    ).toBe(false);
    expect(
      ControlMetadataSchema.safeParse({ ...metadataBase, title: 'ok', description: 'a\nb' }).success,
    ).toBe(true);
  });
});

describe('github automation url', () => {
  it('accepts only exact https github.com URLs with two path segments', () => {
    expect(isAllowedGithubUrl('https://github.com/org/repo')).toBe(true);
    expect(isAllowedGithubUrl('http://github.com/org/repo')).toBe(false);
    expect(isAllowedGithubUrl('https://user@github.com/org/repo')).toBe(false);
    expect(isAllowedGithubUrl('https://github.com:443/org/repo')).toBe(false);
    expect(isAllowedGithubUrl('https://github.com/org/repo#x')).toBe(false);
    expect(isAllowedGithubUrl('https://github.com/org')).toBe(false);
    expect(isAllowedGithubUrl('https://github.com.evil.com/org/repo')).toBe(false);
    expect(isAllowedGithubUrl('https://github.com/org/repo/')).toBe(true);
  });

  it('rejects a URL when automated is false', () => {
    const result = ControlMetadataSchema.safeParse({
      ...metadataBase,
      automated: false,
      automation_github_url: 'https://github.com/org/repo',
    });
    expect(result.success).toBe(false);
  });
});

describe('schedule', () => {
  it('is a strict discriminated union', () => {
    expect(ScheduleSchema.safeParse({ kind: 'monthly', anchorDate: '2028-01-31' }).success).toBe(true);
    expect(ScheduleSchema.safeParse({ kind: 'explicit', dates: [] }).success).toBe(false);
    expect(
      ScheduleSchema.safeParse({ kind: 'once', date: '2028-01-01', extra: 1 }).success,
    ).toBe(false);
  });
});

describe('status input', () => {
  it('forces non_applicable and a null evidence when fait=false', () => {
    const parsed = StatusInputSchema.parse({
      fait: false,
      conformite: 'conforme',
      completed_date: '2028-04-15',
      comment: 'constat',
      evidence_ref: 'ref',
    });
    expect(parsed.conformite).toBe('non_applicable');
    expect(parsed.evidence_ref).toBeNull();
  });

  it('accepts the four conformities when fait=true', () => {
    for (const conformite of [
      'conforme',
      'partiellement_conforme',
      'non_conforme',
      'non_applicable',
    ] as const) {
      const result = StatusInputSchema.safeParse({
        fait: true,
        conformite,
        completed_date: '2028-04-15',
        comment: '',
        evidence_ref: null,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('filters and pagination', () => {
  it('rejects inverted date ranges', () => {
    expect(
      FilterInputSchema.safeParse({ date_from: '2028-04-15', date_to: '2028-04-14' }).success,
    ).toBe(false);
  });

  it('applies pagination defaults and bounds', () => {
    expect(PageInputSchema.parse({})).toEqual({ page: 1, page_size: 50 });
    expect(PageInputSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PageInputSchema.safeParse({ page_size: 101 }).success).toBe(false);
  });
});

describe('create control input', () => {
  it('rejects an inverted activity window', () => {
    const result = CreateControlInputSchema.safeParse({
      ...metadataBase,
      code: 'C1',
      schedule: { kind: 'annual', anchorDate: '2028-01-01' },
      active_from: '2028-06-01',
      active_to: '2028-05-01',
    });
    expect(result.success).toBe(false);
  });
});
