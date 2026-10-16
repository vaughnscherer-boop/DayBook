import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DeviceCalendarSync } from '@/components/device-calendar-sync';
import { FeedSync } from '@/components/feed-sync';
import { GoogleSync } from '@/components/google-sync';
import { NotificationSync } from '@/components/notification-sync';
import { PastDuePrompt } from '@/components/past-due-prompt';
import { BackArrow, isWeb } from '@/components/ui/back-arrow';
import { SyncProvider } from '@/components/sync-provider';
import { ToastHost } from '@/components/toast-host';
import { Colors, Spacing } from '@/constants/theme';
import { migrateDbIfNeeded } from '@/db/migrations';

SplashScreen.preventAutoHideAsync();

/** Navigation chrome (headers, modal backgrounds) in the paper palette. */
function navTheme(base: typeof DefaultTheme, colors: (typeof Colors)['light' | 'dark']) {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.backgroundSelected,
    },
  };
}
const LightNav = navTheme(DefaultTheme, Colors.light);
const DarkNav = navTheme(DarkTheme, Colors.dark);

/**
 * On the computer every screen gets the same back arrow in place of its own Back / Close / Cancel,
 * and buttons on the right (Add, Done, Select) sit as far in from the edge as the arrow does.
 */
const screenOptions = isWeb
  ? {
      headerLeft: () => <BackArrow />,
      headerBackVisible: false,
      headerRightContainerStyle: { paddingRight: Spacing.three },
    }
  : undefined;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkNav : LightNav}>
        <SQLiteProvider databaseName="daybook.db" onInit={migrateDbIfNeeded}>
          <AnimatedSplashOverlay />
          <NotificationSync />
          <SyncProvider />
          <DeviceCalendarSync />
          <GoogleSync />
          <FeedSync />
          <PastDuePrompt />
          <Stack screenOptions={screenOptions}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="import" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
            {/* A formSheet here renders its content blank or misplaced on iOS 27, so it's a plain modal. */}
            <Stack.Screen name="new" options={{ presentation: 'modal', title: 'Add' }} />
            <Stack.Screen name="tasks" options={{ title: 'Tasks', headerBackTitle: 'Home' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
            <Stack.Screen name="group/[id]" options={{ presentation: 'modal', title: 'Edit class' }} />
            <Stack.Screen name="focus/[id]" options={{ presentation: 'fullScreenModal', title: 'Focus' }} />
            <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
            />
          </Stack>
          <ToastHost />
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
