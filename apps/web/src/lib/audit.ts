import type { HistoryItem } from '@/components/history-list';
import {
  assetStatusLabels,
  assetTypeLabels,
  classificationLabels,
  validationLabels,
  type AssetStatus,
  type AssetType,
  type AssetValidation,
  type Classification,
} from '@/lib/assets';
import { documentKindLabels, type DocumentKind } from '@/lib/documents';
import { roleLabels, type Role } from '@/lib/members';
import { residualScore, treatmentLabels, type RiskDecision } from '@/lib/risks';
import { statusLabels, type ImplementationStatus } from '@/lib/soa';
import {
  criticalityLabels,
  reviewOutcomeLabels,
  type SupplierCriticality,
  type SupplierReviewOutcome,
} from '@/lib/suppliers';

/** "Owner changed to Anna", or that nobody owns it now. */
function ownerChange(label: string, name: unknown) {
  return name ? `${label} changed to ${String(name)}` : `${label} now unassigned`;
}

type Value = Record<string, unknown>;

export interface AuditEvent {
  id: string;
  action: string;
  recordType: string;
  recordId: string | null;
  recordRef: string | null;
  recordLabel: string;
  before: Value | null;
  after: Value | null;
  reason: string | null;
  occurredAt: string;
  memberName: string;
}

export interface AuditTrail {
  events: AuditEvent[];
  total: number;
}

function describeDecision(decision: RiskDecision) {
  const residual = residualScore(decision);
  return [
    `rated ${decision.likelihood * decision.impact}`,
    residual && `${residual.likelihood * residual.impact} after treatment`,
    decision.treatment && treatmentLabels[decision.treatment],
  ]
    .filter(Boolean)
    .join(', ');
}

function describeRiskChange(before: Value, after: Value) {
  const was = before as unknown as RiskDecision;
  const now = after as unknown as RiskDecision;
  const changes: string[] = [];
  if (before.title !== after.title) changes.push(`Title changed to “${String(after.title)}”`);
  if (before.description !== after.description) changes.push('Description changed');
  if (before.ownerName !== after.ownerName) {
    changes.push(`Risk owner changed to ${String(after.ownerName)}`);
  }
  if (before.reviewOn !== after.reviewOn) {
    changes.push(`Review date changed to ${String(after.reviewOn)}`);
  }
  if (now.likelihood !== was.likelihood || now.impact !== was.impact) {
    changes.push(`Rating changed to ${now.likelihood * now.impact}`);
  }
  if (
    now.residualLikelihood !== was.residualLikelihood ||
    now.residualImpact !== was.residualImpact
  ) {
    const residual = residualScore(now);
    changes.push(
      residual
        ? `Rating after treatment changed to ${residual.likelihood * residual.impact}`
        : 'Rating after treatment removed',
    );
  }
  if (now.treatment !== was.treatment) {
    changes.push(
      now.treatment ? `Treatment changed to ${treatmentLabels[now.treatment]}` : 'Treatment removed',
    );
  }
  return changes.join('. ');
}

function describeCriteriaChange(before: Value, after: Value) {
  if (before.acceptanceThreshold !== after.acceptanceThreshold) {
    return `Acceptance threshold changed from ${String(before.acceptanceThreshold)} to ${String(after.acceptanceThreshold)}`;
  }
  return 'Meaning of the levels changed';
}

function describeSupplierChange(before: Value, after: Value) {
  const changes: string[] = [];
  const changed = (field: string) => before[field] !== after[field];
  if (changed('name')) changes.push(`Name changed to “${String(after.name)}”`);
  if (changed('provides')) changes.push('What they provide changed');
  if (changed('ownerName')) changes.push(ownerChange('Owner', after.ownerName));
  if (changed('criticality')) {
    changes.push(
      after.criticality
        ? `Criticality changed to ${criticalityLabels[after.criticality as SupplierCriticality]}`
        : 'Criticality now unknown',
    );
  }
  if (changed('handlesPersonalData')) {
    const personalData = {
      true: 'Handles personal data',
      false: 'Doesn’t handle personal data',
      null: 'Whether they handle personal data is now unknown',
    };
    changes.push(personalData[String(after.handlesPersonalData) as keyof typeof personalData]);
  }
  if (changed('contact')) changes.push('Security contact changed');
  // Before contract terms, a missing end date meant the contract rolls on.
  const term = (value: Value) =>
    'contractTerm' in value ? value.contractTerm : value.contractEnds ? 'fixed' : 'rolling';
  if (changed('contractEnds') || term(before) !== term(after)) {
    const ending = {
      fixed: `Contract end changed to ${String(after.contractEnds)}`,
      rolling: 'Contract now rolls on',
    };
    changes.push(ending[term(after) as keyof typeof ending] ?? 'Contract term now unknown');
  }
  if (changed('exitPlan')) changes.push('Exit plan changed');
  if (changed('nextReviewOn')) changes.push(`Next review moved to ${String(after.nextReviewOn)}`);
  return changes.join('. ');
}

