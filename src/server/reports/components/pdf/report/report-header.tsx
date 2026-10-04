import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

/** Small band repeated at the top of every page. */
export function ReportPageHeader({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        display: 'flex',
        flexDirection: 'row',
        paddingHorizontal: 36,
        paddingTop: 7,
        width: '100%',
      }}
    >
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
