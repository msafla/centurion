import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { conformiteLabel, faitLabel, referentialsLabel } from '../../../lib/report-labels';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../table/table';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

export function ReportTable({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const rows = report.rows.items;
  return (
    <View style={{ marginBottom: theme.spacing.sectionGap }}>
      <Text variant="lg" weight="medium">
        Occurrences
      </Text>
      {rows.length === 0 ? (
        <Text variant="sm" color={theme.colors.mutedForeground}>
          Aucune occurrence pour ces filtres.
        </Text>
      ) : (
        <Table variant="line" zebraStripe>
          <TableHeader>
            <TableRow header>
              <TableCell header width={96}>
                Référentiel
              </TableCell>
              <TableCell header width={70}>
                Référence
              </TableCell>
              <TableCell header>Code / titre</TableCell>
              <TableCell header width={62}>
                Fréquence
              </TableCell>
              <TableCell header width={34}>
                Auto
              </TableCell>
              <TableCell header width={62}>
                Date
              </TableCell>
              <TableCell header width={34}>
                FAIT
              </TableCell>
              <TableCell header width={96}>
                Conformité
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((occurrence) => (
              <TableRow key={occurrence.id}>
                <TableCell>{referentialsLabel(occurrence.control.referentials)}</TableCell>
                <TableCell>{occurrence.control.reference}</TableCell>
                <TableCell>
                  {occurrence.control.code} — {occurrence.control.title}
                </TableCell>
                <TableCell>{occurrence.control.schedule.kind}</TableCell>
                <TableCell>{occurrence.control.automated ? 'Oui' : 'Non'}</TableCell>
                <TableCell>{occurrence.occurrence_date}</TableCell>
                <TableCell>{faitLabel(occurrence)}</TableCell>
                <TableCell>
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
