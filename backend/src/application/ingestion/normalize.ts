export function normalizeFullName(suiteName: string | undefined, testName: string): string {
  return suiteName ? `${suiteName} > ${testName}` : testName;
}
