import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ControlDto, Page } from '../../shared/schemas';
import { api } from '../lib/api';
import { usePlan } from '../lib/plan-context';

type ArchivedControl = ControlDto & { plan_year: number; plan_name: string };

export function ArchivedControls() {
  const { plans } = usePlan();
  const [rows, setRows] = useState<ArchivedControl[]>([]);

  useEffect(() => {
    void (async () => {
      const all: ArchivedControl[] = [];
      for (const plan of plans) {
        const page = await api.get<Page<ControlDto>>(`/api/plans/${plan.id}/controls`, {
          status: 'archived',
          page_size: 100,
        });
        for (const control of page.items) {
          all.push({ ...control, plan_year: plan.year, plan_name: plan.name });
        }
      }
      setRows(all);
    })();
  }, [plans]);

  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Contrôles archivés</h1>
      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Code / titre</th>
              <th className="px-3 py-2">Référentiels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-border-brand)]">
                <td className="px-3 py-2">{row.plan_name}</td>
                <td className="px-3 py-2">
                  <Link className="text-[var(--color-brand-primary)] hover:underline" to={`/control/${row.id}`}>
                    {row.code} — {row.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.referentials.join(' + ')}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[var(--color-text-secondary)]" colSpan={3}>
                  Aucun contrôle archivé.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}