import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Input } from '@/components/ui/input';

type SearchResult = {
  control_id: string;
  plan_id: string;
  plan_year: number;
  plan_name: string;
  code: string;
  title: string;
  status: string;
};

export function Search() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    api.get<SearchResult[]>('/api/search', { q }).then(setResults).catch(() => setResults([]));
  }, [q]);

  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Recherche globale</h1>
      <Input
        aria-label="Recherche"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Code, titre, description"
      />
      <div className="panel">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Titre</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.control_id} className="border-t border-[var(--color-border-brand)]">
                <td className="px-3 py-2">
                  <Link className="text-[var(--color-brand-primary)] hover:underline" to={`/control/${result.control_id}`}>
                    {result.code}
                  </Link>
                </td>
                <td className="px-3 py-2">{result.title}</td>
                <td className="px-3 py-2">{result.plan_name}</td>
                <td className="px-3 py-2">{result.status}</td>
              </tr>
            ))}
            {results.length === 0 && q.trim() !== '' ? (
              <tr>
                <td className="px-3 py-4 text-[var(--color-text-secondary)]" colSpan={4}>
                  Aucun résultat pour cette recherche.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}