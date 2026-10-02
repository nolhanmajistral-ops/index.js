/**
 * Logger structuré JSON. Masque automatiquement les champs sensibles :
 * mots de passe, tokens, secrets, emails, téléphones.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|encryption|email|phone|telephone/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function currentLevel(): Level {
  const l = process.env.LOG_LEVEL as Level | undefined;
  return l && l in ORDER ? l : "info";
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[currentLevel()]) return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(data ? (redact(data) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
