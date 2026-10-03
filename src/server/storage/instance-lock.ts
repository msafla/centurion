import lockfile from 'proper-lockfile';
import { AppError } from '../http/errors';

export type InstanceLock = {
  release(): Promise<void>;
  compromised: Promise<Error>;
  isCompromised(): boolean;
};

/**
 * Acquires an exclusive lock on the canonical data directory. A second
 * instance fails with `instance_already_running` and performs no write.
 */
export async function acquireInstanceLock(dataDir: string): Promise<InstanceLock> {
  let compromised = false;
  let resolveCompromised: (error: Error) => void = () => {};
  const compromisedPromise = new Promise<Error>((resolve) => {
    resolveCompromised = resolve;
  });

  try {
    const release = await lockfile.lock(dataDir, {
      stale: 30_000,
      update: 5_000,
      retries: 0,
      realpath: false,
      onCompromised: (error: Error) => {
        compromised = true;
        resolveCompromised(error);
      },
    });
    return {
      release,
      compromised: compromisedPromise,
      isCompromised: () => compromised,
    };
  } catch {
    throw new AppError(409, 'instance_already_running', 'Another instance is already running');
  }
}
