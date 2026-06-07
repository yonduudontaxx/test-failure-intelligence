const MAX_PATTERN_LENGTH = 200;

const SCRUB_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<TS>'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>'],
  [
    /(?:[A-Za-z]:|\/)?[\w\-./]+\.(?:tsx|ts|jsx|js|mjs|cjs|py|rb|java|kt|go|cs):\d+(?::\d+)?/g,
    '<PATH>',
  ],
  [/0x[0-9a-fA-F]+/g, '<ADDR>'],
  [/(https?:\/\/[^\s?]+)\?[^\s]*/g, '$1?<QUERY>'],
  [/\b\d{3,}\b/g, '<N>'],
];

const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/timeout|timed out/i, 'timeout'],
  [
    /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|fetch failed|socket hang up|getaddrinfo|network unreachable|connection refused/i,
    'network',
  ],
  [/deadlock|psql|postgres|\bsql\b|database|connection pool|query failed/i, 'database'],
  [
    /assertion|\bassert\b|expected|expect\(|to (be|equal|match|contain)|toEqual|toBe\b/i,
    'assertion',
  ],
];

function firstLine(s: string): string {
  const i = s.indexOf('\n');
  return i === -1 ? s : s.slice(0, i);
}

function scrub(s: string): string {
  let out = s;
  for (const [re, replacement] of SCRUB_RULES) {
    out = out.replace(re, replacement);
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > MAX_PATTERN_LENGTH) {
    out = `${out.slice(0, MAX_PATTERN_LENGTH - 1)}…`;
  }
  return out;
}

function categorize(pattern: string, failureType: string | undefined): string {
  const hay = failureType ? `${failureType} ${pattern}` : pattern;
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(hay)) return category;
  }
  return 'unknown';
}

export function extractPattern(
  failureMessage: string | undefined,
  failureType: string | undefined,
  testName: string,
): { pattern: string; category: string } {
  const msg = failureMessage?.trim();
  const type = failureType?.trim();

  let raw: string;
  if (msg) {
    raw = type ? `${type}: ${firstLine(msg)}` : firstLine(msg);
  } else if (type) {
    raw = `${type} in ${testName}`;
  } else {
    raw = `Unknown failure in ${testName}`;
  }

  const pattern = scrub(raw);
  const category = categorize(pattern, type);
  return { pattern, category };
}
