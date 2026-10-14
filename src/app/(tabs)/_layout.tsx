import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';

import { BottomBar } from '@/components/bottom-bar';

/** Home · Brief · New tasks · Calendar, switched from a floating bar with a + in the middle. */
export default function TabsLayout() {
  return (
    <Tabs>
      {/* The slot's default style never shrinks, so on web a long screen grew past the window
          and its ScrollView had nothing to scroll. Bound it to the window instead. */}
      <TabSlot style={{ flex: 1, minHeight: 0 }} />
      <BottomBar />
      {/* The routes the bar's triggers point to; the visible bar is BottomBar. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="home" href="/" />
        <TabTrigger name="today" href="/today" />
        <TabTrigger name="tomorrow" href="/tomorrow" />
        <TabTrigger name="calendar" href="/calendar" />
      </TabList>
    </Tabs>
  );
}
