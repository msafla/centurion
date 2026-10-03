import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuditDto, ControlDto, OccurrenceDto, Page } from '../../shared/schemas';
import { SchedulePreview } from '../components/SchedulePreview';
import { StateBadge } from '../components/StateBadge';
import { ApiClientError, api } from '../lib/api';
import { FREQUENCY_LABELS, REFERENTIEL_LABELS, formatDate } from '../lib/format';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Tab = 'definition' | 'calendar' | 'realizations' | 'history';

export function ControlDetail() {
  const { controlId } = useParams<{ controlId: string }>();
  const { plan } = usePlan();
  const [control, setControl] = useState<ControlDto | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceDto[]>([]);
  const [history, setHistory] = useState<AuditDto[]>([]);
  const [tab, setTab] = useState<Tab>('definition');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!plan || !controlId) return;
    try {
      const [controlData, occurrencePage, auditPage] = await Promise.all([
        api.get<ControlDto>(`/api/plans/${plan.id}/controls/${controlId}`),
        api.get<Page<OccurrenceDto>>(`/api/plans/${plan.id}/occurrences`, { page_size: 100 }),
        api.get<Page<AuditDto>>(`/api/plans/${plan.id}/controls/${controlId}/audit-events`, {
          page_size: 50,
        }),
      ]);
      setControl(controlData);
      setOccurrences(occurrencePage.items.filter((item) => item.control_id === controlId));
      setHistory(auditPage.items);
    } catch (cause) {
      setError(String(cause));
    }
  }, [plan, controlId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;
  if (error) return <p className="text-sm text-red-700" role="alert">{error}</p>;
  if (!control) return <p className="text-[var(--color-text-secondary)]">Chargement…</p>;

  async function archive() {
    if (!plan || !control) return;
    setError(null);
    try {
      await api.post(`/api/plans/${plan.id}/controls/${control.id}/archive`, {
        effective_date: effectiveDate,
      });
      await load();
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-light tracking-tight">
          {control.code} — {control.title}
        </h1>
        {control.status === 'archived' ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Archivé</span>
        ) : null}
        <Link to="/plan" className="ml-auto text-sm text-[var(--color-brand-primary)] hover:underline">
          Retour au plan
        </Link>
      </div>

      {control.automation_github_url ? (
        <a
          href={control.automation_github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--color-brand-primary)] hover:underline"
        >
          Voir le script
        </a>
      ) : null}

      <div className="flex gap-1 text-sm">
        {(['definition', 'calendar', 'realizations', 'history'] as Tab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`rounded-full px-3 py-1.5 ${
              tab === entry
                ? 'bg-[var(--color-brand-primary)] text-white'
                : 'text-[var(--color-text-secondary)]'
            }`}
            onClick={() => setTab(entry)}
          >
            {{ definition: 'Définition', calendar: 'Calendrier', realizations: 'Réalisations', history: 'Historique' }[entry]}
          </button>
        ))}
      </div>

      {tab === 'definition' ? (
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border-brand)] bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Référentiel</dt>
            <dd>{REFERENTIEL_LABELS[control.referentiel] ?? control.referentiel}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Référence</dt>
            <dd>{control.reference}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Description</dt>
            <dd className="whitespace-pre-wrap">{control.description}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Domaine</dt>
            <dd>{control.domain}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Responsable</dt>
            <dd>{control.owner_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Méthode</dt>
            <dd className="whitespace-pre-wrap">{control.method || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[var(--color-text-secondary)]">Preuve attendue</dt>
            <dd className="whitespace-pre-wrap">{control.expected_evidence || '—'}</dd>
          </div>
        </dl>
      ) : null}

      {tab === 'calendar' ? (
        <div className="space-y-4 rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
          <p className="text-sm">
            Fréquence :{' '}
            {FREQUENCY_LABELS[control.schedule.kind] ?? control.schedule.kind}
            {control.schedule.kind === 'explicit'
              ? ` (${control.schedule.dates.length} dates)`
              : ''}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="effective" className="text-xs uppercase text-[var(--color-text-secondary)]">
                Date d'effet d'archivage
              </label>
              <Input
                id="effective"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </div>
            <Button variant="outline" disabled={!effectiveDate} onClick={archive}>
              Archiver
            </Button>
            <SchedulePreview planId={plan.id} control={control} onApplied={setControl} />
          </div>
        </div>
      ) : null}

      {tab === 'realizations' ? (
        <div className="rounded-lg border border-[var(--color-border-brand)] bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">FAIT</th>
                <th className="px-3 py-2">Conformité</th>
                <th className="px-3 py-2">Commentaire</th>
                <th className="px-3 py-2">Preuve</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => (
                <tr key={occurrence.id} className="border-t border-[var(--color-border-brand)]">
                  <td className="px-3 py-2 tabular-nums">{formatDate(occurrence.occurrence_date)}</td>
                  <td className="px-3 py-2">
                    {occurrence.realization ? (occurrence.realization.fait ? 'Oui' : 'Non') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StateBadge occurrence={occurrence} />
                  </td>
                  <td className="px-3 py-2">{occurrence.realization?.comment || '—'}</td>
                  <td className="px-3 py-2">{occurrence.realization?.evidence_ref || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'history' ? (
        <ol className="space-y-2">
          {history.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-[var(--color-border-brand)] bg-white p-3 text-sm"
            >
              <span className="font-medium">{event.action}</span> · {event.source} ·{' '}
              <span className="text-[var(--color-text-secondary)]">{event.at_utc}</span>
            </li>
          ))}
          {history.length === 0 ? (
            <li className="text-sm text-[var(--color-text-secondary)]">Aucun événement.</li>
          ) : null}
        </ol>
      ) : null}
    </section>
  );
}
