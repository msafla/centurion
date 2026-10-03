import type { OccurrenceDto } from '../../shared/schemas';
import { CONFORMITE_LABELS } from '../lib/format';

export function StateBadge({ occurrence }: { occurrence: OccurrenceDto }) {
  if (occurrence.state === 'superseded') {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Supplantée</span>;
  }
  if (occurrence.state === 'open') {
    return (
      <span className="rounded-full bg-[var(--color-surface-soft)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
        À renseigner
      </span>
    );
  }
  const realization = occurrence.realization;
  if (!realization) {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Renseigné</span>;
  }
  if (!realization.fait) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">Non réalisé</span>;
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs">
      {CONFORMITE_LABELS[realization.conformite] ?? realization.conformite}
    </span>
  );
}
