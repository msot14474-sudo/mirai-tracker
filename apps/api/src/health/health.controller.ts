import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return {
      status: 'up' as const,
      service: 'api' as const,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRawUnsafe('SELECT 1'),
      this.redis.ping(),
    ]);

    const dependencies = {
      database:
        database.status === 'fulfilled' ? ('up' as const) : ('down' as const),
      redis: redis.status === 'fulfilled' ? ('up' as const) : ('down' as const),
    };

    const response = {
      status:
        dependencies.database === 'up' && dependencies.redis === 'up'
          ? ('ready' as const)
          : ('degraded' as const),
      service: 'api' as const,
      dependencies,
      timestamp: new Date().toISOString(),
    };

    if (response.status === 'degraded') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
