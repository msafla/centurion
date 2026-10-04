import type { ReportDto } from '../../../../domain/report';
import { View } from '../../../lib/pdf-primitives';
import { formatRate } from '../../../lib/report-labels';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';
import { ReportSectionHeading } from './report-section-heading';

function Count({ label, value }: { label: string; value: number }) {
  const theme = usePdfcnTheme();
  return (
    <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 8 }}>
      <Text
        variant="xl"
        weight="semibold"
        color={theme.colors.primary}
        align="center"
        noMargin
        style={{ display: 'block', width: '100%' }}
      >
        {String(value)}
      </Text>
      <Text
        variant="xs"
        color={theme.colors.mutedForeground}
        align="center"
        noMargin
        style={{ display: 'block', width: '100%' }}
      >
        {label}
      </Text>
    </View>
  );
}

function Rate({ label, value, detail }: { label: string; value: string; detail: string }) {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.muted,
        borderRadius: theme.primitives.borderRadius.md,
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text variant="xs" color={theme.colors.mutedForeground} weight="medium" noMargin>
        {label}
      </Text>
      <View style={{ alignItems: 'baseline', display: 'flex', flexDirection: 'row', gap: 8 }}>
        <Text variant="2xl" weight="medium" color={theme.colors.primary} noMargin>
          {value}
        </Text>
        <Text variant="xs" color={theme.colors.mutedForeground} noMargin>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function StatusCount({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = usePdfcnTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        border: `0.5pt solid ${theme.colors.border}`,
        borderLeft: `3pt solid ${color}`,
        borderRadius: theme.primitives.borderRadius.sm,
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
      }}
    >
      <Text variant="xl" weight="semibold" color={color} noMargin>
        {String(value)}
      </Text>
      <Text variant="xs" color={theme.colors.foreground} noMargin>
        {label}
      </Text>
    </View>
  );
}

export function ReportSummary({ report }: { report: ReportDto }) {
  const theme = usePdfcnTheme();
  const { counts, realization_rate, conformity_rate, automation_rate } = report.summary;
  return (
    <View style={{ alignSelf: 'center', marginBottom: theme.spacing.sectionGap, width: 770 }}>
      <ReportSectionHeading number="01" title="Synthèse du plan" />

      <View style={{ display: 'flex', flexDirection: 'row', gap: 14 }}>
        <View
          style={{
            backgroundColor: theme.colors.info,
            borderRadius: theme.primitives.borderRadius.md,
            justifyContent: 'center',
            paddingHorizontal: 18,
            paddingVertical: 14,
            width: 270,
          }}
        >
          <Text variant="xs" weight="semibold" color={theme.colors.accent} noMargin>
            TAUX DE RÉALISATION
          </Text>
          <Text variant="3xl" weight="medium" color={theme.colors.accent} noMargin>
            {formatRate(realization_rate)}
          </Text>
          <Text variant="xs" color={theme.colors.primaryForeground} noMargin>
            {counts.fait_true} contrôle{counts.fait_true === 1 ? '' : 's'} réalisé
            {counts.fait_true === 1 ? '' : 's'} sur {counts.total}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text variant="xs" weight="semibold" color={theme.colors.primary} noMargin>
            VUE D’ENSEMBLE
          </Text>
          <View
            style={{
              alignItems: 'center',
              borderBottom: `0.5pt solid ${theme.colors.border}`,
              borderTop: `0.5pt solid ${theme.colors.border}`,
              display: 'flex',
              flexDirection: 'row',
              marginTop: 7,
            }}
          >
            <Count label="contrôles au périmètre" value={counts.total} />
            <View style={{ backgroundColor: theme.colors.border, height: 27, width: 0.5 }} />
            <Count label="à renseigner" value={counts.open} />
            <View style={{ backgroundColor: theme.colors.border, height: 27, width: 0.5 }} />
            <Count label="réalisés" value={counts.fait_true} />
            <View style={{ backgroundColor: theme.colors.border, height: 27, width: 0.5 }} />
            <Count label="non réalisés" value={counts.fait_false} />
          </View>
        </View>
      </View>

      <View style={{ display: 'flex', flexDirection: 'row', gap: 14, marginTop: 12 }}>
        <Rate
          label="Conformité des contrôles applicables"
          value={formatRate(conformity_rate)}
          detail={`${conformity_rate.numerator}/${conformity_rate.denominator}`}
        />
        <Rate
          label="Automatisation des contrôles réalisés"
          value={formatRate(automation_rate)}
          detail={`${automation_rate.numerator}/${automation_rate.denominator}`}
        />
      </View>

      <Text
        variant="xs"
        weight="semibold"
        color={theme.colors.primary}
        noMargin
        style={{ marginBottom: 6, marginTop: 12 }}
      >
        RÉSULTATS PAR STATUT
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <StatusCount label="Conforme(s)" value={counts.conforme} color={theme.colors.success} />
        <StatusCount
          label="Partiellement conforme(s)"
          value={counts.partiellement_conforme}
          color={theme.colors.warning}
        />
        <StatusCount
          label="Non conforme(s)"
          value={counts.non_conforme}
          color={theme.colors.destructive}
        />
        <StatusCount
          label="Non applicable(s)"
          value={counts.non_applicable}
          color={theme.colors.primary}
        />
      </View>
    </View>
  );
}
