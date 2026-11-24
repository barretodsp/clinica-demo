-- Trilha de auditoria (append-only), do mais recente para o mais antigo, com nomes resolvidos
-- Filtros opcionais: PACIENTE=<e-mail ou nome> LIMITE=<n, padrão 50>
SELECT to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') AS quando_brasilia,
       e.event AS evento,
       e.actor_type AS ator,
       coalesce(au.name, e.actor_id) AS quem,
       coalesce(e.actor_role, '—') AS papel,
       coalesce(c.state, '—') AS uf,
       coalesce(p.name, '—') AS paciente,
       coalesce(e.request_id, '—') AS request_id
FROM audit_event e
LEFT JOIN "user" au ON e.actor_type = 'USER' AND au.id::text = e.actor_id
LEFT JOIN clinic c ON c.id = e.clinic_id
LEFT JOIN patient p ON p.id = e.patient_id
LEFT JOIN "user" pu ON pu.id = p.user_id
WHERE :'paciente' = '' OR pu.email = :'paciente' OR p.name ILIKE '%' || :'paciente' || '%'
ORDER BY e.created_at DESC
LIMIT NULLIF(:'limite', '')::int;
