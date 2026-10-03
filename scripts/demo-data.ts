import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Schedule } from '../src/shared/schemas';
import { openDatabase } from '../src/server/db/database';
import { scheduleToStorage } from '../src/server/domain/controls';
import { generateDates } from '../src/server/domain/schedule';

export const DEMO_CLOCK = '2028-04-15T10:00:00.000Z';
export const DEMO_YEAR = 2028;

/** Stable UUID derived from a key so two resets produce the same identifiers. */
export function demoUuid(key: string): string {
  const hex = createHash('sha1').update(`centurion-demo:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type Completed = {
  date: string;
  fait: boolean;
  conformite: string;
  comment: string;
  evidence: string | null;
};

type DemoControl = {
  code: string;
  title: string;
  description: string;
  referentials: string[];
  reference: string;
  domain: string;
  owner_name: string;
  method: string;
  expected_evidence: string;
  automated: boolean;
  url: string | null;
  schedule: Schedule;
  completed: Completed[];
  superseded: string[];
};

const CONTROLS: DemoControl[] = [
  {
    code: 'ACC-01',
    title: 'Revue des accès',
    description: 'Revue mensuelle des habilitations et des comptes à privilèges.',
    referentials: ['iso_27001'],
    reference: 'A.9.2',
    domain: 'Gouvernance',
    owner_name: 'Alice Martin',
    method: 'Entretien et extraction des journaux',
    expected_evidence: 'Compte rendu de revue signé',
    automated: false,
    url: null,
    schedule: { kind: 'monthly', anchorDate: '2028-01-31' },
    completed: [
      { date: '2028-01-31', fait: true, conformite: 'conforme', comment: 'Revue complète.', evidence: 'CR-2028-01' },
      { date: '2028-02-29', fait: true, conformite: 'non_conforme', comment: 'Deux comptes orphelins.', evidence: 'CR-2028-02' },
      { date: '2028-03-31', fait: true, conformite: 'partiellement_conforme', comment: 'Corrections en cours.', evidence: 'CR-2028-03' },
    ],
    superseded: [],
  },
  {
    code: 'ACC-02',
    title: 'Sauvegardes',
    description: 'Vérification trimestrielle des sauvegardes et des restaurations.',
    referentials: ['iso_27001', 'pci_dss'],
    reference: 'A.12.3',
    domain: 'Exploitation',
    owner_name: 'Bob Durand',
    method: 'Contrôle automatisé',
    expected_evidence: 'Journal de sauvegarde',
    automated: false,
    url: null,
    schedule: { kind: 'quarterly', anchorDate: '2028-01-31' },
    completed: [
      { date: '2028-01-31', fait: true, conformite: 'non_applicable', comment: 'Périmètre non concerné ce trimestre.', evidence: null },
    ],
    superseded: [],
  },
  {
    code: 'ACC-03',
    title: 'Clôture ISAE',
    description: 'Revue de clôture semestrielle des services concernés.',
    referentials: ['isae_3402_t2', 'soc_2'],
    reference: 'ISAE-1',
    domain: 'Finance',
    owner_name: 'Carol Neri',
    method: 'Revue documentaire',
    expected_evidence: 'Rapport de clôture',
    automated: false,
    url: null,
    schedule: { kind: 'semiannual', anchorDate: '2028-01-31' },
    completed: [
      { date: '2028-01-31', fait: false, conformite: 'non_applicable', comment: 'Non réalisé : données indisponibles.', evidence: null },
    ],
    superseded: [],
  },
  {
    code: 'ACC-04',
    title: 'Contrôle automatisé des correctifs',
    description: 'Vérifie l’application des correctifs de sécurité critiques.',
    referentials: ['iso_27001', 'isae_3402_t2'],
    reference: 'A.12.6',
    domain: 'Cybersécurité',
    owner_name: 'David Kim',
    method: 'Script de vérification',
    expected_evidence: 'Rapport du script',
    automated: true,
    url: 'https://github.com/centurion-demo/patch-check',
    schedule: { kind: 'annual', anchorDate: '2028-03-31' },
    completed: [
      { date: '2028-03-31', fait: true, conformite: 'conforme', comment: 'Tous les correctifs appliqués.', evidence: 'patch-2028' },
    ],
    superseded: [],
  },
  {
    code: 'ACC-05',
    title: 'Audit ponctuel fournisseur',
    description: 'Audit ponctuel d’un fournisseur critique.',
    referentials: ['isae_3402_t2'],
    reference: 'ISAE-2',
    domain: 'Achats',
    owner_name: 'Eve Laurent',
    method: 'Audit sur site',
    expected_evidence: 'Rapport d’audit',
    automated: false,
    url: null,
    schedule: { kind: 'once', date: '2028-02-15' },
    completed: [],
    superseded: [],
  },
  {
    code: 'ACC-06',
    title: 'Revue de politiques',
    description: 'Revue des politiques de sécurité aux dates clés.',
    referentials: ['iso_27001'],
    reference: 'A.5.1',
    domain: 'Gouvernance',
    owner_name: 'Frank Osei',
    method: 'Revue documentaire',
    expected_evidence: 'Politiques approuvées',
    automated: false,
    url: null,
    schedule: { kind: 'explicit', dates: ['2028-01-15', '2028-05-31', '2028-11-30'] },
    completed: [
      { date: '2028-01-15', fait: true, conformite: 'conforme', comment: 'Politiques approuvées.', evidence: 'POL-2028' },
    ],
    superseded: ['2028-11-30'],
  },
];

export function seedDemo(dataDir: string): void {
  const handle = openDatabase(join(dataDir, 'centurion.sqlite'));
  try {
    const now = DEMO_CLOCK;
    const planId = demoUuid('plan');
    handle.db
      .prepare(
        `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
         VALUES (?, ?, 'Plan annuel 2028', 'Périmètre de démonstration', 0, ?, ?)`,
      )
      .run(planId, DEMO_YEAR, now, now);

    for (const control of CONTROLS) {
      const controlId = demoUuid(`control-${control.code}`);
      const storage = scheduleToStorage(control.schedule);
      handle.db
        .prepare(
          `INSERT INTO controls
             (id, plan_id, code, title, description, reference, domain, owner_name,
              method, expected_evidence, automated, automation_github_url, frequency_kind,
              anchor_date, explicit_dates_json, active_from, active_to, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'active', ?, ?)`,
        )
        .run(
          controlId,
          planId,
          control.code,
          control.title,
          control.description,
          control.reference,
          control.domain,
          control.owner_name,
          control.method,
          control.expected_evidence,
          control.automated ? 1 : 0,
          control.url,
          storage.frequency_kind,
          storage.anchor_date,
          storage.explicit_dates_json,
          now,
          now,
        );

      const link = handle.db.prepare(
        `INSERT OR IGNORE INTO control_referentials (control_id, referential_id, created_at)
         SELECT ?, id, ? FROM referentials WHERE slug = ?`,
      );
      for (const slug of control.referentials) link.run(controlId, now, slug);

      const dates = generateDates(DEMO_YEAR, control.schedule, {
        active_from: null,
        active_to: null,
      });
      for (const date of dates) {
        const occurrenceId = demoUuid(`occ-${control.code}-${date}`);
        handle.db
          .prepare(
            `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
             VALUES (?, ?, ?, 'open', ?, ?)`,
          )
          .run(occurrenceId, controlId, date, now, now);
        const completed = control.completed.find((entry) => entry.date === date);
        if (completed) {
          handle.db
            .prepare(
              `INSERT INTO realizations
                 (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              demoUuid(`real-${control.code}-${date}`),
              occurrenceId,
              completed.date,
              completed.fait ? 1 : 0,
              completed.conformite,
              completed.comment,
              completed.evidence,
              now,
              now,
            );
        }
      }
      for (const date of control.superseded) {
        handle.db
          .prepare("UPDATE occurrences SET state = 'superseded' WHERE id = ?")
          .run(demoUuid(`occ-${control.code}-${date}`));
      }
    }

    handle.db
      .prepare(
        `INSERT INTO audit_events
           (id, entity_type, entity_id, plan_id, control_id, action, at_utc, before_json, after_json, source, created_at)
         VALUES (?, 'database', ?, ?, NULL, 'seed', ?, NULL, NULL, 'system', ?)`,
      )
      .run(demoUuid('audit-seed'), planId, planId, now, now);
  } finally {
    handle.close();
  }
}
