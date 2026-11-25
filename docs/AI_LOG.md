# Registro do uso de IA (vibe coding)

O desafio pede *vibe coding*. Este projeto foi construído em par com um assistente de IA (Claude, via Claude Code), em três fases:
- **Refinamento do plano:** decisões humanas.
- **Implementação:** código gerado pela IA, revisado e verificado com testes.
- **Revisão de código e correções:** achados da revisão automatizada, com a decisão de cada correção tomada pelo autor.

## 1. Refinamento do plano

O PDF do desafio foi entregue ao assistente com o pedido: *"Vamos, primeiramente, criar e refinar um plano com todos os requisitos necessários. Só depois de tudo refinado, vamos implementar."*

O plano evoluiu em várias rodadas. Cada decisão abaixo foi tomada pelo autor, a partir de opções e trade-offs apresentados pela IA.

| Rodada | Decisões |
|---|---|
| Stack | Node 26 LTS, pnpm, NestJS (com as skills oficiais do NestJS instaladas no assistente), TypeORM, PostgreSQL e Docker Compose; TanStack Router + Query; Mantine |
| Agenda | Expediente de segunda a sexta, das 08:00 às 19:00; feriados nacionais numa lista estática de 2026 a 2028, com Carnaval e Corpus Christi bloqueados; agendamentos até 31/12/2028 |
| Regras | Cancelamento bloqueado com qualquer laudo; 403 para acesso indevido; pacientes cadastrados só pelo seed; busca por nome ou CPF |
| Fuso | Fuso por clínica: Brasília, Amazonas e Acre. Noronha foi descartado. |
| Multi-tenant | 4 clínicas; atendente em 1 clínica, médico em N, paciente global |
| Papéis | "Equipe da clínica" dividida em Atendente e Médico |
| Dados | `created_at` e `updated_at` em todas as tabelas, exceto a auditoria; registros profissionais (CRM) em tabela própria; CRM na UF da clínica para publicar |
| Dados de demonstração | 21 contas com e-mails simples (`joao@mail.com`) e credenciais na tela de login: 4 atendentes, uma por clínica; 5 médicos, 2 deles em uma clínica só; 12 pacientes com CPFs fictícios válidos. 2 pacientes atendidos em duas clínicas e 2 sem agendamentos. Nos 3 próximos dias úteis, 2 agendamentos por paciente por dia, com o restante da agenda livre para testes. |
| Laudo | Título com o tipo do exame; texto livre; assinatura no rodapé; editor Tiptap, escolhido depois de comparar com o CKEditor; o rascunho é a trava do atendimento; sem controle de versão |
| Segurança | JWT de 1 h em cookie HttpOnly; redirecionar no 401, não no 403; nginx com domínio fictício; 10 tentativas de login por minuto |
| Acesso ao banco | Papéis do Postgres com privilégio mínimo. A porta é publicada só em `127.0.0.1`, para inspeção durante a avaliação, e há consultas prontas no `Makefile` com o papel somente leitura. |
| Observabilidade | Grafana + Loki; trilha de auditoria; 10 visualizações; Grafana com leitura direta das tabelas |
| Disponibilidade | Health check com liveness e readiness (ping no banco); sonda externa que grava UP/DOWN no Loki; painéis de API, banco e PACS no dashboard Saúde da API |
| PACS de demonstração | Orthanc efêmero com Stone Web Viewer. Um estudo é gerado por agendamento na subida, a partir de um único Raio-X. Os links ficam na lista de agendamentos e na tela de laudo. Escopo simplificado: sem autenticação nem auditoria do acesso. |
| Imagem do PACS | Radiografia de tórax CC0 do Wikimedia Commons, convertida para DICOM. Fontes descartadas: a DICOM Library, porque os termos proíbem redistribuir, e o NIH ChestX-ray, porque o bucket cobra de quem baixa. |
| Bônus | Exportação FHIR R4 exclusiva de um serviço de integração, com token fixo |

A documentação final está no [README](../README.md), em [ARCHITECTURE.md](ARCHITECTURE.md) e em [features/](features/).

## 2. Implementação

Pedido: *"implemente o plano"*. O que o assistente fez:

1. **Consultou as fontes antes de escrever código.** Leu as skills oficiais do NestJS e os tipos dos pacotes instalados (`@nestjs/authentication`, `@nestjs/authorization`, Mantine 9, Tiptap 3, Orthanc e pydicom), em vez de confiar na memória: as versões eram mais novas que o seu treinamento.
2. **Implementou na ordem do plano:**
   1. monorepo e Postgres com papéis;
   2. schema, migrations e seed;
   3. autenticação e políticas;
   4. agendamentos;
   5. laudos;
   6. portal do paciente;
   7. observabilidade;
   8. frontend;
   9. Docker e nginx;
   10. FHIR;
   11. health check e sonda de disponibilidade;
   12. PACS;
   13. documentação.
