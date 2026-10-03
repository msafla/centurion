const percentFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return percentFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export const REFERENTIEL_LABELS: Record<string, string> = {
  iso_27001: 'ISO 27001',
  isae_3402_t2: 'ISAE 3402 Type 2',
  iso_27001_isae_3402_t2: 'ISO 27001 + ISAE 3402 Type 2',
};

export const CONFORMITE_LABELS: Record<string, string> = {
  conforme: 'Conforme',
  partiellement_conforme: 'Partiellement conforme',
  non_conforme: 'Non conforme',
  non_applicable: 'Non applicable',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  once: 'Ponctuel',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  annual: 'Annuel',
  explicit: 'Dates explicites',
};
