import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** SF Symbol on iOS, Material Symbol on Android and web. */
const NAMES = {
  sidebar: { ios: 'sidebar.left', android: 'menu', web: 'menu' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  forward: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  expand: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  collapse: { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' },
  checked: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  unchecked: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  checkmark: { ios: 'checkmark', android: 'check', web: 'check' },
  partial: { ios: 'minus.circle.fill', android: 'do_not_disturb_on', web: 'do_not_disturb_on' },
  repeat: { ios: 'repeat', android: 'repeat', web: 'repeat' },
  sun: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  empty: { ios: 'leaf', android: 'eco', web: 'eco' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  home: { ios: 'house', android: 'home', web: 'home' },
  homeFilled: { ios: 'house.fill', android: 'home', web: 'home' },
  brief: { ios: 'doc.text', android: 'article', web: 'article' },
  briefFilled: { ios: 'doc.text.fill', android: 'article', web: 'article' },
  moon: { ios: 'moon.zzz', android: 'bedtime', web: 'bedtime' },
  moonFilled: { ios: 'moon.zzz.fill', android: 'bedtime', web: 'bedtime' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  calendarFilled: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  upload: { ios: 'square.and.arrow.down', android: 'upload_file', web: 'upload_file' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  event: { ios: 'calendar', android: 'event', web: 'event' },
  class: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  exam: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  assignment: { ios: 'doc.text', android: 'description', web: 'description' },
  reading: { ios: 'book', android: 'auto_stories', web: 'auto_stories' },
} as const;

export type IconName = keyof typeof NAMES;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, color, weight = 'medium', style }: Props) {
  const theme = useTheme();
  return (
    <SymbolView
      name={NAMES[name]}
      size={size}
      weight={weight}
      tintColor={color ?? theme.text}
      style={[{ width: size, height: size }, style]}
    />
  );
}
