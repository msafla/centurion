import { parse } from 'csv-parse/sync';

const MAX_COLUMNS = 100;
const MAX_RECORD_BYTES = 64 * 1024;

export type CsvParseResult = { rows: string[][]; separator: ',' | ';' | null };

export function detectSeparator(text: string): ',' | ';' | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  if (commas === semicolons) return null;
  return commas > semicolons ? ',' : ';';
}

export function parseCsv(text: string, separator: ',' | ';'): string[][] {
  const rows = parse(text, {
    delimiter: separator,
    bom: true,
    relax_column_count: false,
    relax_quotes: false,
    skip_empty_lines: false,
    trim: false,
  }) as string[][];

  for (const row of rows) {
    if (row.length > MAX_COLUMNS) throw new Error('csv_too_many_columns');
    for (const cell of row) {
      if (Buffer.byteLength(cell, 'utf8') > MAX_RECORD_BYTES) throw new Error('csv_record_too_large');
    }
  }
  return rows;
}
