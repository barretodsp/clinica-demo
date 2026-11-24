-- História de um paciente (auditoria em ordem cronológica): agendado, laudo iniciado/salvo/publicado, visualizado, cancelado...
-- Uso: make db-historico PACIENTE=joao@mail.com
SELECT to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando_brasilia,
       e.event AS evento,
       coalesce(au.name, e.actor_id) AS quem,
       coalesce(e.actor_role, e.actor_type) AS papel,
       coalesce(c.name, '—') AS clinica,
       coalesce(to_char(a.starts_at AT TIME ZONE c.timezone, 'DD/MM HH24:MI'), '—') AS exame_local,
       coalesce(r.status, CASE WHEN e.medical_report_id IS NOT NULL THEN 'descartado' END, '—') AS laudo_agora
FROM audit_event e
JOIN patient p ON p.id = e.patient_id
JOIN "user" pu ON pu.id = p.user_id
LEFT JOIN "user" au ON e.actor_type = 'USER' AND au.id::text = e.actor_id
LEFT JOIN clinic c ON c.id = e.clinic_id
LEFT JOIN appointment a ON a.id = e.appointment_id
LEFT JOIN medical_report r ON r.id = e.medical_report_id
WHERE pu.email = :'paciente' OR p.name ILIKE '%' || NULLIF(:'paciente', '') || '%'
ORDER BY e.created_at;
