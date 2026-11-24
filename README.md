# Exames e Laudos — agendamento de exames e acesso a laudos

Aplicação web para uma rede de clínicas: a equipe agenda exames e emite laudos; o paciente consulta seus agendamentos e lê os laudos publicados.

Resposta ao desafio técnico *"Agendamento de exames e acesso a laudos"*: frontend em React + TypeScript, backend em Node.js + TypeScript.

| Camada | Tecnologias |
|---|---|
| Backend | NestJS 12 · TypeORM 1.1 · PostgreSQL 19 · `@nestjs/authentication` / `@nestjs/authorization` |
| Frontend | React 19 · Vite 8 · TanStack Router + Query · Mantine 9 (editor de laudo Tiptap) |
| Infra | Docker Compose · nginx (`clinica.localhost`) · Grafana + Loki · Orthanc (PACS de demonstração) |
| Testes | Vitest + Supertest contra Postgres real: **97 testes**, unitários e de integração |

**Para avaliar rápido:**
1. [Suba o ambiente](#2-como-executar). Só precisa de Docker.
2. Use as [contas de demonstração](#3-contas-de-demonstração). A senha de todas é `Demo@2026`.
3. Siga o [roteiro de avaliação](#4-roteiro-de-avaliação).

---

## Sumário

1. [O que foi entregue](#1-o-que-foi-entregue)
   - [1.1 Requisitos do desafio](#11-requisitos-do-desafio)
   - [1.2 Extras: além do desafio, mais perto da realidade](#12-extras-além-do-desafio-mais-perto-da-realidade)
2. [Como executar](#2-como-executar)
3. [Contas de demonstração](#3-contas-de-demonstração)
4. [Roteiro de avaliação](#4-roteiro-de-avaliação)
5. [Testes automatizados](#5-testes-automatizados)
6. [Fuso horário](#6-fuso-horário)
7. [Decisões técnicas](#7-decisões-técnicas)
8. [Limitações e pendências](#8-limitações-e-pendências)
9. [Banco de dados e consultas](#9-banco-de-dados-e-consultas)
10. [Uso direto da API](#10-uso-direto-da-api)
11. [Estrutura e documentação](#11-estrutura-e-documentação)
12. [Tempo dedicado](#12-tempo-dedicado)

---

## 1. O que foi entregue

### 1.1 Requisitos do desafio

Todos os itens do enunciado foram implementados. A coluna **Verificar** aponta para o passo do roteiro (§4) ou para o teste que demonstra o item.

**Perfis, autenticação e autorização (§3)**

| Requisito | Como foi atendido | Verificar |
|---|---|---|
| Perfis "Equipe da clínica" e "Paciente" | A equipe foi dividida em **Atendente** (agenda, consulta e cancela) e **Médico** (cria, edita e publica laudos). O paciente tem um portal próprio. | §3 |
| Autenticação simples | Login com e-mail e senha. A sessão é um JWT em cookie HttpOnly. | §4.1 |
| Autorização verificada no backend, inclusive em chamadas diretas à API | É *deny-by-default*: toda rota declara quem pode acessá-la. O vínculo com a clínica é conferido no banco a cada requisição. | §4.8 · testes |

**Agendamento de exames (§4.1)**

| Requisito | Como foi atendido | Verificar |
|---|---|---|
| Selecionar paciente cadastrado | Busca por nome (ignora acentos e maiúsculas) ou por CPF | §4.1 |
| Selecionar tipo de exame (no mínimo 3) | Raio-X, Ultrassonografia e Ressonância Magnética | §4.1 |
| Informar data e horário | Calendário mais a grade de horários livres do dia | §4.1 |
| Consultar e filtrar por data e paciente | Filtros na lista: dia (com anterior, próximo e "Hoje") e paciente | §4.3 |
| Cancelar agendamento | Com confirmação; o horário volta a ficar livre | §4.4 |
| Sala única com horários fixos de 30 min | Uma sala por clínica, horários em :00 e :30, para qualquer exame | §4.1 |
| Não agendar no passado | `422 IN_PAST` | §4.2 · teste 5 |
| Não permitir dois agendamentos ativos no mesmo horário | Garantido por índice único parcial no banco, o que também cobre requisições simultâneas (`409 SLOT_TAKEN`) | §4.2 · teste 1 |
| Reutilizar o horário de um agendamento cancelado | O índice só considera agendamentos ativos | §4.4 |
| Datas consistentes e fuso documentado | O banco guarda em UTC; a tela mostra sempre o horário da clínica, com a indicação do fuso | §6 |

**Cadastro e publicação de laudos (§4.2)**

| Requisito | Como foi atendido | Verificar |
|---|---|---|
| Laudo com título, texto e profissional responsável | O título é o tipo do exame mais um complemento. O texto é rico (editor Tiptap). O profissional é o médico logado, e na publicação o laudo recebe a assinatura com nome e CRM da UF da clínica. | §4.5 |
| Salvar como rascunho e publicar depois | Botões "Salvar rascunho" e "Publicar…" | §4.5 |
| Um laudo por agendamento | Restrição `UNIQUE` no banco | §4.6 |
| Rascunho editável e visível só para a clínica | Só o médico que iniciou o laudo lê e edita. O restante da equipe vê a situação e o responsável. O paciente nunca vê. | §4.6 · teste 3 |
| Publicado fica disponível ao paciente correto | Aparece no portal do paciente | §4.7 · teste 4 |
| Publicado não pode ser editado | `409 REPORT_PUBLISHED` | §4.5 |
| Agendamento cancelado não recebe laudo | `409 APPOINTMENT_CANCELLED` | §4.4 |
| Agendamento com laudo publicado não pode ser cancelado | Bloqueado também com rascunho (`409 APPOINTMENT_HAS_REPORT`) | §4.4 |
| Registrar a data de publicação | `published_at`, exibido no laudo | §4.5 |

**Acesso do paciente (§4.3)**

| Requisito | Como foi atendido | Verificar |
|---|---|---|
| Ver os próprios agendamentos com tipo, data e situação | Página "Meus agendamentos", com os exames de todas as clínicas | §4.7 |
| Identificar quais exames têm laudo publicado | "Laudo disponível" ou "Laudo ainda não disponível". Um rascunho nunca aparece. | §4.7 |
| Abrir e ler os laudos publicados | Leitura do laudo, com assinatura e data de publicação | §4.7 |
| Não acessar dados de outro paciente | `403 REPORT_ACCESS_DENIED`. Tudo é filtrado pelo paciente da sessão, nunca por parâmetro. | §4.8 · teste 2 |

**Testes automatizados (§4.4):** os cinco cenários obrigatórios estão cobertos. Detalhes em [§5](#5-testes-automatizados).

**Entrega (§5)**

| Item | Onde está |
|---|---|
| Código do frontend e do backend | [`apps/frontend`](apps/frontend), [`apps/backend`](apps/backend) |
| Instalar e executar | [§2](#2-como-executar) |
| Preparar o banco e carregar dados fictícios | É automático na subida (container `migrate`). Detalhes em [§9](#9-banco-de-dados-e-consultas). |
| Credenciais das contas de demonstração | [§3](#3-contas-de-demonstração) |
| Executar os testes | [§5](#5-testes-automatizados) |
| Exemplo de variáveis de ambiente, sem segredos reais | [`.env.example`](.env.example) |
| Decisões técnicas, limitações e pendências | [§7](#7-decisões-técnicas), [§8](#8-limitações-e-pendências) e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Tempo dedicado | [§12](#12-tempo-dedicado) |
| *Vibe coding* | O uso de IA, com prompts, revisões e ajustes, está registrado em [docs/AI_LOG.md](docs/AI_LOG.md) |

### 1.2 Extras: além do desafio, mais perto da realidade

O enunciado pede uma clínica simplificada. Os itens abaixo não foram pedidos. Foram incluídos porque tratam problemas que um sistema real de clínicas enfrenta.

| Extra | O que faz | Por que aproxima da realidade | Ver |
|---|---|---|---|
| **Rede com 4 clínicas (multi-tenant)** | Cada clínica tem seus agendamentos. A atendente pertence a uma clínica, o médico a várias e o paciente é global. | Redes de diagnóstico raramente têm uma unidade só, e o isolamento entre unidades é requisito básico. | §4.9 |
| **Fusos diferentes por clínica** | SP e BH (Brasília), Manaus (Amazonas) e Rio Branco (Acre). Expediente, feriados e filtros usam o horário local. | O Brasil tem 4 fusos, e o paciente precisa ver o horário real do exame no local. | §4.9 |
| **Expediente e feriados** | Agendamento de segunda a sexta, das 08:00 às 19:00. Feriados nacionais de 2026 a 2028 ficam bloqueados. | Evita agendamentos em horários em que a clínica não funciona. | §4.2 |
| **Paciente em dois lugares ao mesmo tempo** | `409 PATIENT_BUSY`, mesmo entre clínicas | Conflito comum em redes com várias unidades. | §4.2 |
| **Atendente × Médico** | Quem agenda não lauda, e quem lauda não agenda nem cancela. | Separa funções como no dia a dia de uma clínica. | §3 |
| **Assinatura com CRM por UF** | Na publicação, grava nome e CRM do médico **na UF da clínica**. Sem CRM nessa UF, não publica. | O profissional responsável precisa ter registro no estado onde atua. | §4.5 |
| **Laudo exclusivo de quem iniciou** | "Iniciar laudo" torna o médico responsável. Outro médico recebe `409 REPORT_IN_PROGRESS`, com o nome de quem está laudando. | Evita dois médicos laudando o mesmo exame. | §4.6 |
| **Editor de texto rico com lista fechada** | Negrito, itálico, títulos, listas e alinhamento. O backend recusa qualquer outra formatação. | Laudos reais têm estrutura, e a lista fechada impede injeção de conteúdo. | §4.5 |
| **Trilha de auditoria** | Agendar, cancelar, criar, salvar, publicar e ler laudo geram um evento na mesma transação, e a tabela só aceita inclusão. | Rastreabilidade exigida no tratamento de dados de saúde (LGPD). | §4.11 |
| **Observabilidade** | Logs estruturados no Loki e 4 dashboards no Grafana: operação, saúde, linha do tempo do paciente e atividade por usuário. Os logs levam só IDs, sem dados pessoais. | Para operar e investigar incidentes, sem expor dados sensíveis nos logs. | §4.11 |
| **Health check e monitor UP/DOWN** | `/api/health` e `/api/health/ready`. Uma sonda externa vigia API, banco e PACS a cada 15 s. | Para saber quando o sistema está fora do ar. | §4.11 |
| **PACS de demonstração** | Orthanc com Stone Web Viewer. Cada agendamento ganha uma imagem de Raio-X, aberta por "Visualizar exame". | O médico lauda olhando a imagem. Esta é uma demonstração sem segurança. | §4.10 |
| **Exportação FHIR R4** | O laudo publicado sai como `Bundle` FHIR, para o sistema integrador, com token de serviço. | Padrão de interoperabilidade em saúde, usado pela RNDS. | §4.12 |
| **Segurança** | Cookie HttpOnly, `SameSite=Strict` e `Secure`; proteção CSRF por origem; limite de 10 tentativas de login por minuto; papéis do banco com privilégio mínimo; IDs não sequenciais (UUID v7). | Proteções mínimas para dados de saúde. | §7 |
| **Ambiente "de produção" local** | nginx em `clinica.localhost`, Swagger e subida com um comando, com migrations e seed automáticos. | Avaliação sem instalar Node ou Postgres. | §2 |
| **Consultas prontas ao banco** | `make db-*`, com papel somente leitura | Permite conferir o estado real dos dados durante a avaliação. | §9 |

---

## 2. Como executar

**Requisito:** Docker com Compose. Para rodar os testes também são necessários Node e pnpm (ver §5).

```bash
cp .env.example .env
docker compose up -d --build
```

A primeira subida leva alguns minutos. O compose sobe, nesta ordem:
1. Postgres.
2. `migrate`: aplica as migrations, carrega os dados fictícios e termina.
3. Backend.
4. nginx.

Junto sobem Loki, Grafana, a sonda `uptime` e o PACS (`orthanc` mais o `pacs-seed`, que gera as imagens e termina).

| URL | O quê |
|---|---|
| http://clinica.localhost | Aplicação |
| http://clinica.localhost/api/docs | Swagger (OpenAPI) |
| http://grafana.clinica.localhost | Grafana. Usuário `admin`, senha `admin-demo` (`GRAFANA_ADMIN_PASSWORD` do `.env`). |
| http://pacs.clinica.localhost | PACS (Orthanc Explorer). O Stone Web Viewer abre pelos links da aplicação. |

**Observações:**
- `*.localhost` resolve para `127.0.0.1` nos navegadores modernos. Não é preciso editar `/etc/hosts`.
- O Postgres fica em `127.0.0.1:5432`, só na máquina local, para inspeção.

| Comando | Para quê |
|---|---|
| `make help` | Lista todos os atalhos |
| `make reset` | Recomeça do zero: apaga banco, logs e Grafana e sobe de novo. Útil quando os dias com agendamentos do seed ficam no passado. |
| `make down` | Para o ambiente e mantém os dados |
| `make logs` | Acompanha os logs da API |
| `make fhir` | Exporta um laudo publicado em FHIR R4 (§4.12) |

> **Sobre o seed:** os agendamentos fictícios ocupam os **3 próximos dias úteis depois do dia da subida**, contados no fuso de cada clínica. Fins de semana e feriados nacionais são pulados, com a mesma regra da agenda: se a subida for na quarta, véspera de Natal, os dias serão quinta 24, segunda 28 e terça 29/12. Se avaliar depois desses dias, rode `make reset`.

---

## 3. Contas de demonstração

A senha de **todas** é **`Demo@2026`**. A tela de login lista as contas: clique em uma para preencher.

**Equipe**

| Perfil | Nome | E-mail | Clínicas · registro |
|---|---|---|---|
| Atendente | Paula Ribeiro | `paula@mail.com` | São Paulo (SP) |
| Atendente | Marcos Teixeira | `marcos@mail.com` | Belo Horizonte (MG) |
| Atendente | Iara Monteiro | `iara@mail.com` | Manaus (AM) |
| Atendente | Tiago Barros | `tiago@mail.com` | Rio Branco (AC) |
| Médica | Dra. Ana Souza | `ana@mail.com` | SP · CRM/SP |
| Médico | Dr. Bruno Lima | `bruno@mail.com` | Manaus · CRM/AM |
| Médico | Dr. Carlos Mendes | `carlos@mail.com` | SP e BH · CRM/SP, CRM/MG |
| Médica | Dra. Daniela Rocha | `daniela@mail.com` | todas · CRM/SP, MG, AM, AC |
| Médico | Dr. Eduardo Nunes | `eduardo@mail.com` | Manaus e Rio Branco · CRM/AM, CRM/AC |

**Pacientes**

| Nome | E-mail | Situação no seed |
|---|---|---|
| João Pereira | `joao@mail.com` | SP e Manaus · laudo publicado |
| Silvia Costa | `silvia@mail.com` | BH e Rio Branco · laudo publicado |
| Beatriz Lopes | `beatriz@mail.com` | Manaus · laudo publicado |
| Carla Duarte | `carla@mail.com` | BH · laudo publicado |
| Ricardo Freitas | `ricardo@mail.com` | Rio Branco · **laudo em rascunho** do Dr. Eduardo, invisível para ele |
| Maria Oliveira · Rafael Gomes | `maria@` · `rafael@mail.com` | SP |
| José Antônio Silva | `jose@mail.com` | Manaus |
| Fernando Reis | `fernando@mail.com` | BH |
| Juliana Martins | `juliana@mail.com` | Rio Branco |
| Lúcia Fernandes · Pedro Almeida | `lucia@` · `pedro@mail.com` | **sem agendamentos**, para testar do zero |

**Como o seed está montado:**
- Cada clínica tem 3 pacientes agendados.
- Nos 3 próximos dias úteis, cada um tem 2 exames por dia: 5 por clínica por dia, e o resto da agenda fica livre.
- Os CPFs são fictícios, mas têm dígitos verificadores válidos.

---

## 4. Roteiro de avaliação

Cada cenário indica a conta, os passos e o resultado esperado. Dica: para comparar perfis lado a lado, use uma janela anônima, porque a sessão fica num cookie.

### 4.1 Agendar um exame

**Conta:** Paula (atendente de SP).

1. Entre com `paula@mail.com`. Ela só tem uma clínica, então cai direto na lista de **Agendamentos**.
2. Clique em **Novo agendamento**.
3. Em **Paciente**, digite `lucia`, ou parte de um CPF (mínimo de 3 caracteres), e escolha **Lúcia Fernandes**.
4. Escolha o **Tipo de exame**, uma **Data** e um horário livre na grade. O calendário só oferece dias úteis futuros, e a grade mostra os horários livres no fuso da clínica.
5. Clique em **Agendar**.

**Esperado:** o agendamento aparece na lista com situação "Agendado". O horário some da grade para novos agendamentos.

### 4.2 Regras de agendamento

| Regra | Como provocar | Esperado |
|---|---|---|
| Dois agendamentos no mesmo horário (inclusive ao mesmo tempo) | Abra **Novo agendamento** em duas abas, escolha o mesmo dia e horário e clique em **Agendar** nas duas. | A primeira é aceita. A segunda mostra "Este horário já está ocupado nesta clínica." e a grade é recarregada. A versão concorrente de verdade, com 8 requisições em paralelo, é o teste obrigatório 1. |
| Agendar no passado | A tela não oferece datas passadas, então use a API. No Swagger (`/api/docs`), faça `POST /api/auth/login` como Paula e pegue os IDs em `GET /api/me/clinics`, `GET /api/patients?search=lucia` e `GET /api/exam-types`. Depois chame `POST /api/clinics/{clinicId}/appointments` com `startsAt` de ontem, por exemplo `2026-11-23T13:00:00Z`. | `422 IN_PAST` |
| Paciente em dois lugares ao mesmo tempo | Rode `make db-agendamentos PACIENTE=joao@mail.com` para ver o horário do João em **Manaus**. Como Paula (SP), agende o João no **mesmo instante**: o horário de SP é 1 h a mais no relógio. | "O paciente já tem um exame agendado neste horário (em alguma clínica)." (`409 PATIENT_BUSY`) |
| Fim de semana, feriado ou fora do expediente | Pela API, um sábado, 25/12 ou 19:00 locais | `422 WEEKEND`, `HOLIDAY` ou `OUTSIDE_BUSINESS_HOURS` |

### 4.3 Consultar e filtrar agendamentos

**Conta:** Paula ou qualquer médico.

1. Na lista, use o filtro **Data**: **Hoje**, as setas de **Dia anterior** e **Próximo dia**, ou **Todas as datas**.
2. Use o filtro **Paciente** (nome ou CPF). Os filtros se combinam.
3. **Limpar filtros** volta à lista completa.

**Esperado:** as colunas mostram data e hora no fuso da clínica, paciente (com CPF mascarado), exame, situação, laudo e imagem. O "dia" do filtro é o dia local da clínica.

### 4.4 Cancelar e reutilizar o horário

**Conta:** Paula.

1. Abra um agendamento **sem laudo** e clique em **Cancelar agendamento**, depois confirme.
2. A situação passa a "Cancelado", com a data do cancelamento. A tela avisa: "Agendamentos cancelados não recebem laudos."
3. Em **Novo agendamento**, escolha o mesmo dia: **o horário cancelado voltou à grade** e pode ser agendado de novo.
4. Abra um agendamento **com laudo**, por exemplo um passado do João com **Todas as datas**. O cancelamento está bloqueado: "Agendamentos com laudo não podem ser cancelados."

### 4.5 Laudar: do rascunho à publicação

**Conta:** Dra. Ana (SP).

1. Entre com `ana@mail.com` e abra um agendamento futuro de SP.
2. Opcional: clique em **Visualizar exame** para abrir a imagem no Stone Web Viewer (§4.10).
3. Clique em **Iniciar laudo**. A partir daí, você é a responsável pelo laudo deste exame.
4. O **Título** já vem com o tipo do exame, que é fixo. Preencha o **Complemento** (ex.: "Joelho direito").
5. Escreva o texto usando negrito, listas e títulos, e clique em **Salvar rascunho**.
6. Saia e volte à tela: o rascunho continua lá e pode ser editado.
7. Clique em **Publicar…** e confirme.

**Esperado:**
- O laudo fica somente leitura.
- Aparece a data e hora da publicação e a assinatura "Dra. Ana Souza · CRM/SP …".
- Não há mais como editar (pela API, `409 REPORT_PUBLISHED`).
- O agendamento deixa de poder ser cancelado.

**Variações:**
- **Descartar rascunho:** apaga o rascunho e libera o atendimento.
- **Publicar com texto vazio:** é recusado.

### 4.6 Rascunho restrito e um laudo por agendamento

Continue a partir de um rascunho da Dra. Ana, ou seja, do passo 5 do §4.5 antes de publicar.

| Quem | Passos | Esperado |
|---|---|---|
| Dr. Carlos (SP e BH) | Entre, escolha **São Paulo** e abra o mesmo agendamento. | Vê "Em elaboração por Dra. Ana Souza", sem o conteúdo e sem botão para iniciar outro laudo. |
| Paula (atendente) | Abra o mesmo agendamento. | Vê só a situação e o responsável. O cancelamento está bloqueado. |
| Paciente do agendamento | Abra **Meus agendamentos**. | "Laudo ainda não disponível". O conteúdo não é exposto, nem pela API (teste obrigatório 3). |

Com o seed, dá para ver o mesmo comportamento sem criar nada: o rascunho do **Ricardo** (Rio Branco) pertence ao **Dr. Eduardo**.
1. Entre com `eduardo@mail.com`, escolha **Rio Branco** e use **Todas as datas**.
2. Abra o exame do Ricardo, edite e publique.
3. Entre como `ricardo@mail.com`: agora aparece **Laudo disponível**.

### 4.7 Portal do paciente

**Conta:** João (`joao@mail.com`).

1. Entre: a página é **Meus agendamentos**, com os exames de **todas as clínicas** (SP e Manaus). Cada um mostra o horário no fuso da sua clínica.
2. Veja as colunas: exame, data e hora, clínica, situação e **Laudo disponível** ou **Laudo ainda não disponível**.
3. Clique em **Laudo disponível**. Abre o laudo com título, texto, assinatura (nome e CRM) e data de publicação.
4. Depois do §4.5, entre como o paciente daquele agendamento: o laudo publicado pela Dra. Ana aparece para ele, e só para ele (teste obrigatório 4).

### 4.8 Acesso negado direto na API

A interface não oferece links para dados de outro paciente. O teste é chamar a API diretamente.

1. Descubra o ID de um laudo da Beatriz:
   ```bash
   make db-laudos PACIENTE=beatriz@mail.com    # coluna medical_report_id
   ```
2. Entre como João e tente ler esse laudo:
   ```bash
   SESSION=$(curl -s -D - -o /dev/null -H 'Content-Type: application/json' \
     -d '{"email":"joao@mail.com","password":"Demo@2026"}' \
     http://clinica.localhost/api/auth/login | sed -n 's/^[Ss]et-[Cc]ookie: clinic_session=\([^;]*\).*/\1/p')

   curl -i -b "clinic_session=$SESSION" http://clinica.localhost/api/me/medical-reports/<id-do-laudo-da-beatriz>
   ```

**Esperado:** `403 REPORT_ACCESS_DENIED`, sem conteúdo (teste obrigatório 2). A tentativa é registrada no log como `access.denied`.

Outros testes do mesmo tipo:
- João chamando uma rota de equipe, como `GET /api/clinics/<id>/appointments`: `403`.
- Paula chamando a agenda de outra clínica: `403`.

### 4.9 Várias clínicas e fusos

1. Entre como **Dra. Daniela** (`daniela@mail.com`). Como ela atende as 4 clínicas, aparece **Escolha a clínica**.
2. Abra **Manaus**: os horários aparecem com a indicação "horário do Amazonas".
3. Troque para **Rio Branco** pelo menu: "horário do Acre".
4. Como **Paula**, confirme que só aparece a clínica de SP. Chamar outra clínica pela API devolve `403`.

### 4.10 Imagem do exame (PACS)

1. Em qualquer agendamento ativo, use a coluna **Imagem** ("Ver exame") na lista ou o botão **Visualizar exame** na tela do laudo.
2. O Stone Web Viewer abre em nova aba com uma radiografia de tórax identificada com o nome do paciente, a data e o tipo de exame do agendamento.

**Sobre a demonstração:**
- O PACS é efêmero e aberto, sem autenticação.
- Todos os exames usam a **mesma imagem**, inclusive ultrassonografia e ressonância.
- Agendamentos criados depois da subida ficam sem imagem até rodar `make pacs`.
- Detalhes em [docs/features/pacs.md](docs/features/pacs.md).

### 4.11 Auditoria e observabilidade

Em http://grafana.clinica.localhost (`admin` / `admin-demo`), pasta **Clínica**:

| Dashboard | O que mostra |
|---|---|
| **Clínica — Operação** | Agendamentos por dia, exames por tipo, ranking de médicos, cancelamentos, ocupação por dia e horário, tempo até a publicação. Tem filtro por clínica. |
| **Clínica — Saúde da API** | API, banco e PACS **UP/DOWN**, disponibilidade, latência, erros por rota, acessos negados e logins com falha |
| **Clínica — Linha do tempo do paciente** | A história de um paciente: agendado, laudo iniciado, publicado, visualizado… |
| **Clínica — Atividade por usuário** | O que cada usuário fez |

Para ver uma queda: rode `docker compose stop backend`, espere uns 30 s e veja **API DOWN** em "Saúde da API". Depois rode `docker compose start backend`. O mesmo vale para `postgres` (banco DOWN) e `orthanc` (PACS DOWN).

Sem Grafana, a auditoria também pode ser vista no terminal:
```bash
make db-historico PACIENTE=joao@mail.com   # trilha de auditoria do paciente
make db-auditoria LIMITE=20                # eventos mais recentes
```

### 4.12 Exportação FHIR

Um comando gera o token de serviço, escolhe o laudo e chama a API pelo nginx, como faria um sistema integrador:

```bash
make fhir                              # laudo publicado mais recente
make fhir PACIENTE=joao@mail.com       # o mais recente de um paciente (e-mail ou nome)
make fhir LAUDO=<medical_report_id>    # um laudo específico (IDs em: make db-laudos)
make -s fhir > laudo.json              # grava só o JSON
```

**Esperado:** um `Bundle` FHIR R4 (`application/fhir+json`) com `DiagnosticReport`, `Patient`, `Practitioner` e `Organization`.

A rota só aceita o token de serviço:
- uma sessão de usuário nessa rota recebe `401`;
- o token de serviço em qualquer outra rota também recebe `401`.

Com o ID de um rascunho, por exemplo o do Ricardo em `make db-laudos PACIENTE=ricardo@mail.com`, a resposta é `403 REPORT_NOT_PUBLISHED`.

Para chamar a API manualmente:
```bash
TOKEN=$(make -s service-token)
curl -H "Authorization: Bearer $TOKEN" http://clinica.localhost/api/fhir/medical-reports/<id>
```

---

## 5. Testes automatizados

Os testes rodam no host, contra o Postgres do compose (`127.0.0.1:5432`). Requerem **Node.js 26** (há `.nvmrc`) e **pnpm 12** (`npm i -g pnpm@12`; o Corepack não acompanha o Node 26).

```bash
docker compose up -d   # ou só: docker compose up -d postgres
pnpm install
pnpm test              # ou: make test
```

Os testes de integração usam o banco `clinic_test`, recriado a partir das migrations reais a cada execução. Eles conectam como `clinic_app`, o mesmo papel do backend.

**Cenários obrigatórios do enunciado:**

| # | Cenário | Teste |
|---|---|---|
| 1 | Tentativas simultâneas no mesmo horário: só uma é aceita | `test/scheduling.e2e-spec.ts`: 8 requisições paralelas, 1×201 e 7×409 |
| 2 | Paciente consultando laudo de outro: acesso negado | `test/medical-reports.e2e-spec.ts`: 403 |
| 3 | Paciente acessando rascunho: conteúdo não disponibilizado | `test/medical-reports.e2e-spec.ts`: 403 e nada vaza na listagem |
| 4 | Laudo publicado fica disponível ao paciente correto | `test/medical-reports.e2e-spec.ts` |
| 5 | Agendamento no passado é rejeitado | Unitário e `test/scheduling.e2e-spec.ts`: 422 `IN_PAST` |

**Além dos obrigatórios:**
- isolamento entre clínicas e papéis;
- expediente por fuso e feriados;
- concorrência ao iniciar o laudo;
- CRM por UF e lista fechada de formatação do laudo;
- limite de login;
- auditoria que só aceita inclusão;
- FHIR, health check e PACS;
- remoção de dados sensíveis dos logs.

A rastreabilidade entre regra e teste está em cada documento de [docs/features/](docs/features/).

---

## 6. Fuso horário

- O banco guarda instantes em **UTC** (`timestamptz`), e a API trafega ISO 8601 em UTC.
- **Cada clínica tem o seu fuso**: `America/Sao_Paulo`, `America/Manaus` ou `America/Rio_Branco`. Noronha foi descartado.
- Expediente (segunda a sexta, 08:00 às 19:00), feriados e o "dia" dos filtros são avaliados no **horário local da clínica**.
- A interface mostra todos os horários **no fuso da clínica**, com a indicação (ex.: "horário do Amazonas"), seja qual for o fuso do navegador. O paciente vê o horário real do exame no local.
- Premissa: o Brasil não tem horário de verão desde 2019.

---

## 7. Decisões técnicas

Detalhes e justificativas em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Multi-tenant:** banco compartilhado, com `clinic_id` nas tabelas operacionais. O `ClinicAccessGuard` confere o vínculo no banco a cada requisição.
- **Concorrência resolvida no banco:**
  - índices únicos parciais em `(clinic_id, starts_at)` e `(patient_id, starts_at)` para agendamentos ativos;
  - `SELECT … FOR UPDATE` para iniciar laudo e para cancelar;
  - publicação atômica.
- **Laudo:** o texto é guardado como JSON do Tiptap, validado por uma lista fechada de formatações. A assinatura é gravada na publicação, fora do texto editável.
- **Autorização sempre no backend**, *deny-by-default*. Os erros têm códigos estáveis (`SLOT_TAKEN`, `PATIENT_BUSY`, `REPORT_IN_PROGRESS`…) no formato `{ statusCode, code, message }`.
- **Auditoria** (`audit_event`) na mesma transação da operação. Os logs estruturados levam só IDs (LGPD).
- **Segurança:**
  - cookie HttpOnly, `Secure` e `SameSite=Strict`;
  - CSRF por origem;
  - limite de login;
  - papéis do Postgres com privilégio mínimo: `clinic_owner` para DDL, `clinic_app` para DML (só inclusão na auditoria) e `grafana_ro` só para leitura.

---

## 8. Limitações e pendências

- **Feriados:** só os nacionais, numa lista fixa de 2026 a 2028. Agendamentos vão até 31/12/2028.
- **Sessão sem estado:** o logout apaga o cookie, mas um token já emitido vale até expirar (1 h).
- **O 403 revela que o recurso existe:** foi uma decisão pedida, atenuada pelos IDs UUID v7 não sequenciais.
- **Rascunho sem controle de versão:** com duas abas do mesmo médico, vale a última gravação. Se um médico for desvinculado com rascunho aberto, o atendimento fica preso, porque não há tela de administração.
- **Cadastros** de clínicas, usuários e vínculos só pelo seed.
- **Isolamento entre clínicas** feito na aplicação. O Row Level Security do Postgres seria uma segunda camada.
- **O Grafana lê as tabelas operacionais**, que incluem dados pessoais. O ideal seria uma base analítica separada.
- **FHIR:**
  - segue o R4 base, não os perfis BR Core/RNDS;
  - o token de serviço não expira;
  - o Raio-X é exportado sem código LOINC.
- **PACS:** demonstração sem autenticação, com a mesma imagem para todos os exames.
- **Sem HTTPS local.** O banco fica exposto em `127.0.0.1:5432` para facilitar a avaliação. Em produção, basta remover `ports` do serviço `postgres`.

---

## 9. Banco de dados e consultas

**Como o banco é montado:**
- **Migrations:** SQL escrito à mão em `apps/backend/src/database/migrations/`, com UUID v7, índices únicos parciais, `CHECK`s e trigger de `updated_at`.
- **Seed** (container `migrate`): 4 clínicas, 21 contas, tipos de exame, feriados, agenda dos 3 próximos dias úteis, um cancelado, um rascunho e laudos publicados. Se o banco já tiver dados, não faz nada.

Consultas prontas com o papel **somente leitura**, via `psql` dentro do container ([`docker/queries/`](docker/queries/)):

```bash
make db-tudo                                    # visão geral
make db-agendamentos CLINICA=AM DATA=2026-11-25 # filtros: CLINICA (UF ou nome), PACIENTE, DATA, TODOS=1
make db-laudos PACIENTE=joao@mail.com           # laudos, assinatura e publicação (sem o texto clínico)
make db-historico PACIENTE=joao@mail.com        # a história do paciente na auditoria
make db-psql                                    # psql interativo (somente leitura)
```

**Cliente gráfico (DBeaver, pgAdmin…):** `127.0.0.1:5432`, banco `clinic`.

| Para | Usuário | Senha |
|---|---|---|
| Consultar (recomendado) | `grafana_ro` | `grafana-demo` |
| Mesmo acesso da API | `clinic_app` | `app-demo` |
| Dono do schema | `clinic_owner` | `owner-demo` |
| Administração | `postgres` | `postgres-demo` |

O banco guarda horários em UTC. Use `starts_at AT TIME ZONE 'America/Sao_Paulo'` (ou o fuso da clínica) para ver no horário local.

---

## 10. Uso direto da API

- **Swagger** em http://clinica.localhost/api/docs. Chame `POST /api/auth/login` pela própria página: o navegador grava o cookie e as chamadas seguintes saem autenticadas.
- **curl:** o cookie é `Secure`, e o curl não o reenvia por HTTP a partir do *cookie jar*. Envie-o explicitamente, como no §4.8.

---

## 11. Estrutura e documentação

```
apps/backend     NestJS (auth, clinics, patients, catalog, appointments, medical-reports, patient-portal, fhir, audit, pacs)
apps/frontend    React + Vite (rotas em src/routes, file-based)
docker/          nginx, Dockerfiles, init do Postgres, Loki, Grafana, consultas do Makefile, sonda uptime, PACS
Makefile         atalhos: subir, derrubar e consultar o banco (somente leitura)
docs/            plano, arquitetura, documentação por feature e registro do uso de IA
```

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, modelo de dados e decisões com alternativas descartadas |
| [docs/features/](docs/features/) | Uma página por feature: regras, máquina de estados, sequências e rastreabilidade com os testes |
| [docs/AI_LOG.md](docs/AI_LOG.md) | Como a IA foi usada: refinamento do plano, implementação e papel humano × IA |

---

## 12. Tempo dedicado

Aproximadamente **⟨preencher⟩ horas**: refinamento do plano e implementação com IA (veja [docs/AI_LOG.md](docs/AI_LOG.md)).
