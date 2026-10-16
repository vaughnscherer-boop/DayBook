import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EventColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string | null;
  onChange: (color: string) => void;
  size?: number;
};

const GAP = Spacing.one;
const RING = 6; // the selection ring's 2px border and 1px air, on both sides

/** One row of preset color dots, shrunk to fit the width; the selected one gets a ring. */
export function ColorSwatches({ value, onChange, size: largest = 28 }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const count = EventColors.length;
  // Fit every color on one line rather than leaving one alone on a second row.
  const size = width ? Math.min(largest, Math.floor((width - GAP * (count - 1)) / count) - RING) : largest;
  return (
    <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {EventColors.map((color) => {
        const selected = value?.toLowerCase() === color.toLowerCase();
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityLabel={`Color ${color}`}
            accessibilityState={{ selected }}
            hitSlop={4}
            style={[
              styles.ring,
              { width: size + RING, height: size + RING, borderRadius: size, borderColor: selected ? theme.text : 'transparent' },
            ]}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: GAP },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
