import type { ReportDto } from '../../../../domain/report';
import { Document, Page, View } from '../../../lib/pdf-primitives';
import { PageNumber } from '../page-number/page-number';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';
import { ReportDetails } from './report-details';
import { ReportHeader } from './report-header';
import { ReportSummary } from './report-summary';
import { ReportTable } from './report-table';

export function CenturionReportDocument({ report }: { report: ReportDto }) {
  return (
    <Document title={`Rapport CENTURION — ${report.plan.name}`}>
      <Page>
        <ReportHeader report={report} />
        <ReportSummary report={report} />
        <ReportTable report={report} />
        <ReportDetails report={report} />
      </Page>
    </Document>
  );
}

/** Fixed footer band: legal mention and exact page numbers. */
export function ReportPageFooter() {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        borderTop: `0.5pt solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.paragraphGap,
        width: '100%',
      }}
    >
      <Text variant="xs" color={theme.colors.mutedForeground} noMargin>
        Document généré par CENTURION — ne constitue pas une opinion d'assurance.
      </Text>
      <PageNumber format="Page {page} / {total}" align="right" size="xs" />
    </View>
  );
}