function describeAssetChange(before: Value, after: Value) {
  const changes: string[] = [];
  // Fields added later are missing from older events, which says nothing about a change.
  const changed = (field: string) => field in before && before[field] !== after[field];
  if (changed('name')) changes.push(`Name changed to “${String(after.name)}”`);
  if (changed('type')) {
    changes.push(`Type changed to ${assetTypeLabels[after.type as AssetType]}`);
  }
  if (changed('status')) {
    changes.push(`Status changed to ${assetStatusLabels[after.status as AssetStatus]}`);
  }
  if (changed('classification')) {
    changes.push(
      after.classification
        ? `Classification changed to ${classificationLabels[after.classification as Classification]}`
        : 'Classification now unknown',
    );
  }
  if (changed('ownerName')) changes.push(ownerChange('Business owner', after.ownerName));
  if (changed('technicalOwnerName')) {
    changes.push(ownerChange('Technical owner', after.technicalOwnerName));
  }
  if (changed('location')) changes.push('Locations changed');
  // Only in events from before an asset could have several Suppliers.
  if (changed('supplierRef')) {
    changes.push(after.supplierRef ? `Supplier changed to ${String(after.supplierRef)}` : 'Supplier removed');
  }
  if (changed('validation')) {
    changes.push(validationLabels[after.validation as AssetValidation]);
  }
  if (changed('source')) changes.push('Source changed');
  if (changed('notes')) changes.push('Notes changed');
  return changes.join('. ');
}

function describeIncidentChange(before: Value, after: Value) {
  const changes: string[] = [];
  if (before.title !== after.title) changes.push(`Title changed to “${String(after.title)}”`);
  if (before.description !== after.description) changes.push('Details changed');
  if (before.occurredOn !== after.occurredOn) {
    changes.push(`Date changed to ${String(after.occurredOn)}`);
  }
  if (before.ownerName !== after.ownerName) {
    changes.push(`Owner changed to ${String(after.ownerName)}`);
  }
  if (before.riskRef !== after.riskRef) {
    changes.push(after.riskRef ? `Linked to ${String(after.riskRef)}` : 'Risk link removed');
  }
  return changes.join('. ');
}

function describeNonconformityChange(before: Value, after: Value) {
  const changes: string[] = [];
  if (before.title !== after.title) changes.push(`Title changed to “${String(after.title)}”`);
  if (before.description !== after.description) changes.push('Details changed');
  if (before.foundIn !== after.foundIn) {
    changes.push(`Found in changed to “${String(after.foundIn)}”`);
  }
  if (before.foundOn !== after.foundOn) {
    changes.push(`Found on changed to ${String(after.foundOn)}`);
  }
  if (before.ownerName !== after.ownerName) {
    changes.push(`Owner changed to ${String(after.ownerName)}`);
  }
  if (before.cause !== after.cause) {
    changes.push(before.cause ? 'Cause changed' : `Cause recorded: ${String(after.cause)}`);
  }
  return changes.join('. ');
}

interface FileEntry {
  title: string;
  upload: { name: string; sha256: string } | null;
}

function describeSoaDecision(decision: Value) {
  if (!decision.applicable) return 'does not apply';
  return `applies, ${statusLabels[decision.status as ImplementationStatus]}`;
}

function describeSoaChange(before: Value, after: Value) {
  const changes: string[] = [];
  if (before.applicable !== after.applicable || before.status !== after.status) {
    changes.push(`Changed to: ${describeSoaDecision(after)}`);
  }
  if (before.justification !== after.justification) changes.push('Justification changed');
  if (before.ownerName !== after.ownerName) {
    changes.push(after.ownerName ? `Owner changed to ${String(after.ownerName)}` : 'Owner removed');
  }
  return changes.join('. ');
}

function describeDocumentChange(before: Value, after: Value) {
  const changes: string[] = [];
  const version = `version ${String(after.version)}`;
  if ('upload' in after) {
    const upload = after.upload as FileEntry['upload'];
    changes.push(upload ? `File for ${version}: ${upload.name}` : `File removed from ${version}`);
  }
  if ('title' in after && before.title !== after.title) {
    changes.push(`Title changed to “${String(after.title)}”`);
  }
  if ('kind' in after && before.kind !== after.kind) {
    changes.push(`Kind changed to ${documentKindLabels[after.kind as DocumentKind]}`);
  }
  if ('ownerName' in after && before.ownerName !== after.ownerName) {
    changes.push(`Owner changed to ${String(after.ownerName)}`);
  }
  if ('content' in after && before.content !== after.content) {
    changes.push(`Content of ${version} changed`);
  }
  if ('datedOn' in after && 'datedOn' in before && before.datedOn !== after.datedOn) {
    changes.push(
      after.datedOn
        ? `Source date of ${version} changed to ${String(after.datedOn)}`
        : `Source date of ${version} now unknown`,
    );
  }
  return changes.join('. ');
}

