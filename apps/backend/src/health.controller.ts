import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DB_PING_TIMEOUT_MS = 2_000;

/**
 * - GET /api/health        — liveness: o processo responde (healthcheck do Docker). Não toca no banco.
 * - GET /api/health/ready  — readiness: consegue atender (ping no Postgres). 503 se o banco não responde.
 *   Consultado pela sonda de disponibilidade (docker/uptime), que grava UP/DOWN no Loki para o Grafana.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Public()
  async ready() {
    const started = performance.now();
    try {
      await withTimeout(this.dataSource.query('SELECT 1'), DB_PING_TIMEOUT_MS);
    } catch {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'Serviço indisponível: banco de dados não responde.',
        details: { database: 'down' },
      });
    }
    return { status: 'ok', checks: { database: { status: 'up', latencyMs: Math.round(performance.now() - started) } } };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout após ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
