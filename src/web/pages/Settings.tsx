import { useCallback, useEffect, useState } from 'react';
import type { BackupDto, Page, PlanDto } from '../../shared/schemas';
import { ApiClientError, api } from '../lib/api';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type McpPolicy = {
  read_enabled: boolean;
  exports_enabled: boolean;
  write_create_enabled: boolean;
  write_update_enabled: boolean;
  write_set_occurrence_enabled: boolean;
  updated_at: string;
};

const POLICY_FIELDS: { key: keyof McpPolicy; label: string; hint: string }[] = [
  { key: 'read_enabled', label: 'Lecture', hint: 'listes, fiches et synthèse' },
  { key: 'exports_enabled', label: 'Exports', hint: 'CSV et PDF' },
  { key: 'write_create_enabled', label: 'Écriture — créer un contrôle', hint: 'proposition à approuver' },
  { key: 'write_update_enabled', label: 'Écriture — modifier un contrôle', hint: 'proposition à approuver' },
  { key: 'write_set_occurrence_enabled', label: 'Écriture — réalisation', hint: 'proposition à approuver' },
];

export function Settings() {
  const { plan, reloadPlans } = usePlan();
  const [name, setName] = useState(plan?.name ?? '');
  const [perimeter, setPerimeter] = useState(plan?.perimeter ?? '');
  const [backups, setBackups] = useState<BackupDto[]>([]);
  const [proposals, setProposals] = useState<
    { id: string; tool: string; state: string; expires_at: string; diff: unknown }[]
  >([]);
  const [policy, setPolicy] = useState<McpPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingCount = proposals.filter((proposal) => proposal.state === 'pending').length;

  useEffect(() => {
    setName(plan?.name ?? '');
    setPerimeter(plan?.perimeter ?? '');
  }, [plan]);

  const loadBackups = useCallback(async () => {
    const page = await api.get<Page<BackupDto>>('/api/backups', { page_size: 50 });
    setBackups(page.items);
  }, []);

  const loadProposals = useCallback(async () => {
    const page = await api.get<
      Page<{ id: string; tool: string; state: string; expires_at: string; diff: unknown }>
    >('/api/mcp-proposals', { page_size: 50 });
    setProposals(page.items);
  }, []);

  const loadPolicy = useCallback(async () => {
    setPolicy(await api.get<McpPolicy>('/api/mcp-policy'));
  }, []);

  useEffect(() => {
    loadBackups().catch((cause: unknown) => setError(String(cause)));
    loadProposals().catch(() => undefined);
    loadPolicy().catch(() => undefined);
  }, [loadBackups, loadProposals, loadPolicy]);

  async function togglePermission(key: keyof McpPolicy, enabled: boolean) {
    await run(async () => {
      setPolicy(await api.put<McpPolicy>('/api/mcp-policy', { [key]: enabled }));
    }, 'Permissions MCP mises à jour.');
  }

  async function run(action: () => Promise<void>, success: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  if (!plan) return <p className="text-[var(--color-text-secondary)]">Aucun plan disponible.</p>;

  return (
    <section className="space-y-8">
      <h1 className="text-4xl font-semibold tracking-[-0.05em]">Paramètres</h1>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
        <h2 className="text-lg font-medium">Plan annuel</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="plan-name">Nom</Label>
            <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="plan-perimeter">Périmètre</Label>
            <Input
              id="plan-perimeter"
              value={perimeter}
              onChange={(event) => setPerimeter(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              run(async () => {
                await api.patch<PlanDto>(`/api/plans/${plan.id}`, { name, perimeter });
                await reloadPlans();
              }, 'Plan mis à jour.')
            }
          >
            Enregistrer
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              run(async () => {
                await api.post(`/api/plans/${plan.id}/clone`, {});
                await reloadPlans();
              }, 'Année suivante créée.')
            }
          >
            Créer l'année suivante
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Sauvegardes</h2>
          <Button
            className="ml-auto"
            onClick={() =>
              run(async () => {
                await api.post<BackupDto>('/api/backups', {});
                await loadBackups();
              }, 'Sauvegarde créée.')
            }
          >
            Créer une sauvegarde
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-2 py-1">Motif</th>
              <th className="px-2 py-1">Créée le</th>
              <th className="px-2 py-1">Taille</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id} className="border-t border-[var(--color-border-brand)]">
                <td className="px-2 py-1">{backup.reason}</td>
                <td className="px-2 py-1">{backup.created_at}</td>
                <td className="px-2 py-1 tabular-nums">{backup.size_bytes}</td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(async () => {
                        const preview = await api.post<{ id: string }>(
                          `/api/backups/${backup.id}/restore-preview`,
                          {},
                        );
                        await api.post(`/api/backups/${backup.id}/restore`, {
                          preview_id: preview.id,
                        });
                        await reloadPlans();
                        await loadBackups();
                      }, 'Restauration effectuée.')
                    }
                  >
                    Restaurer
                  </Button>
                </td>
              </tr>
            ))}
            {backups.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-[var(--color-text-secondary)]" colSpan={4}>
                  Aucune sauvegarde.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
        <h2 className="text-lg font-medium">Permissions MCP</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Choisissez ce que l'adaptateur MCP est autorisé à faire. Le backend revalide chaque appel ;
          une modification s'applique immédiatement à l'adaptateur. Les écritures restent des
          propositions à approuver ci-dessous.
        </p>
        {policy ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {POLICY_FIELDS.map((field) => (
              <label key={field.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy[field.key] as boolean}
                  onChange={(event) => void togglePermission(field.key, event.target.checked)}
                />
                <span>
                  {field.label}
                  <span className="block text-xs text-[var(--color-text-secondary)]">
                    {field.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">Chargement…</p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white/88 shadow-[0_24px_80px_-52px_rgba(22,19,42,0.32)] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Approbations MCP</h2>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
              {pendingCount} en attente
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Les écritures proposées par un client IA ne modifient rien avant validation ici. Une
          approbation qui modifie le plan rend les autres propositions de ce plan obsolètes.
        </p>
        <ul className="space-y-3">
          {proposals.map((proposal) => (
            <li
              key={proposal.id}
              className="rounded-md border border-[var(--color-border-brand)] p-3 text-sm"
            >
              <p className="font-medium">
                {proposal.tool} · {proposal.state} · expire {proposal.expires_at}
              </p>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-[var(--color-surface-soft)] p-2 text-xs">
                {JSON.stringify(proposal.diff, null, 2)}
              </pre>
              {proposal.state === 'pending' ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    onClick={() =>
                      run(async () => {
                        await api.post(`/api/mcp-proposals/${proposal.id}/approve`, {});
                        await loadProposals();
                      }, 'Proposition approuvée.')
                    }
                  >
                    Approuver
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(async () => {
                        await api.post(`/api/mcp-proposals/${proposal.id}/reject`, {});
                        await loadProposals();
                      }, 'Proposition refusée.')
                    }
                  >
                    Refuser
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
          {proposals.length === 0 ? (
            <li className="text-sm text-[var(--color-text-secondary)]">Aucune proposition.</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
