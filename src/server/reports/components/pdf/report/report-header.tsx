import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { filtersLabel } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

export function ReportHeader({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  return (
    <View style={{ marginBottom: theme.spacing.sectionGap }}>
      <Text variant="2xl" weight="semibold" color={theme.colors.primary}>
        Rapport CENTURION
      </Text>
      <Text variant="lg" color={theme.colors.foreground}>
        {report.plan.name}
      </Text>
      <Text variant="xs" color={theme.colors.mutedForeground}>
        Généré le {report.generated_at} · {report.rows.total} occurrence(s) · filtres :{' '}
        {filtersLabel(report.filters)}
      </Text>
    </View>
  );
}

/** Small band repeated at the top of every page. */
export function ReportPageHeader({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  return (
    <View style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
      <Text variant="xs" color={theme.colors.primary} weight="medium">
        CENTURION
      </Text>
      <Text variant="xs" color={theme.colors.mutedForeground}>
        {'  ·  '}
        {report.plan.name}
      </Text>
    </View>
  );
}
