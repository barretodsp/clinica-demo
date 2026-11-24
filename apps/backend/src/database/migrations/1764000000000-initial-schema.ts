import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema inicial. SQL escrito à mão para controlar o que o ORM não expressa bem:
 * UUID v7, índices únicos parciais, CHECKs, trigger de updated_at e privilégios.
 */
export class InitialSchema1764000000000 implements MigrationInterface {
  name = 'InitialSchema1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE EXTENSION IF NOT EXISTS unaccent;

-- updated_at mantido pelo banco (cobre SQL direto, seed e updates atômicos)
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$fn$;

CREATE TABLE clinic (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL CONSTRAINT clinic_state_uf CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  timezone text NOT NULL CONSTRAINT clinic_timezone_supported
    CHECK (timezone IN ('America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "user" (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CONSTRAINT user_role_valid CHECK (role IN ('ATTENDANT', 'DOCTOR', 'PATIENT')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_email_unique ON "user" (lower(email));

-- Atendente: exatamente uma clínica
CREATE TABLE attendant (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL CONSTRAINT attendant_user_unique UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinic(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendant_clinic ON attendant (clinic_id);

CREATE TABLE doctor (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL CONSTRAINT doctor_user_unique UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  specialty text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE professional_council (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code text NOT NULL CONSTRAINT professional_council_code_unique UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE doctor_registration (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  doctor_id uuid NOT NULL REFERENCES doctor(id) ON DELETE CASCADE,
  council_id uuid NOT NULL REFERENCES professional_council(id),
  number varchar(20) NOT NULL CONSTRAINT doctor_registration_number_digits CHECK (number ~ '^[0-9]+$'),
  state char(2) NOT NULL CONSTRAINT doctor_registration_state_uf CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- um registro pertence a um único profissional
  CONSTRAINT doctor_registration_unique UNIQUE (council_id, state, number)
);
CREATE INDEX doctor_registration_doctor ON doctor_registration (doctor_id);

CREATE TABLE doctor_clinic (
  doctor_id uuid NOT NULL REFERENCES doctor(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinic(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, clinic_id)
);
CREATE INDEX doctor_clinic_clinic ON doctor_clinic (clinic_id);

-- Paciente: global (sem clínica)
CREATE TABLE patient (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL CONSTRAINT patient_user_unique UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_date date NOT NULL,
  document char(11) NOT NULL CONSTRAINT patient_document_unique UNIQUE
    CONSTRAINT patient_document_digits CHECK (document ~ '^[0-9]{11}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exam_type (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL CONSTRAINT exam_type_name_unique UNIQUE,
  loinc_code text,
  loinc_display text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE holiday (
  date date PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointment (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  clinic_id uuid NOT NULL REFERENCES clinic(id),
  patient_id uuid NOT NULL REFERENCES patient(id),
  exam_type_id uuid NOT NULL REFERENCES exam_type(id),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CONSTRAINT appointment_status_valid CHECK (status IN ('SCHEDULED', 'CANCELLED')),
  created_by_user_id uuid NOT NULL REFERENCES "user"(id),
  cancelled_by_user_id uuid REFERENCES "user"(id),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- slots de 30 min: alinhado em :00/:30, segundos zerados (independe do fuso da sessão)
  CONSTRAINT appointment_starts_at_aligned CHECK (extract(epoch FROM starts_at)::numeric % 1800 = 0),
  CONSTRAINT appointment_cancel_consistency CHECK (
    (status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)
  )
);
-- Sala única por clínica: um agendamento ATIVO por horário; cancelados liberam o slot
CREATE UNIQUE INDEX appointment_clinic_slot_active ON appointment (clinic_id, starts_at) WHERE status = 'SCHEDULED';
-- Paciente não pode estar em dois exames no mesmo horário, em qualquer clínica
CREATE UNIQUE INDEX appointment_patient_slot_active ON appointment (patient_id, starts_at) WHERE status = 'SCHEDULED';
CREATE INDEX appointment_clinic_starts ON appointment (clinic_id, starts_at);
CREATE INDEX appointment_patient_starts ON appointment (patient_id, starts_at);

CREATE TABLE medical_report (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  appointment_id uuid NOT NULL REFERENCES appointment(id),
  doctor_id uuid NOT NULL REFERENCES doctor(id),
  title text NOT NULL,
  title_complement text,
  body jsonb NOT NULL,
  body_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CONSTRAINT medical_report_status_valid CHECK (status IN ('DRAFT', 'PUBLISHED')),
  published_at timestamptz,
  registration_id uuid REFERENCES doctor_registration(id),
  professional_name text,
  professional_registration text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- um laudo por agendamento; também é a trava contra dois médicos no mesmo atendimento
  CONSTRAINT medical_report_appointment_unique UNIQUE (appointment_id),
  CONSTRAINT medical_report_body_is_doc CHECK (body->>'type' = 'doc'),
  CONSTRAINT medical_report_body_size CHECK (octet_length(body::text) <= 102400),
  CONSTRAINT medical_report_published_consistency CHECK (
    status = 'DRAFT' OR (
      published_at IS NOT NULL AND registration_id IS NOT NULL
      AND professional_name IS NOT NULL AND professional_registration IS NOT NULL
    )
  )
);
CREATE INDEX medical_report_doctor ON medical_report (doctor_id);
CREATE INDEX medical_report_published_at ON medical_report (published_at) WHERE status = 'PUBLISHED';

-- Auditoria append-only: sem updated_at, sem FKs (o histórico sobrevive a rascunhos descartados)
CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  request_id text,
  actor_type text NOT NULL CONSTRAINT audit_event_actor_type_valid CHECK (actor_type IN ('USER', 'SERVICE')),
  actor_id text NOT NULL,
  actor_role text,
  clinic_id uuid,
  patient_id uuid,
  appointment_id uuid,
  medical_report_id uuid,
  doctor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_event_patient ON audit_event (patient_id, created_at);
CREATE INDEX audit_event_actor ON audit_event (actor_type, actor_id, created_at);
CREATE INDEX audit_event_clinic ON audit_event (clinic_id, created_at);
CREATE TRIGGER clinic_set_updated_at BEFORE UPDATE ON clinic FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_set_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER attendant_set_updated_at BEFORE UPDATE ON attendant FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER doctor_set_updated_at BEFORE UPDATE ON doctor FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER professional_council_set_updated_at BEFORE UPDATE ON professional_council FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER doctor_registration_set_updated_at BEFORE UPDATE ON doctor_registration FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER doctor_clinic_set_updated_at BEFORE UPDATE ON doctor_clinic FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER patient_set_updated_at BEFORE UPDATE ON patient FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER exam_type_set_updated_at BEFORE UPDATE ON exam_type FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER holiday_set_updated_at BEFORE UPDATE ON holiday FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER appointment_set_updated_at BEFORE UPDATE ON appointment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER medical_report_set_updated_at BEFORE UPDATE ON medical_report FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- append-only garantido pelo banco: a aplicação só insere e lê
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM clinic_app;
`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_event CASCADE;
DROP TABLE IF EXISTS medical_report CASCADE;
DROP TABLE IF EXISTS appointment CASCADE;
DROP TABLE IF EXISTS holiday CASCADE;
DROP TABLE IF EXISTS exam_type CASCADE;
DROP TABLE IF EXISTS patient CASCADE;
DROP TABLE IF EXISTS doctor_clinic CASCADE;
DROP TABLE IF EXISTS doctor_registration CASCADE;
DROP TABLE IF EXISTS professional_council CASCADE;
DROP TABLE IF EXISTS doctor CASCADE;
DROP TABLE IF EXISTS attendant CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS clinic CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
`);
  }
}
