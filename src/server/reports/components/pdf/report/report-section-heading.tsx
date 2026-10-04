import { View } from '../../../lib/pdf-primitives';
import { Text } from '../text/text';
import { usePdfcnTheme } from '../theme-provider';

export function ReportSectionHeading({
  number,
  title,
  aside,
}: {
  number: string;
  title: string;
  aside?: string;
}) {
  const theme = usePdfcnTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{ alignItems: 'center', display: 'flex', flexDirection: 'row', width: '100%' }}
      >
        <View style={{ width: 36 }}>
          <Text variant="2xl" weight="semibold" color={theme.colors.primary} noMargin>
            {number}
          </Text>
        </View>
        <Text
          variant="lg"
          weight="medium"
          color={theme.colors.foreground}
          noMargin
          style={{ marginLeft: 10 }}
        >
          — {title}
        </Text>
        {aside ? (
          <View style={{ alignItems: 'flex-end', marginLeft: 'auto', width: 230 }}>
            <Text
              variant="xs"
              weight="semibold"
              color={theme.colors.mutedForeground}
              align="right"
              noMargin
              style={{ display: 'block', width: '100%' }}
            >
              {aside}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: theme.colors.accent,
          height: 3,
          marginTop: 8,
          width: 36,
        }}
      />
    </View>
  );
}
