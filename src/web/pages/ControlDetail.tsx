import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuditDto, ControlDto, OccurrenceDto, Page } from '../../shared/schemas';
import { SchedulePreview } from '../components/SchedulePreview';
import { StateBadge } from '../components/StateBadge';
import { ApiClientError, api } from '../lib/api';
import { FREQUENCY_LABELS, formatDate } from '../lib/format';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Tab = 'definition' | 'calendar' | 'realizations' | 'history';

type ClauseDtoLocal = {
  id: string;
  referential: string | null;
  code: string;
  title: string;
  created_at: string;
};

type EvidenceDto = {
  id: string;
  occurrence_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

export function ControlDetail() {
  const { controlId } = useParams<{ controlId: string }>();
  const { plan, labelOf } = usePlan();
  const [control, setControl] = useState<ControlDto | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceDto[]>([]);
  const [history, setHistory] = useState<AuditDto[]>([]);
  const [allClauses, setAllClauses] = useState<ClauseDtoLocal[]>([]);
  const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>([]);
  const [evidenceByOccurrence, setEvidenceByOccurrence] = useState<Record<string, EvidenceDto[]>>({});
  const [tab, setTab] = useState<Tab>('definition');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!plan || !controlId) return;
    try {
      const [controlData, occurrencePage, auditPage, clauses] = await Promise.all([
        api.get<ControlDto>(`/api/plans/${plan.id}/controls/${controlId}`),
        api.get<Page<OccurrenceDto>>(`/api/plans/${plan.id}/occurrences`, { page_size: 100 }),
        api.get<Page<AuditDto>>(`/api/plans/${plan.id}/controls/${controlId}/audit-events`, {
          page_size: 50,
        }),
        api.get<ClauseDtoLocal[]>('/api/clauses'),
      ]);
      const filteredOccurrences = occurrencePage.items.filter((item) => item.control_id === controlId);
      setControl(controlData);
      setOccurrences(filteredOccurrences);
      setHistory(auditPage.items);
      setAllClauses(clauses);
      setSelectedClauseIds(clauses.filter((clause) => controlData.clauses.includes(clause.code)).map((clause) => clause.id));
      const evidenceEntries = await Promise.all(
        filteredOccurrences.map(async (occurrence) => {
          const list = await api.get<EvidenceDto[]>(
            `/api/plans/${plan.id}/occurrences/${occurrence.id}/evidence`,
          );
          return [occurrence.id, list] as const;
        }),
      );
      setEvidenceByOccurrence(Object.fromEntries(evidenceEntries));
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

  async function uploadEvidence(occurrenceId: string, fileList: FileList | null) {
    if (!plan || !fileList || fileList.length === 0) return;
    setError(null);
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/plans/${plan.id}/occurrences/${occurrenceId}/evidence`, {
        method: 'POST',
        headers: { 'X-Centurion-Request': '1' },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(String((payload as { error?: { message?: string } })?.error?.message ?? response.statusText));
        return;
      }
    }
    await load();
  }

  async function removeEvidence(occurrenceId: string, evidenceId: string) {
    if (!plan) return;
    setError(null);
    await api.delete(`/api/plans/${plan.id}/occurrences/${occurrenceId}/evidence/${evidenceId}`);
    await load();
  }

  async function saveClauses() {
    if (!plan || !control) return;
    setError(null);
    await api.put(`/api/plans/${plan.id}/controls/${control.id}/clauses`, {
      clause_ids: selectedClauseIds,
    });
    await load();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-[-0.05em]">
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
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Référentiel</dt>
            <dd>{control.referentials.map(labelOf).join(" + ")}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Référence</dt>
            <dd>{control.reference}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--color-text-secondary)]">Description</dt>
            <dd className="whitespace-pre-wrap">{control.description}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Domaine</dt>
            <dd>{control.domain}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Responsable</dt>
            <dd>{control.owner_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Méthode</dt>
            <dd className="whitespace-pre-wrap">{control.method || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Preuve attendue</dt>
            <dd className="whitespace-pre-wrap">{control.expected_evidence || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--color-text-secondary)]">Clauses</dt>
            <dd className="space-y-2">
              {control.clauses.length > 0 ? (
                <p>{control.clauses.join(', ')}</p>
              ) : (
                <p className="text-[var(--color-text-secondary)]">Aucune clause liée.</p>
              )}
              {allClauses.length > 0 ? (
                <div className="space-y-1 rounded-md border border-[var(--color-border-brand)] bg-white p-2">
                  {allClauses.map((clause) => (
                    <label key={clause.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClauseIds.includes(clause.id)}
                        onChange={(event) =>
                          setSelectedClauseIds((current) =>
                            event.target.checked
                              ? [...current, clause.id]
                              : current.filter((id) => id !== clause.id),
                          )
                        }
                      />
                      <span>
                        {clause.code}
                        {clause.referential ? ` (${clause.referential})` : ''}
                      </span>
                    </label>
                  ))}
                  <Button variant="outline" onClick={() => void saveClauses().catch((cause) => setError(String(cause)))}>
                    Enregistrer les clauses
                  </Button>
                </div>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : null}

      {tab === 'calendar' ? (
        <div className="space-y-4 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
          <p className="text-sm">
            Fréquence :{' '}
            {FREQUENCY_LABELS[control.schedule.kind] ?? control.schedule.kind}
            {control.schedule.kind === 'explicit'
              ? ` (${control.schedule.dates.length} dates)`
              : ''}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="effective" className="text-xs text-[var(--color-text-secondary)]">
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
        <div className="rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
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
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      {(evidenceByOccurrence[occurrence.id] ?? []).map((evidence) => (
                        <div key={evidence.id} className="flex items-center gap-2">
                          <a
                            className="text-[var(--color-brand-primary)] hover:underline"
                            href={`/api/plans/${plan.id}/occurrences/${occurrence.id}/evidence/${evidence.id}/download`}
                          >
                            {evidence.original_name}
                          </a>
                          <button
                            type="button"
                            className="text-xs text-red-700 hover:underline"
                            onClick={() =>
                              void removeEvidence(occurrence.id, evidence.id).catch((cause) => setError(String(cause)))
                            }
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                      <label className="block">
                        <span className="sr-only">Ajouter des pièces jointes</span>
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/png,image/jpeg,text/plain"
                          onChange={(event) => void uploadEvidence(occurrence.id, event.target.files).catch((cause) => setError(String(cause)))}
                        />
                      </label>
                    </div>
                  </td>
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
              className="rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-3 text-sm"
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