function fileLabel({ title, upload }: FileEntry) {
  return upload && upload.name !== title ? `${title} (${upload.name})` : title;
}

/** One event as a sentence: the same words on a record's History and in the Audit trail. */
/** If the owner had left, the record went to whoever brought it back. */
function describeReturn(text: string, after: Value | null) {
  if (!after) return text;
  return [
    text,
    'ownerName' in after && ownerChange('Owner', after.ownerName),
    'technicalOwnerName' in after && ownerChange('Technical owner', after.technicalOwnerName),
  ]
    .filter(Boolean)
    .join('. ');
}

export function describeEvent({ action, recordLabel, before, after }: AuditEvent) {
  const decision = after as unknown as RiskDecision;
  switch (action) {
    case 'risk.added':
      return `Risk added, rated ${decision.likelihood * decision.impact}`;
    case 'risk.changed':
      return describeRiskChange(before!, after!);
    case 'risk.confirmed': {
      const replaced = before
        ? `. Replaced ${describeDecision(before as unknown as RiskDecision)}`
        : '';
      return `Confirmed: ${describeDecision(decision)}${replaced}`;
    }
    case 'risk.closed':
      return 'Risk closed';
    case 'risk.reopened':
      return describeReturn('Risk reopened', after);
    case 'risk.deleted':
      return 'Risk deleted';
    case 'risk.asset_linked':
      return `Asset linked: ${String(after!.asset)}`;
    case 'risk.asset_unlinked':
      return `Asset removed: ${String(before!.asset)}`;
    case 'risk.control_linked':
      return `Control linked: ${String(after!.control)}`;
    case 'risk.control_unlinked':
      return `Control removed: ${String(before!.control)}`;
    case 'risk_criteria.changed':
      return describeCriteriaChange(before!, after!);
    case 'risk_assessment.started':
      return 'Risk assessment started';
    case 'risk_assessment.completed':
      return `Risk assessment completed with ${String(after!.risks)} risks`;
    case 'supplier.added':
      return 'Supplier added';
    case 'supplier.changed':
      return describeSupplierChange(before!, after!);
    case 'supplier.ended':
      return 'Supplier ended';
    case 'supplier.resumed':
      return describeReturn('Supplier resumed', after);
    case 'supplier.deleted':
      return 'Supplier deleted';
    case 'supplier.reviewed':
      return `Reviewed: ${reviewOutcomeLabels[after!.outcome as SupplierReviewOutcome]}. ${String(after!.notes)}`;
    case 'supplier.file_added': {
      const entry = after as unknown as FileEntry;
      return `${entry.upload ? 'File uploaded' : 'File added'}: ${fileLabel(entry)}`;
    }
    case 'supplier.file_removed': {
      const entry = before as unknown as FileEntry;
      return `${entry.upload ? 'Uploaded file deleted' : 'File removed'}: ${fileLabel(entry)}`;
    }
    case 'supplier.asset_linked':
      return `Asset linked: ${String(after!.asset)}`;
    case 'supplier.asset_unlinked':
      return `Asset removed: ${String(before!.asset)}`;
    case 'asset.added':
      return 'Asset added';
    case 'asset.changed':
      return describeAssetChange(before!, after!);
    case 'asset.retired':
      return 'Asset retired';
    case 'asset.reinstated':
      return describeReturn('Asset reinstated', after);
    case 'asset.deleted':
      return 'Asset deleted';
    case 'file.refused':
      return `Upload refused by the virus scanner: ${String(after!.signature)}`;
    case 'incident.reported':
      return 'Incident reported';
    case 'incident.changed':
      return describeIncidentChange(before!, after!);
    case 'incident.closed':
      return 'Incident closed';
    case 'incident.reopened':
      return describeReturn('Incident reopened', after);
    case 'incident.deleted':
      return 'Incident deleted';
    case 'nonconformity.added':
      return 'Nonconformity added';
    case 'nonconformity.changed':
      return describeNonconformityChange(before!, after!);
    case 'nonconformity.closed':
      return 'Nonconformity closed';
    case 'nonconformity.reopened':
      return describeReturn('Nonconformity reopened', after);
    case 'nonconformity.deleted':
      return 'Nonconformity deleted';
    case 'soa.own_control_added':
      return 'Own control added';
    case 'soa.changed':
      return describeSoaChange(before!, after!);
    case 'soa.confirmed': {
      const replaced = before ? `. Replaced: ${describeSoaDecision(before)}` : '';
      return `Confirmed: ${describeSoaDecision(after!)}${replaced}`;
    }
    case 'soa.evidence_added':
      return `Evidence added: ${fileLabel(after as unknown as FileEntry)}`;
    case 'soa.evidence_removed':
      return `Evidence removed: ${fileLabel(before as unknown as FileEntry)}`;
    case 'document.added':
      return 'Document created';
    case 'document.changed':
      return describeDocumentChange(before!, after!);
    case 'document.version_started':
      return `Version ${String(after!.version)} started`;
    case 'document.confirmed':
      return `Version ${String(after!.version)} confirmed`;
    case 'document.withdrawn':
      return 'Document withdrawn';
    case 'document.reinstated':
      return describeReturn('Document reinstated', after);
    case 'document.deleted':
      return 'Document deleted';
    case 'member.invited':
      return after?.role
        ? `Invited to the Organization as ${roleLabels[after.role as Role]}`
        : 'Invited to the Organization';
    case 'member.invitation_revoked':
      return 'Invitation revoked';
    case 'member.joined': {
      const role = after!.role ? ` as ${roleLabels[after!.role as Role]}` : '';
      return `Joined the Organization${role}, invited by ${String(after!.invitedBy)}`;
    }
    case 'member.removed':
      return 'Removed from the Organization';
    case 'member.role_changed':
      return `Role changed from ${roleLabels[before!.role as Role]} to ${roleLabels[after!.role as Role]}`;
    case 'organization.renamed':
      return `Organization renamed from “${String(before!.name)}” to “${recordLabel}”`;
    case 'task.added':
      if (after!.proposed) return 'Task proposed';
      return `Task added for ${String(after!.ownerName)}, due ${String(after!.dueOn)}`;
    case 'task.committed':
      return `Committed to: ${String(after!.ownerName)} does it by ${String(after!.dueOn)}`;
    case 'task.finished':
      return 'Task marked done';
    case 'task.cancelled':
      return 'Task cancelled';
    default:
      return action;
  }
}

