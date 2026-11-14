import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config';

describe('loadConfig listenHost', () => {
  it('defaults to 127.0.0.1 when CENTURION_LISTEN_HOST is unset', () => {
    const config = loadConfig({});
    expect(config.listenHost).toBe('127.0.0.1');
    expect(config.host).toBe('127.0.0.1');
  });

  it('accepts 0.0.0.0 for container use', () => {
    const config = loadConfig({ CENTURION_LISTEN_HOST: '0.0.0.0' });
    expect(config.listenHost).toBe('0.0.0.0');
  });

  it.each(['192.168.1.10', '::', 'localhost', ''])(
    'rejects invalid CENTURION_LISTEN_HOST %j',
    (value) => {
      expect(() => loadConfig({ CENTURION_LISTEN_HOST: value })).toThrow(/CENTURION_LISTEN_HOST/);
    },
  );

  it('keeps host, port, origins and allowedHosts unchanged when CENTURION_LISTEN_HOST=0.0.0.0', () => {
    const config = loadConfig({ CENTURION_LISTEN_HOST: '0.0.0.0' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4317);
    expect(config.canonicalOrigin).toBe('http://127.0.0.1:4317');
    expect(config.allowedOrigins).toEqual(['http://127.0.0.1:4317']);
    expect(config.allowedHosts).toEqual(['127.0.0.1:4317']);
  });
});
