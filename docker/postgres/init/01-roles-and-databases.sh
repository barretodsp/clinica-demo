#!/bin/sh
# Executado uma única vez, na primeira inicialização do volume do Postgres.
# Cria os papéis com privilégio mínimo e os bancos da aplicação e dos testes.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$CLINIC_OWNER_PASSWORD" \
  -v app_pw="$CLINIC_APP_PASSWORD" \
  -v grafana_pw="$GRAFANA_DB_PASSWORD" <<'SQL'
-- clinic_owner: dono do schema; usado só por migrations e seed (DDL)
CREATE ROLE clinic_owner LOGIN PASSWORD :'owner_pw';
-- clinic_app: backend em execução; DML sem DDL
CREATE ROLE clinic_app LOGIN PASSWORD :'app_pw';
-- grafana_ro: somente leitura, para os dashboards
CREATE ROLE grafana_ro LOGIN PASSWORD :'grafana_pw';

CREATE DATABASE clinic OWNER clinic_owner;
CREATE DATABASE clinic_test OWNER clinic_owner;
SQL

for db in clinic clinic_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO clinic_owner, clinic_app, grafana_ro;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO clinic_owner;
GRANT USAGE ON SCHEMA public TO clinic_app, grafana_ro;

-- Tudo o que o clinic_owner criar no schema public recebe estas permissões.
-- (audit_event tem UPDATE/DELETE revogados na própria migration: append-only.)
ALTER DEFAULT PRIVILEGES FOR ROLE clinic_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinic_app;
ALTER DEFAULT PRIVILEGES FOR ROLE clinic_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO grafana_ro;
SQL
done
