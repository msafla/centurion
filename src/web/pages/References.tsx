import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPercent } from '../lib/format';
import { usePlan } from '../lib/plan-context';

type Summary = {
  by_referentiel: {
    referential: { slug: string; label: string };
    counts: { total: number; open: number; fait_true: number; fait_false: number };
    realization_rate: { value: number | null };
    conformity_rate: { value: number | null };
  }[];
};

export function References() {
  const { plan } = usePlan();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    let active = true;
    api
      .get<Summary>(`/api/plans/${plan.id}/summary`)
      .then((data) => active && setSummary(data))
      .catch((cause: unknown) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [plan]);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;
  if (error) return <p className="text-sm text-red-700" role="alert">{error}</p>;
  if (!summary) return <p className="text-[var(--color-text-secondary)]">Chargement…</p>;

  return (
    <section className="space-y-5">
      <h1 className="text-4xl font-light tracking-tight">Référentiels</h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Agrégation par référentiel : suivi, pas couverture certifiée. Les rapprochements détaillés de
        clauses restent hors MVP.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summary.by_referentiel.map((entry) => (
          <article
            key={entry.referential.slug}
            className="rounded-lg border border-[var(--color-border-brand)] bg-white p-4"
          >
            <h2 className="text-lg font-medium">{entry.referential.label}</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Occurrences</dt>
                <dd className="tabular-nums">{entry.counts.total}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">À renseigner</dt>
                <dd className="tabular-nums">{entry.counts.open}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Réalisation</dt>
                <dd className="tabular-nums">{formatPercent(entry.realization_rate.value)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Conformité</dt>
                <dd className="tabular-nums">{formatPercent(entry.conformity_rate.value)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
