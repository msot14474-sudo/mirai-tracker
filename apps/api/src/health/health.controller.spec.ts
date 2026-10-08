import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without checking dependencies', () => {
    const controller = new HealthController({} as never, {} as never);
    expect(controller.live()).toMatchObject({ status: 'up', service: 'api' });
  });

  it('reports readiness when PostgreSQL and Redis respond', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(prisma as never, redis as never);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      dependencies: { database: 'up', redis: 'up' },
    });
  });

  it('returns a service error when a dependency is unavailable', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('down')),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(prisma as never, redis as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
