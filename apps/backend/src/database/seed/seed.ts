import { PasswordHasher } from '@nestjs/authentication';
import type { DataSource, EntityManager } from 'typeorm';
import { addDays, businessSlots, localParts, localToUtc } from '../../common/clinic-time.js';
import type { ClinicTimezone, Uf } from '../../common/domain.js';
import { nextBusinessDays } from '../../appointments/booking-rules.js';
import { extractPlainText, type ReportDocument } from '../../medical-reports/report-body.js';
import {
  Appointment, Attendant, Clinic, Doctor, DoctorClinic, DoctorRegistration, ExamType, Holiday, MedicalReport,
  Patient, ProfessionalCouncil, User,
} from '../entities/index.js';
import { HOLIDAYS } from './holidays.data.js';

/** Senha de todas as contas de demonstração. */
export const DEMO_PASSWORD = 'Demo@2026';

const CLINICS: { key: string; name: string; city: string; state: Uf; timezone: ClinicTimezone }[] = [
  { key: 'SP', name: 'Clínica Demo São Paulo', city: 'São Paulo', state: 'SP', timezone: 'America/Sao_Paulo' },
  { key: 'BH', name: 'Clínica Demo Belo Horizonte', city: 'Belo Horizonte', state: 'MG', timezone: 'America/Sao_Paulo' },
  { key: 'MAO', name: 'Clínica Demo Manaus', city: 'Manaus', state: 'AM', timezone: 'America/Manaus' },
  { key: 'RBR', name: 'Clínica Demo Rio Branco', city: 'Rio Branco', state: 'AC', timezone: 'America/Rio_Branco' },
];

/**
 * LOINC: códigos confirmados para US e MR ("Unspecified body region").
 * Raio-X fica sem código (não confirmado): a exportação FHIR usa só o texto.
 */
const EXAM_TYPES = [
  { key: 'XR', name: 'Raio-X', loincCode: null, loincDisplay: null },
  { key: 'US', name: 'Ultrassonografia', loincCode: '25061-3', loincDisplay: 'US Unspecified body region' },
  { key: 'MR', name: 'Ressonância Magnética', loincCode: '25056-3', loincDisplay: 'MR Unspecified body region' },
];

/** Um atendente por clínica. */
const ATTENDANTS = [
  { email: 'paula@mail.com', name: 'Paula Ribeiro', clinic: 'SP' },
  { email: 'marcos@mail.com', name: 'Marcos Teixeira', clinic: 'BH' },
  { email: 'iara@mail.com', name: 'Iara Monteiro', clinic: 'MAO' },
  { email: 'tiago@mail.com', name: 'Tiago Barros', clinic: 'RBR' },
];

/** 5 médicos: 2 atuam em uma clínica só (SP e Manaus); 3 em várias. CRM em cada UF onde atuam. */
const DOCTORS = [
  { key: 'ANA', email: 'ana@mail.com', name: 'Dra. Ana Souza', specialty: 'Radiologia', clinics: ['SP'], crms: [['SP', '123456']] as [Uf, string][] },
  { key: 'BRUNO', email: 'bruno@mail.com', name: 'Dr. Bruno Lima', specialty: 'Radiologia', clinics: ['MAO'], crms: [['AM', '112233']] as [Uf, string][] },
  {
    key: 'CARLOS', email: 'carlos@mail.com', name: 'Dr. Carlos Mendes', specialty: 'Ultrassonografia',
    clinics: ['SP', 'BH'], crms: [['SP', '778899'], ['MG', '654321']] as [Uf, string][],
  },
  {
    key: 'DANIELA', email: 'daniela@mail.com', name: 'Dra. Daniela Rocha', specialty: 'Radiologia',
    clinics: ['SP', 'BH', 'MAO', 'RBR'],
    crms: [['SP', '135790'], ['MG', '246802'], ['AM', '975310'], ['AC', '864209']] as [Uf, string][],
  },
  {
    key: 'EDUARDO', email: 'eduardo@mail.com', name: 'Dr. Eduardo Nunes', specialty: 'Ressonância Magnética',
    clinics: ['MAO', 'RBR'], crms: [['AM', '558812'], ['AC', '330145']] as [Uf, string][],
  },
];

/**
 * 12 pacientes (globais), CPFs fictícios com dígitos verificadores válidos.
 * João (SP + Manaus) e Silvia (BH + Rio Branco): agendamentos em mais de uma clínica.
 * Oito pacientes em uma clínica só (dois por clínica). Lúcia e Pedro: sem agendamentos.
 */