3. **Verificou cada etapa:**
   - `curl` contra a API real a cada módulo;
   - 97 testes automatizados ao fim da implementação (187 depois da revisão, §3), entre unitários e de integração com Postgres real, incluindo concorrência e o seed em datas de feriado e fim de semana;
   - roteiro de ponta a ponta em navegador headless (Chromium), com capturas de tela;
   - subida do ambiente do zero (`docker compose up --build`) e consultas reais pelo Grafana;
   - quedas simuladas de backend, banco e Orthanc, conferidas nos painéis UP/DOWN;
   - o Orthanc recriado vazio e repovoado, com as URLs gravadas continuando válidas.

## 3. Revisão de código e correções

Com a implementação pronta, o código passou por rodadas de revisão com o comando `/code-review` do Claude Code: primeiro só os commits de documentação, depois a branch `main` inteira (25 commits) e, em seguida, cada leva de correções. Cada achado foi explicado em detalhe a pedido do autor, que decidiu entre corrigir, só documentar ou deixar para depois. As correções vieram com testes que falham no código anterior, o que foi conferido em cada caso.

| Achado da revisão | Decisão do autor | O que foi feito |
|---|---|---|
| Laudo entre ~95 e 100 KB devolvia 500: a aplicação media o JSON compacto e o `CHECK` do banco mede o texto do jsonb, que tem espaços | Corrigir | O tamanho passou a ser medido como o banco mede. Os testes de paridade com o Postgres revelaram outro 500 (caractere `\u0000`, recusado pelo jsonb), também corrigido para 422. |
| Erro de banco no log levava a query e os parâmetros (conteúdo do laudo e dados pessoais) | Corrigir, registrando **só** o SQLSTATE e a constraint | Sem mensagem (o Postgres às vezes inclui o valor recebido nela) e sem `name` (a redação de `*.name` o apagaria de qualquer forma) |
| A lista de agendamentos deixava de mostrar os novos depois de 500 | Limite de **50**, sem paginação, com os atendimentos de **hoje no topo** quando não há filtro de data | Ordem: hoje e futuros em ordem de horário, depois os anteriores do mais recente ao mais antigo |
| — (pedido do autor) | Tornar configuráveis por variável de ambiente as constantes que fizerem sentido | A IA separou ajuste operacional (limites e timeouts, que foram para o env com padrão) de regra de domínio e de valores acoplados ao banco, ao frontend ou ao nginx, que ficaram fixos |
| Revisão do item anterior: timeout do health check podia passar do tempo da sonda; limite da busca de pacientes podia subir para 100; testes dependiam do `.env` local; timeouts do pacs-seed | Teto de 4,5 s no health check; busca de pacientes **limitada a 20**, com valor maior exigindo revisão de privacidade; suíte fixada nos padrões; pacs-seed **só documentado** (fluxo de demonstração) | — |
| Texto digitado durante um salvamento podia se perder na publicação do laudo | A IA propôs gravar e publicar numa só requisição no backend; o autor propôs **liberar o Publicar só depois de salvar**, e essa foi a solução adotada | "Salvo" passou a ser controlado pelo número da edição. O teste no navegador, com latência simulada, revelou um problema antigo (o editor marcava o rascunho como alterado ao abrir), também corrigido. O caso de duas abas do mesmo médico foi julgado improvável pelo autor e ficou como limitação documentada. |
| Agendamento cancelado mantinha o link "Ver exame", que quebraria com o PACS recriado | Corrigir, escondendo o botão | O cancelamento limpa a URL, a API devolve `null` para qualquer cancelado e a tela esconde o botão |
| README: instruções de testes e acesso ao Grafana | Detalhar | Passo a passo dos testes (só o Postgres é necessário) e tabela dos dashboards com links diretos e como obter os IDs pedidos nos filtros |

Achados menores que não foram corrigidos ficaram para decisão posterior.

## 4. Papel humano × IA

- **Humano:**
  - escopo, refinamento das regras de negócio e trade-offs de segurança e de produto;
  - **enriquecimento dos requisitos do desafio** com o planejamento de integrações e recursos que aproximam o projeto da realidade de uma rede de clínicas:
    - integração com **PACS** (Orthanc + Stone Web Viewer) para visualizar o exame junto do agendamento e do laudo;
    - exportação de laudos em **FHIR R4** para sistemas integradores;
    - **dashboards do Grafana** para operação, saúde da API, linha do tempo do paciente e atividade por usuário;
    - **monitoramento de disponibilidade**, com painéis UP/DOWN de API, banco e PACS;
    - rede **multi-clínica** com fusos diferentes, divisão da equipe em atendente e médico, e assinatura com CRM por UF;
    - trilha de **auditoria** e dados de demonstração pensados para a avaliação;
  - aprovação de cada rodada do plano e revisão final;
  - na revisão, a decisão sobre cada achado e soluções próprias, como liberar a publicação só depois de salvar e limitar a busca de pacientes por privacidade.
- **IA:** propostas com alternativas e custos, código, testes, infraestrutura, documentação, revisão de código e verificação.

O código foi revisado pela suíte de testes e pelos roteiros de verificação descritos acima. Ainda assim, recomenda-se revisão humana linha a linha antes de uso real.
