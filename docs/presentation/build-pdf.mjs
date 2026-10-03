import { chromium } from '@playwright/test';
import { getDocumentProxy } from 'unpdf';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const input = `file://${path.join(dir, 'index.html')}`;
const output = path.join(dir, 'CENTURION-presentation.pdf');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(input, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const slides = await page.locator('.slide').count();
  if (slides !== 8) throw new Error(`Expected 8 slides, found ${slides}`);
  await page.pdf({ path: output, width: '13.333in', height: '7.5in', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
} finally {
  await browser.close();
}
const bytes = await readFile(output);
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const pages = pdf.numPages;
if (pages !== 8) throw new Error(`Expected 8 PDF pages, found ${pages}`);
console.log(JSON.stringify({ output, pages, bytes: bytes.byteLength }));
