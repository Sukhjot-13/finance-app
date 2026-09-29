/**
 * Logger options shared by the server integration and the plain-Node
 * measurement script.
 *
 * They live apart from `server.js` because that module imports `next/server`
 * and `node:async_hooks`, which plain Node cannot resolve. Keeping the options
 * here means a script can reproduce the server logger's exact configuration
 * without pulling server-only code in.
 */

/**
 * Batch window for routine entries. Short on purpose: a burst of N lines becomes
 * ONE request per window instead of N, and the window must be short enough that
 * a timer frozen after the response cannot strand the tail of a burst. Request
 * completion flushing (`after()`) is still required — this is not a substitute.
 */
export const FLUSH_INTERVAL_MS = 250;

/**
 * Keys whose values must never reach Manager. The SDK applies its own default
 * list too; this extends it with the financial identifiers this app handles so
 * a stray account or card number cannot ride along inside a log payload.
 */
export const REDACT_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "cvv",
  "cardnumber",
  "card_number",
  "accountnumber",
  "account_number",
  "iban",
  "ssn",
];
