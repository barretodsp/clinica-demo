import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({ imports: [ClinicsModule], controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
