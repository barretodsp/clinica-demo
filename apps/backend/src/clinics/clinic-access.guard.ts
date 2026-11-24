import { createParamDecorator, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { forbidden, notFound } from '../common/errors.js';
import { isUuid } from '../common/validation.js';
import { isSessionUser, type AuthUser } from '../auth/auth-user.js';
import type { Clinic } from '../database/entities/index.js';
import { ClinicsService } from './clinics.service.js';

type ClinicRequest = Request & { user?: AuthUser; clinic?: Clinic };

/**
 * Isolamento multi-tenant: toda rota /clinics/:clinicId/... confere, no banco e a cada
 * requisição, se o usuário tem vínculo com a clínica (atendente: a sua; médico: doctor_clinic).
 */
@Injectable()
export class ClinicAccessGuard implements CanActivate {
  constructor(private readonly clinics: ClinicsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ClinicRequest>();
    const clinicId = req.params.clinicId;
    const user = req.user;
    if (typeof clinicId !== 'string' || !isUuid(clinicId)) throw notFound('CLINIC_NOT_FOUND', 'Clínica não encontrada.');
    if (!isSessionUser(user)) throw forbidden('CLINIC_ACCESS_DENIED', 'Sem acesso a esta clínica.');
    const clinic = await this.clinics.findAccessible(user, clinicId);
    if (!clinic) {
      if (!(await this.clinics.exists(clinicId))) throw notFound('CLINIC_NOT_FOUND', 'Clínica não encontrada.');
      throw forbidden('CLINIC_ACCESS_DENIED', 'Você não tem vínculo com esta clínica.');
    }
    req.clinic = clinic;
    return true;
  }
}

/** A clínica já validada pelo ClinicAccessGuard. */
export const CurrentClinic = createParamDecorator((_: unknown, ctx: ExecutionContext): Clinic => {
  return ctx.switchToHttp().getRequest<ClinicRequest>().clinic!;
});
