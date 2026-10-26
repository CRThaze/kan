const MASK = "[Redacted]";
// Also stops cycles: pino serializes those safely, but recursing into one here
// would throw from inside the log call.
const MAX_DEPTH = 10;

// Keys are compared lowercased with "_" and "-" removed, so newPassword,
// new_password and x-api-key all match.
const SENSITIVE_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "apikey",
  "licensekey",
];
const SENSITIVE_KEYS = new Set([
  "code",
  "authorization",
  "cookie",
  "setcookie",
  "signature",
  "invitecode",
]);

const isSensitiveKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
  );
};

/**
 * Returns a copy of a log object with secret-looking keys masked at any depth.
 * Class instances (Error, Date) pass through untouched so pino's serializers
 * still see them. The original value is never mutated.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return MASK;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? MASK : redactSensitive(item, depth + 1),
    ]),
  );
}
