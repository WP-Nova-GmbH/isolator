import type { AuditEvent } from '@/lib/audit';

export type AssetType = 'information' | 'software' | 'hardware' | 'service' | 'people' | 'site';
export type Classification = 'public' | 'internal' | 'confidential' | 'strictly_confidential';

export const assetTypeLabels: Record<AssetType, string> = {
  information: 'Information',
  software: 'Software',
  hardware: 'Hardware',
  service: 'Service',
  people: 'People',
  site: 'Site',
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
  classification: Classification;
  ownerId: string;
  ownerName: string;
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
    classification: form.get('classification'),
    ownerId: form.get('ownerId'),
    supplierRef: form.get('supplierRef') || null,
  };
}
