import type { FilterInput, OccurrenceDto } from '../../../shared/schemas';
import type { ReportDto } from '../../domain/report';

/** Presentation-only labels. Canonical values are never altered. */
const CONFORMITE_LABELS: Record<string, string> = {
  conforme: 'Conforme',
  partiellement_conforme: 'Partiellement conforme',
  non_conforme: 'Non conforme',
  non_applicable: 'Non applicable',
};

const KNOWN_REFERENTIALS: Record<string, string> = {
  iso_27001: 'ISO 27001',
  isae_3402_t2: 'ISAE 3402 Type 2',
  pci_dss: 'PCI DSS',
  soc_2: 'SOC 2',
};

export function conformiteLabel(conformite: string | null): string {
  if (!conformite) return '—';
  return CONFORMITE_LABELS[conformite] ?? conformite;
}

export function referentialLabel(slug: string): string {
  if (KNOWN_REFERENTIALS[slug]) return KNOWN_REFERENTIALS[slug];
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function referentialsLabel(slugs: string[]): string {
  return slugs.length > 0 ? slugs.map(referentialLabel).join(' + ') : '—';
}

export function faitLabel(occurrence: OccurrenceDto): string {
  if (occurrence.state !== 'completed') return '—';
  return occurrence.realization?.fait ? 'Oui' : 'Non';
}

export function outcomeLabel(occurrence: OccurrenceDto): string {
  if (occurrence.state === 'open') return 'À renseigner';
  if (occurrence.state === 'superseded') return 'Supplantée';
  if (!occurrence.realization) return 'Renseigné';
  if (!occurrence.realization.fait) return 'Non réalisé';
  return conformiteLabel(occurrence.realization.conformite);
}

export function formatRate(rate: { value: number | null }): string {
  if (rate.value === null) return '—';
  return `${(rate.value * 100).toFixed(1).replace('.', ',')} %`;
}

export function filtersLabel(filters: FilterInput): string {
  const parts: string[] = [];
  if (filters.referentiel) parts.push(`référentiel ${referentialLabel(filters.referentiel)}`);
  if (filters.domain) parts.push(`domaine ${filters.domain}`);
  if (filters.owner_name) parts.push(`responsable ${filters.owner_name}`);
  if (filters.automated !== undefined) parts.push(filters.automated ? 'automatisés' : 'non automatisés');
  if (filters.fait) parts.push(`fait ${filters.fait}`);
  if (filters.conformite) parts.push(`conformité ${conformiteLabel(filters.conformite)}`);
  if (filters.state) parts.push(`état ${filters.state}`);
  if (filters.date_from) parts.push(`du ${filters.date_from}`);
  if (filters.date_to) parts.push(`au ${filters.date_to}`);
  if (filters.search) parts.push(`recherche « ${filters.search} »`);
  return parts.length > 0 ? parts.join(' · ') : 'aucun';
}

export function reportTitle(report: ReportDto): string {
  return `Rapport CENTURION — ${report.plan.name}`;
}
