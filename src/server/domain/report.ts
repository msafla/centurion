import type BetterSqlite3 from 'better-sqlite3';
import type {
  FilterInput,
  OccurrenceDto,
  Page,
  PlanDto,
  Referentiel,
} from '../../shared/schemas';
import type { Clock } from '../clock';
import { planInScope } from '../db/scoping';
import { toPlanDto } from './plans';
import {
  OCCURRENCE_FROM,
  type SqlFilter,
  buildOccurrenceFilter,
  hasOccurrenceFilter,
  listOccurrences,
} from './queries';

export type Counts = {
  total: number;
  open: number;
  fait_true: number;
  fait_false: number;
  conforme: number;
  partiellement_conforme: number;
  non_conforme: number;
  non_applicable: number;
};

export type Rate = { numerator: number; denominator: number; value: number | null };

export type ReferentielSummary = {
  referentiel: Referentiel;
  counts: Counts;
  realization_rate: Rate;
  conformity_rate: Rate;
};

export type SummaryDto = {
  counts: Counts;
  realization_rate: Rate;
  conformity_rate: Rate;
  automation_rate: Rate;
  by_referentiel: ReferentielSummary[];
};

export type ReportDto = {
  plan: PlanDto;
  filters: FilterInput;
  generated_at: string;
  summary: SummaryDto;
  rows: Page<OccurrenceDto>;
};

const REFERENTIELS: Referentiel[] = [
  'iso_27001',
  'isae_3402_t2',
  'iso_27001_isae_3402_t2',
];

const AGGREGATES = `COUNT(*) AS total,
  COALESCE(SUM(CASE WHEN o.state = 'open' THEN 1 ELSE 0 END), 0) AS open,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 1 THEN 1 ELSE 0 END), 0) AS fait_true,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 0 THEN 1 ELSE 0 END), 0) AS fait_false,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 1 AND r.conformite = 'conforme' THEN 1 ELSE 0 END), 0) AS conforme,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 1 AND r.conformite = 'partiellement_conforme' THEN 1 ELSE 0 END), 0) AS partiellement_conforme,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 1 AND r.conformite = 'non_conforme' THEN 1 ELSE 0 END), 0) AS non_conforme,
  COALESCE(SUM(CASE WHEN o.state = 'completed' AND r.fait = 1 AND r.conformite = 'non_applicable' THEN 1 ELSE 0 END), 0) AS non_applicable`;

function rate(numerator: number, denominator: number): Rate {
  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

function realizationRate(counts: Counts): Rate {
  return rate(counts.fait_true, counts.total);
}

function conformityRate(counts: Counts): Rate {
  return rate(counts.conforme, counts.fait_true - counts.non_applicable);
}

function buildControlFilter(planId: string, filter: FilterInput): SqlFilter {
  const conditions = ['c.plan_id = ?', "c.status = 'active'"];
  const params: unknown[] = [planId];
  if (filter.referentiel) {
    conditions.push('c.referentiel = ?');
    params.push(filter.referentiel);
  }
  if (filter.domain) {
    conditions.push('c.domain = ?');
    params.push(filter.domain);
  }
  if (filter.owner_name !== undefined) {
    conditions.push('c.owner_name = ?');
    params.push(filter.owner_name);
  }
  if (filter.automated !== undefined) {
    conditions.push('c.automated = ?');
    params.push(filter.automated ? 1 : 0);
  }
  if (filter.search) {
    conditions.push(
      "(c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')",
    );
    const escaped = filter.search.replace(/[\\%_]/g, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    params.push(pattern, pattern, pattern);
  }
  return { where: conditions.join(' AND '), params };
}

function automationRate(db: BetterSqlite3.Database, planId: string, filter: FilterInput): Rate {
  if (hasOccurrenceFilter(filter)) {
    const { where, params } = buildOccurrenceFilter(planId, filter);
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) AS denominator,
                COUNT(DISTINCT CASE WHEN c.automated = 1 THEN c.id END) AS numerator
         ${OCCURRENCE_FROM}
         WHERE ${where} AND c.status = 'active'`,
      )
      .get(...params) as { numerator: number; denominator: number };
    return rate(row.numerator, row.denominator);
  }

  const { where, params } = buildControlFilter(planId, filter);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS denominator,
              COALESCE(SUM(CASE WHEN c.automated = 1 THEN 1 ELSE 0 END), 0) AS numerator
       FROM controls c WHERE ${where}`,
    )
    .get(...params) as { numerator: number; denominator: number };
  return rate(row.numerator, row.denominator);
}

function emptyCounts(): Counts {
  return {
    total: 0,
    open: 0,
    fait_true: 0,
    fait_false: 0,
    conforme: 0,
    partiellement_conforme: 0,
    non_conforme: 0,
    non_applicable: 0,
  };
}

export function buildSummary(
  db: BetterSqlite3.Database,
  planId: string,
  filter: FilterInput,
): SummaryDto {
  const { where, params } = buildOccurrenceFilter(planId, filter);

  const counts = db
    .prepare(`SELECT ${AGGREGATES} ${OCCURRENCE_FROM} WHERE ${where}`)
    .get(...params) as Counts;

  const grouped = db
    .prepare(
      `SELECT c.referentiel AS referentiel, ${AGGREGATES}
       ${OCCURRENCE_FROM} WHERE ${where} GROUP BY c.referentiel`,
    )
    .all(...params) as (Counts & { referentiel: Referentiel })[];

  const byReferentiel = REFERENTIELS.map((referentiel) => {
    const row = grouped.find((entry) => entry.referentiel === referentiel);
    const clean: Counts = row
      ? {
          total: row.total,
          open: row.open,
          fait_true: row.fait_true,
          fait_false: row.fait_false,
          conforme: row.conforme,
          partiellement_conforme: row.partiellement_conforme,
          non_conforme: row.non_conforme,
          non_applicable: row.non_applicable,
        }
      : emptyCounts();
    return {
      referentiel,
      counts: clean,
      realization_rate: realizationRate(clean),
      conformity_rate: conformityRate(clean),
    };
  });

  return {
    counts,
    realization_rate: realizationRate(counts),
    conformity_rate: conformityRate(counts),
    automation_rate: automationRate(db, planId, filter),
    by_referentiel: byReferentiel,
  };
}

export function buildReport(
  db: BetterSqlite3.Database,
  clock: Clock,
  planId: string,
  filter: FilterInput,
  page: number,
  pageSize: number,
): ReportDto {
  const plan = planInScope(db, planId);
  return {
    plan: toPlanDto(plan),
    filters: filter,
    generated_at: clock.nowUtc(),
    summary: buildSummary(db, planId, filter),
    rows: listOccurrences(db, planId, filter, page, pageSize),
  };
}
