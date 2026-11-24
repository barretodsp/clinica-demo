import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { SessionUser } from './auth-user.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: SessionUser['role'];
  password_hash?: string;
  patient_id: string | null;
  doctor_id: string | null;
  attendant_clinic_id: string | null;
}

const SELECT = `
  SELECT u.id, u.name, u.email, u.role,
         p.id AS patient_id, d.id AS doctor_id, a.clinic_id AS attendant_clinic_id
  FROM "user" u
  LEFT JOIN patient p ON p.user_id = u.id
  LEFT JOIN doctor d ON d.user_id = u.id
  LEFT JOIN attendant a ON a.user_id = u.id`;

function toSessionUser(row: UserRow): SessionUser {
  return {
    kind: 'user',
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    attendantClinicId: row.attendant_clinic_id,
  };
}

@Injectable()
export class UsersRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Usuário ativo, com o perfil do papel; null se não existe ou foi desativado. */
  async findActiveById(id: string): Promise<SessionUser | null> {
    const rows: UserRow[] = await this.ds.query(`${SELECT} WHERE u.id = $1 AND u.is_active`, [id]);
    return rows[0] ? toSessionUser(rows[0]) : null;
  }

  /** Para o login: o hash da senha nunca sai deste repositório. */
  async findCredentials(email: string): Promise<{ user: SessionUser; passwordHash: string } | null> {
    const rows: UserRow[] = await this.ds.query(
      `${SELECT.replace('u.role,', 'u.role, u.password_hash,')} WHERE lower(u.email) = lower($1) AND u.is_active`,
      [email],
    );
    const row = rows[0];
    return row ? { user: toSessionUser(row), passwordHash: row.password_hash! } : null;
  }
}
