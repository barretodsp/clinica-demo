import { DataSource, type DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities/index.js';
import { InitialSchema1764000000000 } from './migrations/1764000000000-initial-schema.js';
import { AppointmentImageUrl1764100000000 } from './migrations/1764100000000-appointment-image-url.js';

export const MIGRATIONS = [InitialSchema1764000000000, AppointmentImageUrl1764100000000];

/** Opções comuns ao app, às migrations, ao seed e aos testes. */
export function dataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsTableName: 'typeorm_migrations',
    // o app sempre conversa com o banco em UTC
    extra: { options: '-c timezone=UTC' },
  };
}

export function createDataSource(url: string): DataSource {
  return new DataSource(dataSourceOptions(url));
}
