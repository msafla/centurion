import type { CivilDate } from '../shared/schemas';

export type Clock = {
  nowUtc(): string;
  todayParis(): CivilDate;
  monotonicMs(): number;
};

const PARIS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parisDate(instant: Date): CivilDate {
  const parts = PARIS_FORMAT.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function systemClock(): Clock {
  return {
    nowUtc: () => new Date().toISOString(),
    todayParis: () => parisDate(new Date()),
    monotonicMs: () => performance.now(),
  };
}

export function fixedClock(nowUtc: string): Clock {
  const instant = new Date(nowUtc);
  let ticks = 0;
  return {
    nowUtc: () => nowUtc,
    todayParis: () => parisDate(instant),
    monotonicMs: () => {
      ticks += 1;
      return ticks;
    },
  };
}
