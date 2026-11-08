import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { OccurrenceDto, Page } from '../../shared/schemas';
import { ControlForm } from '../components/ControlForm';
import { RealizationForm } from '../components/RealizationForm';
import { StateBadge } from '../components/StateBadge';
import { api } from '../lib/api';
import { FREQUENCY_LABELS, formatDate } from '../lib/format';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAGE_SIZE = 50;
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function AnnualPlan() {
  const { plan, reloadPlans, labelOf } = usePlan();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Page<OccurrenceDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OccurrenceDto | null>(null);
  const [view, setView] = useState<'table' | 'months'>('table');

  const ignoreUrlSync = useRef(false);
  const [filters, setFilters] = useState({
    search: '',
    referentiel: '',
    state: '',
    page: Number(searchParams.get('page') ?? '1'),
  });

  useEffect(() => {
    if (ignoreUrlSync.current) {
      ignoreUrlSync.current = false;
      return;
    }
    const urlPage = Number(searchParams.get('page') ?? '1');
    setFilters((current) => (current.page === urlPage ? current : { ...current, page: urlPage }));
  }, [searchParams]);

  useEffect(() => {
    if (!plan) return;
    let active = true;
    api
      .get<Page<OccurrenceDto>>(`/api/plans/${plan.id}/occurrences`, {
        search: filters.search || undefined,
        referentiel: filters.referentiel || undefined,
        state: filters.state || undefined,
        page: filters.page,
        page_size: PAGE_SIZE,
      })
      .then((data) => active && setRows(data))
      .catch((cause: unknown) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [plan, filters]);

  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0) as number[];
    for (const occurrence of rows?.items ?? []) {
      const month = Number(occurrence.occurrence_date.slice(5, 7));
      if (month >= 1 && month <= 12) counts[month - 1] = (counts[month - 1] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;

  function updateFilter(key: string, value: string) {
    const isPage = key === 'page';
    const pageNumber = isPage ? Number(value) : 1;
    setFilters((current) => ({
      ...current,
      [key]: isPage ? pageNumber : value,
      page: isPage ? pageNumber : 1,
    }));
    const nextParams = new URLSearchParams();
    if (pageNumber > 1) nextParams.set('page', String(pageNumber));
    ignoreUrlSync.current = true;
    navigate(`/plan${nextParams.toString() ? `?${nextParams.toString()}` : ''}`);
  }

  function resetFilters() {
    setFilters({ search: '', referentiel: '', state: '', page: 1 });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Plan annuel — {plan.year}
        </h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            onClick={() => setView('table')}
          >
            Tableau
          </Button>
          <Button
            variant={view === 'months' ? 'default' : 'outline'}
            onClick={() => setView('months')}
          >
            Douze mois
          </Button>
          <ControlForm planId={plan.id} onCreated={() => void reloadPlans().then(refresh)} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="search" className="text-xs text-[var(--color-text-secondary)]">
            Recherche
          </label>
          <Input
            id="search"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="code, titre, description"
          />
        </div>
        <div>
          <label htmlFor="referentiel" className="text-xs text-[var(--color-text-secondary)]">
            Référentiel
          </label>
          <select
            id="referentiel"
            className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
            value={filters.referentiel}
            onChange={(event) => updateFilter('referentiel', event.target.value)}
          >
            <option value="">Tous</option>
            <option value="iso_27001">ISO 27001</option>
            <option value="isae_3402_t2">ISAE 3402 Type 2</option>
            <option value="iso_27001_isae_3402_t2">ISO 27001 + ISAE 3402 Type 2</option>
          </select>
        </div>
        <div>
          <label htmlFor="state" className="text-xs text-[var(--color-text-secondary)]">
            État
          </label>
          <select
            id="state"
            className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
            value={filters.state}
            onChange={(event) => updateFilter('state', event.target.value)}
          >
            <option value="">Courantes</option>
            <option value="open">À renseigner</option>
            <option value="completed">Renseignées</option>
            <option value="superseded">Supplantées</option>
          </select>
        </div>
        <Button variant="outline" onClick={resetFilters}>
          Réinitialiser
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {view === 'months' ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {MONTHS.map((label, index) => (
            <div
              key={label}
              className="rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-3 text-center"
            >
              <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
              <p className="text-xl tabular-nums">{monthCounts[index] ?? 0}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Référentiel</th>
                <th className="px-3 py-2">Référence</th>
                <th className="px-3 py-2">Code / titre</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Fréquence</th>
                <th className="px-3 py-2">Auto</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">FAIT</th>
                <th className="px-3 py-2">Conformité</th>
              </tr>
            </thead>
            <tbody>
              {(rows?.items ?? []).map((occurrence) => (
                <tr key={occurrence.id} className="border-t border-[var(--color-border-brand)]">
                  <td className="px-3 py-2">
                    {occurrence.control.referentials.map(labelOf).join(" + ")}
                  </td>
                  <td className="px-3 py-2">{occurrence.control.reference}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium text-[var(--color-brand-primary)] hover:underline"
                      to={`/control/${occurrence.control.id}`}
                    >
                      {occurrence.control.code} — {occurrence.control.title}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-[var(--color-text-secondary)]">
                    {occurrence.control.description}
                  </td>
                  <td className="px-3 py-2">
                    {FREQUENCY_LABELS[occurrence.control.schedule.kind] ?? occurrence.control.schedule.kind}
                  </td>
                  <td className="px-3 py-2">{occurrence.control.automated ? 'Oui' : 'Non'}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(occurrence.occurrence_date)}</td>
                  <td className="px-3 py-2">
                    {occurrence.realization ? (occurrence.realization.fait ? 'Oui' : 'Non') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setEditing(occurrence)}
                    >
                      <StateBadge occurrence={occurrence} />
                    </button>
                  </td>
                </tr>
              ))}
              {(rows?.items ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-[var(--color-text-secondary)]" colSpan={9}>
                    Aucune occurrence pour ces filtres.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.total > PAGE_SIZE ? (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline"
            disabled={filters.page <= 1}
            onClick={() => updateFilter('page', String(filters.page - 1))}
          >
            Précédent
          </Button>
          <span>
            Page {rows.page} · {rows.total} occurrences
          </span>
          <Button
            variant="outline"
            disabled={filters.page * PAGE_SIZE >= rows.total}
            onClick={() => updateFilter('page', String(filters.page + 1))}
          >
            Suivant
          </Button>
        </div>
      ) : null}

      {editing ? (
        <RealizationForm
          planId={plan.id}
          occurrence={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setRows((current) =>
              current
                ? {
                    ...current,
                    items: current.items.map((item) => (item.id === saved.id ? saved : item)),
                  }
                : current,
            );
          }}
        />
      ) : null}
    </section>
  );

  function refresh() {
    setFilters((current) => ({ ...current, page: current.page }));
  }
}
