export type TxClient = {
  query: (
    queryTextOrConfig: string | { text: string; values?: unknown[] },
    values?: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};
