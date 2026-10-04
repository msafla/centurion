import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { filtersLabel } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

function generatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
}

export function ReportCover({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.info,
        display: 'flex',
        flexDirection: 'column',
        height: 480,
        justifyContent: 'space-between',
        padding: 30,
        width: '100%',
      }}
    >
      <View style={{ alignItems: 'center', display: 'flex', flexDirection: 'row' }}>
        <Text variant="lg" weight="semibold" color={theme.colors.primaryForeground} noMargin>
          CENTURION
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.accent,
            height: 4,
            marginLeft: 12,
            width: 34,
          }}
        />
        <Text
          variant="xs"
          weight="medium"
          color={theme.colors.primaryForeground}
          style={{ marginLeft: 'auto' }}
          noMargin
        >
          RAPPORT DE CONFORMITÉ
        </Text>
      </View>

      <View style={{ marginTop: 44 }}>
        <Text variant="xs" weight="semibold" color={theme.colors.accent}>
          PILOTAGE ANNUEL DES CONTRÔLES
        </Text>
        <Text variant="3xl" weight="semibold" color={theme.colors.primaryForeground} noMargin>
          Rapport annuel de conformité
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.primary,
            height: 3,
            marginBottom: 18,
            marginTop: 18,
            width: 54,
          }}
        />
        <Text variant="2xl" weight="medium" color={theme.colors.primaryForeground} noMargin>
          {report.plan.name}
        </Text>
        <Text variant="xl" color={theme.colors.primaryForeground} noMargin>
          Exercice {report.plan.year}
        </Text>
      </View>

      <View
        style={{
          borderTop: `0.5pt solid ${theme.colors.primaryForeground}55`,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingTop: 12,
        }}
      >
        <View>
          <Text variant="xs" color={theme.colors.primaryForeground} noMargin>
            Généré le {generatedDate(report.generated_at)}
          </Text>
          <Text variant="xs" color={theme.colors.primaryForeground} noMargin>
            {report.plan.perimeter || 'Périmètre : non précisé'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '48%', width: '48%' }}>
          <Text
            variant="xs"
            color={theme.colors.accent}
            weight="semibold"
            align="right"
            noMargin
            style={{ display: 'block', width: '100%' }}
          >
            {report.rows.total} OCCURRENCES
          </Text>
          <Text
            variant="xs"
            color={theme.colors.primaryForeground}
            align="right"
            noMargin
            style={{ display: 'block', width: '100%' }}
          >
            Filtres :{' '}
            {filtersLabel(report.filters) === 'aucun'
              ? 'aucun (toutes les occurrences)'
              : filtersLabel(report.filters)}
          </Text>
        </View>
      </View>
    </View>
  );
}
