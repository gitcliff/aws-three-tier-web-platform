import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables and is validated once at
 * startup. A misconfigured process fails fast with a clear message instead of failing on
 * the first request. Error messages name the offending variables but never echo their
 * values, so secrets cannot leak into logs.
 */

const port = z.coerce.number().int().min(1).max(65_535);

const booleanString = z
  .enum(['true', 'false'], { error: 'must be "true" or "false"' })
  .transform((value) => value === 'true');

const envSchema = z.object({
  // Defaults to production so a forgotten variable never enables development behaviour.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: port.default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1),
  DB_PORT: port.default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: booleanString.default(false),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  MIGRATIONS_DIR: z.string().min(1).default('../database/migrations'),
});

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolMax: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: LogLevel;
  db: DbConfig;
  migrationsDir: string;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }

  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    db: {
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      ssl: e.DB_SSL,
      poolMax: e.DB_POOL_MAX,
    },
    migrationsDir: e.MIGRATIONS_DIR,
  };
}
