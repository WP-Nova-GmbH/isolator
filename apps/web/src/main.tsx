import { ClerkProvider } from '@clerk/react';
import { shadcn } from '@clerk/ui/themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api, renewSessionOnReturn } from '@/lib/api';
import { appLoader } from '@/lib/members';
import './index.css';
import {
  AcceptInvite,
  acceptInviteAction,
  acceptInviteLoader,
  InviteError,
} from './routes/accept-invite';
import { AssetDetail, assetDetailAction, assetDetailLoader } from './routes/asset-detail';
import { AssetNew, assetNewAction, assetNewLoader } from './routes/asset-new';
import { Assets, assetsLoader } from './routes/assets';
import { AuditFile, auditFileLoader } from './routes/audit-file';
import { AuditTrail, auditTrailLoader } from './routes/audit-trail';
import { Claim, claimAction, claimLoader } from './routes/claim';
import {
  DocumentDetail,
  documentDetailAction,
  documentDetailLoader,
} from './routes/document-detail';
import { DocumentNew, documentNewAction } from './routes/document-new';
import { Documents, documentsLoader } from './routes/documents';
import { Evidence, evidenceAction, evidenceLoader } from './routes/evidence';
import { IncidentDetail, incidentDetailAction, incidentDetailLoader } from './routes/incident-detail';
import { IncidentNew, incidentNewAction, incidentNewLoader } from './routes/incident-new';
import { Incidents, incidentsLoader } from './routes/incidents';
import { Layout } from './routes/layout';
import { Members, membersAction, membersLoader } from './routes/members';
import { Nonconformities, nonconformitiesLoader } from './routes/nonconformities';
import {
  NonconformityDetail,
  nonconformityDetailAction,
  nonconformityDetailLoader,
} from './routes/nonconformity-detail';
import { NonconformityNew, nonconformityNewAction } from './routes/nonconformity-new';
import { NotFound } from './routes/not-found';
import { Organizations, organizationsAction, organizationsLoader } from './routes/organizations';
import { Overview, overviewLoader } from './routes/overview';
import { ApiUnreachable, RouteError } from './routes/route-error';
import { RiskAssessment, riskAssessmentLoader } from './routes/risk-assessment';
import {
  RiskAssessments,
  riskAssessmentsAction,
  riskAssessmentsLoader,
} from './routes/risk-assessments';
import { RiskCriteria, riskCriteriaAction, riskCriteriaLoader } from './routes/risk-criteria';
import { RiskDetail, riskDetailAction, riskDetailLoader } from './routes/risk-detail';
import { RiskNew, riskNewAction } from './routes/risk-new';
import { Risks, risksLoader } from './routes/risks';
import { SignIn, signInLoader } from './routes/sign-in';
import { Soa, soaAction, soaLoader } from './routes/soa';
import { SoaEntry, soaEntryAction, soaEntryLoader } from './routes/soa-entry';
import {
  SupplierAssets,
  SupplierDetail,
  supplierDetailAction,
  supplierDetailLoader,
  SupplierFiles,
  SupplierReviews,
  SupplierTasks,
} from './routes/supplier-detail';
import { SupplierNew, supplierNewAction } from './routes/supplier-new';
import { Suppliers, suppliersLoader } from './routes/suppliers';
import { Tasks, tasksAction, tasksLoader } from './routes/tasks';

