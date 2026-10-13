import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DeviceCalendarSync } from '@/components/device-calendar-sync';
import { NotificationSync } from '@/components/notification-sync';
import { SyncProvider } from '@/components/sync-provider';
import { migrateDbIfNeeded } from '@/db/migrations';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SQLiteProvider databaseName="daybook.db" onInit={migrateDbIfNeeded}>
          <AnimatedSplashOverlay />
          <NotificationSync />
          <SyncProvider />
          <DeviceCalendarSync />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="import" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
            <Stack.Screen name="tomorrow" options={{ presentation: 'modal', title: 'Plan tomorrow' }} />
            <Stack.Screen name="today" options={{ presentation: 'modal', title: 'Today' }} />
            <Stack.Screen
              name="onboarding"
              options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
            />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
