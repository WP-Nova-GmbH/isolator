import type { State } from '@/components/state-badge';
import { api } from '@/lib/api';
import type { DocumentKind, IsmsDocument } from '@/lib/documents';
import type { Nonconformity } from '@/lib/nonconformities';
import type { Risk, RiskAssessmentList, RiskCriteria } from '@/lib/risks';
import type { SoaEntry } from '@/lib/soa';

type ReadinessState = State<'readiness'>;

export interface ReadinessItem {
  ref: string;
  title: string;
  where: { label: string; to: string };
  state: ReadinessState;
}

export interface ReadinessGroup {
  title: string;
  items: ReadinessItem[];
}

export async function readinessData() {
  const [risks, { assessments }, criteria, soa, documents, nonconformities] = await Promise.all([
    api<Risk[]>('/risks'),
    api<RiskAssessmentList>('/risk-assessments'),
    api<RiskCriteria>('/risk-criteria'),
    api<SoaEntry[]>('/soa'),
    api<IsmsDocument[]>('/documents'),
    api<Nonconformity[]>('/nonconformities'),
  ]);
  return { risks, assessments, criteria, soa, documents, nonconformities };
}

type ReadinessData = Awaited<ReturnType<typeof readinessData>>;

function documentItem(
  documents: IsmsDocument[],
  ref: string,
  title: string,
  kind: DocumentKind,
): ReadinessItem {
  const ofKind = documents.filter((document) => document.kind === kind);
  const inForce = ofKind.some((document) => document.versionInForce !== null);
  return {
    ref,
    title,
    where: { label: 'Documents', to: `/documents?tab=${kind}` },
    state: inForce ? 'Done' : ofKind.length > 0 ? 'Drafted' : 'Missing',
  };
}

function controlsState(entries: SoaEntry[]): ReadinessState {
  const confirmed = entries.filter((entry) => entry.confirmation).length;
  if (entries.length > 0 && confirmed === entries.length) return 'Done';
  return confirmed > 0 || entries.some((entry) => entry.justification) ? 'Drafted' : 'Missing';
}

function nonconformitiesState(items: Nonconformity[], documents: IsmsDocument[]): ReadinessState {
  if (items.some((item) => !item.closedAt)) return 'Drafted';
  if (items.length > 0) return 'Done';
  // An empty register only means something once an internal audit has looked.
  const audited = documents.some(
    (document) => document.kind === 'internal_audit' && document.versionInForce !== null,
  );
  return audited ? 'Done' : 'Missing';
}

function themeItem(soa: SoaEntry[], ref: string, name: string, theme: SoaEntry['theme']) {
  const entries = soa.filter((entry) => entry.theme === theme);
  const confirmed = entries.filter((entry) => entry.confirmation).length;
  return {
    ref,
    title: `${name}: ${confirmed} of ${entries.length} confirmed`,
    where: { label: 'SoA', to: `/soa?tab=${theme}` },
    state: controlsState(entries),
  };
}

/** Everything the certificate needs, read from the records themselves. */
export function readinessGroups(data: ReadinessData): ReadinessGroup[] {
  const { risks, assessments, criteria, soa, documents, nonconformities } = data;
  const risksConfirmed = risks.length > 0 && risks.every((risk) => risk.confirmation);

  return [
    {
      title: 'Context and scope',
      items: [
        documentItem(documents, '4.2', 'Interested parties and their requirements', 'interested_parties'),
        documentItem(documents, '4.3', 'ISMS scope', 'scope'),
      ],
    },
    {
      title: 'Leadership',
      items: [
        documentItem(documents, '5.2', 'Information security policy', 'policy'),
        documentItem(documents, '5.3', 'Roles and responsibilities', 'roles'),
      ],
    },
    {
      title: 'Planning',
      items: [
        {
          ref: '6.1.2',
          title: 'Risk criteria',
          where: { label: 'Risks', to: '/risks/criteria' },
          state: criteria.saved ? 'Done' : 'Missing',
        },
        {
          ref: '6.1.2',
          title: 'First Risk assessment',
          where: { label: 'Risks', to: '/risks/assessments' },
          state: assessments.some((assessment) => assessment.completed)
            ? 'Done'
            : assessments.length > 0
              ? 'Drafted'
              : 'Missing',
        },
        {
          ref: '6.1.3',
          title: 'Risk treatment plan',
          where: { label: 'Tasks', to: '/tasks' },
          state: risksConfirmed ? 'Done' : risks.length > 0 ? 'Drafted' : 'Missing',
        },
        {
          ref: '6.1.3',
          title: 'Statement of Applicability',
          where: { label: 'SoA', to: '/soa' },
          state: controlsState(soa),
        },
        documentItem(documents, '6.2', 'Security objectives', 'objectives'),
      ],
    },
    {
      title: 'Support',
      items: [
        documentItem(documents, '7.2', 'Competence records', 'competence'),
        documentItem(documents, '7.3', 'Awareness records', 'awareness'),
      ],
    },
    {
      title: 'Review and improvement',
      items: [
        documentItem(documents, '9.2', 'Internal audit', 'internal_audit'),
        documentItem(documents, '9.3', 'Management review', 'management_review'),
        {
          ref: '10.2',
          title: 'Nonconformities handled',
          where: { label: 'Nonconformities', to: '/nonconformities' },
          state: nonconformitiesState(nonconformities, documents),
        },
      ],
    },
    {
      title: 'Annex A controls',
      items: [
        themeItem(soa, 'A.5', 'Organizational', 'organizational'),
        themeItem(soa, 'A.6', 'People', 'people'),
        themeItem(soa, 'A.7', 'Physical', 'physical'),
        themeItem(soa, 'A.8', 'Technological', 'technological'),
      ],
    },
  ];
}
