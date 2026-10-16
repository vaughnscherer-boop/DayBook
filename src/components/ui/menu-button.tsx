import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MenuItem = { label: string; icon?: IconName; destructive?: boolean; onPress: () => void };

type Props = {
  items: MenuItem[];
  accessibilityLabel: string;
  /** What you tap to open the menu. */
  children: ReactNode;
};

const MENU_WIDTH = 190;

/** A small popup menu anchored under its button (Edit / Delete, This week / This month…). */
export function MenuButton({ items, accessibilityLabel, children }: Props) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => {
      // Right-align with the button, but stay on screen.
      const left = Math.min(Math.max(x + width - MENU_WIDTH, 8), screenWidth - MENU_WIDTH - 8);
      setPosition({ top: y + height + 6, left });
    });
  const close = () => setPosition(null);

  return (
    <>
      <Pressable ref={anchor} onPress={open} hitSlop={8} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
      </Pressable>
      <Modal visible={position !== null} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
        {position && (
          <View
            style={[
              styles.menu,
              { top: position.top, left: position.left, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
            ]}>
            {items.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  close();
                  item.onPress();
                }}
                accessibilityRole="menuitem"
                style={({ pressed }) => [
                  styles.item,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.backgroundSelected },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                {item.icon && <Icon name={item.icon} size={16} color={item.destructive ? theme.danger : theme.text} />}
                <ThemedText type="smallBold" style={item.destructive ? { color: theme.danger } : undefined}>
                  {item.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: Radius.md, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    boxShadow: Shadow.raised,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, paddingHorizontal: Spacing.three, paddingVertical: Spacing.twoHalf },
});
