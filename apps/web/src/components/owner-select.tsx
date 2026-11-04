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
  className?: string;
  'aria-label'?: string;
}

/** Chooses one of the Organization's Members. */
export function OwnerSelect({ defaultValue, unassigned, ...props }: OwnerSelectProps) {
  const { members } = useAppData();

  return (
    <NativeSelect defaultValue={defaultValue ?? ''} {...props}>
      {unassigned && <option value="">{UNASSIGNED}</option>}
      {members
        // An Auditor only reads, so owns nothing.
        .filter((member) => member.role !== 'auditor')
        .map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
    </NativeSelect>
  );
}

/** "Yes" or "No" for a fact on a record's page, or null while nobody knows. */
export function yesNoLabel(value: boolean | null) {
  return value === null ? null : value ? 'Yes' : 'No';
}

/** "Yes", "No" or "Unknown", as a select posts them. */
export function yesNoValue(value: boolean | null) {
  return value === null ? '' : value ? 'yes' : 'no';
}

export function yesNoFromForm(value: FormDataEntryValue | null) {
  return value === 'yes' ? true : value === 'no' ? false : null;
}
