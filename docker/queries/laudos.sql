-- Laudos: situação, médico responsável, assinatura gravada na publicação (sem o texto clínico)
-- Filtro opcional: PACIENTE=<e-mail ou nome>
SELECT r.status AS situacao,
       r.title AS titulo,
       p.name AS paciente,
       c.name AS clinica,
       du.name AS medico_responsavel,
       coalesce(r.professional_registration, '—') AS assinatura_crm,
       coalesce(to_char(r.published_at AT TIME ZONE c.timezone, 'DD/MM/YYYY HH24:MI'), '—') AS publicado_em_local,
       to_char(a.starts_at AT TIME ZONE c.timezone, 'DD/MM/YYYY HH24:MI') AS exame_local,
       r.id AS medical_report_id
FROM medical_report r
JOIN appointment a ON a.id = r.appointment_id
JOIN clinic c ON c.id = a.clinic_id
JOIN patient p ON p.id = a.patient_id
JOIN "user" pu ON pu.id = p.user_id
JOIN doctor d ON d.id = r.doctor_id
JOIN "user" du ON du.id = d.user_id
WHERE :'paciente' = '' OR pu.email = :'paciente' OR p.name ILIKE '%' || :'paciente' || '%'
ORDER BY a.starts_at;
