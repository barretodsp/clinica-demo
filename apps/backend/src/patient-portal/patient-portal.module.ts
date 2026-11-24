import { Module } from '@nestjs/common';
import { PatientPortalController } from './patient-portal.controller.js';

@Module({ controllers: [PatientPortalController] })
export class PatientPortalModule {}
