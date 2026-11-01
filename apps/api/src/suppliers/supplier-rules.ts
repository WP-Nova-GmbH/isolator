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

interface SupplierFacts {
  endedAt: Date | null;
  criticality: SupplierCriticality;
  handlesPersonalData: boolean;
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

/** What is missing or out of date on this Supplier, in the order to deal with it. */
export function supplierAttention(
  supplier: SupplierFacts,
  files: FileFacts[],
  lastOutcome: SupplierReviewOutcome | undefined,
  today: string,
) {
  if (supplier.endedAt) return [];
  const notExpired = files.filter((file) => fileState(file.expiresOn, today) !== 'Expired');
  const attention: string[] = [];

  if (lastOutcome === 'stop_using') attention.push('The last review says to stop using them.');
  if (lastOutcome === 'concerns') attention.push('The last review raised concerns.');
  if (supplier.nextReviewOn < today) {
    attention.push(`The review was due on ${supplier.nextReviewOn}.`);
  }
  if (
    supplier.handlesPersonalData &&
    !notExpired.some((file) => file.kind === 'data_processing_agreement')
  ) {
    attention.push('They handle personal data, but no data processing agreement is on file.');
  }
  if (!notExpired.some((file) => file.kind === 'contract')) {
    attention.push('No contract on file.');
  }
  if (supplier.contractEnds && supplier.contractEnds < today) {
    attention.push(`The contract ended on ${supplier.contractEnds}.`);
  } else if (
    supplier.contractEnds &&
    supplier.contractEnds <= addDays(today, CONTRACT_END_WARNING_DAYS)
  ) {
    attention.push(`The contract ends on ${supplier.contractEnds}.`);
  }
  if (supplier.criticality === 'high' && !supplier.exitPlan) {
    attention.push('They are critical, but there is no exit plan.');
  }
  for (const file of files) {
    const state = fileState(file.expiresOn, today);
    if (state === 'Expired') attention.push(`${file.title} expired on ${file.expiresOn}.`);
    if (state === 'Expires soon') attention.push(`${file.title} expires on ${file.expiresOn}.`);
  }
  return attention;
}
