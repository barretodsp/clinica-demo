-- Pacientes: CPF, e-mail de acesso, clínicas e quantidade de agendamentos
-- Filtro opcional: PACIENTE=<e-mail ou parte do nome>
SELECT p.name AS paciente,
       u.email,
       substr(p.document, 1, 3) || '.' || substr(p.document, 4, 3) || '.' || substr(p.document, 7, 3) || '-' || substr(p.document, 10, 2) AS cpf,
       to_char(p.birth_date, 'DD/MM/YYYY') AS nascimento,
       count(a.id) FILTER (WHERE a.status = 'SCHEDULED' AND a.starts_at > now()) AS futuros,
       count(a.id) FILTER (WHERE a.starts_at <= now()) AS passados,
       count(a.id) FILTER (WHERE a.status = 'CANCELLED') AS cancelados,
       coalesce(string_agg(DISTINCT c.state, ', '), '—') AS clinicas,
       p.id AS patient_id
FROM patient p
JOIN "user" u ON u.id = p.user_id
LEFT JOIN appointment a ON a.patient_id = p.id
LEFT JOIN clinic c ON c.id = a.clinic_id
WHERE :'paciente' = '' OR u.email = :'paciente' OR p.name ILIKE '%' || :'paciente' || '%'
GROUP BY p.id, u.email
ORDER BY p.name;
