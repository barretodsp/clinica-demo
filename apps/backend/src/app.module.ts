import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ClinicsModule } from './clinics/clinics.module.js';
import { HttpErrorFilter } from './common/http-error.filter.js';
import { env } from './config/env.js';
import { dataSourceOptions } from './database/data-source.js';
import { FhirModule } from './fhir/fhir.module.js';
import { HealthController } from './health.controller.js';
import { MedicalReportsModule } from './medical-reports/medical-reports.module.js';
import { loggerParams } from './observability/logger.config.js';
import { PatientPortalModule } from './patient-portal/patient-portal.module.js';
import { PatientsModule } from './patients/patients.module.js';

@Module({
  imports: [
    LoggerModule.forRoot(loggerParams()),
    TypeOrmModule.forRoot({ ...dataSourceOptions(env().DATABASE_URL), migrations: [] }),
    // ordem importa: autenticação antes da autorização
    AuthenticationModule.forRoot({}),
    AuthorizationModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        // login: 10/min por IP e 10/min por conta (e-mail)
        { name: 'login-ip', ttl: 60_000, limit: env().LOGIN_RATE_LIMIT, getTracker: (req) => `ip:${req.ip}` },
        {
          name: 'login-account',
          ttl: 60_000,
          limit: env().LOGIN_RATE_LIMIT,
          getTracker: (req) => `account:${String(req.body?.email ?? '').trim().toLowerCase()}`,
        },
        // token de serviço (FHIR): 60/min
        { name: 'service', ttl: 60_000, limit: env().SERVICE_RATE_LIMIT, getTracker: () => 'service-token' },
      ],
    }),
    AuditModule,
    AuthModule,
    ClinicsModule,
    CatalogModule,
    PatientsModule,
    AppointmentsModule,
    MedicalReportsModule,
    PatientPortalModule,
    FhirModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpErrorFilter }],
})
export class AppModule {}
