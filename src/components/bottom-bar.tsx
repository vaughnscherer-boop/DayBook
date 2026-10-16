import { router } from 'expo-router';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tap } from '@/lib/haptics';

const BAR_HEIGHT = 64;
const BAR_GAP = 8;

/** Space a tab screen leaves at the bottom so its content can scroll clear of the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + BAR_GAP * 2 + Math.max(insets.bottom - BAR_GAP, 0);
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; focusedIcon: IconName; label: string };

function TabButton({ icon, focusedIcon, label, isFocused, onPress, ...rest }: TabButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (!isFocused) tap();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      hitSlop={6}
      style={styles.tab}>
      <Icon
        fixed
        name={isFocused ? focusedIcon : icon}
        // Calendar has no filled symbol, so the selected tab also gets a heavier stroke.
        weight={isFocused ? 'semibold' : 'medium'}
        size={23}
        color={isFocused ? theme.accent : theme.textSecondary} />
      <View style={[styles.indicator, { backgroundColor: isFocused ? theme.accent : 'transparent' }]} />
    </Pressable>
  );
}

/** Floating tab bar: Home · Brief · + · New tasks (the night check-in) · Calendar. The + opens quick add. */
export function BottomBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - BAR_GAP, 0) + BAR_GAP }]}>
      <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
        <TabTrigger name="home" asChild>
          <TabButton icon="home" focusedIcon="homeFilled" label="Home" />
        </TabTrigger>
        <TabTrigger name="today" asChild>
          <TabButton icon="brief" focusedIcon="briefFilled" label="Today's brief" />
        </TabTrigger>
        <PressableScale
          onPress={() => {
            tap();
            router.push('/new');
          }}
          accessibilityRole="button"
          accessibilityLabel="Add an event or task"
          style={[styles.add, { backgroundColor: theme.accent }]}>
          <Icon fixed name="add" size={26} weight="semibold" color={theme.onAccent} />
        </PressableScale>
        <TabTrigger name="tomorrow" asChild>
          <TabButton icon="moon" focusedIcon="moonFilled" label="New tasks" />
        </TabTrigger>
        <TabTrigger name="calendar" asChild>
          <TabButton icon="calendar" focusedIcon="calendarFilled" label="Calendar" />
        </TabTrigger>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.three },
  bar: {
    width: '100%',
    maxWidth: 440,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.two,
    boxShadow: Shadow.floating,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 5 },
  indicator: { width: 4, height: 4, borderRadius: 2 },
  add: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginHorizontal: Spacing.one },
});
