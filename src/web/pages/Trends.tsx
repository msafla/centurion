import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '@/components/ui/button';

type TrendSummary = {
  counts: { total: number; fait_true: number; conforme: number };
  realization_rate: { value: number | null };
  conformity_rate: { value: number | null };
};

type TrendPoint = {
  plan_id: string;
  year: number;
  name: string;
  summary: TrendSummary;
};

export function Trends() {
  const [rows, setRows] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [referentiel, setReferentiel] = useState('');
  const [state, setState] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get<TrendPoint[]>('/api/trends', {
        referentiel: referentiel || undefined,
        state: state || undefined,
      })
      .then((data) => active && setRows(data))
      .catch((cause: unknown) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [referentiel, state]);

  const exportCsv = () => {
    const header = ['Annee', 'Plan', 'Occurrences', 'Renseignees', 'Conformes', 'Realisation', 'Conformite'];
    const lines = rows.map((row) => [
      row.year,
      `"${row.name.replace(/"/g, '""')}"`,
      row.summary.counts.total,
      row.summary.counts.fait_true,
      row.summary.counts.conforme,
      row.summary.realization_rate.value ?? '',
      row.summary.conformity_rate.value ?? '',
    ]);
    const csv = [header.join(';'), ...lines.map((line) => line.join(';'))].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tendances.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxValue = useMemo(() => Math.max(...rows.map((row) => row.summary.counts.total), 1), [rows]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Tendances multi-années</h1>
        <Button variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="trend-referentiel" className="text-xs text-[var(--color-text-secondary)]">Référentiel</label>
          <select
            id="trend-referentiel"
            className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
            value={referentiel}
            onChange={(event) => setReferentiel(event.target.value)}
          >
            <option value="">Tous</option>
            <option value="iso_27001">ISO 27001</option>
            <option value="isae_3402_t2">ISAE 3402 Type 2</option>
          </select>
        </div>
        <div>
          <label htmlFor="trend-state" className="text-xs text-[var(--color-text-secondary)]">État</label>
          <select
            id="trend-state"
            className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">Courantes</option>
            <option value="open">À renseigner</option>
            <option value="completed">Renseignées</option>
          </select>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-3 py-2">Année</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Occurrences</th>
              <th className="px-3 py-2">Renseignées</th>
              <th className="px-3 py-2">Conformes</th>
              <th className="px-3 py-2">Réalisation</th>
              <th className="px-3 py-2">Conformité</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.plan_id} className="border-t border-[var(--color-border-brand)]">
                <td className="px-3 py-2 tabular-nums">{row.year}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 tabular-nums">{row.summary.counts.total}</td>
                <td className="px-3 py-2 tabular-nums">{row.summary.counts.fait_true}</td>
                <td className="px-3 py-2 tabular-nums">{row.summary.counts.conforme}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.summary.realization_rate.value === null
                    ? '—'
                    : `${Math.round(row.summary.realization_rate.value * 100)} %`}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {row.summary.conformity_rate.value === null
                    ? '—'
                    : `${Math.round(row.summary.conformity_rate.value * 100)} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">Volume d’occurrences par exercice</p>
        <div className="flex items-end gap-3" style={{ height: 160 }}>
          {rows.map((row) => (
            <div key={row.plan_id} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-[var(--color-brand-primary)]"
                style={{ height: `${(row.summary.counts.total / maxValue) * 120}px` }}
              />
              <span className="text-xs tabular-nums">{row.year}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}