import { SegmentedControl } from '@/components/ui/segmented-control';

export type Kind = 'event' | 'task';

const OPTIONS: { value: Kind; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'task', label: 'Task' },
];

/** The Event | Task switch: quick add, and the form you check quick add's result in. */
export function KindSwitch({ value, onChange }: { value: Kind; onChange: (kind: Kind) => void }) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} />;
}
