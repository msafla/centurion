import { useCallback, useEffect, useState } from 'react';
import type { BackupDto, Page, PlanDto } from '../../shared/schemas';
import { ApiClientError, api } from '../lib/api';
import { usePlan } from '../lib/plan-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Settings() {
  const { plan, reloadPlans } = usePlan();
  const [name, setName] = useState(plan?.name ?? '');
  const [perimeter, setPerimeter] = useState(plan?.perimeter ?? '');
  const [backups, setBackups] = useState<BackupDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(plan?.name ?? '');
    setPerimeter(plan?.perimeter ?? '');
  }, [plan]);

  const loadBackups = useCallback(async () => {
    const page = await api.get<Page<BackupDto>>('/api/backups', { page_size: 50 });
    setBackups(page.items);
  }, []);

  useEffect(() => {
    loadBackups().catch((cause: unknown) => setError(String(cause)));
  }, [loadBackups]);

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
      <h1 className="text-4xl font-light tracking-tight">Paramètres</h1>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
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

      <div className="space-y-3 rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
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
          <thead className="text-left text-xs uppercase text-[var(--color-text-secondary)]">
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

      <div className="rounded-lg border border-[var(--color-border-brand)] bg-white p-4">
        <h2 className="text-lg font-medium">Approbations MCP</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Les écritures proposées par un client IA apparaissent ici pour validation explicite.
        </p>
      </div>
    </section>
  );
}
