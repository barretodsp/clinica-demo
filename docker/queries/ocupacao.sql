-- Ocupação da agenda nos próximos dias: agendados e livres (22 slots por dia útil)
SELECT c.name AS clinica,
       to_char(a.starts_at AT TIME ZONE c.timezone, 'DD/MM') || ' (' ||
         (ARRAY['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])[extract(isodow FROM a.starts_at AT TIME ZONE c.timezone)::int] || ')' AS dia,
       count(*) AS agendados,
       22 - count(*) AS livres
FROM appointment a JOIN clinic c ON c.id = a.clinic_id
WHERE a.status = 'SCHEDULED' AND a.starts_at > now()
GROUP BY c.name, (a.starts_at AT TIME ZONE c.timezone)::date, 2
ORDER BY c.name, (a.starts_at AT TIME ZONE c.timezone)::date;
