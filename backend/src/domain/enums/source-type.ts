export const SOURCE_TYPES = ['api', 'junit_xml', 'playwright', 'jest', 'json'] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export function isSourceType(value: unknown): value is SourceType {
  return typeof value === 'string' && (SOURCE_TYPES as readonly string[]).includes(value);
}
