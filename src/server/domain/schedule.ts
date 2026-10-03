import type { CivilDate, OccurrenceState, Schedule } from '../../shared/schemas';
import { addMonthsClamped, compareCivilDate, translateCivilDate, yearOf } from './civil-date';

export type ActivityWindow = { active_from: CivilDate | null; active_to: CivilDate | null };

export type ControlDefinitionDates = {
  schedule: Schedule;
  active_from: CivilDate | null;
  active_to: CivilDate | null;
};

const INTERVAL_MONTHS: Record<'monthly' | 'quarterly' | 'semiannual', number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
};

function withinWindow(date: CivilDate, window: ActivityWindow): boolean {
  if (window.active_from && compareCivilDate(date, window.active_from) < 0) return false;
  if (window.active_to && compareCivilDate(date, window.active_to) > 0) return false;
  return true;
}

export function generateDates(
  year: number,
  schedule: Schedule,
  window: ActivityWindow,
): CivilDate[] {
  const endOfYear = `${year}-12-31`;
  let dates: CivilDate[];

  switch (schedule.kind) {
    case 'once':
      dates = [schedule.date];
      break;
    case 'annual':
      dates = [schedule.anchorDate];
      break;
    case 'monthly':
    case 'quarterly':
    case 'semiannual': {
      const step = INTERVAL_MONTHS[schedule.kind];
      dates = [];
      for (let index = 0; index <= 200; index += 1) {
        const next = addMonthsClamped(schedule.anchorDate, step * index);
        if (next > endOfYear) break;
        dates.push(next);
      }
      break;
    }
    case 'explicit':
      dates = schedule.dates;
      break;
  }

  const unique = [...new Set(dates.filter((date) => yearOf(date) === year))].sort();
  return unique.filter((date) => withinWindow(date, window));
}

export function translateSchedule(schedule: Schedule, targetYear: number): Schedule {
  switch (schedule.kind) {
    case 'once':
      return { kind: 'once', date: translateCivilDate(schedule.date, targetYear) };
    case 'explicit':
      return {
        kind: 'explicit',
        dates: [...new Set(schedule.dates.map((date) => translateCivilDate(date, targetYear)))].sort(),
      };
    default:
      return { kind: schedule.kind, anchorDate: translateCivilDate(schedule.anchorDate, targetYear) };
  }
}

export function translateDefinitionDates(
  input: ControlDefinitionDates,
  targetYear: number,
): ControlDefinitionDates {
  return {
    schedule: translateSchedule(input.schedule, targetYear),
    active_from: input.active_from ? translateCivilDate(input.active_from, targetYear) : null,
    active_to: input.active_to ? translateCivilDate(input.active_to, targetYear) : null,
  };
}

export type ScheduleDeltaInput = {
  year: number;
  occurrences: { id: string; date: CivilDate; state: OccurrenceState }[];
  newSchedule: Schedule;
  newWindow: ActivityWindow;
  effectiveDate: CivilDate;
};

export type ScheduleDelta = {
  keep: string[];
  supersede: string[];
  create: CivilDate[];
};

/**
 * Delta from an effective date. Completed and earlier open occurrences are
 * kept; future open occurrences whose date survives are kept; future open
 * occurrences that disappear are superseded; new dates at or after the effect
 * are created when not already covered by an active occurrence. Superseded
 * rows are never touched or recycled.
 */
export function computeScheduleDelta(input: ScheduleDeltaInput): ScheduleDelta {
  const newDates = new Set(generateDates(input.year, input.newSchedule, input.newWindow));
  const activeDates = new Set(
    input.occurrences.filter((occurrence) => occurrence.state !== 'superseded').map((o) => o.date),
  );
  const byId = new Map(input.occurrences.map((occurrence) => [occurrence.id, occurrence]));

  const keep: string[] = [];
  const supersede: string[] = [];
  for (const occurrence of input.occurrences) {
    if (occurrence.state === 'completed') {
      keep.push(occurrence.id);
      continue;
    }
    if (occurrence.state === 'superseded') continue;
    if (occurrence.date < input.effectiveDate) {
      keep.push(occurrence.id);
      continue;
    }
    if (newDates.has(occurrence.date)) keep.push(occurrence.id);
    else supersede.push(occurrence.id);
  }

  const create: CivilDate[] = [];
  for (const date of [...newDates].sort()) {
    if (date < input.effectiveDate) continue;
    if (activeDates.has(date)) continue;
    if (create.includes(date)) continue;
    create.push(date);
  }

  // Sanity: every kept id must reference an existing occurrence.
  for (const id of keep) if (!byId.has(id)) throw new Error('delta_unknown_occurrence');

  return { keep, supersede, create };
}
