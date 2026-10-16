import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'title'
    | 'subtitle'
    | 'heading'
    | 'label'
    | 'sectionLabel'
    | 'small'
    | 'smallBold'
    | 'caption'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

/**
 * How far the big decorative sizes may grow with the phone's text size; past this they push dates and
 * clocks off-screen. Body text scales fully.
 */
const MAX_SCALE: Partial<Record<NonNullable<ThemedTextProps['type']>, number>> = {
  display: 1.2,
  title: 1.3,
  subtitle: 1.4,
  heading: 1.6,
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE[type]}
      style={[
        { color: theme[themeColor ?? (type === 'sectionLabel' ? 'textSecondary' : 'text')] },
        type === 'default' && styles.default,
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'caption' && styles.caption,
        type === 'subtitle' && styles.subtitle,
        type === 'heading' && styles.heading,
        type === 'label' && styles.label,
        type === 'sectionLabel' && styles.sectionLabel,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.accent }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
    fontVariant: ['tabular-nums'],
  },
  /** Big, heavy, tightly tracked numerals and headings. */
  display: {
    fontSize: 64,
    lineHeight: 64,
    fontWeight: 800,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 52,
    letterSpacing: -1.5,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 800,
    letterSpacing: -0.8,
  },
  /** Section titles on tab screens: "Overview", "Your day", "Today's plan". */
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  /** Row titles in lists and cards. */
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  /** Grouped-list section labels: Settings, editors, the class page. */
  sectionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
