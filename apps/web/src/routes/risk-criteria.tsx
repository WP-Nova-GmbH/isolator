import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { RiskChip, type RiskBand } from '@/components/risk-score';
import { RiskTabs } from '@/components/tab-nav';
import { MainCell, Ref } from '@/components/table-parts';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, attempt } from '@/lib/api';
import type { RiskCriteria as Criteria } from '@/lib/risks';

const bands: { band: RiskBand; scores: string; label: string }[] = [
  { band: 'low', scores: '1–4', label: 'Low' },
  { band: 'medium', scores: '5–9', label: 'Medium' },
  { band: 'high', scores: '10–16', label: 'High' },
  { band: 'critical', scores: '20–25', label: 'Critical' },
];

export function riskCriteriaLoader() {
  return api<Criteria>('/risk-criteria');
}

export async function riskCriteriaAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return attempt(() =>
    api('/risk-criteria', {
      method: 'PUT',
      body: {
        acceptanceThreshold: Number(form.get('acceptanceThreshold')),
        likelihoodLevels: form.getAll('likelihoodLevels'),
        impactLevels: form.getAll('impactLevels'),
      },
    }),
  );
}

function LevelTable({
  title,
  name,
  levels,
}: {
  title: string;
  name: string;
  levels: string[];
}) {
  return (
    <section aria-label={`${title} levels`} className="flex flex-col gap-3">
      <h2>{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Level</TableHead>
            <TableHead>What it means here</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {levels.map((meaning, index) => (
            <TableRow key={index}>
              <TableCell>
                <Ref>{index + 1}</Ref>
              </TableCell>
              <MainCell>
                <Input
                  name={name}
                  aria-label={`${title} ${index + 1}`}
                  defaultValue={meaning}
                  required
                />
              </MainCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export function RiskCriteria() {
  const criteria = useLoaderData<typeof riskCriteriaLoader>();
  const result = useActionData<typeof riskCriteriaAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Risks"
        description="The 5 × 5 matrix is fixed. The threshold and the meaning of each level are yours."
        actions={
          <Button type="submit" form="criteria-form" disabled={navigation.state !== 'idle'}>
            Save criteria
          </Button>
        }
      />
      <RiskTabs />

      <FormError message={result?.error} />
      {result?.saved && navigation.state === 'idle' && (
        <Alert>
          <AlertTitle>Risk criteria saved</AlertTitle>
        </Alert>
      )}

      <Form id="criteria-form" method="post" className="flex flex-col gap-6">
        <Card aria-label="Acceptance threshold" className="flex flex-col gap-4">
          <h2>Acceptance threshold</h2>
          <Field
            label="Highest score you accept without treatment"
            htmlFor="threshold"
            className="max-w-68"
          >
            <Input
              id="threshold"
              name="acceptanceThreshold"
              type="number"
              min={1}
              max={25}
              defaultValue={criteria.acceptanceThreshold}
              required
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {bands.map(({ band, scores, label }) => (
              <span key={band} className="flex items-center gap-2 pr-2">
                <RiskChip band={band}>{scores}</RiskChip>
                <span className="text-muted-foreground">{label}</span>
              </span>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-8">
          <LevelTable title="Likelihood" name="likelihoodLevels" levels={criteria.likelihoodLevels} />
          <LevelTable title="Impact" name="impactLevels" levels={criteria.impactLevels} />
        </div>
      </Form>
    </>
  );
}
