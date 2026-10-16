import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { AskBox } from '@/components/home/ask-box';
import { LoadMeter } from '@/components/home/load-meter';
import { NextClassCard } from '@/components/next-class-card';
import { ClassCards } from '@/components/home/class-cards';
import { OverviewTiles, type Tile } from '@/components/home/overview-tiles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { MenuButton } from '@/components/ui/menu-button';
import { EventColors, Radius, Shadow, Spacing } from '@/constants/theme';
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
  const { itemsBetween, groups, classes, activeGroupIds, grades, reload } = useCalendarData();
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
              style={[styles.circle, { backgroundColor: theme.backgroundElement }]}>
              {name ? (
                <ThemedText style={styles.initial}>{name[0]}</ThemedText>
              ) : (
                <Icon name="settings" size={20} color={theme.text} />
              )}
            </Pressable>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">
                {greeting(new Date())}
              </ThemedText>
              <ThemedText style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {name || 'Welcome back'}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: '/tasks', params: { filter: 'overdue' } })}
              accessibilityRole="button"
              accessibilityLabel={`${overdue.length} overdue tasks`}
              style={[styles.circle, { backgroundColor: theme.backgroundElement }]}>
              {/* A clock, not a bell: it opens what's overdue, not notifications. */}
              <Icon name="clock" size={20} color={theme.text} />
              {overdue.length > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                  <ThemedText style={styles.badgeText}>{overdue.length}</ThemedText>
                </View>
              )}
            </Pressable>
          </View>

          <AskBox items={items} groups={groups} today={today} />
          <NextClassCard items={items} groups={groups} />

          <View style={styles.sectionHead}>
            <ThemedText type="heading">Overview</ThemedText>
            <MenuButton
              accessibilityLabel={`Range: ${rangeLabel}`}
              items={RANGES.map((r) => ({ label: r.label, onPress: () => setRange(r.value) }))}>
              <View style={[styles.dropdown, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="small">{rangeLabel}</ThemedText>
                <Icon name="expand" size={12} weight="semibold" color={theme.text} />
              </View>
            </MenuButton>
          </View>
          <OverviewTiles tiles={tiles} />
          <LoadMeter items={items} today={today} />

          <View style={styles.sectionHead}>
            <ThemedText type="heading">Classes</ThemedText>
          </View>
          <ClassCards
            groups={groups}
            classIds={classIds}
            activeIds={activeGroupIds}
            upcoming={upcoming}
            grades={grades}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, marginBottom: Spacing.two },
  // Settings (left) and Overdue (right) as a matching pair of quiet buttons.
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', boxShadow: Shadow.card },
  initial: { fontSize: 19, fontWeight: 800 },
  flex: { flex: 1 },
  name: { fontSize: 20, lineHeight: 25, fontWeight: 800, letterSpacing: -0.3 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: 800 },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
  },
});
