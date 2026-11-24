-- Agendamentos com horário LOCAL da clínica, paciente, exame, situação e laudo
-- Filtros opcionais: CLINICA=<UF ou parte do nome> PACIENTE=<e-mail ou nome> DATA=<AAAA-MM-DD, dia local>
-- Sem filtros: só os futuros. TODOS=1 inclui passados e cancelados.
SELECT to_char(a.starts_at AT TIME ZONE c.timezone, 'DD/MM/YYYY HH24:MI') AS horario_local,
       c.state AS uf,
       c.name AS clinica,
       p.name AS paciente,
       e.name AS exame,
       a.status AS situacao,
       coalesce(r.status, '—') AS laudo,
       coalesce(du.name, '—') AS medico_do_laudo,
       a.id AS appointment_id
FROM appointment a
JOIN clinic c ON c.id = a.clinic_id
JOIN patient p ON p.id = a.patient_id
JOIN "user" pu ON pu.id = p.user_id
JOIN exam_type e ON e.id = a.exam_type_id
LEFT JOIN medical_report r ON r.appointment_id = a.id
LEFT JOIN doctor d ON d.id = r.doctor_id
LEFT JOIN "user" du ON du.id = d.user_id
WHERE (:'clinica' = '' OR c.state = upper(:'clinica') OR c.name ILIKE '%' || :'clinica' || '%')
  AND (:'paciente' = '' OR pu.email = :'paciente' OR p.name ILIKE '%' || :'paciente' || '%')
  AND (NULLIF(:'data', '') IS NULL OR (a.starts_at AT TIME ZONE c.timezone)::date = NULLIF(:'data', '')::date)
  AND (:'todos' = '1' OR NULLIF(:'data', '') IS NOT NULL OR :'paciente' <> '' OR (a.status = 'SCHEDULED' AND a.starts_at > now()))
ORDER BY a.starts_at, c.name;
