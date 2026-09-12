// Payload-shaped keys are redacted regardless of length — they carry base64
// image/video bytes that would otherwise consume the executor's context for
// no diagnostic value (RESEARCH.md Pitfall 1).
const PAYLOAD_KEYS = new Set(["data", "imagebytes", "videobytes"]);

function isPayloadKey(key: string): boolean {
  return PAYLOAD_KEYS.has(key.toLowerCase());
}

// Any key whose lowercased name contains "key", "token", or "authorization"
// is a secret carrier (T-01-01). Matched by substring so "apiKey",
// "x-goog-api-key", "authorization", and "token" are all caught.
function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
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

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, maxLen, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = redactValue(entryValue, maxLen, seen, key);
  }
  return result;
}

/**
 * Returns a structurally-identical clone of `value` with three substitutions
 * applied: any string longer than `maxLen` becomes a length-naming
 * placeholder; any value under a key named `data`, `imageBytes`, or
 * `videoBytes` becomes a placeholder regardless of length; and any value
 * under a key whose lowercased name contains `key`, `token`, or
 * `authorization` is replaced in full. Visited objects are tracked in a
 * WeakSet so a circular reference yields a marker instead of throwing.
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
