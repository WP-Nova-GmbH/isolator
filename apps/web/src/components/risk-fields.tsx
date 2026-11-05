import { useState } from 'react';
import { Field, FieldGrid, FieldSection } from '@/components/field';
import { OwnerSelect } from '@/components/owner-select';
import { RiskScore } from '@/components/risk-score';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { aYearFromNow } from '@/lib/dates';
import { useAppData } from '@/lib/members';
import { treatmentLabels, type RiskDetail } from '@/lib/risks';

const levels = [1, 2, 3, 4, 5];

function LevelSelect({
  name,
  label,
  value,
  optional,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={name}>
      <NativeSelect
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {optional && <option value="">Not set</option>}
        {levels.map((level) => (
          <option key={level}>{level}</option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function ScoreCard({
  title,
  prefix,
  likelihood,
  impact,
  optional,
}: {
  title: string;
  prefix: 'likelihood' | 'residual';
  likelihood: number | null | undefined;
  impact: number | null | undefined;
  optional?: boolean;
}) {
  const [l, setL] = useState(likelihood ? String(likelihood) : '');
  const [i, setI] = useState(impact ? String(impact) : '');
  const names =
    prefix === 'likelihood'
      ? { likelihood: 'likelihood', impact: 'impact' }
      : { likelihood: 'residualLikelihood', impact: 'residualImpact' };

  return (
    <FieldSection
      title={title}
      aside={
        l && i ? (
          <RiskScore likelihood={Number(l)} impact={Number(i)} />
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <LevelSelect
          name={names.likelihood}
          label="Likelihood"
          value={l}
          optional={optional}
          onChange={setL}
        />
        <LevelSelect
          name={names.impact}
          label="Impact"
          value={i}
          optional={optional}
          onChange={setI}
        />
      </div>
    </FieldSection>
  );
}

/** The fields of a risk. Goes inside a form; riskPayload reads them back out. */
export function RiskFields({ risk }: { risk?: RiskDetail }) {
  const { me } = useAppData();

  return (
    <>
      <FieldSection label="Risk">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={risk?.title} required />
        </Field>
        <Field label="What could happen" htmlFor="description">
          <Textarea id="description" name="description" defaultValue={risk?.description} />
        </Field>
        <FieldGrid>
          <Field label="Risk treatment" htmlFor="treatment">
            <NativeSelect id="treatment" name="treatment" defaultValue={risk?.treatment ?? ''}>
              <option value="">Not set</option>
              {Object.entries(treatmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Risk owner" htmlFor="ownerId">
            <OwnerSelect id="ownerId" name="ownerId" defaultValue={risk?.ownerId ?? me.id} />
          </Field>
          <Field label="Review on" htmlFor="reviewOn">
            <Input
              id="reviewOn"
              name="reviewOn"
              type="date"
              defaultValue={risk?.reviewOn ?? aYearFromNow()}
              required
            />
          </Field>
        </FieldGrid>
      </FieldSection>

      <section
        aria-label="Scores"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3"
      >
        <ScoreCard
          title="Before treatment"
          prefix="likelihood"
          likelihood={risk?.likelihood ?? 3}
          impact={risk?.impact ?? 3}
        />
        <ScoreCard
          title="After treatment"
          prefix="residual"
          likelihood={risk?.residualLikelihood}
          impact={risk?.residualImpact}
          optional
        />
      </section>
    </>
  );
}