const routes: RouteObject[] = [
  {
    id: 'app',
    element: <Layout />,
    loader: appLoader,
    errorElement: <RouteError fullPage />,
    hydrateFallbackElement: <div className="min-h-svh bg-background" />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, loader: overviewLoader, element: <Overview /> },
          { path: 'tasks', loader: tasksLoader, action: tasksAction, element: <Tasks /> },
          { path: 'soa', loader: soaLoader, action: soaAction, element: <Soa /> },
          {
            path: 'soa/:ref',
            loader: soaEntryLoader,
            action: soaEntryAction,
            element: <SoaEntry />,
          },
          { path: 'risks', loader: risksLoader, element: <Risks /> },
          { path: 'risks/new', action: riskNewAction, element: <RiskNew /> },
          {
            path: 'risks/assessments',
            loader: riskAssessmentsLoader,
            action: riskAssessmentsAction,
            element: <RiskAssessments />,
          },
          {
            path: 'risks/assessments/:id',
            loader: riskAssessmentLoader,
            element: <RiskAssessment />,
          },
          {
            path: 'risks/criteria',
            loader: riskCriteriaLoader,
            action: riskCriteriaAction,
            element: <RiskCriteria />,
          },
          {
            path: 'risks/:ref',
            loader: riskDetailLoader,
            action: riskDetailAction,
            element: <RiskDetail />,
          },
          { path: 'assets', loader: assetsLoader, element: <Assets /> },
          {
            path: 'assets/new',
            loader: assetNewLoader,
            action: assetNewAction,
            element: <AssetNew />,
          },
          {
            path: 'assets/:id',
            loader: assetDetailLoader,
            action: assetDetailAction,
            element: <AssetDetail />,
          },
          { path: 'suppliers', loader: suppliersLoader, element: <Suppliers /> },
          { path: 'suppliers/new', action: supplierNewAction, element: <SupplierNew /> },
          {
            path: 'suppliers/:ref',
            loader: supplierDetailLoader,
            action: supplierDetailAction,
            element: <SupplierDetail />,
            // Each tab is a route. A form inside a tab posts to it, so each shares the action.
            children: [
              { index: true, action: supplierDetailAction, element: <SupplierFiles /> },
              { path: 'reviews', action: supplierDetailAction, element: <SupplierReviews /> },
              { path: 'tasks', action: supplierDetailAction, element: <SupplierTasks /> },
              { path: 'assets', action: supplierDetailAction, element: <SupplierAssets /> },
            ],
          },
          {
            path: 'evidence',
            loader: evidenceLoader,
            action: evidenceAction,
            element: <Evidence />,
          },
          { path: 'incidents', loader: incidentsLoader, element: <Incidents /> },
          {
            path: 'incidents/new',
            loader: incidentNewLoader,
            action: incidentNewAction,
            element: <IncidentNew />,
          },
          {
            path: 'incidents/:ref',
            loader: incidentDetailLoader,
            action: incidentDetailAction,
            element: <IncidentDetail />,
          },
          { path: 'nonconformities', loader: nonconformitiesLoader, element: <Nonconformities /> },
          {
            path: 'nonconformities/new',
            action: nonconformityNewAction,
            element: <NonconformityNew />,
          },
          {
            path: 'nonconformities/:ref',
            loader: nonconformityDetailLoader,
            action: nonconformityDetailAction,
            element: <NonconformityDetail />,
          },
          { path: 'documents', loader: documentsLoader, element: <Documents /> },
          { path: 'documents/new', action: documentNewAction, element: <DocumentNew /> },
          {
            path: 'documents/:id',
            loader: documentDetailLoader,
            action: documentDetailAction,
            element: <DocumentDetail />,
          },
          { path: 'audit-file', loader: auditFileLoader, element: <AuditFile /> },
          { path: 'audit-trail', loader: auditTrailLoader, element: <AuditTrail /> },
          { path: 'members', loader: membersLoader, action: membersAction, element: <Members /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
  {
    path: 'claim',
    loader: claimLoader,
    action: claimAction,
    element: <Claim />,
    errorElement: <RouteError fullPage />,
  },
  {
    path: 'sign-in',
    loader: signInLoader,
    element: <SignIn />,
    errorElement: <RouteError fullPage />,
  },
  {
    path: 'invite/:token',
    loader: acceptInviteLoader,
    action: acceptInviteAction,
    element: <AcceptInvite />,
    errorElement: <InviteError />,
  },
  {
    path: 'organizations',
    loader: organizationsLoader,
    action: organizationsAction,
    element: <Organizations />,
    errorElement: <RouteError fullPage />,
  },
];

async function start() {
  const root = createRoot(document.getElementById('root')!);
  const install = await api<{ clerkPublishableKey: string }>('/install', {
    signedOut: true,
  }).catch(() => null);
  if (!install) return root.render(<ApiUnreachable />);

  root.render(
    <StrictMode>
      <ClerkProvider
        publishableKey={install.clerkPublishableKey}
        afterSignOutUrl="/sign-in"
        appearance={{ theme: shadcn }}
      >
        <TooltipProvider>
          <RouterProvider router={createBrowserRouter(routes)} />
        </TooltipProvider>
      </ClerkProvider>
    </StrictMode>,
  );
  renewSessionOnReturn();
}

void start();
