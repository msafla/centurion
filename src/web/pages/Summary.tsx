import { useEffect, useState } from 'react';
import type { OccurrenceDto, Page } from '../../shared/schemas';
import { api } from '../lib/api';
import { formatDate, formatPercent } from '../lib/format';
import { usePlan } from '../lib/plan-context';

type Summary = {
  counts: {
    total: number;
    open: number;
    fait_true: number;
    fait_false: number;
    conforme: number;
    partiellement_conforme: number;
    non_conforme: number;
    non_applicable: number;
  };
  realization_rate: { numerator: number; denominator: number; value: number | null };
  conformity_rate: { numerator: number; denominator: number; value: number | null };
  automation_rate: { numerator: number; denominator: number; value: number | null };
  by_referentiel: { referentiel: string; counts: { total: number } }[];
};

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums">{value}</p>
    </div>
  );
}

export function Summary() {
  const { plan, labelOf } = usePlan();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [next, setNext] = useState<OccurrenceDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    let active = true;
    Promise.all([
      api.get<Summary>(`/api/plans/${plan.id}/summary`),
      api.get<Page<OccurrenceDto>>(`/api/plans/${plan.id}/occurrences`, {
        state: 'open',
        page_size: 5,
      }),
    ])
      .then(([summaryData, occurrences]) => {
        if (!active) return;
        setSummary(summaryData);
        setNext(occurrences.items);
      })
      .catch((cause: unknown) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [plan]);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;
  if (error) return <p className="text-sm text-red-700" role="alert">{error}</p>;
  if (!summary) return <p className="text-[var(--color-text-secondary)]">Chargement…</p>;

  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-light tracking-tight">Synthèse — {plan.name}</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Total" value={String(summary.counts.total)} />
        <Card label="À renseigner" value={String(summary.counts.open)} />
        <Card label="Réalisés" value={String(summary.counts.fait_true)} />
        <Card label="Non réalisés" value={String(summary.counts.fait_false)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          label="Taux de réalisation"
          value={`${formatPercent(summary.realization_rate.value)} (${summary.realization_rate.numerator}/${summary.realization_rate.denominator})`}
        />
        <Card
          label="Taux de conformité"
          value={`${formatPercent(summary.conformity_rate.value)} (${summary.conformity_rate.numerator}/${summary.conformity_rate.denominator})`}
        />
        <Card
          label="Automatisation (contrôles actifs)"
          value={`${formatPercent(summary.automation_rate.value)} (${summary.automation_rate.numerator}/${summary.automation_rate.denominator})`}
        />
      </div>

      <div className="rounded-lg border border-[var(--color-border-brand)] bg-white">
        <h2 className="border-b border-[var(--color-border-brand)] px-4 py-3 text-sm font-medium">
          Prochaines occurrences
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Référentiel</th>
            </tr>
          </thead>
          <tbody>
            {next.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]" colSpan={3}>
                  Aucune occurrence à venir.
                </td>
              </tr>
            ) : (
              next.map((occurrence) => (
                <tr key={occurrence.id} className="border-t border-[var(--color-border-brand)]">
                  <td className="px-4 py-2 tabular-nums">{formatDate(occurrence.occurrence_date)}</td>
                  <td className="px-4 py-2 font-medium">{occurrence.control.code}</td>
                  <td className="px-4 py-2">
                    {occurrence.control.referentials.map(labelOf).join(" + ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