export const PATIENTS = [
  { key: 'JOAO', email: 'joao@mail.com', name: 'João Pereira', birthDate: '1985-03-12', document: '38291560498' },
  { key: 'SILVIA', email: 'silvia@mail.com', name: 'Silvia Costa', birthDate: '1990-09-04', document: '51724893637' },
  { key: 'MARIA', email: 'maria@mail.com', name: 'Maria Oliveira', birthDate: '1992-07-25', document: '69403152761' },
  { key: 'RAFAEL', email: 'rafael@mail.com', name: 'Rafael Gomes', birthDate: '1988-12-01', document: '61827394528' },
  { key: 'JOSE', email: 'jose@mail.com', name: 'José Antônio Silva', birthDate: '1958-11-02', document: '20576314862' },
  { key: 'BEATRIZ', email: 'beatriz@mail.com', name: 'Beatriz Lopes', birthDate: '1995-04-17', document: '73452918637' },
  { key: 'CARLA', email: 'carla@mail.com', name: 'Carla Duarte', birthDate: '1979-08-09', document: '15986347200' },
  { key: 'FERNANDO', email: 'fernando@mail.com', name: 'Fernando Reis', birthDate: '1967-02-23', document: '92637485191' },
  { key: 'JULIANA', email: 'juliana@mail.com', name: 'Juliana Martins', birthDate: '1999-10-30', document: '34781265928' },
  { key: 'RICARDO', email: 'ricardo@mail.com', name: 'Ricardo Freitas', birthDate: '1972-06-14', document: '58294613746' },
  { key: 'LUCIA', email: 'lucia@mail.com', name: 'Lúcia Fernandes', birthDate: '2001-01-30', document: '87362049196' },
  { key: 'PEDRO', email: 'pedro@mail.com', name: 'Pedro Almeida', birthDate: '1976-05-18', document: '43159876209' },
];

/** Pacientes agendados em cada clínica: 2 exclusivos + 1 compartilhado (João ou Silvia) = 3 por clínica. */
const CLINIC_PATIENTS: Record<string, string[]> = {
  SP: ['MARIA', 'RAFAEL', 'JOAO'],
  MAO: ['JOSE', 'BEATRIZ', 'JOAO'],
  BH: ['CARLA', 'FERNANDO', 'SILVIA'],
  RBR: ['JULIANA', 'RICARDO', 'SILVIA'],
};

/** Agenda futura: cada paciente com 2 agendamentos por dia, nos 3 próximos dias úteis. */
export const SEED_FILLED_BUSINESS_DAYS = 3;
export const SEED_APPOINTMENTS_PER_PATIENT_PER_DAY = 2;

function reportBody(findings: string[], conclusion: string): ReportDocument {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2, textAlign: null }, content: [{ type: 'text', text: 'Achados' }] },
      {
        type: 'bulletList',
        content: findings.map((f) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: f }] }] })),
      },
      { type: 'heading', attrs: { level: 2, textAlign: null }, content: [{ type: 'text', text: 'Conclusão' }] },
      {
        type: 'paragraph',
        attrs: { textAlign: 'justify' },
        content: [{ type: 'text', text: conclusion, marks: [{ type: 'bold' }] }],
      },
    ],
  };
}

export interface SeedResult {
  skipped: boolean;
}

