import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReportDto } from '../domain/report';
import { AppError } from '../http/errors';

export const PDF_MAX_ROWS = 1_000;
const PDF_MAX_BYTES = 64 * 1024 * 1024;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fontCandidates(name: string): string[] {
  return [
    join(process.cwd(), 'public', 'fonts', name),
    join(process.cwd(), 'dist', 'web', 'fonts', name),
  ];
}

function loadFont(name: string, weight: number): unknown {
  for (const path of fontCandidates(name)) {
    if (existsSync(path)) {
      return { name: 'Poppins', data: new Uint8Array(readFileSync(path)), weight, style: 'normal' };
    }
  }
  return null;
}

/**
 * Renders the report snapshot to a bounded PDF with local Poppins. The DTO is
 * already detached from the database, so no DB read happens during rendering.
 * `takumi-pdf` is imported lazily so CSV-only paths never load the renderer.
 */
export async function buildReportPdf(report: ReportDto): Promise<Uint8Array> {
  if (report.rows.total > PDF_MAX_ROWS) {
    throw new AppError(422, 'report_too_large', 'PDF limited to 1000 occurrences; filter or use CSV');
  }

  const rows = report.rows.items;
  const tableRows = rows
    .map(
      (occurrence) =>
        `<tr><td>${escapeHtml(occurrence.control.code)} — ${escapeHtml(occurrence.control.title)}</td>` +
        `<td>${escapeHtml(occurrence.control.referentials.join(' + '))}</td>` +
        `<td>${escapeHtml(occurrence.occurrence_date)}</td>` +
        `<td>${occurrence.control.automated ? 'Oui' : 'Non'}</td>` +
        `<td>${occurrence.realization ? (occurrence.realization.fait ? 'Oui' : 'Non') : '—'}</td>` +
        `<td>${escapeHtml(occurrence.realization?.conformite ?? '')}</td></tr>`,
    )
    .join('');

  const details = rows
    .filter((occurrence) => occurrence.realization?.comment || occurrence.realization?.evidence_ref)
    .map(
      (occurrence) =>
        `<div class="detail"><h3>${escapeHtml(occurrence.control.code)} — ${escapeHtml(occurrence.occurrence_date)}</h3>` +
        `<p>${escapeHtml(occurrence.realization?.comment ?? '')}</p>` +
        `<p>${escapeHtml(occurrence.realization?.evidence_ref ?? '')}</p></div>`,
    )
    .join('');

  const body =
    rows.length === 0
      ? '<p>Aucune occurrence pour ces filtres</p>'
      : `<table><thead><tr><th>Contrôle</th><th>Référentiel</th><th>Date</th><th>Auto</th><th>FAIT</th><th>Conformité</th></tr></thead><tbody>${tableRows}</tbody></table>`;

  const html =
    '<style>body{font-family:Poppins;font-size:12px} table{width:100%;border-collapse:collapse} ' +
    'th,td{border-bottom:1px solid #E5E0F0;padding:4px;text-align:left} h1{font-size:20px} .detail{margin-top:12px}</style>' +
    `<h1>Rapport CENTURION — ${escapeHtml(report.plan.name)}</h1>` +
    "<p>Document généré par CENTURION — ne constitue pas une opinion d'assurance.</p>" +
    body +
    details;

  const fonts = [
    loadFont('Poppins-Light.ttf', 300),
    loadFont('Poppins-Regular.ttf', 400),
    loadFont('Poppins-SemiBold.ttf', 600),
  ].filter((font): font is NonNullable<typeof font> => font !== null);

  const { render } = (await import('takumi-pdf')) as {
    render: (input: string, options: Record<string, unknown>) => Promise<Uint8Array>;
  };
  const bytes = await render(html, { size: 'a4', landscape: true, fonts });
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new AppError(422, 'report_too_large', 'PDF exceeds 64 MiB');
  }
  return bytes;
}
