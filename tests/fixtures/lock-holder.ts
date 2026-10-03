import { acquireInstanceLock } from '../../src/server/storage/instance-lock';

const dir = process.argv[2];
if (!dir) throw new Error('missing data directory argument');

try {
  const lock = await acquireInstanceLock(dir);
  process.stdout.write('LOCKED\n');
  process.on('SIGTERM', () => {
    void lock.release().then(() => process.exit(0));
  });
  setInterval(() => undefined, 1000);
} catch (error) {
  const code = (error as { code?: string }).code ?? (error as Error).message;
  process.stderr.write(`ERROR ${code}\n`);
  process.exit(3);
}
