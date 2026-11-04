import type { AuditEvent } from '@/lib/audit';

export type AssetType = 'information' | 'software' | 'hardware' | 'service' | 'people' | 'site';
export type AssetStatus = 'planned' | 'operational';
export type AssetValidation = 'unvalidated' | 'validated';
export type Classification = 'public' | 'internal' | 'confidential' | 'strictly_confidential';

export const assetTypeLabels: Record<AssetType, string> = {
  information: 'Information',
  software: 'Software',
  hardware: 'Hardware',
  service: 'Service',
  people: 'People',
  site: 'Site',
};

export const assetStatusLabels: Record<AssetStatus, string> = {
  planned: 'Planned',
  operational: 'Operational',
};

export const validationLabels: Record<AssetValidation, string> = {
  unvalidated: 'Not validated',
  validated: 'Validated',
};

export const classificationLabels: Record<Classification, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  strictly_confidential: 'Strictly confidential',
};

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  /** Null until someone has classified it. */
  classification: Classification | null;
  /** The business owner. Null while unassigned, as is the technical owner. */
  ownerId: string | null;
  ownerName: string | null;
  technicalOwnerId: string | null;
  technicalOwnerName: string | null;
  location: string;
  validation: AssetValidation;
  source: string;
  notes: string;
  retiredAt: string | null;
  retiredReason: string | null;
  supplier: { ref: string; name: string } | null;
  risks: number;
}

export interface AssetDetail extends Omit<Asset, 'risks'> {
  deletable: boolean;
  risks: { ref: string; title: string }[];
  history: AuditEvent[];
}

/** The form fields in AssetFields, as the API takes them. */
export function assetPayload(form: FormData) {
  return {
    name: form.get('name'),
    type: form.get('type'),
    status: form.get('status'),
    classification: form.get('classification') || null,
    ownerId: form.get('ownerId') || null,
    technicalOwnerId: form.get('technicalOwnerId') || null,
    location: form.get('location'),
    supplierRef: form.get('supplierRef') || null,
    validation: form.get('validation'),
    source: form.get('source'),
    notes: form.get('notes'),
  };
}
