import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { conformiteLabel, outcomeLabel } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

export function ReportDetails({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const withDetails = report.rows.items.filter(
    (occurrence) =>
      occurrence.realization &&
      (occurrence.realization.comment !== '' || occurrence.realization.evidence_ref),
  );
  if (withDetails.length === 0) return null;

  return (
    <View>
      <Text variant="lg" weight="medium">
        Détails des réalisations
      </Text>
      {withDetails.map((occurrence) => (
        <View
          key={occurrence.id}
          style={{
            borderTop: `0.5pt solid ${theme.colors.border}`,
            marginTop: theme.spacing.componentGap,
            paddingTop: theme.spacing.paragraphGap,
          }}
        >
          <Text variant="sm" weight="semibold" color={theme.colors.primary} noMargin>
            {occurrence.control.code} — {occurrence.occurrence_date} · {outcomeLabel(occurrence)}
          </Text>
          {occurrence.realization?.fait ? (
            <Text variant="xs" color={theme.colors.mutedForeground} noMargin>
              Conformité : {conformiteLabel(occurrence.realization.conformite)}
            </Text>
          ) : null}
          {occurrence.realization?.comment ? (
            <Text variant="xs" color={theme.colors.foreground}>
              Commentaire : {occurrence.realization.comment}
            </Text>
          ) : null}
          {occurrence.realization?.evidence_ref ? (
            <Text variant="xs" color={theme.colors.foreground}>
              Preuve obtenue : {occurrence.realization.evidence_ref}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
