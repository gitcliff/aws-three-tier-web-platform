import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const required = {
  DB_HOST: 'db',
  DB_NAME: 'taskdb',
  DB_USER: 'task_app',
  DB_PASSWORD: 's3cret-value',
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(required);
    expect(config).toMatchObject({
      nodeEnv: 'production',
      port: 4000,
      logLevel: 'info',
      db: { host: 'db', port: 5432, ssl: false, poolMax: 10 },
    });
  });

  it('coerces numeric and boolean strings', () => {
    const config = loadConfig({ ...required, PORT: '8081', DB_SSL: 'true', DB_POOL_MAX: '3' });
    expect(config.port).toBe(8081);
    expect(config.db.ssl).toBe(true);
    expect(config.db.poolMax).toBe(3);
  });

  it('lists every missing variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (err) {
      const message = (err as Error).message;
      for (const key of Object.keys(required)) expect(message).toContain(key);
    }
  });

  it('rejects invalid values without echoing them', () => {
    const run = () => loadConfig({ ...required, PORT: 'not-a-port', DB_SSL: 'yes' });
    expect(run).toThrow(/PORT/);
    expect(run).toThrow(/DB_SSL/);
    expect(run).not.toThrow(/not-a-port/);
  });

  it('never includes the password in error output', () => {
    expect(() => loadConfig({ ...required, PORT: '0' })).not.toThrow(/s3cret-value/);
  });
});
