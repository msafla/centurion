import { AppError } from '../http/errors';

const WINDOW_MS = 60_000;
const MAX_CALLS = 120;
const MAX_WRITES = 30;
const MAX_EXPORTS = 5;
const MAX_IN_FLIGHT = 4;
const CIRCUIT_THRESHOLD = 10;
const CIRCUIT_OPEN_MS = 10_000;

type Kind = 'call' | 'write' | 'export';

/** Sliding-window rate limits and a server-error circuit, shared by all adapters. */
export class McpLimiter {
  private callTimes: number[] = [];
  private writeTimes: number[] = [];
  private exportTimes: number[] = [];
  private inFlight = 0;
  private consecutive5xx = 0;
  private circuitUntil = 0;

  private prune(times: number[], now: number): number[] {
    return times.filter((time) => now - time < WINDOW_MS);
  }

  check(kind: Kind, now: number): void {
    if (this.circuitUntil > now) {
      throw new AppError(503, 'backend_unavailable', 'Backend circuit is open');
    }
    if (this.inFlight >= MAX_IN_FLIGHT) {
      throw new AppError(429, 'rate_limited', 'Too many in-flight MCP calls');
    }
    this.callTimes = this.prune(this.callTimes, now);
    if (this.callTimes.length >= MAX_CALLS) {
      throw new AppError(429, 'rate_limited', 'MCP call rate exceeded');
    }
    if (kind === 'write') {
      this.writeTimes = this.prune(this.writeTimes, now);
      if (this.writeTimes.length >= MAX_WRITES) {
        throw new AppError(429, 'rate_limited', 'MCP write rate exceeded');
      }
      this.writeTimes.push(now);
    }
    if (kind === 'export') {
      this.exportTimes = this.prune(this.exportTimes, now);
      if (this.exportTimes.length >= MAX_EXPORTS) {
        throw new AppError(429, 'rate_limited', 'MCP export rate exceeded');
      }
      this.exportTimes.push(now);
    }
    this.callTimes.push(now);
    this.inFlight += 1;
  }

  release(serverError: boolean, now: number): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (serverError) {
      this.consecutive5xx += 1;
      if (this.consecutive5xx >= CIRCUIT_THRESHOLD) {
        this.circuitUntil = now + CIRCUIT_OPEN_MS;
        this.consecutive5xx = 0;
      }
    } else {
      this.consecutive5xx = 0;
    }
  }
}
