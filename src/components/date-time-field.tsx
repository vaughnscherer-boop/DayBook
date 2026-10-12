import { DatePicker, Host } from '@expo/ui/swift-ui';

export type DateTimeFieldProps = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode: 'date' | 'time' | 'datetime';
};

const COMPONENTS = {
  date: ['date'],
  time: ['hourAndMinute'],
  datetime: ['date', 'hourAndMinute'],
} as const;

/** iOS-native date/time picker row: label on the left, compact pickers on the right. */
export function DateTimeField({ label, value, onChange, mode }: DateTimeFieldProps) {
  return (
    <Host matchContents={{ vertical: true }}>
      <DatePicker
        title={label}
        selection={value}
        displayedComponents={[...COMPONENTS[mode]]}
        onDateChange={onChange}
      />
    </Host>
  );
}
