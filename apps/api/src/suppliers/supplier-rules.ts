export type SupplierCriticality = 'low' | 'medium' | 'high';
export type SupplierFileKind =
  | 'contract'
  | 'data_processing_agreement'
  | 'certificate'
  | 'security_assessment'
  | 'other';
export type SupplierReviewOutcome = 'no_concerns' | 'concerns' | 'stop_using';

const FILE_EXPIRY_WARNING_DAYS = 30;
const CONTRACT_END_WARNING_DAYS = 60;

/** Null means nobody knows yet, or nobody has been assigned. */
interface SupplierFacts {
  endedAt: Date | null;
  ownerId: string | null;
  criticality: SupplierCriticality | null;
  handlesPersonalData: boolean | null;
  contractTerm: 'fixed' | 'rolling' | null;
  contractEnds: string | null;
  exitPlan: string;
  nextReviewOn: string;
}

interface FileFacts {
  kind: SupplierFileKind;
  title: string;
  expiresOn: string | null;
}

export function formatSupplierRef(number: number) {
  return `S-${String(number).padStart(2, '0')}`;
}

export function parseSupplierRef(ref: string) {
  const match = /^S-(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function fileState(expiresOn: string | null, today: string) {
  if (!expiresOn) return 'Current';
  if (expiresOn < today) return 'Expired';
  return expiresOn <= addDays(today, FILE_EXPIRY_WARNING_DAYS) ? 'Expires soon' : 'Current';
}

export function supplierState(
  supplier: Pick<SupplierFacts, 'endedAt' | 'nextReviewOn'>,
  lastOutcome: SupplierReviewOutcome | undefined,
  today: string,
) {
  if (supplier.endedAt) return 'Ended';
  if (supplier.nextReviewOn < today) return 'Review overdue';
  return lastOutcome ? 'Reviewed' : 'Not reviewed';
}

/**
 * What is missing or out of date on this Supplier, in the order to deal with it.
 * Short phrases, not sentences: the register lists several side by side on one line.
 */
export function supplierAttention(
  supplier: SupplierFacts,
  files: FileFacts[],
  lastOutcome: SupplierReviewOutcome | undefined,
  today: string,
) {
  if (supplier.endedAt) return [];
  const notExpired = files.filter((file) => fileState(file.expiresOn, today) !== 'Expired');
  const attention: string[] = [];

  if (lastOutcome === 'stop_using') attention.push('Last review says stop using them');
  if (lastOutcome === 'concerns') attention.push('Last review raised concerns');
  if (supplier.nextReviewOn < today) {
    attention.push(`Review overdue since ${supplier.nextReviewOn}`);
  }
  // Only asked for when they handle personal data.
  if (
    supplier.handlesPersonalData &&
    !notExpired.some((file) => file.kind === 'data_processing_agreement')
  ) {
    attention.push('No data processing agreement');
  }
  if (!notExpired.some((file) => file.kind === 'contract')) {
    attention.push('No contract on file');
  }
  // What nobody has found out yet.
  if (!supplier.ownerId) attention.push('No owner');
  if (!supplier.criticality) attention.push('Criticality unknown');
  if (supplier.handlesPersonalData === null) {
    attention.push('Unknown if they handle personal data');
  }
  if (!supplier.contractTerm) attention.push('Contract term unknown');
  if (supplier.contractEnds && supplier.contractEnds < today) {
    attention.push(`Contract ended on ${supplier.contractEnds}`);
  } else if (
    supplier.contractEnds &&
    supplier.contractEnds <= addDays(today, CONTRACT_END_WARNING_DAYS)
  ) {
    attention.push(`Contract ends on ${supplier.contractEnds}`);
  }
  // Only asked for when they are critical.
  if (supplier.criticality === 'high' && !supplier.exitPlan) {
    attention.push('No exit plan');
  }
  for (const file of files) {
    const state = fileState(file.expiresOn, today);
    if (state === 'Expired') attention.push(`${file.title} expired on ${file.expiresOn}`);
    if (state === 'Expires soon') attention.push(`${file.title} expires on ${file.expiresOn}`);
  }
  return attention;
}
