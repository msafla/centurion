import { useState } from 'react';
import { IMPORT_COLUMNS, type ImportColumn } from '../../shared/schemas';
import { ApiClientError, api } from '../lib/api';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type UploadResponse = {
  import_id: string;
  sheets: string[] | null;
  headers: string[];
  sample_rows: string[][];
  separator: ',' | ';' | null;
};

type PreviewRow = {
  row_number: number;
  code: string | null;
  action: string;
  field_errors: Record<string, string[]>;
};

type PreviewResponse = {
  counts: { create: number; update: number; unchanged: number; invalid: number };
  can_apply: boolean;
  rows: { items: PreviewRow[]; total: number };
};

const REQUIRED: ImportColumn[] = ['code', 'title', 'description', 'referentiel', 'reference', 'domain', 'frequency_kind'];

export function Import() {
  const { plan, reloadPlans } = usePlan();
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportColumn, number>>>({});
  const [effectiveDate, setEffectiveDate] = useState('2028-07-01');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/plans/${plan?.id}/imports`, {
      method: 'POST',
      headers: { 'X-Centurion-Request': '1' },
      body: form,
    });
    const data = (await response.json()) as UploadResponse & {
      error?: { code?: string; message?: string };
    };
    if (!response.ok) {
      setError(`${data.error?.code ?? 'error'} — ${data.error?.message ?? ''}`);
      return;
    }
    setUpload(data);
  }

  async function requestPreview() {
    if (!upload) return;
    setError(null);
    try {
      const result = await api.put<PreviewResponse>(
        `/api/plans/${plan?.id}/imports/${upload.import_id}/mapping`,
        {
          sheet: upload.sheets ? (upload.sheets[0] ?? undefined) : undefined,
          separator: upload.sheets ? undefined : (upload.separator ?? ';'),
          columns: mapping,
          effective_date: effectiveDate,
        },
      );
      setPreview(result);
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  async function apply() {
    if (!upload) return;
    setError(null);
    try {
      await api.post(`/api/plans/${plan?.id}/imports/${upload.import_id}/apply`, {});
      setMessage('Import appliqué.');
      setPreview(null);
      setUpload(null);
      await reloadPlans();
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  return (
    <section className="space-y-5">
      <h1 className="text-4xl font-light tracking-tight">Import</h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Un fichier CSV ou XLSX, un mapping explicite, un aperçu paginé puis une application atomique.
        L'import est une définition complète : un champ optionnel absent efface l'ancienne valeur.
      </p>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
        <label htmlFor="file" className="text-sm font-medium">
          Fichier (.csv ou .xlsx)
        </label>
        <input
          id="file"
          type="file"
          accept=".csv,.xlsx"
          className="mt-2 block text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </div>

      {upload ? (
        <div className="space-y-4 rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
          <p className="text-sm">
            {upload.headers.length} colonnes détectées
            {upload.separator ? ` · séparateur « ${upload.separator} »` : ''}
            {upload.sheets ? ` · feuille « ${upload.sheets[0]} »` : ''}
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_COLUMNS.map((column) => (
              <label key={column} className="flex items-center gap-2 text-sm">
                <span className="w-40 truncate">
                  {column}
                  {REQUIRED.includes(column) ? ' *' : ''}
                </span>
                <select
                  aria-label={`Colonne ${column}`}
                  className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-1 text-sm"
                  value={mapping[column] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [column]: event.target.value === '' ? undefined : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {upload.headers.map((header, index) => (
                    <option key={header} value={index}>
                      {index}: {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex items-end gap-3">
            <div>
              <label htmlFor="effective_date" className="text-xs uppercase text-[var(--color-text-secondary)]">
                Date d'effet
              </label>
              <Input
                id="effective_date"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </div>
            <Button onClick={requestPreview}>Aperçu</Button>
          </div>

          {preview ? (
            <div className="space-y-3">
              <p className="text-sm">
                Créations : {preview.counts.create} · Mises à jour : {preview.counts.update} ·
                Inchangées : {preview.counts.unchanged} · Invalides : {preview.counts.invalid}
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-2 py-1">Ligne</th>
                    <th className="px-2 py-1">Code</th>
                    <th className="px-2 py-1">Action</th>
                    <th className="px-2 py-1">Erreurs</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.items.map((row) => (
                    <tr key={row.row_number} className="border-t border-[var(--color-border-brand)]">
                      <td className="px-2 py-1 tabular-nums">{row.row_number}</td>
                      <td className="px-2 py-1">{row.code ?? '—'}</td>
                      <td className="px-2 py-1">{row.action}</td>
                      <td className="px-2 py-1 text-red-700">
                        {Object.values(row.field_errors).flat().join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button disabled={!preview.can_apply} onClick={apply}>
                Appliquer
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
