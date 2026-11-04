import { NativeSelect } from '@/components/ui/native-select';
import { useAppData } from '@/lib/members';

export const UNASSIGNED = 'Unassigned';
export const UNKNOWN = 'Unknown';

interface OwnerSelectProps {
  id: string;
  name: string;
  /** A Member's id, or null for nobody. */
  defaultValue: string | null;
  /** Offers "Unassigned", which posts an empty value. */
  unassigned?: boolean;
  required?: boolean;
}

/** Chooses one of the Organization's Members. */
export function OwnerSelect({ defaultValue, unassigned, ...props }: OwnerSelectProps) {
  const { members } = useAppData();

  return (
    <NativeSelect defaultValue={defaultValue ?? ''} {...props}>
      {unassigned && <option value="">{UNASSIGNED}</option>}
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** "Yes", "No" or "Unknown", as a select posts them. */
export function yesNoValue(value: boolean | null) {
  return value === null ? '' : value ? 'yes' : 'no';
}

export function yesNoFromForm(value: FormDataEntryValue | null) {
  return value === 'yes' ? true : value === 'no' ? false : null;
}
