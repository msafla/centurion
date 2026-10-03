import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import type { Page, PlanDto } from '../shared/schemas';
import { api } from './lib/api';
import { PlanContext, type PlanState } from './lib/plan-context';
import { AnnualPlan } from './pages/AnnualPlan';
import { ControlDetail } from './pages/ControlDetail';
import { Import } from './pages/Import';
import { References } from './pages/References';
import { Reporting } from './pages/Reporting';
import { Settings } from './pages/Settings';
import { Summary } from './pages/Summary';

const NAV = [
  { to: '/', label: 'Synthèse' },
  { to: '/plan', label: 'Plan annuel' },
  { to: '/references', label: 'Référentiels' },
  { to: '/reporting', label: 'Reporting' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Paramètres' },
];

export function App() {
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [referentials, setReferentials] = useState<{ slug: string; label: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem('centurion.plan'),
  );
  const [error, setError] = useState<string | null>(null);

  const reloadPlans = useCallback(async () => {
    const [page, catalog] = await Promise.all([
      api.get<Page<PlanDto>>('/api/plans', { page_size: 100 }),
      api.get<{ slug: string; label: string }[]>('/api/referentials'),
    ]);
    setPlans(page.items);
    setReferentials(catalog);
    setSelectedId((current) => {
      if (current && page.items.some((plan) => plan.id === current)) return current;
      const currentYear = new Date().getFullYear();
      const preferred = page.items.find((plan) => plan.year === currentYear) ?? page.items[0];
      return preferred?.id ?? null;
    });
  }, []);

  useEffect(() => {
    reloadPlans().catch((cause: unknown) => setError(String(cause)));
  }, [reloadPlans]);

  useEffect(() => {
    if (selectedId) localStorage.setItem('centurion.plan', selectedId);
  }, [selectedId]);

  const plan = plans.find((entry) => entry.id === selectedId) ?? null;
  const labelBySlug = new Map(referentials.map((entry) => [entry.slug, entry.label]));
  const labelOf = (slug: string): string => labelBySlug.get(slug) ?? slug;
  const value: PlanState = {
    plans,
    plan,
    referentials,
    labelOf,
    reloadPlans,
    selectPlan: setSelectedId,
  };

  return (
    <PlanContext.Provider value={value}>
      <BrowserRouter>
        <div className="min-h-full bg-[var(--color-surface-soft)] text-[var(--color-ink)]">
          <header className="border-b border-[var(--color-border-brand)] bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
              <span className="text-lg font-semibold tracking-tight text-[var(--color-brand-primary)]">
                CENTURION
              </span>
              <nav aria-label="Navigation principale" className="flex flex-wrap gap-1 text-sm">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1.5 transition-colors ${
                        isActive
                          ? 'bg-[var(--color-brand-primary)] text-white'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)]'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                Plan
                <select
                  aria-label="Choix du plan"
                  className="rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-1 text-sm"
                  value={plan?.id ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {plans.length === 0 ? <option value="">Aucun plan</option> : null}
                  {plans.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          {error ? (
            <p className="mx-auto max-w-7xl px-6 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <main className="mx-auto max-w-7xl px-6 py-8">
            <Routes>
              <Route path="/" element={<Summary />} />
              <Route path="/plan" element={<AnnualPlan />} />
              <Route path="/control/:controlId" element={<ControlDetail />} />
              <Route path="/references" element={<References />} />
              <Route path="/reporting" element={<Reporting />} />
              <Route path="/import" element={<Import />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </PlanContext.Provider>
  );
}
