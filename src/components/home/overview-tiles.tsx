import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tint } from '@/lib/calendar-items';

export type Tile = { key: string; label: string; count: number; color: string; bars: number[]; onPress: () => void };

/** Seven little bars: how the tile's items spread over the coming days. */
function Sparkline({ bars, color }: { bars: number[]; color: string }) {
  const max = Math.max(1, ...bars);
  return (
    <View style={styles.spark}>
      {bars.map((value, i) => (
        <View
          key={i}
          style={[styles.bar, { height: 4 + (value / max) * 22, backgroundColor: value > 0 ? color : tint(color, 0.3) }]}
        />
      ))}
    </View>
  );
}

/** The 2×2 Overview grid on Home: a big count, a label, a sparkline and a chevron per tile. */
export function OverviewTiles({ tiles }: { tiles: Tile[] }) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <PressableScale
          key={tile.key}
          onPress={tile.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${tile.count} ${tile.label}`}
          style={[styles.tile, { backgroundColor: tint(tile.color, 0.2), borderColor: tint(tile.color, 0.35) }]}>
          <View style={styles.top}>
            <ThemedText style={styles.count}>{tile.count}</ThemedText>
            <Sparkline bars={tile.bars} color={tile.color} />
          </View>
          <View style={styles.bottom}>
            <ThemedText type="smallBold">{tile.label}</ThemedText>
            <Icon name="forward" size={13} weight="semibold" color={theme.text} />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two + 2 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  count: { fontSize: 30, lineHeight: 34, fontWeight: 800, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 },
  bar: { width: 4, borderRadius: 2 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
