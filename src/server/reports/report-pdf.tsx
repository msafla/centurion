import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import type { ReportDto } from '../domain/report';
import { AppError } from '../http/errors';
import {
  CenturionReportDocument,
  ReportPageFooter,
} from './components/pdf/report/report-document';
import {
  reportTocSections,
  type ReportSectionKey,
} from './components/pdf/report/report-contents';
import { ReportPageHeader } from './components/pdf/report/report-header';
import { PdfcnThemeProvider } from './components/pdf/theme-provider';
import { centurionPdfTheme } from './lib/pdf-themes/centurion';

export const PDF_MAX_ROWS = 1_000;
const PDF_MAX_BYTES = 64 * 1024 * 1024;

type PdfRender = (
  input: ReactNode,
  options: Record<string, unknown>,
) => Promise<Uint8Array>;

async function renderReport(
  render: PdfRender,
  report: ReportDto,
  tocPages: Partial<Record<ReportSectionKey, number>>,
  fonts: unknown[],
): Promise<Uint8Array> {
  return render(
    <PdfcnThemeProvider theme={centurionPdfTheme}>
      <CenturionReportDocument report={report} tocPages={tocPages} />
    </PdfcnThemeProvider>,
    {
      size: 'a4',
      landscape: true,
      fonts,
      header: (
        <PdfcnThemeProvider theme={centurionPdfTheme}>
          <ReportPageHeader report={report} />
        </PdfcnThemeProvider>
      ),
      footer: (
        <PdfcnThemeProvider theme={centurionPdfTheme}>
          <ReportPageFooter />
        </PdfcnThemeProvider>
      ),
      pages: { first: { header: false, footer: false } },
      margin: { top: 88, bottom: 48, left: 36, right: 36 },
    },
  );
}

async function locateContentsPages(
  bytes: Uint8Array,
  report: ReportDto,
): Promise<Partial<Record<ReportSectionKey, number>>> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text: pages } = await extractText(document, { mergePages: false });
  const pageNumbers: Partial<Record<ReportSectionKey, number>> = {};
  for (const section of reportTocSections(report)) {
    const pageIndex = pages.findIndex((page) => page.includes(section.marker));
    if (pageIndex < 0) {
      throw new AppError(500, 'pdf_toc_failed', 'Could not locate a report section for the table of contents');
    }
    pageNumbers[section.key] = pageIndex + 1;
  }
  return pageNumbers;
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
 * Renders the report snapshot to a bounded PDF with the local pdfcn components
 * and the CENTURION theme. The DTO is already detached from the database, so no
 * DB read happens during rendering. `takumi-pdf` is imported lazily so CSV-only
 * paths never load the renderer. User data stays React text, never HTML.
 */
export async function buildReportPdf(report: ReportDto): Promise<Uint8Array> {
  if (report.rows.total > PDF_MAX_ROWS) {
    throw new AppError(422, 'report_too_large', 'PDF limited to 1000 occurrences; filter or use CSV');
  }

  const fonts = [
    loadFont('Poppins-Light.ttf', 300),
    loadFont('Poppins-Regular.ttf', 400),
    loadFont('Poppins-SemiBold.ttf', 600),
  ].filter((font): font is NonNullable<typeof font> => font !== null);

  const { render } = (await import('takumi-pdf')) as unknown as { render: PdfRender };

  const firstPass = await renderReport(render, report, {}, fonts);
  if (firstPass.byteLength > PDF_MAX_BYTES) {
    throw new AppError(422, 'report_too_large', 'PDF exceeds 64 MiB');
  }
  const tocPages = await locateContentsPages(firstPass, report);
  const bytes = await renderReport(render, report, tocPages, fonts);

  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new AppError(422, 'report_too_large', 'PDF exceeds 64 MiB');
  }
  return bytes;
}
