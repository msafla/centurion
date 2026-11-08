import { useEffect, useState } from 'react';
import type { OccurrenceDto, Page, PlanDto } from '../../shared/schemas';
import { api } from '../lib/api';
import { formatDate, formatPercent } from '../lib/format';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Report = {
  plan: PlanDto;
  generated_at: string;
  summary: {
    counts: { total: number; open: number; fait_true: number; fait_false: number };
    realization_rate: { value: number | null };
    conformity_rate: { value: number | null };
  };
  rows: Page<OccurrenceDto>;
};

export function Reporting() {
  const { plan, labelOf } = usePlan();
  const [referentiel, setReferentiel] = useState('');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    let active = true;
    api
      .get<Report>(`/api/plans/${plan.id}/report`, {
        referentiel: referentiel || undefined,
        search: search || undefined,
        page_size: 50,
      })
      .then((data) => active && setReport(data))
      .catch((cause: unknown) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [plan, referentiel, search]);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;

  const exportQuery = new URLSearchParams();
  if (referentiel) exportQuery.set('referentiel', referentiel);
  if (search) exportQuery.set('search', search);
  const suffix = exportQuery.toString() ? `?${exportQuery.toString()}` : '';

  return (
    <section className="space-y-5">
      <h1 className="text-4xl font-semibold tracking-[-0.05em]">Reporting</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="referentiel" className="text-xs uppercase text-[var(--color-text-secondary)]">
            Référentiel
          </label>
          <select
            id="referentiel"
            className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
            value={referentiel}
            onChange={(event) => setReferentiel(event.target.value)}
          >
            <option value="">Tous</option>
            <option value="iso_27001">ISO 27001</option>
            <option value="isae_3402_t2">ISAE 3402 Type 2</option>
            <option value="iso_27001_isae_3402_t2">ISO 27001 + ISAE 3402 Type 2</option>
          </select>
        </div>
        <div>
          <label htmlFor="search" className="text-xs uppercase text-[var(--color-text-secondary)]">
            Recherche
          </label>
          <Input id="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <a href={`/api/plans/${plan.id}/exports/controls.csv${suffix}`}>
          <Button variant="outline">Export CSV</Button>
        </a>
        <a href={`/api/plans/${plan.id}/exports/report.pdf${suffix}`}>
          <Button variant="outline">Export PDF</Button>
        </a>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Total" value={String(report.summary.counts.total)} />
            <Metric label="À renseigner" value={String(report.summary.counts.open)} />
            <Metric label="Réalisation" value={formatPercent(report.summary.realization_rate.value)} />
            <Metric label="Conformité" value={formatPercent(report.summary.conformity_rate.value)} />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Généré le {report.generated_at}. Exports plafonnés (CSV 64 MiB, PDF 1 000 occurrences).
          </p>
          <div className="overflow-x-auto rounded-3xl border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)]">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Référentiel</th>
                  <th className="px-3 py-2">Code / titre</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">FAIT</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.items.map((occurrence) => (
                  <tr key={occurrence.id} className="border-t border-[var(--color-border-brand)]">
                    <td className="px-3 py-2">
                      {occurrence.control.referentials.map(labelOf).join(" + ")}
                    </td>
                    <td className="px-3 py-2">
                      {occurrence.control.code} — {occurrence.control.title}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDate(occurrence.occurrence_date)}</td>
                    <td className="px-3 py-2">
                      {occurrence.realization ? (occurrence.realization.fait ? 'Oui' : 'Non') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums">{value}</p>
    </div>
  );
}
