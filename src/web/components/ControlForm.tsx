import { useState } from 'react';
import type { ControlDto } from '../../shared/schemas';
import { ApiClientError, api } from '../lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FrequencyKind = 'once' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'explicit';

const EMPTY = {
  code: '',
  title: '',
  description: '',
  referentiel: 'iso_27001',
  reference: '',
  domain: '',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: '',
  frequency: 'quarterly' as FrequencyKind,
  anchor: '2028-03-31',
  explicitDates: '',
  active_from: '',
  active_to: '',
};

function buildSchedule(state: typeof EMPTY) {
  if (state.frequency === 'once') return { kind: 'once', date: state.anchor };
  if (state.frequency === 'explicit') {
    return {
      kind: 'explicit',
      dates: state.explicitDates
        .split(/[|,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  return { kind: state.frequency, anchorDate: state.anchor };
}

export function ControlForm({
  planId,
  onCreated,
}: {
  planId: string;
  onCreated: (control: ControlDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const update = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  async function submit() {
    setError(null);
    setFields({});
    try {
      const result = await api.post<{ control: ControlDto }>(`/api/plans/${planId}/controls`, {
        code: state.code,
        title: state.title,
        description: state.description,
        referentiel: state.referentiel,
        reference: state.reference,
        domain: state.domain,
        owner_name: state.owner_name,
        method: state.method,
        expected_evidence: state.expected_evidence,
        automated: state.automated,
        automation_github_url: state.automated ? state.automation_github_url || null : null,
        schedule: buildSchedule(state),
        active_from: state.active_from || null,
        active_to: state.active_to || null,
      });
      onCreated(result.control);
      setState(EMPTY);
      setOpen(false);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(`${cause.code} — ${cause.message}`);
        setFields(cause.fields);
      } else {
        setError(String(cause));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nouveau contrôle</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau contrôle</DialogTitle>
          <DialogDescription>
            La définition complète et le planning sont enregistrés dans une seule transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={state.code} onChange={(e) => update('code', e.target.value)} />
            {fields.code ? <p className="text-xs text-red-700">{fields.code.join(', ')}</p> : null}
          </div>
          <div>
            <Label htmlFor="reference">Référence</Label>
            <Input id="reference" value={state.reference} onChange={(e) => update('reference', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={state.title} onChange={(e) => update('title', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              className="min-h-20 w-full rounded-md border border-[var(--color-border-brand)] p-2 text-sm"
              value={state.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="referentiel">Référentiel</Label>
            <select
              id="referentiel"
              className="w-full rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
              value={state.referentiel}
              onChange={(e) => update('referentiel', e.target.value)}
            >
              <option value="iso_27001">ISO 27001</option>
              <option value="isae_3402_t2">ISAE 3402 Type 2</option>
              <option value="iso_27001_isae_3402_t2">ISO 27001 + ISAE 3402 Type 2</option>
            </select>
          </div>
          <div>
            <Label htmlFor="domain">Domaine</Label>
            <Input id="domain" value={state.domain} onChange={(e) => update('domain', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="owner_name">Responsable</Label>
            <Input id="owner_name" value={state.owner_name} onChange={(e) => update('owner_name', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="frequency">Fréquence</Label>
            <select
              id="frequency"
              className="w-full rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
              value={state.frequency}
              onChange={(e) => update('frequency', e.target.value as FrequencyKind)}
            >
              <option value="once">Ponctuel</option>
              <option value="monthly">Mensuel</option>
              <option value="quarterly">Trimestriel</option>
              <option value="semiannual">Semestriel</option>
              <option value="annual">Annuel</option>
              <option value="explicit">Dates explicites</option>
            </select>
          </div>
          {state.frequency === 'explicit' ? (
            <div className="sm:col-span-2">
              <Label htmlFor="explicitDates">Dates (séparées par | )</Label>
              <Input
                id="explicitDates"
                value={state.explicitDates}
                onChange={(e) => update('explicitDates', e.target.value)}
                placeholder="2028-01-31|2028-04-30"
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="anchor">{state.frequency === 'once' ? 'Date' : 'Ancre'}</Label>
              <Input
                id="anchor"
                type="date"
                value={state.anchor}
                onChange={(e) => update('anchor', e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="active_from">Début d'activité</Label>
            <Input
              id="active_from"
              type="date"
              value={state.active_from}
              onChange={(e) => update('active_from', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="active_to">Fin d'activité</Label>
            <Input
              id="active_to"
              type="date"
              value={state.active_to}
              onChange={(e) => update('active_to', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="automated"
              type="checkbox"
              checked={state.automated}
              onChange={(e) => update('automated', e.target.checked)}
            />
            <Label htmlFor="automated">Automatisé</Label>
          </div>
          {state.automated ? (
            <div className="sm:col-span-2">
              <Label htmlFor="automation_github_url">URL GitHub (facultatif)</Label>
              <Input
                id="automation_github_url"
                value={state.automation_github_url}
                onChange={(e) => update('automation_github_url', e.target.value)}
                placeholder="https://github.com/org/repo"
              />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={submit}>Créer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
