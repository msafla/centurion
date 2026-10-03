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

type Preview = {
  preview_id: string;
  counts: { keep: number; supersede: number; create: number };
  truncated: boolean;
};

export function SchedulePreview({
  planId,
  control,
  onApplied,
}: {
  planId: string;
  control: ControlDto;
  onApplied: (control: ControlDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<FrequencyKind>(
    control.schedule.kind === 'once' ? 'once' : control.schedule.kind,
  );
  const [anchor, setAnchor] = useState(
    control.schedule.kind === 'once'
      ? control.schedule.date
      : control.schedule.kind === 'explicit'
        ? ''
        : control.schedule.anchorDate,
  );
  const [explicitDates, setExplicitDates] = useState(
    control.schedule.kind === 'explicit' ? control.schedule.dates.join('|') : '',
  );
  const [effectiveDate, setEffectiveDate] = useState(control.active_from ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function schedulePayload() {
    if (frequency === 'once') return { kind: 'once', date: anchor };
    if (frequency === 'explicit') {
      return {
        kind: 'explicit',
        dates: explicitDates
          .split(/[|,]/)
          .map((value) => value.trim())
          .filter(Boolean),
      };
    }
    return { kind: frequency, anchorDate: anchor };
  }

  async function requestPreview() {
    setError(null);
    try {
      const result = await api.post<Preview>(
        `/api/plans/${planId}/controls/${control.id}/schedule-preview`,
        {
          schedule: schedulePayload(),
          active_from: control.active_from,
          active_to: control.active_to,
          effective_date: effectiveDate,
        },
      );
      setPreview(result);
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  async function apply() {
    if (!preview) return;
    setError(null);
    try {
      const result = await api.post<{ control: ControlDto }>(
        `/api/plans/${planId}/controls/${control.id}/schedule-apply`,
        { preview_id: preview.preview_id },
      );
      onApplied(result.control);
      setOpen(false);
    } catch (cause) {
      if (cause instanceof ApiClientError) setError(`${cause.code} — ${cause.message}`);
      else setError(String(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Modifier le planning</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Changement de planning — {control.code}</DialogTitle>
          <DialogDescription>
            Un aperçu est calculé et appliqué par identifiant. Toute modification métier entre-temps
            invalide l'aperçu (409).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor="frequency">Fréquence</Label>
            <select
              id="frequency"
              className="w-full rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
              value={frequency}
              onChange={(event) => {
                setFrequency(event.target.value as FrequencyKind);
                setPreview(null);
              }}
            >
              <option value="once">Ponctuel</option>
              <option value="monthly">Mensuel</option>
              <option value="quarterly">Trimestriel</option>
              <option value="semiannual">Semestriel</option>
              <option value="annual">Annuel</option>
              <option value="explicit">Dates explicites</option>
            </select>
          </div>
          {frequency === 'explicit' ? (
            <div>
              <Label htmlFor="explicitDates">Dates (séparées par | )</Label>
              <Input
                id="explicitDates"
                value={explicitDates}
                onChange={(event) => setExplicitDates(event.target.value)}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="anchor">{frequency === 'once' ? 'Date' : 'Ancre'}</Label>
              <Input
                id="anchor"
                type="date"
                value={anchor}
                onChange={(event) => setAnchor(event.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="schedule-effective">Date d'effet du planning</Label>
            <Input
              id="schedule-effective"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </div>
        </div>

        {preview ? (
          <p className="rounded-md bg-[var(--color-surface-soft)] p-3 text-sm">
            Conservées : {preview.counts.keep} · Supplantées : {preview.counts.supersede} · Créées :{' '}
            {preview.counts.create}
            {preview.truncated ? ' (échantillon tronqué)' : ''}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={requestPreview}>
            Aperçu
          </Button>
          <Button disabled={!preview} onClick={apply}>
            Appliquer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
