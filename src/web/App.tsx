import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SECTIONS = ['Synthèse', 'Plan annuel', 'Référentiels', 'Reporting', 'Import', 'Paramètres'];

export function App() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-full bg-[var(--color-surface)] text-[var(--color-ink)]">
      <header className="border-b border-[var(--color-border-brand)] bg-white">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4"
        >
          <span className="text-lg font-semibold tracking-tight text-[var(--color-brand-primary)]">
            CENTURION
          </span>
          <ul className="flex flex-wrap gap-4 text-sm text-[var(--color-text-secondary)]">
            {SECTIONS.map((section) => (
              <li key={section}>
                <span>{section}</span>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-light tracking-tight">Plan annuel de contrôles</h1>
        <p className="mt-4 max-w-2xl text-[var(--color-text-secondary)]">
          Suivi, traçabilité et reporting des contrôles annuels. Application locale mono-utilisateur.
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="mt-8">À propos</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>À propos de CENTURION</DialogTitle>
              <DialogDescription>
                Projet local indépendant. Les références ISO 27001 et ISAE 3402 servent à illustrer le
                suivi ; elles ne constituent pas une opinion d'assurance.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => setOpen(false)}>Fermer</Button>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
