-- Médicos: registros profissionais (CRM por UF) e clínicas onde atuam
SELECT u.name AS medico,
       u.email,
       d.specialty AS especialidade,
       (SELECT string_agg(pc.code || '/' || r.state || ' ' || r.number, ', ' ORDER BY r.state)
          FROM doctor_registration r JOIN professional_council pc ON pc.id = r.council_id
         WHERE r.doctor_id = d.id) AS registros,
       (SELECT string_agg(c.name, ', ' ORDER BY c.name)
          FROM doctor_clinic dc JOIN clinic c ON c.id = dc.clinic_id WHERE dc.doctor_id = d.id) AS clinicas,
       (SELECT count(*) FROM medical_report m WHERE m.doctor_id = d.id AND m.status = 'PUBLISHED') AS laudos_publicados
FROM doctor d JOIN "user" u ON u.id = d.user_id
ORDER BY u.name;
