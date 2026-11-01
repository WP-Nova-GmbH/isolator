import { describe, expect, it } from 'vitest';
import {
  fileState,
  formatSupplierRef,
  parseSupplierRef,
  supplierAttention,
  supplierState,
} from './supplier-rules';

const today = '2026-11-01';

const supplier = {
  endedAt: null,
  criticality: 'medium' as const,
  handlesPersonalData: false,
  contractEnds: null,
  exitPlan: '',
  nextReviewOn: '2027-01-01',
};

const contract = { kind: 'contract' as const, title: 'Contract', expiresOn: null };

describe('supplier refs', () => {
  it('reads back what it wrote and refuses anything else', () => {
    expect(formatSupplierRef(3)).toBe('S-03');
    expect(parseSupplierRef('S-03')).toBe(3);
    expect(parseSupplierRef('R-03')).toBeNull();
  });
});

describe('fileState', () => {
  it('warns 30 days ahead', () => {
    expect(fileState(null, today)).toBe('Current');
    expect(fileState('2026-12-02', today)).toBe('Current');
    expect(fileState('2026-12-01', today)).toBe('Expires soon');
    expect(fileState('2026-11-01', today)).toBe('Expires soon');
    expect(fileState('2026-10-31', today)).toBe('Expired');
  });
});

describe('supplierState', () => {
  it('puts ended first, then overdue, then whether it was ever reviewed', () => {
    const ended = { endedAt: new Date(), nextReviewOn: '2000-01-01' };
    expect(supplierState(ended, undefined, today)).toBe('Ended');
    expect(supplierState({ ...supplier, nextReviewOn: '2026-10-31' }, 'no_concerns', today)).toBe(
      'Review overdue',
    );
    expect(supplierState(supplier, undefined, today)).toBe('Not reviewed');
    expect(supplierState(supplier, 'no_concerns', today)).toBe('Reviewed');
  });
});

describe('supplierAttention', () => {
  it('has nothing to say about a Supplier in good order', () => {
    expect(supplierAttention(supplier, [contract], 'no_concerns', today)).toEqual([]);
  });

  it('says nothing about an ended Supplier', () => {
    const ended = { ...supplier, endedAt: new Date(), nextReviewOn: '2000-01-01' };
    expect(supplierAttention(ended, [], 'stop_using', today)).toEqual([]);
  });

  it('asks for a contract', () => {
    expect(supplierAttention(supplier, [], undefined, today)).toEqual(['No contract on file.']);
  });

  it('asks for a data processing agreement when personal data is involved', () => {
    const handling = { ...supplier, handlesPersonalData: true };
    expect(supplierAttention(handling, [contract], undefined, today)[0]).toContain(
      'no data processing agreement',
    );
    const agreement = { kind: 'data_processing_agreement' as const, title: 'DPA', expiresOn: null };
    expect(supplierAttention(handling, [contract, agreement], undefined, today)).toEqual([]);
  });

  it('doesn’t count an expired agreement', () => {
    const handling = { ...supplier, handlesPersonalData: true };
    const expired = {
      kind: 'data_processing_agreement' as const,
      title: 'DPA',
      expiresOn: '2026-01-01',
    };
    expect(supplierAttention(handling, [contract, expired], undefined, today)).toEqual([
      'They handle personal data, but no data processing agreement is on file.',
      'DPA expired on 2026-01-01.',
    ]);
  });

  it('warns before a file expires', () => {
    const certificate = {
      kind: 'certificate' as const,
      title: 'Certificate',
      expiresOn: '2026-11-20',
    };
    expect(supplierAttention(supplier, [contract, certificate], undefined, today)).toEqual([
      'Certificate expires on 2026-11-20.',
    ]);
  });

  it('warns about the contract ending, 60 days ahead', () => {
    const attention = (contractEnds: string) =>
      supplierAttention({ ...supplier, contractEnds }, [contract], undefined, today);
    expect(attention('2027-01-01')).toEqual([]);
    expect(attention('2026-12-31')).toEqual(['The contract ends on 2026-12-31.']);
    expect(attention('2026-10-31')).toEqual(['The contract ended on 2026-10-31.']);
  });

  it('asks a critical Supplier for an exit plan', () => {
    const critical = { ...supplier, criticality: 'high' as const };
    expect(supplierAttention(critical, [contract], undefined, today)).toEqual([
      'They are critical, but there is no exit plan.',
    ]);
    expect(
      supplierAttention({ ...critical, exitPlan: 'Move to X' }, [contract], undefined, today),
    ).toEqual([]);
  });

  it('passes on what the last review found', () => {
    expect(supplierAttention(supplier, [contract], 'concerns', today)).toEqual([
      'The last review raised concerns.',
    ]);
    expect(supplierAttention(supplier, [contract], 'stop_using', today)).toEqual([
      'The last review says to stop using them.',
    ]);
  });

  it('flags an overdue review', () => {
    const overdue = { ...supplier, nextReviewOn: '2026-10-15' };
    expect(supplierAttention(overdue, [contract], 'no_concerns', today)).toEqual([
      'The review was due on 2026-10-15.',
    ]);
  });
});
