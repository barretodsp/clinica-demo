-- Clínicas: fuso, atendente e médicos vinculados
SELECT c.name AS clinica,
       c.city || '/' || c.state AS cidade,
       c.timezone AS fuso,
       ua.name || ' <' || ua.email || '>' AS atendente,
       (SELECT string_agg(u.name, ', ' ORDER BY u.name)
          FROM doctor_clinic dc JOIN doctor d ON d.id = dc.doctor_id JOIN "user" u ON u.id = d.user_id
         WHERE dc.clinic_id = c.id) AS medicos
FROM clinic c
LEFT JOIN attendant a ON a.clinic_id = c.id
LEFT JOIN "user" ua ON ua.id = a.user_id
ORDER BY c.name;
