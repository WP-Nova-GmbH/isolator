import { Badge } from '@/components/ui/badge';

// The one place domain states map to tones. See docs/design-system.md.
const tones = {
  readiness: { Done: 'success', Drafted: 'info', Missing: 'neutral' },
  control: {
    Implemented: 'success',
    Partial: 'warning',
    Planned: 'info',
    'Not started': 'neutral',
    'Not applicable': 'neutral',
  },
  confirmation: { Confirmed: 'success', Draft: 'info' },
  document: { Confirmed: 'success', Draft: 'info', Withdrawn: 'neutral' },
  risk: { Closed: 'neutral' },
  evidence: { Current: 'success', 'Expires soon': 'warning', Expired: 'danger' },
  task: {
    Proposed: 'info',
    Open: 'neutral',
    Overdue: 'danger',
    Done: 'success',
    Cancelled: 'neutral',
  },
  supplier: {
    Reviewed: 'success',
    'Not reviewed': 'neutral',
    'Review overdue': 'danger',
    Ended: 'neutral',
  },
  supplierReview: { 'No concerns': 'success', Concerns: 'warning', 'Stop using': 'danger' },
  incident: { Investigating: 'warning', Closed: 'neutral' },
  nonconformity: { Open: 'danger', Closed: 'neutral' },
  assessment: { 'In progress': 'info', Planned: 'neutral', Completed: 'success' },
} as const;

type Kind = keyof typeof tones;
type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

export type State<K extends Kind> = keyof (typeof tones)[K];

interface StateBadgeProps<K extends Kind> {
  kind: K;
  state: State<K>;
  /** Replaces the state's name, for example "1 expired". */
  label?: string;
}

export function StateBadge<K extends Kind>({ kind, state, label }: StateBadgeProps<K>) {
  const tone = (tones[kind] as Record<string, Tone>)[String(state)];
  return <Badge variant={tone}>{label ?? String(state)}</Badge>;
}
