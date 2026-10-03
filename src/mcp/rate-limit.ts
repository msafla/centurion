const WINDOW_MS = 60_000;
const MAX_CALLS = 120;
const MAX_EXPORTS = 5;

/** Adapter-side limiter, counted in addition to the backend limits. */
export class AdapterLimiter {
  private callTimes: number[] = [];
  private exportTimes: number[] = [];

  private prune(times: number[], now: number): number[] {
    return times.filter((time) => now - time < WINDOW_MS);
  }

  check(isExport: boolean): void {
    const now = Date.now();
    this.callTimes = this.prune(this.callTimes, now);
    if (this.callTimes.length >= MAX_CALLS) throw new Error('rate_limited');
    if (isExport) {
      this.exportTimes = this.prune(this.exportTimes, now);
      if (this.exportTimes.length >= MAX_EXPORTS) throw new Error('rate_limited');
      this.exportTimes.push(now);
    }
    this.callTimes.push(now);
  }
}
