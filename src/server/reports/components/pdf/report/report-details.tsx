import type { OccurrenceDto } from '../../../../../shared/schemas';
import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { conformiteLabel, outcomeLabel } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';
import { ReportSectionHeading } from './report-section-heading';

function resultColor(occurrence: OccurrenceDto, colors: ReturnType<typeof usePdfcnTheme>['colors']) {
  if (!occurrence.realization?.fait) return colors.destructive;
  switch (occurrence.realization.conformite) {
    case 'conforme':
      return colors.success;
    case 'partiellement_conforme':
      return colors.warning;
    case 'non_conforme':
      return colors.destructive;
    case 'non_applicable':
      return colors.primary;
  }
}

function DetailLabel({ children }: { children: string }) {
  const theme = usePdfcnTheme();
  return (
    <Text
      variant="xs"
      color={theme.colors.mutedForeground}
      weight="semibold"
      noMargin
      style={{ display: 'block', width: '100%' }}
    >
      {children}
    </Text>
  );
}

export function ReportDetails({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const withDetails = report.rows.items.filter(
    (occurrence) =>
      occurrence.realization &&
      (occurrence.realization.comment !== '' || occurrence.realization.evidence_ref),
  );
  if (withDetails.length === 0) return null;

  return (
    <View style={{ alignSelf: 'center', width: 770 }}>
      <ReportSectionHeading
        number="03"
        title="Détails des réalisations"
        aside={`DOSSIER DE CONTRÔLE · ${withDetails.length} FICHE${withDetails.length > 1 ? 'S' : ''}`}
      />

      <View style={{ alignSelf: 'center', width: 720 }}>
        {withDetails.map((occurrence) => {
        const statusColor = resultColor(occurrence, theme.colors);
        const realizationTextLength =
          (occurrence.realization?.comment.length ?? 0) +
          (occurrence.realization?.evidence_ref?.length ?? 0);
        const keepTogether = realizationTextLength < 420;
        return (
          <View
            key={occurrence.id}
            wrap={!keepTogether}
            style={{
              backgroundColor: theme.colors.muted,
              border: `0.5pt solid ${theme.colors.border}`,
              borderLeft: `4pt solid ${statusColor}`,
              borderRadius: theme.primitives.borderRadius.md,
              display: 'flex',
              flexDirection: 'row',
              gap: 14,
              marginBottom: 12,
              padding: 12,
            }}
          >
            <View
              style={{
                borderRight: `0.5pt solid ${theme.colors.border}`,
                paddingRight: 12,
                width: 168,
              }}
            >
              <DetailLabel>CONTRÔLE</DetailLabel>
              <Text variant="2xl" weight="semibold" color={theme.colors.primary} noMargin>
                {occurrence.control.code}
              </Text>
              <View style={{ marginTop: 10 }}>
                <DetailLabel>ÉCHÉANCE</DetailLabel>
                <Text variant="sm" weight="medium" color={theme.colors.foreground} noMargin>
                  {occurrence.occurrence_date}
                </Text>
              </View>
              <View style={{ marginTop: 10 }}>
                <DetailLabel>RÉSULTAT</DetailLabel>
                <Text variant="sm" weight="semibold" color={statusColor}>
                  {outcomeLabel(occurrence)}
                </Text>
              </View>
            </View>

            <View style={{ flex: 1 }}>
              {occurrence.realization?.comment ? (
                <View style={{ marginBottom: theme.spacing.paragraphGap }}>
                  <DetailLabel>COMMENTAIRE</DetailLabel>
                  <Text variant="sm" color={theme.colors.foreground}>
                    {occurrence.realization.comment}
                  </Text>
                </View>
              ) : null}
              {occurrence.realization?.evidence_ref ? (
                <View>
                  <DetailLabel>RÉFÉRENCE DE PREUVE</DetailLabel>
                  <Text variant="sm" weight="medium" color={theme.colors.foreground} noMargin>
                    {occurrence.realization.evidence_ref}
                  </Text>
                </View>
              ) : null}
              {occurrence.realization?.fait ? (
                <Text
                  variant="xs"
                  color={theme.colors.mutedForeground}
                  style={{ marginTop: theme.spacing.paragraphGap }}
                >
                  Conformité : {conformiteLabel(occurrence.realization.conformite)}
                </Text>
              ) : null}
            </View>
          </View>
        );
        })}
      </View>
    </View>
  );
}
