import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const checks = [
  ['dist/web/index.html', resolve(root, 'dist', 'web', 'index.html')],
  ['dist/server/index.js', resolve(root, 'dist', 'server', 'index.js')],
  ['dist/mcp/server.js', resolve(root, 'dist', 'mcp', 'server.js')],
  ['migrations', resolve(root, 'src', 'server', 'db', 'migrations')],
];

for (const [name, path] of checks) {
  console.log(`${existsSync(path) ? 'OK' : 'MANQUANT'}: ${name}`);
}
console.log(`Node: ${process.version}`);
console.log(' Lancez "npm run check" pour la validation complete.');
