import 'dotenv/config';

const VALID_NODE_ENVS = ['development', 'production', 'test'] as const;
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

type NodeEnv = (typeof VALID_NODE_ENVS)[number];
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

interface Config {
  port: number;
  nodeEnv: NodeEnv;
  databaseUrl: string;
  logLevel: LogLevel;
  rateLimitMax: number;
  corsOrigins: readonly string[];
}

function requireEnum<T extends string>(
  rawValue: string | undefined,
  allowed: readonly T[],
  name: string,
  defaultValue: T,
): T {
  const value = rawValue ?? defaultValue;
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}. Got: "${rawValue}"`);
  }
  return value as T;
}

const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

export function parseCorsOrigins(raw: string | undefined): readonly string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    return [DEFAULT_CORS_ORIGIN];
  }
  return entries.map((entry) => {
    if (entry === '*') {
      throw new Error('CORS_ORIGINS must list explicit origins; "*" is not allowed');
    }
    try {
      return new URL(entry).origin;
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin. Got: "${entry}"`);
    }
  });
}

function buildConfig(): Readonly<Config> {
  const rawPort = parseInt(process.env.PORT ?? '3001', 10);
  if (Number.isNaN(rawPort) || rawPort <= 0) {
    throw new Error(`PORT must be a valid positive integer. Got: "${process.env.PORT}"`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX ?? '300', 10);
  if (Number.isNaN(rateLimitMax) || rateLimitMax <= 0) {
    throw new Error(`RATE_LIMIT_MAX must be a valid positive integer. Got: "${process.env.RATE_LIMIT_MAX}"`);
  }

  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  const nodeEnv = requireEnum(process.env.NODE_ENV, VALID_NODE_ENVS, 'NODE_ENV', 'development');
  const logLevel = requireEnum(process.env.LOG_LEVEL, VALID_LOG_LEVELS, 'LOG_LEVEL', 'info');

  return Object.freeze({
    port: rawPort,
    nodeEnv,
    databaseUrl,
    logLevel,
    rateLimitMax,
    corsOrigins,
  });
}

export const config: Readonly<Config> = buildConfig();
