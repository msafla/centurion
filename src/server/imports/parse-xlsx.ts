import ExcelJS from 'exceljs';

export type XlsxParseResult = { sheetNames: string[]; rows: string[][] };

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

function cellToText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return String(value.result ?? '');
    return '';
  }
  return String(value);
}

/**
 * Parses an .xlsx workbook after the ZIP preflight. Rejects any formula cell in
 * any sheet (even unselected) and converts native dates to civil dates in UTC
 * without a local timezone.
 */
export async function parseXlsx(buffer: Buffer, sheetName: string): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) throw new Error('xlsx_formula_not_allowed');
      });
    });
  }

  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error('xlsx_sheet_not_found');

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(cellToText(cell));
    });
    rows.push(values);
  });

  return { sheetNames: workbook.worksheets.map((worksheet) => worksheet.name), rows };
}

export function sampleRows(rows: string[][], count: number): string[][] {
  return rows.slice(1, 1 + count);
}

export async function inspectXlsx(
  buffer: Buffer,
): Promise<{ sheetNames: string[]; headers: string[]; sample: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const first = workbook.worksheets[0];
  if (!first) throw new Error('xlsx_no_sheet');
  const rows: string[][] = [];
  first.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cellToText(cell)));
    rows.push(values);
  });
  return {
    sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
    headers: rows[0] ?? [],
    sample: rows.slice(1, 6),
  };
}