/** Popula o banco com dados fictícios. Idempotente: não faz nada se já houver clínicas. */
export async function seedDatabase(ds: DataSource, now = new Date(), hasher = new PasswordHasher()): Promise<SeedResult> {
  if ((await ds.getRepository(Clinic).count()) > 0) return { skipped: true };
  const passwordHash = await hasher.hash(DEMO_PASSWORD);

  await ds.transaction(async (m: EntityManager) => {
    await m.getRepository(Holiday).insert(HOLIDAYS);
    const holidaySet = new Set(HOLIDAYS.map((h) => h.date));

    const clinics = new Map<string, Clinic>();
    for (const c of CLINICS) {
      const saved = await m.getRepository(Clinic).save(m.getRepository(Clinic).create(c));
      clinics.set(c.key, saved);
    }

    const exams = new Map<string, ExamType>();
    for (const e of EXAM_TYPES) {
      exams.set(e.key, await m.getRepository(ExamType).save(m.getRepository(ExamType).create(e)));
    }

    const crm = await m.getRepository(ProfessionalCouncil).save(
      m.getRepository(ProfessionalCouncil).create({ code: 'CRM', name: 'Conselho Regional de Medicina' }),
    );

    const newUser = (email: string, name: string, role: User['role']) =>
      m.getRepository(User).save(m.getRepository(User).create({ email, name, role, passwordHash }));

    const attendantUsers = new Map<string, User>();
    for (const a of ATTENDANTS) {
      const user = await newUser(a.email, a.name, 'ATTENDANT');
      await m.getRepository(Attendant).insert({ userId: user.id, clinicId: clinics.get(a.clinic)!.id });
      attendantUsers.set(a.clinic, user);
    }

    const doctors = new Map<string, { doctor: Doctor; user: User; registrations: DoctorRegistration[] }>();
    for (const d of DOCTORS) {
      const user = await newUser(d.email, d.name, 'DOCTOR');
      const doctor = await m.getRepository(Doctor).save(m.getRepository(Doctor).create({ userId: user.id, specialty: d.specialty }));
      const registrations: DoctorRegistration[] = [];
      for (const [state, number] of d.crms) {
        registrations.push(
          await m.getRepository(DoctorRegistration).save(
            m.getRepository(DoctorRegistration).create({ doctorId: doctor.id, councilId: crm.id, state, number }),
          ),
        );
      }
      for (const ck of d.clinics) {
        await m.getRepository(DoctorClinic).insert({ doctorId: doctor.id, clinicId: clinics.get(ck)!.id });
      }
      doctors.set(d.key, { doctor, user, registrations });
    }

    const patients = new Map<string, Patient>();
    for (const p of PATIENTS) {
      const user = await newUser(p.email, p.name, 'PATIENT');
      patients.set(
        p.key,
        await m.getRepository(Patient).save(
          m.getRepository(Patient).create({ userId: user.id, name: p.name, birthDate: p.birthDate, document: p.document }),
        ),
      );
    }

    // --- Agendamentos ----------------------------------------------------
    const apptRepo = m.getRepository(Appointment);
    const today = (tz: ClinicTimezone) => localParts(now, tz).date;
    const pastDay = (clinicKey: string, nthBack: number) => {
      const tz = clinics.get(clinicKey)!.timezone;
      let d = addDays(today(tz), -1);
      let found = -1;
      while (true) {
        const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
        if (wd !== 0 && wd !== 6 && !holidaySet.has(d)) found++;
        if (found === nthBack) return d;
        d = addDays(d, -1);
      }
    };
    const at = (clinicKey: string, date: string, hhmm: string) => {
      const [h, mi] = hhmm.split(':').map(Number);
      return localToUtc(date, h * 60 + mi, clinics.get(clinicKey)!.timezone);
    };
    const schedule = (clinicKey: string, patientKey: string, examKey: string, startsAt: Date) =>
      apptRepo.save(
        apptRepo.create({
          clinicId: clinics.get(clinicKey)!.id,
          patientId: patients.get(patientKey)!.id,
          examTypeId: exams.get(examKey)!.id,
          startsAt,
          createdByUserId: attendantUsers.get(clinicKey)!.id,
        }),
      );

    // Agenda futura: nos 3 próximos dias úteis, cada paciente tem 2 agendamentos por dia.
    // Pacientes exclusivos: 2 na sua clínica. João e Silvia: 1 em cada uma das suas 2 clínicas.
    // Resultado: 5 agendamentos por clínica/dia (17 dos 22 horários livres).
    // O paciente nunca fica em dois exames no mesmo instante (fusos diferentes coincidem em UTC).
    const busy = new Map<string, Set<number>>(); // paciente → instantes ocupados
    const isFree = (patientKey: string, t: Date) => !busy.get(patientKey)?.has(t.getTime());
    const occupy = (patientKey: string, t: Date) => {
      if (!busy.has(patientKey)) busy.set(patientKey, new Set());
      busy.get(patientKey)!.add(t.getTime());
    };
    const examKeys = EXAM_TYPES.map((e) => e.key);
    const future: Partial<Appointment>[] = [];
    for (const c of CLINICS) {
      const [exclusiveA, exclusiveB, shared] = CLINIC_PATIENTS[c.key];
      // ordem de ocupação dos horários do dia: exclusivo A, B, A, B e o compartilhado
      const plan = [exclusiveA, exclusiveB, exclusiveA, exclusiveB, shared];
      const days = nextBusinessDays(addDays(today(c.timezone), 1), SEED_FILLED_BUSINESS_DAYS, holidaySet);
      days.forEach((day, dayIdx) => {
        const slots = businessSlots(day, c.timezone);
        const used = new Set<number>();
        plan.forEach((patientKey, k) => {
          // horários espalhados pelo dia (a cada 2 h), deslocados por dia e por clínica;
          // se o paciente já estiver ocupado no instante (outra clínica), usa o próximo horário livre
          let idx = (2 + k * 4 + dayIdx + (patientKey === shared && ['MAO', 'RBR'].includes(c.key) ? 1 : 0)) % slots.length;
          while (used.has(idx) || !isFree(patientKey, slots[idx])) idx = (idx + 1) % slots.length;
          used.add(idx);
          occupy(patientKey, slots[idx]);
          future.push({
            clinicId: clinics.get(c.key)!.id,
            patientId: patients.get(patientKey)!.id,
            examTypeId: exams.get(examKeys[(k + dayIdx) % examKeys.length])!.id,
            startsAt: slots[idx],
            createdByUserId: attendantUsers.get(c.key)!.id,
          });
        });
      });
    }
    await apptRepo.insert(future as Appointment[]);
    // um cancelamento às 08:00 do 1º dia em SP (horário não usado acima): continua agendável
    const spFirstDay = nextBusinessDays(addDays(today('America/Sao_Paulo'), 1), 1, holidaySet)[0];
    const cancelledSlot = { clinicKey: 'SP', startsAt: at('SP', spFirstDay, '08:00') };

    // Cancelado (o horário segue livre e pode ser reagendado)
    {
      const { clinicKey, startsAt } = cancelledSlot;
      await apptRepo.insert({
        clinicId: clinics.get(clinicKey)!.id,
        patientId: patients.get('JOAO')!.id,
        examTypeId: exams.get('US')!.id,
        startsAt,
        status: 'CANCELLED',
        createdByUserId: attendantUsers.get(clinicKey)!.id,
        cancelledByUserId: attendantUsers.get(clinicKey)!.id,
        cancelledAt: now,
      });
    }

    // Passados (inseridos direto no banco: a regra de "não agendar no passado" vale só para a API)
    const pastMr = await schedule('SP', 'JOAO', 'MR', at('SP', pastDay('SP', 2), '10:00'));
    const pastUs = await schedule('MAO', 'BEATRIZ', 'US', at('MAO', pastDay('MAO', 4), '15:00'));
    const pastXr = await schedule('BH', 'SILVIA', 'XR', at('BH', pastDay('BH', 1), '08:30'));
    const pastBh = await schedule('BH', 'CARLA', 'US', at('BH', pastDay('BH', 3), '11:00'));
    const pastRbr = await schedule('RBR', 'RICARDO', 'XR', at('RBR', pastDay('RBR', 3), '13:00'));
    await schedule('RBR', 'JULIANA', 'US', at('RBR', pastDay('RBR', 0), '09:00')); // ainda sem laudo

    // --- Laudos -----------------------------------------------------------
    const reportRepo = m.getRepository(MedicalReport);
    const publish = async (appt: Appointment, examKey: string, doctorKey: string, clinicKey: string, complement: string | null, body: ReportDocument, publishedAt: Date) => {
      const { doctor, user, registrations } = doctors.get(doctorKey)!;
      const reg = registrations.find((r) => r.state === clinics.get(clinicKey)!.state)!;
      const examName = exams.get(examKey)!.name;
      await reportRepo.insert({
        appointmentId: appt.id,
        doctorId: doctor.id,
        title: complement ? `${examName} — ${complement}` : examName,
        titleComplement: complement,
        body,
        bodyText: extractPlainText(body),
        status: 'PUBLISHED',
        publishedAt,
        registrationId: reg.id,
        professionalName: user.name,
        professionalRegistration: `CRM/${reg.state} ${reg.number}`,
      });
    };
    const dayAfter = (d: Date) => new Date(d.getTime() + 24 * 3600 * 1000);

    await publish(
      pastMr, 'MR', 'ANA', 'SP', 'Joelho direito',
      reportBody(
        ['Menisco medial íntegro, sem sinais de ruptura.', 'Ligamentos cruzados preservados.', 'Pequeno derrame articular.'],
        'Exame sem alterações estruturais significativas, exceto discreto derrame articular.',
      ),
      dayAfter(pastMr.startsAt),
    );
    await publish(
      pastUs, 'US', 'BRUNO', 'MAO', 'Abdome total',
      reportBody(['Fígado de dimensões normais e ecotextura homogênea.', 'Vesícula biliar sem cálculos.'], 'Ultrassonografia de abdome total dentro da normalidade.'),
      dayAfter(pastUs.startsAt),
    );
    await publish(
      pastXr, 'XR', 'CARLOS', 'BH', 'Tórax PA e perfil',
      reportBody(['Campos pulmonares livres.', 'Área cardíaca dentro dos limites da normalidade.'], 'Radiografia de tórax sem alterações.'),
      dayAfter(pastXr.startsAt),
    );
    await publish(
      pastBh, 'US', 'DANIELA', 'BH', 'Tireoide',
      reportBody(['Tireoide de dimensões normais.', 'Sem nódulos.'], 'Ultrassonografia de tireoide sem alterações.'),
      dayAfter(pastBh.startsAt),
    );

    // Rascunho (visível só para o médico dono)
    const draftBody = reportBody(['Coluna lombar com redução do espaço discal em L4-L5.'], 'Rascunho em elaboração.');
    await reportRepo.insert({
      appointmentId: pastRbr.id,
      doctorId: doctors.get('EDUARDO')!.doctor.id,
      title: `${exams.get('XR')!.name} — Coluna lombar`,
      titleComplement: 'Coluna lombar',
      body: draftBody,
      bodyText: extractPlainText(draftBody),
      status: 'DRAFT',
    });
  });

  return { skipped: false };
}
