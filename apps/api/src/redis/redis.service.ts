import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  );

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis is unavailable; readiness will remain degraded.');
    }
  }

  async ping() {
    return this.client.ping();
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  async incrementWithExpiry(key: string, ttlSeconds: number) {
    const result = await this.client.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       return count`,
      1,
      key,
      ttlSeconds,
    );
    return Number(result);
  }

  async onApplicationShutdown() {
    if (this.client.status !== 'end')
      await this.client.quit().catch(() => undefined);
  }
}
