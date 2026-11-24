import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

const controller = (query: () => Promise<unknown>) => new HealthController({ query } as unknown as DataSource);

describe('HealthController', () => {
  it('liveness não toca no banco', () => {
    const query = vi.fn();
    expect(controller(query).live()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('readiness: banco responde → ok', async () => {
    const res = await controller(() => Promise.resolve([{ '?column?': 1 }])).ready();
    expect(res).toMatchObject({ status: 'ok', checks: { database: { status: 'up' } } });
  });

  it('readiness: banco com erro → 503 NOT_READY', async () => {
    const err = await controller(() => Promise.reject(new Error('ECONNREFUSED'))).ready().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'NOT_READY', details: { database: 'down' } });
  });

  it('readiness: banco travado → 503 após o timeout', async () => {
    vi.useFakeTimers();
    try {
      const pending = controller(() => new Promise(() => {})).ready().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await pending).toBeInstanceOf(ServiceUnavailableException);
    } finally {
      vi.useRealTimers();
    }
  });
});
