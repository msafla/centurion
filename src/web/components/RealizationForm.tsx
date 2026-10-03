import { useState } from 'react';
import type { OccurrenceDto } from '../../shared/schemas';
import { ApiClientError, api } from '../lib/api';
import { CONFORMITE_LABELS } from '../lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RealizationForm({
  planId,
  occurrence,
  open,
  onOpenChange,
  onSaved,
}: {
  planId: string;
  occurrence: OccurrenceDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (occurrence: OccurrenceDto) => void;
}) {
  const [fait, setFait] = useState<boolean | null>(occurrence.realization?.fait ?? null);
  const [conformite, setConformite] = useState(
    occurrence.realization?.conformite ?? 'conforme',
  );
  const [completedDate, setCompletedDate] = useState(
    occurrence.realization?.completed_date ?? new Date().toISOString().slice(0, 10),
  );
  const [comment, setComment] = useState(occurrence.realization?.comment ?? '');
  const [evidence, setEvidence] = useState(occurrence.realization?.evidence_ref ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (fait === null) {
      setError('Le choix FAIT est obligatoire.');
      return;
    }
    setError(null);
    try {
      const saved = await api.put<OccurrenceDto>(
        `/api/plans/${planId}/occurrences/${occurrence.id}/status`,
        {
          fait,
          conformite: fait ? conformite : 'non_applicable',
          completed_date: completedDate,
          comment,
          evidence_ref: fait && evidence ? evidence : null,
        },
      );
      onSaved(saved);
      onOpenChange(false);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(`${cause.code} — ${cause.message}`);
      } else {
        setError(String(cause));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Réalisation — {occurrence.control.code} ({occurrence.occurrence_date})
          </DialogTitle>
          <DialogDescription>
            Une correction conserve l'identifiant de la réalisation. « Non » force Non applicable et
            efface la preuve obtenue.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">FAIT</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="fait" checked={fait === true} onChange={() => setFait(true)} />
              Oui
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="fait" checked={fait === false} onChange={() => setFait(false)} />
              Non
            </label>
          </div>
        </fieldset>

        <div>
          <Label htmlFor="completed_date">Date de réalisation</Label>
          <Input
            id="completed_date"
            type="date"
            value={completedDate}
            onChange={(event) => setCompletedDate(event.target.value)}
          />
        </div>

        {fait === false ? (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            Non réalisé : conformité Non applicable, preuve obtenue effacée.
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="conformite">Conformité</Label>
              <select
                id="conformite"
                className="w-full rounded-md border border-[var(--color-border-brand)] bg-white px-2 py-2 text-sm"
                value={conformite}
                onChange={(event) => setConformite(event.target.value as typeof conformite)}
              >
                {Object.entries(CONFORMITE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="evidence_ref">Preuve obtenue (texte)</Label>
              <Input
                id="evidence_ref"
                value={evidence ?? ''}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <Label htmlFor="comment">Commentaire</Label>
          <textarea
            id="comment"
            className="min-h-20 w-full rounded-md border border-[var(--color-border-brand)] p-2 text-sm"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
