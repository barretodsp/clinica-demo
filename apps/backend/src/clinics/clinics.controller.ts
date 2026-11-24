import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '../auth/auth-user.js';
import { RolePolicy } from '../auth/role.policy.js';
import { ClinicsService, toClinicDto } from './clinics.service.js';

@ApiTags('clínicas')
@Controller('me/clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  /** Clínicas acessíveis ao usuário logado (atendente: 1; médico: as vinculadas). */
  @Get()
  @Can(RolePolicy, 'staff')
  async list(@CurrentUser() user: SessionUser) {
    return (await this.clinics.accessibleClinics(user)).map(toClinicDto);
  }
}
