-- ID do laudo PUBLICADO mais recente (usado por `make fhir`)
-- Filtro opcional: PACIENTE=<e-mail ou nome>
SELECT r.id
FROM medical_report r
JOIN appointment a ON a.id = r.appointment_id
JOIN patient p ON p.id = a.patient_id
JOIN "user" pu ON pu.id = p.user_id
WHERE r.status = 'PUBLISHED'
  AND (:'paciente' = '' OR pu.email = :'paciente' OR p.name ILIKE '%' || :'paciente' || '%')
ORDER BY r.published_at DESC
LIMIT 1;
