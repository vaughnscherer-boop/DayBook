import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { ClassCards } from '@/components/home/class-cards';
import { OverviewTiles, type Tile } from '@/components/home/overview-tiles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { MenuButton } from '@/components/ui/menu-button';
import { EventColors, Spacing } from '@/constants/theme';
import { getSettings } from '@/db/settings';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { shiftKey, todayKey } from '@/lib/dates';
import { filterItems, loadRange, rangeDays, RANGES, sparkline, todayItems, type OverviewRange } from '@/lib/overview';
import { getSyncStatus, subscribeSyncStatus } from '@/lib/sync';

/** How far ahead Home looks for each class's next meeting and counts. */
const CLASS_LOOKAHEAD_DAYS = 60;

function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** "vaughn.scherer@…" → "Vaughn". */
function firstName(email: string) {
  const word = email.split('@')[0].split(/[._\-+\d]/)[0];
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}

/** Home: a greeting, the Overview tiles and your classes. */
export default function HomeScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  // First launch on this device shows the intro.
  useEffect(() => {
    getSettings(db).then((settings) => {
      if (!settings.onboardingDone) router.push('/onboarding');
    });
  }, [db]);
  // `/?add=tomorrow` came from night notifications scheduled before the check-in screen existed.
  const params = useLocalSearchParams<{ add?: string }>();
  useEffect(() => {
    if (params.add === 'tomorrow') router.navigate('/tomorrow');
  }, [params.add]);

  const tabBarSpace = useTabBarSpace();
  const { itemsBetween, groups, classes, activeGroupIds, reload } = useCalendarData();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const [range, setRange] = useState<OverviewRange>('week');
  const days = rangeDays(range);
  const today = todayKey();

  const [start, end] = loadRange(today, CLASS_LOOKAHEAD_DAYS);
  const items = itemsBetween(start, end);

  const name = 'email' in status ? firstName(status.email) : '';
  const overdue = filterItems(items, 'overdue', today, days);
  const openTasks = (filter: 'due' | 'tests' | 'open') =>
    router.push({ pathname: '/tasks', params: { filter, range } });

  const todayList = todayItems(items, today);
  const due = filterItems(items, 'due', today, days);
  const tests = filterItems(items, 'tests', today, days);
  const open = filterItems(items, 'open', today, days);
  const tiles: Tile[] = [
    {
      key: 'today',
      label: 'Today',
      count: todayList.length,
      color: EventColors[0],
      bars: sparkline(itemsBetween(today, shiftKey(today, days - 1)), today, days),
      onPress: () => router.navigate('/today'),
    },
    { key: 'due', label: 'Due soon', count: due.length, color: EventColors[1], bars: sparkline(due, today, days), onPress: () => openTasks('due') },
    { key: 'tests', label: 'Tests', count: tests.length, color: EventColors[5], bars: sparkline(tests, today, days), onPress: () => openTasks('tests') },
    { key: 'open', label: 'Tasks', count: open.length, color: EventColors[3], bars: sparkline(open, today, days), onPress: () => openTasks('open') },
  ];

  const classIds = useMemo(() => new Set(classes.map((c) => c.groupId)), [classes]);
  const upcoming = useMemo(() => items.filter((item) => item.startDay >= today), [items, today]);
  const rangeLabel = RANGES.find((r) => r.value === range)!.label;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace + Spacing.three }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={[styles.avatar, { backgroundColor: theme.accent }]}>
              {name ? (
                <ThemedText style={[styles.initial, { color: theme.onAccent }]}>{name[0]}</ThemedText>
              ) : (
                <Icon name="settings" size={20} color={theme.onAccent} />
              )}
            </Pressable>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">
                {greeting(new Date())}
              </ThemedText>
              <ThemedText style={styles.name} numberOfLines={1}>
                {name || 'Welcome back'}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: '/tasks', params: { filter: 'overdue' } })}
              accessibilityRole="button"
              accessibilityLabel={`${overdue.length} overdue tasks`}
              style={[styles.bell, { borderColor: theme.backgroundSelected }]}>
              <Icon name="bell" size={19} color={theme.text} />
              {overdue.length > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                  <ThemedText style={styles.badgeText}>{overdue.length}</ThemedText>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.sectionHead}>
            <ThemedText style={styles.sectionTitle}>Overview</ThemedText>
            <MenuButton
              accessibilityLabel="Change range"
              items={RANGES.map((r) => ({ label: r.label, onPress: () => setRange(r.value) }))}>
              <View style={[styles.dropdown, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="small">{rangeLabel}</ThemedText>
                <Icon name="expand" size={12} weight="semibold" color={theme.text} />
              </View>
            </MenuButton>
          </View>
          <OverviewTiles tiles={tiles} />

          <View style={styles.sectionHead}>
            <ThemedText style={styles.sectionTitle}>Classes</ThemedText>
          </View>
          <ClassCards
            groups={groups}
            classIds={classIds}
            activeIds={activeGroupIds}
            upcoming={upcoming}
            onChanged={reload}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 4, marginBottom: Spacing.two },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 19, fontWeight: 800 },
  flex: { flex: 1 },
  name: { fontSize: 20, lineHeight: 25, fontWeight: 800, letterSpacing: -0.3 },
  bell: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: 800 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  sectionTitle: { fontSize: 24, lineHeight: 30, fontWeight: 800, letterSpacing: -0.5 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
});
