# Atalhos para rodar, testar e consultar o banco.
# As consultas usam o papel SOMENTE LEITURA (grafana_ro) via psql dentro do container:
# não precisam de porta publicada nem de cliente instalado.
#
#   make help
#   make db-agendamentos CLINICA=SP DATA=2026-11-25
#   make db-historico PACIENTE=joao@mail.com
#   make fhir PACIENTE=joao@mail.com

COMPOSE   ?= docker compose
PSQL      = $(COMPOSE) exec -T postgres psql -U grafana_ro -d clinic -X -q -P pager=off -P null=— \
            -v paciente="$(PACIENTE)" -v clinica="$(CLINICA)" -v data="$(DATA)" -v todos="$(TODOS)" -v limite="$(LIMITE)"
Q         = docker/queries
LIMITE   ?= 50
BASE_URL ?= http://clinica.localhost
# Formata o JSON com o que houver no host (jq, python3); senão, imprime cru.
JSON_FMT  = $(if $(shell command -v jq),jq .,$(if $(shell command -v python3),python3 -m json.tool --no-ensure-ascii,cat))

.DEFAULT_GOAL := help
.PHONY: help up down reset logs test service-token fhir pacs db-psql db-clinicas db-usuarios db-medicos db-pacientes \
        db-agendamentos db-ocupacao db-laudos db-auditoria db-historico db-tudo

help: ## Lista os comandos
	@echo "Uso: make <comando> [PACIENTE=...] [CLINICA=...] [DATA=AAAA-MM-DD] [TODOS=1] [LIMITE=n]"
	@echo
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{ printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }'

# --- Ambiente ---------------------------------------------------------------
up: ## Sobe o ambiente (http://clinica.localhost)
	$(COMPOSE) up -d --build

down: ## Para o ambiente (mantém os dados)
	$(COMPOSE) down

reset: ## Recomeça do zero: apaga banco, logs e Grafana e sobe de novo
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

logs: ## Acompanha os logs da API
	$(COMPOSE) logs -f backend

test: ## Roda os testes (requer Node 26/pnpm e o Postgres no ar)
	pnpm test

service-token: ## Gera o token de serviço da exportação FHIR
	@$(COMPOSE) exec -T backend node dist/auth/generate-service-token.js

# Sem LAUDO, usa o laudo publicado mais recente (do PACIENTE, se informado).
# O ID escolhido vai para o stderr: `make -s fhir > laudo.json` grava só o JSON.
fhir: ## Exporta um laudo publicado em FHIR R4  [LAUDO=<id> ou PACIENTE=]
	@id="$(LAUDO)"; \
	if [ -z "$$id" ]; then id=$$($(PSQL) -t -A < $(Q)/laudo-publicado.sql) || exit 1; fi; \
	if [ -z "$$id" ]; then echo "Nenhum laudo publicado encontrado$(if $(PACIENTE), para '$(PACIENTE)')." >&2; exit 1; fi; \
	echo "GET $(BASE_URL)/api/fhir/medical-reports/$$id" >&2; \
	token=$$($(COMPOSE) exec -T backend node dist/auth/generate-service-token.js) || exit 1; \
	body=$$(curl -sS --fail-with-body -H "Authorization: Bearer $$token" "$(BASE_URL)/api/fhir/medical-reports/$$id"); rc=$$?; \
	printf '%s\n' "$$body" | $(JSON_FMT); exit $$rc

pacs: ## Gera imagens no PACS para agendamentos criados depois da subida
	$(COMPOSE) up pacs-seed

# --- Banco (somente leitura) -------------------------------------------------
db-psql: ## Abre o psql interativo (somente leitura)
	$(COMPOSE) exec postgres psql -U grafana_ro -d clinic

db-clinicas: ## Clínicas, fuso, atendente e médicos
	@$(PSQL) < $(Q)/clinicas.sql

db-usuarios: ## Usuários (papel, escopo, ativo) — sem hash de senha
	@$(PSQL) < $(Q)/usuarios.sql

db-medicos: ## Médicos, CRMs por UF, clínicas e laudos publicados
	@$(PSQL) < $(Q)/medicos.sql

db-pacientes: ## Pacientes, CPF, e-mail e agendamentos  [PACIENTE=]
	@$(PSQL) < $(Q)/pacientes.sql

db-agendamentos: ## Agendamentos no horário local  [CLINICA= PACIENTE= DATA= TODOS=1]
	@$(PSQL) < $(Q)/agendamentos.sql

db-ocupacao: ## Agendados e livres por clínica/dia (próximos dias)
	@$(PSQL) < $(Q)/ocupacao.sql

db-laudos: ## Laudos, médico, assinatura e publicação (sem o texto)  [PACIENTE=]
	@$(PSQL) < $(Q)/laudos.sql

db-auditoria: ## Trilha de auditoria, mais recente primeiro  [PACIENTE= LIMITE=50]
	@$(PSQL) < $(Q)/auditoria.sql

db-historico: ## História de um paciente na auditoria  PACIENTE=<e-mail ou nome>
	@test -n "$(PACIENTE)" || (echo "Informe o paciente: make db-historico PACIENTE=joao@mail.com" && exit 1)
	@$(PSQL) < $(Q)/historico.sql

db-tudo: db-clinicas db-usuarios db-medicos db-pacientes db-ocupacao db-laudos ## Visão geral do banco
