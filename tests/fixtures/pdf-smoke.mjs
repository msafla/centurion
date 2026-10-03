import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { render } from 'takumi-pdf';

const outPath = process.argv[2] ?? '/tmp/opencode/centurion-smoke.pdf';
const font = (name, weight) => ({
  name: 'Poppins',
  data: new Uint8Array(readFileSync(resolve('public/fonts', name))),
  weight,
  style: 'normal',
});

const fonts = [
  font('Poppins-Light.ttf', 300),
  font('Poppins-Regular.ttf', 400),
  font('Poppins-SemiBold.ttf', 600),
];

const paragraphs = Array.from(
  { length: 60 },
  (_, i) =>
    `<p>Ligne ${i + 1} — contrôle annuel, conformité, réalisé, non applicable, caractères accentués éàçüö.</p>`,
).join('');

const html = `<style>body{font-family:Poppins;font-size:14px}</style><h1>Rapport CENTURION — contrôle annuel 2028</h1>${paragraphs}`;

const pdf = await render(html, { size: 'a4', landscape: true, fonts });
const byteLength = pdf.byteLength;
writeFileSync(outPath, pdf);

const doc = await getDocumentProxy(pdf);
const { text } = await extractText(doc, { mergePages: true });

console.log(
  JSON.stringify({
    byteLength,
    pages: doc.numPages,
    hasTitle: text.includes('CENTURION'),
    hasAccents: text.includes('éàçüö'),
  }),
);
