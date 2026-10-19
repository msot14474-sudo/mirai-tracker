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

  async acquireLock(key: string, value: string, seconds: number) {
    return (await this.client.set(key, value, 'EX', seconds, 'NX')) === 'OK';
  }

  async get(key: string) {
    return this.client.get(key);
  }

  /** Read and upgrade legacy expiring sessions in one Redis round trip. */
  async getPersistent(key: string): Promise<string | null> {
    const value = await this.client.eval(
      `local value = redis.call('GET', KEYS[1])
       if value then redis.call('PERSIST', KEYS[1]) end
       return value`,
      1,
      key,
    );
    return typeof value === 'string' ? value : null;
  }

  async setPersistent(key: string, value: string) {
    await this.client.set(key, value);
  }

  async persist(key: string) {
    await this.client.persist(key);
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  async consumeIfValue(key: string, expectedValue: string) {
    const result = await this.client.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then
         redis.call('DEL', KEYS[1])
         return 1
       end
       return 0`,
      1,
      key,
      expectedValue,
    );
    return Number(result) === 1;
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
