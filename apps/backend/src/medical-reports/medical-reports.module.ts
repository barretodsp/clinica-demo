import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module.js';
import { MedicalReportsController } from './medical-reports.controller.js';
import { MedicalReportsService } from './medical-reports.service.js';

@Module({
  imports: [ClinicsModule],
  controllers: [MedicalReportsController],
  providers: [MedicalReportsService],
  exports: [MedicalReportsService],
})
export class MedicalReportsModule {}
