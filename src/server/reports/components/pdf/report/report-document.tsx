import type { ReportDto } from '../../../../domain/report';
import { Document, Page, View } from '../../../lib/pdf-primitives';
import { PageNumber } from '../page-number/page-number';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';
import { ReportDetails } from './report-details';
import { ReportSummary } from './report-summary';
import { ReportTable } from './report-table';
import {
  reportTocSections,
  ReportContents,
  type ReportSectionKey,
} from './report-contents';
import { ReportCover } from './report-cover';

export function CenturionReportDocument({
  report,
  tocPages,
}: {
  report: ReportDto;
  tocPages: Partial<Record<ReportSectionKey, number>>;
}) {
  return (
    <Document title={`Rapport CENTURION — ${report.plan.name}`}>
      <Page>
        <ReportCover report={report} />
        <View break>
          <ReportContents report={report} pageNumbers={tocPages} />
        </View>
      <View break>
        <ReportSummary report={report} />
      </View>
      <View break>
        <ReportTable report={report} />
      </View>
      {reportTocSections(report).some((section) => section.key === 'details') ? (
        <View break>
          <ReportDetails report={report} />
        </View>
      ) : null}
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
        borderTop: `1pt solid ${theme.colors.primary}`,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 36,
        paddingTop: theme.spacing.paragraphGap,
        width: '100%',
      }}
    >
      <Text
        variant="xs"
        color={theme.colors.foreground}
        weight="medium"
        noMargin
        style={{ width: '68%' }}
      >
        CENTURION · Rapport de conformité — Ne constitue pas une opinion d’assurance.
      </Text>
      <View style={{ width: '25%' }}>
        <PageNumber
          format="Page {page} / {total}"
          align="right"
          size="xs"
          muted={false}
          style={{ color: theme.colors.primary, fontWeight: 600 }}
        />
      </View>
    </View>
  );
}
