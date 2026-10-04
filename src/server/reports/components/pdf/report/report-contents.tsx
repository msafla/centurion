import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

export type ReportSectionKey = 'summary' | 'occurrences' | 'details';

export type ReportTocSection = {
  key: ReportSectionKey;
  title: string;
  marker: string;
};

export function reportTocSections(report: ReportDto): ReportTocSection[] {
  const sections: ReportTocSection[] = [
    { key: 'summary', title: 'Synthèse du plan', marker: '01 — Synthèse du plan' },
    { key: 'occurrences', title: 'Occurrences', marker: '02 — Occurrences' },
  ];
  const hasDetails = report.rows.items.some(
    (occurrence) =>
      occurrence.realization &&
      (occurrence.realization.comment !== '' || occurrence.realization.evidence_ref),
  );
  if (hasDetails) {
    sections.push({
      key: 'details',
      title: 'Détails des réalisations',
      marker: 'DOSSIER DE CONTRÔLE',
    });
  }
  return sections;
}

export function ReportContents({
  report,
  pageNumbers,
}: {
  report: ReportDto;
  pageNumbers: Partial<Record<ReportSectionKey, number>>;
}) {
  const theme = usePdfcnTheme();
  const sections = reportTocSections(report);
  return (
    <View style={{ alignSelf: 'center', paddingTop: 132, width: 560 }}>
      <Text variant="xs" color={theme.colors.primary} weight="semibold">
        RAPPORT CENTURION · EXERCICE {report.plan.year}
      </Text>
      <Text variant="3xl" weight="medium" color={theme.colors.foreground}>
        Sommaire
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.accent,
          height: 3,
          marginBottom: 22,
          width: 42,
        }}
      />
      {sections.map((section, index) => (
        <View
          key={section.key}
          style={{
            alignItems: 'center',
            borderBottom: `0.5pt solid ${theme.colors.border}`,
            display: 'flex',
            flexDirection: 'row',
            paddingVertical: 13,
          }}
        >
          <Text variant="sm" color={theme.colors.primary} weight="semibold" noMargin>
            {String(index + 1).padStart(2, '0')}
          </Text>
          <Text
            variant="sm"
            color={theme.colors.foreground}
            weight="medium"
            style={{ marginLeft: 14 }}
            noMargin
          >
            {section.title}
          </Text>
          <Text
            variant="sm"
            color={theme.colors.mutedForeground}
            align="right"
            style={{ marginLeft: 'auto', width: 34 }}
            noMargin
          >
            {pageNumbers[section.key] ?? ''}
          </Text>
        </View>
      ))}
      <Text variant="xs" color={theme.colors.mutedForeground} style={{ marginTop: 20 }}>
        Les numéros indiquent la première page de chaque section.
      </Text>
    </View>
  );
}
