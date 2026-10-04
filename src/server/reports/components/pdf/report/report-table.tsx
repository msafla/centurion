import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { conformiteLabel, faitLabel, referentialsLabel } from '../../../lib/report-labels';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../table/table';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';
import { ReportSectionHeading } from './report-section-heading';

function HeaderLabel({
  children,
  align = 'left',
}: {
  children: string;
  align?: 'center' | 'left';
}) {
  const theme = usePdfcnTheme();
  return (
    <Text
      variant="xs"
      weight="semibold"
      color={theme.colors.primaryForeground}
      align={align}
      noMargin
      style={{ display: 'block', width: '100%' }}
    >
      {children}
    </Text>
  );
}

export function ReportTable({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const rows = report.rows.items;
  return (
    <View
      style={{
        alignSelf: 'center',
        marginBottom: theme.spacing.sectionGap,
        width: 770,
      }}
    >
      <ReportSectionHeading number="02" title="Occurrences" />
      {rows.length === 0 ? (
        <Text variant="sm" color={theme.colors.mutedForeground}>
          Aucune occurrence pour ces filtres.
        </Text>
      ) : (
        <Table variant="primary-header" zebraStripe>
          <TableHeader>
            <TableRow header>
              <TableCell header width={96}>
                <HeaderLabel>Référentiel</HeaderLabel>
              </TableCell>
              <TableCell header width={70} align="center">
                <HeaderLabel align="center">Référence</HeaderLabel>
              </TableCell>
              <TableCell header>
                <HeaderLabel>Code / titre</HeaderLabel>
              </TableCell>
              <TableCell header width={62} align="center">
                <HeaderLabel align="center">Fréquence</HeaderLabel>
              </TableCell>
              <TableCell header width={34} align="center">
                <HeaderLabel align="center">Auto</HeaderLabel>
              </TableCell>
              <TableCell header width={120} align="center">
                <HeaderLabel align="center">Date</HeaderLabel>
              </TableCell>
              <TableCell header width={34} align="center">
                <HeaderLabel align="center">FAIT</HeaderLabel>
              </TableCell>
              <TableCell header width={96} align="center">
                <HeaderLabel align="center">Conformité</HeaderLabel>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((occurrence) => (
              <TableRow key={occurrence.id}>
                <TableCell width={96}>{referentialsLabel(occurrence.control.referentials)}</TableCell>
                <TableCell width={70} align="center">
                  {occurrence.control.reference}
                </TableCell>
                <TableCell>
                  {occurrence.control.code} — {occurrence.control.title}
                </TableCell>
                <TableCell width={62} align="center">
                  {occurrence.control.schedule.kind}
                </TableCell>
                <TableCell width={34} align="center">
                  {occurrence.control.automated ? 'Oui' : 'Non'}
                </TableCell>
                <TableCell width={120} align="center">
                  {occurrence.occurrence_date}
                </TableCell>
                <TableCell width={34} align="center">
                  {faitLabel(occurrence)}
                </TableCell>
                <TableCell width={96} align="center">
                  {occurrence.state === 'completed' && occurrence.realization?.fait
                    ? conformiteLabel(occurrence.realization.conformite)
                    : occurrence.state === 'completed'
                      ? 'Non applicable'
                      : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length > 0 && rows.length < report.rows.total ? (
        <Text variant="xs" color={theme.colors.mutedForeground}>
          {rows.length} ligne(s) affichée(s) sur {report.rows.total}.
        </Text>
      ) : null}
    </View>
  );
}
