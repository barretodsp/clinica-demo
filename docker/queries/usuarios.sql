-- Usuários (sem hash de senha) com papel e escopo
SELECT u.role AS papel,
       u.name AS nome,
       u.email,
       CASE u.role
         WHEN 'ATTENDANT' THEN (SELECT c.name FROM attendant a JOIN clinic c ON c.id = a.clinic_id WHERE a.user_id = u.id)
         WHEN 'DOCTOR' THEN (SELECT string_agg(c.state, ', ' ORDER BY c.state) FROM doctor d
                               JOIN doctor_clinic dc ON dc.doctor_id = d.id JOIN clinic c ON c.id = dc.clinic_id
                              WHERE d.user_id = u.id)
         ELSE 'global'
       END AS escopo,
       u.is_active AS ativo,
       u.id AS user_id
FROM "user" u
ORDER BY CASE u.role WHEN 'ATTENDANT' THEN 1 WHEN 'DOCTOR' THEN 2 ELSE 3 END, u.name;
