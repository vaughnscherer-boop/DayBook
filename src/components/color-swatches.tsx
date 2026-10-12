import { Pressable, StyleSheet, View } from 'react-native';

import { EventColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string | null;
  onChange: (color: string) => void;
  size?: number;
};

/** A wrap of preset color dots; the selected one gets a ring. */
export function ColorSwatches({ value, onChange, size = 28 }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
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
              { width: size + 6, height: size + 6, borderRadius: size, borderColor: selected ? theme.text : 'transparent' },
            ]}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
