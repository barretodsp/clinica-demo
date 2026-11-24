import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TIMEZONE_LABELS } from '../common/domain.js';
import { Clinic } from '../database/entities/index.js';
import type { SessionUser } from '../auth/auth-user.js';

export interface ClinicDto {
  id: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  timezoneLabel: string;
}

export function toClinicDto(c: Clinic): ClinicDto {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    state: c.state,
    timezone: c.timezone,
    timezoneLabel: TIMEZONE_LABELS[c.timezone],
  };
}

@Injectable()
export class ClinicsService {
  constructor(@InjectRepository(Clinic) private readonly clinics: Repository<Clinic>) {}

  /** Clínicas que o usuário pode acessar (consultado no banco a cada chamada). */
  async accessibleClinics(user: SessionUser): Promise<Clinic[]> {
    if (user.role === 'ATTENDANT' && user.attendantClinicId) {
      return this.clinics.find({ where: { id: user.attendantClinicId, isActive: true } });
    }
    if (user.role === 'DOCTOR' && user.doctorId) {
      return this.clinics
        .createQueryBuilder('c')
        .innerJoin('doctor_clinic', 'dc', 'dc.clinic_id = c.id AND dc.doctor_id = :doctorId', { doctorId: user.doctorId })
        .where('c.is_active')
        .orderBy('c.name')
        .getMany();
    }
    return [];
  }

  /** A clínica, se o usuário tem vínculo com ela; null caso contrário. */
  async findAccessible(user: SessionUser, clinicId: string): Promise<Clinic | null> {
    if (user.role === 'ATTENDANT') {
      if (user.attendantClinicId !== clinicId) return null;
      return this.clinics.findOne({ where: { id: clinicId, isActive: true } });
    }
    if (user.role === 'DOCTOR' && user.doctorId) {
      return this.clinics
        .createQueryBuilder('c')
        .innerJoin('doctor_clinic', 'dc', 'dc.clinic_id = c.id AND dc.doctor_id = :doctorId', { doctorId: user.doctorId })
        .where('c.id = :clinicId AND c.is_active', { clinicId })
        .getOne();
    }
    return null;
  }

  exists(clinicId: string): Promise<boolean> {
    return this.clinics.exists({ where: { id: clinicId } });
  }
}
