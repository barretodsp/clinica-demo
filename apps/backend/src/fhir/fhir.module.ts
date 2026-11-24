import { Module } from '@nestjs/common';
import { FhirController } from './fhir.controller.js';

@Module({ controllers: [FhirController] })
export class FhirModule {}
