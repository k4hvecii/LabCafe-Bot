export const LEVELS = ['trace', 'debug', 'info', 'success', 'warn', 'error', 'fatal'] as const;
export type Level = typeof LEVELS[number];
type Context = Record<string, string | number | boolean>;
export interface SanitizedLogRecord {time:string;level:Level;message:string;module?:string;context?:Record<string,unknown>}
let logObserver:((record:SanitizedLogRecord)=>void)|undefined;
export function observeLogs(observer:(record:SanitizedLogRecord)=>void){logObserver=observer;return ()=>{if(logObserver===observer)logObserver=undefined;};}
const ORDER: Record<Level, number> = { trace: 5, debug: 10, info: 20, success: 20, warn: 30, error: 40, fatal: 50 };
const COLORS: Record<Level, number> = { trace: 90, debug: 90, info: 36, success: 32, warn: 33, error: 31, fatal: 91 };

export interface LoggerOptions {
  format?: 'auto' | 'json' | 'pretty';
  module?: string;
  /** A failed telemetry sink must not crash the bot. */
  sink?: (line: string, level: Level) => void;
}

/** Never log a configured secret, including inside context values. */
export function redact(value: string, secrets: readonly string[]): string {
  return [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)
    .reduce((result, secret) => result.split(secret).join('[REDACTED]'), value);
}

const SENSITIVE_KEY = /^(?:authorization|proxyauthorization|cookie|setcookie|token|.*token|secret|.*secret|password|apikey|code|state|query|body|headers)$/i;
function clean(value: string, secrets: readonly string[], limit: number): string {
  // Redact before truncation so a long secret cannot leave its prefix behind.
  return redact(value, secrets)
    .replace(/\b(?:Bearer\s+[^\s,;"']+|Bot\s+[A-Za-z0-9._-]{20,})/gi, '[REDACTED AUTH]')
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi, '[REDACTED HEADER]')
    .replace(/https?:\/\/[^\s<>"']+/gi, url => {
      try {
        const parsed = new URL(url);
        parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/(webhooks|interactions)\/[^/]+\/[^/]+/gi, '/$1/[REDACTED]/[REDACTED]');
        return parsed.href;
      } catch { return '[REDACTED URL]'; }
    })
    .replace(/\b(code|state|access_token|refresh_token|client_secret|password)=([^\s&#]*)/gi, '$1=[REDACTED]')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .slice(0, limit);
}

export function createLogger(level: Level, secrets: readonly string[] = [], options: LoggerOptions = {}) {
  const configuredSecrets = [...secrets];
  const moduleName = options.module ? clean(options.module, configuredSecrets, 48) : undefined;
  const tty = Boolean(process.stdout.isTTY);
  const pretty = process.env.NODE_ENV !== 'production'
    && (options.format === 'pretty' || ((options.format ?? 'auto') === 'auto' && tty));
  const color = pretty && tty && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb';
  const sink = options.sink ?? ((line: string, severity: Level) => {
    if (ORDER[severity] >= ORDER.error) console.error(line);
    else console.log(line);
  });
  const write = (severity: Level, message: string, context?: Context) => {
    if (ORDER[severity] < ORDER[level]) return;
    try {
      const safeContext = context ? Object.fromEntries(Object.entries(context).slice(0, 32).map(([key, value]) => [
        clean(key, configuredSecrets, 64),
        SENSITIVE_KEY.test(key.replace(/[^a-z]/gi, '')) ? '[REDACTED]'
          : typeof value === 'string' ? clean(value, configuredSecrets, 2_048)
          : typeof value === 'boolean' ? value
          : typeof value === 'number' && Number.isFinite(value) ? value : '[UNSUPPORTED]'
      ])) : undefined;
      const record = { time: new Date().toISOString(), level: severity, message: clean(message, configuredSecrets, 4_096),
        ...(moduleName ? { module: moduleName } : {}), ...(safeContext ? { context: safeContext } : {}) };
      try{logObserver?.(record);}catch{/* Monitoring is independent of terminal delivery. */}
      if (!pretty) { sink(JSON.stringify(record), severity); return; }
      const label = severity.toUpperCase().padEnd(7);
      const badge = color ? `\x1b[${COLORS[severity]}m${label}\x1b[0m` : label;
      const moduleLabel = moduleName ? ` [${moduleName}]` : '';
      sink(`[${record.time}] [${badge}]${moduleLabel} ${record.message}${safeContext ? ` ${JSON.stringify(safeContext)}` : ''}`, severity);
    } catch { /* Best effort: never fall back to emitting unsanitized input. */ }
  };
  return {
    trace: (msg: string, context?: Context) => write('trace', msg, context),
    debug: (msg: string, context?: Context) => write('debug', msg, context),
    info: (msg: string, context?: Context) => write('info', msg, context),
    success: (msg: string, context?: Context) => write('success', msg, context),
    warn: (msg: string, context?: Context) => write('warn', msg, context),
    error: (msg: string, context?: Context) => write('error', msg, context),
    fatal: (msg: string, context?: Context) => write('fatal', msg, context)
  };
}

export function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
