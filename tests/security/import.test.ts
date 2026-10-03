import { crc32 } from 'node:zlib';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/server/imports/parse-csv';
import { parseXlsx } from '../../src/server/imports/parse-xlsx';
import { preflightZip } from '../../src/server/imports/zip-preflight';

/** Minimal stored ZIP builder so hostile names/duplicates can be crafted. */
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const size = entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

describe('zip preflight', () => {
  it('accepts a normal archive and counts decompressed bytes', async () => {
    const result = await preflightZip(buildZip([{ name: 'xl/workbook.xml', data: Buffer.from('hello') }]));
    expect(result.entries).toBe(1);
    expect(result.uncompressedBytes).toBe(5);
  });

  it('refuses traversal and duplicate entries', async () => {
    await expect(
      preflightZip(buildZip([{ name: '../evil', data: Buffer.from('x') }])),
    ).rejects.toThrow('zip_traversal');
    await expect(
      preflightZip(
        buildZip([
          { name: 'dup.xml', data: Buffer.from('a') },
          { name: 'dup.xml', data: Buffer.from('b') },
        ]),
      ),
    ).rejects.toThrow('zip_duplicate_entry');
  });

  it('refuses macros and oversized archives', async () => {
    await expect(
      preflightZip(buildZip([{ name: 'xl/vbaProject.bin', data: Buffer.from('x') }])),
    ).rejects.toThrow('zip_macro');
    await expect(
      preflightZip(buildZip([{ name: 'xl/huge.xml', data: Buffer.alloc(26 * 1024 * 1024) }])),
    ).rejects.toThrow('zip_too_large');
  });

  it('refuses too many entries', async () => {
    const entries = Array.from({ length: 2_001 }, (_, index) => ({
      name: `entry-${index}.xml`,
      data: Buffer.from('x'),
    }));
    await expect(preflightZip(buildZip(entries))).rejects.toThrow('zip_too_many_entries');
  });
});

describe('xlsx formula rejection', () => {
  it('refuses a formula in an unselected sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet('Data');
    first.addRow(['code', 'title']);
    first.addRow(['C1', 'Titre']);
    const second = workbook.addWorksheet('Hidden');
    second.getCell('A1').value = { formula: '1+1', result: 2 } as ExcelJS.CellFormulaValue;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseXlsx(buffer, 'Data')).rejects.toThrow('xlsx_formula_not_allowed');
  });
});

describe('csv parsing', () => {
  it('keeps BOM handling, quotes, newlines and formula text as data', () => {
    const text = '\uFEFFcode;title\r\nC1;"ligne 1\nligne 2"\r\nC2;"=SUM(A1)"\r\n';
    const rows = parseCsv(text, ';');
    expect(rows[0]).toEqual(['code', 'title']);
    expect(rows[1]?.[1]).toBe('ligne 1\nligne 2');
    expect(rows[2]?.[1]).toBe('=SUM(A1)');
  });
});
