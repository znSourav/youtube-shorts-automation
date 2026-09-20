// Payload-shaped keys are redacted regardless of length — they carry base64
// image/video bytes that would otherwise consume the executor's context for
// no diagnostic value (RESEARCH.md Pitfall 1).
const PAYLOAD_KEYS = new Set(["data", "imagebytes", "videobytes"]);

function isPayloadKey(key: string): boolean {
  return PAYLOAD_KEYS.has(key.toLowerCase());
}

// Every real usage-metadata field name this SDK returns (verified
// exhaustively against node_modules/@google/genai/dist/genai.d.ts,
// 06-RESEARCH.md Code Example 2 -- promptTokenCount, candidatesTokenCount,
// totalTokenCount, etc., and the nested tokensDetails/TokensDetails arrays)
// ends in one of exactly these two suffixes. This is what narrows the
// over-redaction WINDOWS #2 named without weakening the true-positive match
// on a genuinely key/token/authorization-shaped field name (06-RESEARCH.md
// Code Example 3).
const SAFE_TOKEN_FIELD_SUFFIX = /tokencount$|tokensdetails$/i;

// Any key whose lowercased name contains "key", "token", or "authorization"
// is a secret carrier (T-01-01). Matched by substring so "apiKey",
// "x-goog-api-key", "authorization", and "token" are all caught -- UNLESS
// the name both contains "token" AND ends in one of the SDK's verified
// usage-metadata suffixes (tokenCount/tokensDetails), in which case only the
// key/authorization-shaped substrings still redact it (defense in depth: a
// name that happens to ALSO look key-shaped, e.g. "apiKeyTokenCount", stays
// redacted even though it passes the safe-suffix test).
function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.includes("token") && SAFE_TOKEN_FIELD_SUFFIX.test(lowered)) {
    return lowered.includes("key") || lowered.includes("authorization");
  }
  return lowered.includes("key") || lowered.includes("token") || lowered.includes("authorization");
}

function redactValue(value: unknown, maxLen: number, seen: WeakSet<object>, keyName?: string): unknown {
  if (keyName !== undefined && isSecretKey(keyName)) {
    // Replaced in full, never truncated — a prefix of an API key is still a disclosure.
    return "[REDACTED:secret]";
  }

  if (keyName !== undefined && isPayloadKey(keyName)) {
    const length = typeof value === "string" ? value.length : undefined;
    return length === undefined ? "[REDACTED:payload]" : `[REDACTED:payload ${length} chars]`;
  }

  if (typeof value === "string") {
    if (value.length > maxLen) {
      return `[REDACTED:${value.length} chars]`;
    }
    return value;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  // WR-01: `seen` tracks only the current ancestor path (this node and its
  // still-open recursive callers), not every object visited anywhere in the
  // whole tree. A true cycle re-enters an object that is still on this path
  // and is correctly reported as "[CIRCULAR]"; a "diamond" reference (the
  // same object reachable from two separate, non-nested branches) is popped
  // off `seen` before the sibling branch is visited, so it is redacted
  // normally instead of being falsely flagged as circular.
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const arrayResult = value.map((item) => redactValue(item, maxLen, seen));
    seen.delete(value);
    return arrayResult;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = redactValue(entryValue, maxLen, seen, key);
  }
  seen.delete(value);
  return result;
}

/**
 * Returns a structurally-identical clone of `value` with three substitutions
 * applied: any string longer than `maxLen` becomes a length-naming
 * placeholder; any value under a key named `data`, `imageBytes`, or
 * `videoBytes` becomes a placeholder regardless of length; and any value
 * under a key whose lowercased name contains `key`, `token`, or
 * `authorization` is replaced in full -- EXCEPT a name that contains `token`
 * only because it is one of the SDK's real usage-metadata fields (ends in
 * `TokenCount` or `TokensDetails`, e.g. `promptTokenCount`,
 * `candidatesTokensDetails`), which is left unchanged so legitimate token
 * telemetry is no longer redacted alongside real secrets (06-01, Task 3;
 * WINDOWS #2). Visited objects are tracked in a WeakSet so a circular
 * reference yields a marker instead of throwing.
 */
export function redactLargeStrings(value: unknown, maxLen: number = 256): unknown {
  return redactValue(value, maxLen, new WeakSet());
}

/**
 * Prints `label` followed by the redacted, pretty-printed JSON of `value`.
 * This is what makes dumping a raw provider response affordable: a raw
 * image response is roughly a megabyte of base64; redacted, it is a few
 * kilobytes and shows exactly the field names that matter (RESEARCH.md
 * Pitfall 1). It is also the control that keeps an accidentally-logged
 * request or client-config object from leaking GEMINI_API_KEY (T-01-01).
 */
export function logRawResponse(label: string, value: unknown): void {
  console.log(`${label}\n${JSON.stringify(redactLargeStrings(value), null, 2)}`);
}
