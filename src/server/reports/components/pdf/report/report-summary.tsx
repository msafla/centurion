import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { formatRate } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

function Metric({ label, value }: { label: string; value: string }) {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.muted,
        borderRadius: theme.primitives.borderRadius.md,
        padding: theme.primitives.spacing[2],
        width: 110,
      }}
    >
      <Text variant="xs" color={theme.colors.mutedForeground} noMargin>
        {label}
      </Text>
      <Text variant="xl" color={theme.colors.foreground} weight="semibold" noMargin>
        {value}
      </Text>
    </View>
  );
}

export function ReportSummary({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const { counts, realization_rate, conformity_rate, automation_rate } = report.summary;
  return (
    <View style={{ marginBottom: theme.spacing.sectionGap }}>
      <Text variant="lg" weight="medium">
        Synthèse
      </Text>
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: theme.spacing.componentGap,
          marginTop: theme.spacing.paragraphGap,
        }}
      >
        <Metric label="Total" value={String(counts.total)} />
        <Metric label="À renseigner" value={String(counts.open)} />
        <Metric label="Réalisés" value={String(counts.fait_true)} />
        <Metric label="Non réalisés" value={String(counts.fait_false)} />
      </View>
      <Text variant="xs" color={theme.colors.mutedForeground}>
        Réalisation : {formatRate(realization_rate)} ({realization_rate.numerator}/
        {realization_rate.denominator}) · Conformité : {formatRate(conformity_rate)} (
        {conformity_rate.numerator}/{conformity_rate.denominator}) · Automatisation :{' '}
        {formatRate(automation_rate)} ({automation_rate.numerator}/{automation_rate.denominator})
      </Text>
      <Text variant="xs" color={theme.colors.mutedForeground}>
        Conformités (FAIT Oui) : conformes {counts.conforme} · partiellement{' '}
        {counts.partiellement_conforme} · non conformes {counts.non_conforme} · non applicables{' '}
        {counts.non_applicable}
      </Text>
    </View>
  );
}
