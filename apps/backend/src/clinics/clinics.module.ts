import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clinic } from '../database/entities/index.js';
import { ClinicAccessGuard } from './clinic-access.guard.js';
import { ClinicsController } from './clinics.controller.js';
import { ClinicsService } from './clinics.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic])],
  controllers: [ClinicsController],
  providers: [ClinicsService, ClinicAccessGuard],
  exports: [ClinicsService, ClinicAccessGuard],
})
export class ClinicsModule {}
