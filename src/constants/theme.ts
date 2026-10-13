/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#161616',
    background: '#ECEAE5', // warm light grey
    backgroundElement: '#F7F6F3', // raised surfaces: inputs, popovers, sheets
    backgroundSelected: '#D6D3CC', // hairlines and outlines
    textSecondary: '#6E6B66',
    accent: '#161616', // selection is solid black, like the pill toggles
    onAccent: '#FFFFFF',
    danger: '#E2583B',
  },
  dark: {
    text: '#F2F0EB',
    background: '#121212',
    backgroundElement: '#1E1E1E',
    backgroundSelected: '#353432',
    textSecondary: '#9A968F',
    accent: '#F2F0EB',
    onAccent: '#121212',
    danger: '#F07052',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Swatches for calendars and events: bold color blocks that carry their own text. */
export const EventColors = [
  '#959BDB', // periwinkle
  '#E2583B', // vermilion
  '#8C4A4C', // maroon
  '#9CC27A', // sage
  '#1E3550', // navy
  '#2B8899', // teal
  '#D2BF45', // mustard
  '#3B3B3B', // charcoal
  '#C98A5A', // clay
  '#7A5C99', // plum
] as const;
