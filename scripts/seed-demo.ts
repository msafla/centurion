import { resolve } from 'node:path';
import { canonicalDataDir, ensurePrivateDir } from '../src/server/storage/paths';
import { seedDemo } from './demo-data';

const raw = process.env.CENTURION_DATA_DIR ?? resolve('data/demo');
const dataDir = canonicalDataDir(raw);
ensurePrivateDir(dataDir);
seedDemo(dataDir);
process.stdout.write(`Demo data seeded at ${dataDir}\n`);
