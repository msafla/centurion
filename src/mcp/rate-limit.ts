const WINDOW_MS = 60_000;
const MAX_CALLS = 120;
const MAX_EXPORTS = 5;
const MAX_WRITES = 30;

export type AdapterLimitKind = 'call' | 'export' | 'write';

/** Adapter-side limiter, counted in addition to the backend limits. */
export class AdapterLimiter {
  private callTimes: number[] = [];
  private exportTimes: number[] = [];
  private writeTimes: number[] = [];

  private prune(times: number[], now: number): number[] {
    return times.filter((time) => now - time < WINDOW_MS);
  }

  check(kind: AdapterLimitKind): void {
    const now = performance.now();
    this.callTimes = this.prune(this.callTimes, now);
    if (this.callTimes.length >= MAX_CALLS) throw new Error('rate_limited');
    if (kind === 'export') {
      this.exportTimes = this.prune(this.exportTimes, now);
      if (this.exportTimes.length >= MAX_EXPORTS) throw new Error('rate_limited');
      this.exportTimes.push(now);
    }
    if (kind === 'write') {
      this.writeTimes = this.prune(this.writeTimes, now);
      if (this.writeTimes.length >= MAX_WRITES) throw new Error('rate_limited');
      this.writeTimes.push(now);
    }
    this.callTimes.push(now);
  }
}