/** Where to read about the record now, if it has a page of its own. */
export function recordPath({ recordType, recordRef, recordId, action }: AuditEvent) {
  if (recordType === 'risk' && action !== 'risk.deleted') return `/risks/${recordRef}`;
  if (recordType === 'risk_criteria') return '/risks/criteria';
  if (recordType === 'risk_assessment') return '/risks/assessments';
  if (recordType === 'supplier' && action !== 'supplier.deleted') return `/suppliers/${recordRef}`;
  if (recordType === 'incident' && action !== 'incident.deleted') return `/incidents/${recordRef}`;
  if (recordType === 'nonconformity' && action !== 'nonconformity.deleted') {
    return `/nonconformities/${recordRef}`;
  }
  if (recordType === 'asset' && action !== 'asset.deleted') return `/assets/${recordId}`;
  if (recordType === 'soa_entry') return `/soa/${recordRef}`;
  if (recordType === 'document' && action !== 'document.deleted') return `/documents/${recordId}`;
  if (recordType === 'task') return '/tasks';
  return null;
}

export function historyItems(events: AuditEvent[]): HistoryItem[] {
  return events.map((event) => ({
    title: describeEvent(event),
    meta: [`${event.memberName}, ${event.occurredAt.slice(0, 10)}`, event.reason]
      .filter(Boolean)
      .join('. '),
  }));
}

/** "2026-11-01 10:04", always UTC so the trail reads the same for everyone. */
export function eventTime(event: AuditEvent) {
  return event.occurredAt.slice(0, 16).replace('T', ' ');
}

// A leading = + - or @ would run as a formula when the file is opened in a spreadsheet.
function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function fileHash({ before, after }: AuditEvent) {
  const entry = (after ?? before) as unknown as (Partial<FileEntry> & { sha256?: string }) | null;
  return entry?.upload?.sha256 ?? entry?.sha256 ?? '';
}

export function auditTrailCsv(events: AuditEvent[]) {
  const rows = events.map((event) =>
    [
      event.occurredAt,
      event.memberName,
      event.recordRef ?? '',
      event.recordLabel,
      describeEvent(event),
      event.reason ?? '',
      fileHash(event),
    ].map(csvCell),
  );
  const header = [
    'Time (UTC)',
    'Member',
    'Ref',
    'Record',
    'What happened',
    'Reason',
    'File SHA-256',
  ].map(csvCell);
  return [header, ...rows].map((row) => row.join(',')).join('\r\n');
}
