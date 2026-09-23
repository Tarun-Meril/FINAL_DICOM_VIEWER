/**
 * Centralized logging + diagnostics ring buffer.
 *
 * Clinical-safety note (§40): log records must never contain patient identifiers.
 * `redactPHI` is applied to every string payload before it is stored or printed.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  readonly seq: number;
  readonly t: number;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly data?: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Tags that may carry direct patient identifiers and must never be logged. */
const PHI_KEYS = new Set([
  'PatientName', 'PatientID', 'PatientBirthDate', 'PatientAddress', 'OtherPatientIDs',
  'OtherPatientNames', 'PatientTelephoneNumbers', 'AccessionNumber', 'InstitutionName',
  'ReferringPhysicianName', 'PerformingPhysicianName', 'OperatorsName', 'PatientMotherBirthName',
]);

export function isPHIKey(key: string): boolean {
  return PHI_KEYS.has(key);
}

/** Strip anything that looks like a direct identifier out of a free-text payload. */
export function redactPHI(value: unknown): unknown {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(redactPHI);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PHI_KEYS.has(k) ? '<redacted>' : redactPHI(v);
    }
    return out;
  }
  return value;
}

class Logger {
  private readonly buffer: LogRecord[] = [];
  private capacity = 4000;
  private seq = 0;
  private minLevel: LogLevel = 'debug';
  private mirrorToConsole = false;
  private listeners = new Set<(r: LogRecord) => void>();

  setLevel(level: LogLevel): void { this.minLevel = level; }
  setConsoleMirror(on: boolean): void { this.mirrorToConsole = on; }

  subscribe(fn: (r: LogRecord) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  log(level: LogLevel, scope: string, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const rec: LogRecord = {
      seq: ++this.seq, t: Date.now(), level, scope, message,
      data: data === undefined ? undefined : redactPHI(data),
    };
    this.buffer.push(rec);
    if (this.buffer.length > this.capacity) this.buffer.splice(0, this.buffer.length - this.capacity);
    for (const l of this.listeners) { try { l(rec); } catch { /* listener failure must not break logging */ } }
    if (this.mirrorToConsole) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(`[${scope}] ${message}`, rec.data ?? '');
    }
  }

  debug(scope: string, m: string, d?: unknown): void { this.log('debug', scope, m, d); }
  info(scope: string, m: string, d?: unknown): void { this.log('info', scope, m, d); }
  warn(scope: string, m: string, d?: unknown): void { this.log('warn', scope, m, d); }
  error(scope: string, m: string, d?: unknown): void { this.log('error', scope, m, d); }

  records(): readonly LogRecord[] { return this.buffer; }
  clear(): void { this.buffer.length = 0; }

  export(): string {
    return this.buffer
      .map((r) => `${new Date(r.t).toISOString()} ${r.level.toUpperCase().padEnd(5)} [${r.scope}] ${r.message}` +
        (r.data === undefined ? '' : ` ${safeJson(r.data)}`))
      .join('\n');
  }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '<unserializable>'; }
}

export const logger = new Logger();

/** Scoped logger factory so modules do not repeat their name. */
export function scopedLogger(scope: string) {
  return {
    debug: (m: string, d?: unknown) => logger.debug(scope, m, d),
    info: (m: string, d?: unknown) => logger.info(scope, m, d),
    warn: (m: string, d?: unknown) => logger.warn(scope, m, d),
    error: (m: string, d?: unknown) => logger.error(scope, m, d),
  };
}
