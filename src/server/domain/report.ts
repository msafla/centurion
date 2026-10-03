import type BetterSqlite3 from 'better-sqlite3';
import type { FilterInput, OccurrenceDto, Page, PlanDto } from '../../shared/schemas';
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
import { listReferentials } from './referentials';

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

export type ReferentialSummary = {
  referential: { slug: string; label: string };
  counts: Counts;
  realization_rate: Rate;
  conformity_rate: Rate;
};

export type SummaryDto = {
  counts: Counts;
  realization_rate: Rate;
  conformity_rate: Rate;
  automation_rate: Rate;
  by_referentiel: ReferentialSummary[];
};

export type ReportDto = {
  plan: PlanDto;
  filters: FilterInput;
  generated_at: string;
  summary: SummaryDto;
  rows: Page<OccurrenceDto>;
};

const REFERENTIAL_FROM = `FROM occurrences o
      JOIN controls c ON c.id = o.control_id
      LEFT JOIN realizations r ON r.occurrence_id = o.id
      JOIN control_referentials cr ON cr.control_id = c.id
      JOIN referentials ref ON ref.id = cr.referential_id`;

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
    conditions.push(
      `EXISTS (SELECT 1 FROM control_referentials cr
                 JOIN referentials ref ON ref.id = cr.referential_id
                WHERE cr.control_id = c.id AND ref.slug = ?)`,
    );
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

function cleanCounts(row: Counts): Counts {
  return {
    total: row.total,
    open: row.open,
    fait_true: row.fait_true,
    fait_false: row.fait_false,
    conforme: row.conforme,
    partiellement_conforme: row.partiellement_conforme,
    non_conforme: row.non_conforme,
    non_applicable: row.non_applicable,
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
      `SELECT ref.slug AS slug, ${AGGREGATES}
       ${REFERENTIAL_FROM} WHERE ${where} GROUP BY ref.slug`,
    )
    .all(...params) as (Counts & { slug: string })[];

  const byReferentiel: ReferentialSummary[] = listReferentials(db).map((referential) => {
    const row = grouped.find((entry) => entry.slug === referential.slug);
    const categoryCounts = row ? cleanCounts(row) : emptyCounts();
    return {
      referential: { slug: referential.slug, label: referential.label },
      counts: categoryCounts,
      realization_rate: realizationRate(categoryCounts),
      conformity_rate: conformityRate(categoryCounts),
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
