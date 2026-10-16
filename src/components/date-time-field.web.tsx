import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime, toDateKey } from '@/lib/dates';

import type { DateTimeFieldProps } from './date-time-field';

const STEP = 15;
const ROW_HEIGHT = 36;
const LIST_HEIGHT = ROW_HEIGHT * 7;
const LIST_WIDTH = 140;

/** Every 15 minutes of the day, as minutes after midnight. */
const SLOTS = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

function atMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function formatDay(date: Date) {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/**
 * Reads a typed time: "2:45", "245", "2:45pm", "2 pm", "14:45". Without am/pm, 1–12 keeps the half
 * of the day the time was already in. Null when it isn't a time.
 */
function parseTypedTime(text: string, previous: Date): number | null {
  const match = text.trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour >= 1 && hour <= 12) {
    const pm = previous.getHours() >= 12;
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  return hour * 60 + minute;
}

type Anchor = { left: number; top: number };

/** Where the time list goes: under the pill, or above it when there's no room below. */
function anchorFor(node: HTMLElement): Anchor {
  const rect = node.getBoundingClientRect();
  const below = rect.bottom + 4;
  const top = below + LIST_HEIGHT > window.innerHeight - 8 ? rect.top - 4 - LIST_HEIGHT : below;
  const left = Math.min(Math.max(rect.right - LIST_WIDTH, 8), window.innerWidth - LIST_WIDTH - 8);
  return { left, top: Math.max(top, 8) };
}

function DatePill({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Date, ${formatDay(value)}`}
      style={({ hovered }) => [
        styles.pill,
        { backgroundColor: theme.backgroundSelected },
        hovered && { borderColor: theme.textSecondary },
      ]}>
      <ThemedText style={styles.pillText}>{formatDay(value)}</ThemedText>
      {/* The browser's own calendar, opened from the pill; the box itself stays hidden. */}
      {createElement('input', {
        ref: inputRef,
        type: 'date',
        tabIndex: -1,
        'aria-hidden': true,
        value: toDateKey(value),
        onChange: (e: { target: { value: string } }) => {
          if (!e.target.value) return;
          const [y, m, d] = e.target.value.split('-').map(Number);
          const next = new Date(value);
          next.setFullYear(y, m - 1, d);
          onChange(next);
        },
        style: {
          position: 'absolute',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          border: 0,
          padding: 0,
          // The calendar it opens follows the app's light or dark look.
          colorScheme: theme === Colors.dark ? 'dark' : 'light',
        },
      })}
    </Pressable>
  );
}

function TimePill({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const theme = useTheme();
  const wrapRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<ScrollView>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // What's typed while the box has focus; null shows the time as set.
  const [typed, setTyped] = useState<string | null>(null);
  const current = minutesOf(value);
  const nearest = useMemo(() => Math.round(current / STEP) * STEP, [current]);

  const node = () => wrapRef.current as unknown as HTMLElement | null;
  const open = () => {
    const el = node();
    if (el) setAnchor(anchorFor(el));
  };
  const close = () => {
    setAnchor(null);
    setTyped(null);
  };
  const pick = (minutes: number) => {
    onChange(atMinutes(value, minutes));
    close();
    inputRef.current?.blur();
  };
  const commitTyped = () => {
    if (typed === null) return;
    const minutes = parseTypedTime(typed, value);
    if (minutes !== null) onChange(atMinutes(value, minutes));
  };

  // Keep the list on the pill while the form scrolls or the window resizes.
  useEffect(() => {
    if (!anchor) return;
    const follow = () => {
      const el = node();
      if (el) setAnchor(anchorFor(el));
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [anchor]);

  // Open with the current time in the middle of the list.
  const isOpen = anchor !== null;
  useEffect(() => {
    if (!isOpen) return;
    const y = (SLOTS.indexOf(nearest % (24 * 60)) - 3) * ROW_HEIGHT;
    listRef.current?.scrollTo({ y: Math.max(y, 0), animated: false });
  }, [isOpen, nearest]);

  return (
    <View ref={wrapRef}>
      <TextInput
        ref={inputRef}
        value={typed ?? formatTime(value)}
        onChangeText={setTyped}
        onFocus={() => {
          open();
          setTimeout(() => (inputRef.current as unknown as HTMLInputElement | null)?.select(), 0);
        }}
        onBlur={() => {
          commitTyped();
          close();
        }}
        onSubmitEditing={() => {
          commitTyped();
          close();
          inputRef.current?.blur();
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === 'Escape') {
            setTyped(null);
            inputRef.current?.blur();
          } else if (nativeEvent.key === 'ArrowDown' || nativeEvent.key === 'ArrowUp') {
            // Arrow keys step through the list, 15 minutes at a time.
            const step = nativeEvent.key === 'ArrowDown' ? STEP : -STEP;
            const base = current % STEP === 0 ? current : nearest - (step > 0 ? STEP : 0);
            const next = (base + step + 24 * 60) % (24 * 60);
            setTyped(null);
            onChange(atMinutes(value, next));
          }
        }}
        accessibilityLabel="Time"
        selectTextOnFocus
        style={[
          styles.pill,
          styles.pillText,
          styles.timeInput,
          { backgroundColor: theme.backgroundSelected, color: theme.text },
          isOpen && { borderColor: theme.accent },
        ]}
      />
      {anchor &&
        createPortal(
          // Clicking the list mustn't take focus from the box, or it would close before the pick lands.
          createElement(
            'div',
            {
              onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
              style: { position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 1000 },
            },
            <View
              style={[
                styles.list,
                { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
              ]}>
              <ScrollView ref={listRef} style={{ height: LIST_HEIGHT }} accessibilityRole="list">
                {SLOTS.map((minutes) => {
                  const selected = minutes === current;
                  return (
                    <Pressable
                      key={minutes}
                      onPress={() => pick(minutes)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ hovered }) => [
                        styles.option,
                        (hovered || selected) && { backgroundColor: theme.backgroundSelected },
                      ]}>
                      <ThemedText type={selected ? 'smallBold' : 'small'}>
                        {formatTime(atMinutes(value, minutes))}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ),
          document.body
        )}
    </View>
  );
}

/** Computer version: a date pill that opens the browser's calendar and a time pill with a list of times. */
export function DateTimeField({ label, value, onChange, mode, hint }: DateTimeFieldProps) {
  return (
    <View style={styles.row}>
      {/* The hint sits by the label so the pickers line up from row to row. */}
      <View style={styles.label}>
        <ThemedText>{label}</ThemedText>
        {hint && (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
      </View>
      <View style={styles.pills}>
        {mode !== 'time' && <DatePill value={value} onChange={onChange} />}
        {mode !== 'date' && <TimePill value={value} onChange={onChange} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  pills: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: 6,
  },
  pillText: { fontSize: 15 },
  timeInput: { width: 96, textAlign: 'center', outlineStyle: 'none' } as object,
  label: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexShrink: 1 },
  list: {
    width: LIST_WIDTH,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    boxShadow: Shadow.raised,
  },
  option: { height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: Spacing.three },
});
