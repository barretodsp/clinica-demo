# PACS de demonstração (Orthanc + Stone Web Viewer)

## Objetivo e escopo
Mostrar, de forma simples, a visualização de imagem integrada aos agendamentos: cada agendamento ativo tem um estudo num PACS Orthanc, aberto no **Stone Web Viewer** a partir da aplicação.

**Fora do escopo (decisão):**
- **Segurança:** sem autenticação no PACS, sem auditoria do acesso à imagem, sem isolamento por clínica.
- **Fluxo DICOM:** sem recepção real de modalidades (porta 4242) e sem worklist.

## Componentes
- **`orthanc`:**
  - imagem `orthancteam/orthanc:26.9.1`, com DICOMweb e Stone Web Viewer;
  - **sem volume** (efêmero) e sem porta publicada;
  - exposto pelo nginx em `http://pacs.clinica.localhost`, onde a raiz leva ao Orthanc Explorer 2;
  - o painel de "intended use" do Stone desligado e datas em `DD/MM/YYYY`.
- **`pacs-seed`:** one-shot com a imagem do backend (`dist/pacs/run-pacs-seed.js`), que roda a cada `docker compose up` depois do `migrate` e do Orthanc saudável.
  1. Lê os agendamentos `SCHEDULED` (papel `clinic_owner`).
  2. Envia o modelo [`docker/pacs/raio-x.dcm`](../../docker/pacs/raio-x.dcm) ao Orthanc e, para cada agendamento que ainda não está no PACS, chama `POST /instances/{modelo}/modify` (`Force: true`) e envia a cópia com `POST /instances`.
  3. Remove o modelo do Orthanc.
  4. Grava `appointment.image_viewer_url = http://pacs.clinica.localhost/stone-webviewer/index.html?study=<StudyInstanceUID>`, só se mudou, para não alterar o `updated_at` à toa.
- **Banco:** migration `1764100000000-appointment-image-url` adiciona `appointment.image_viewer_url text NULL`, com CHECK de `http(s)://`.
- **API:** o `StaffAppointmentDto` traz `imageViewerUrl`. Não há endpoint novo.
- **Frontend:**
  - coluna **Imagem** na lista de agendamentos, com o link "Ver exame";
  - botão **Visualizar exame** na tela do agendamento/laudo, para atendentes e médicos;
  - ambos abrem a URL armazenada em nova aba e, sem imagem, mostram "—" ou o botão desabilitado.

**Agendamento cancelado não tem imagem:** o cancelamento limpa `image_viewer_url`, a API devolve `imageViewerUrl: null` para qualquer cancelado (inclusive os cancelados antes dessa limpeza existir) e a tela do agendamento esconde o botão **Visualizar exame**; na lista aparece "—". Sem isso, o link de um cancelado quebraria quando o Orthanc efêmero fosse recriado, porque o `pacs-seed` só gera estudos para agendamentos ativos.

## Tags trocadas no modelo

| Tag | Valor |
|---|---|
| `PatientName` | nome do paciente como `Sobrenome^Nome` |
| `PatientID` | `patient.id` (UUID); **nunca o CPF** |
| `PatientBirthDate` | data de nascimento |
| `StudyInstanceUID` | `2.25.<UUID do agendamento como inteiro>`: determinístico, sobrevive à recriação do Orthanc |
| `SeriesInstanceUID`, `SOPInstanceUID` | `2.25.<128 bits do SHA-256 de "<id>:series"/"<id>:instance">` |
| `AccessionNumber`, `StudyID` | derivados do ID do agendamento |
| `StudyDate/Time`, `SeriesDate/Time`, `ContentDate/Time` | início do exame **no fuso da clínica** |
| `StudyDescription` | tipo de exame (a imagem é sempre o mesmo Raio-X) |
| `InstitutionName` | clínica |

## Imagem modelo
- **Origem:** *Chest Xray PA 3-8-2010.png*, de Stillwaterising ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chest_Xray_PA_3-8-2010.png)), **CC0**.
- **Conversão:** [`docker/pacs/build_raio_x_dcm.py`](../../docker/pacs/build_raio_x_dcm.py), que roda num container `python:3.13-slim` com pydicom.
- **Formato gerado:** CR, 1200×973, 8 bits, MONOCHROME2, Explicit VR Little Endian, `SpecificCharacterSet` UTF-8 (para os acentos).
- **Fontes descartadas:**
  - DICOM Library: não há radiografia entre os exemplos e os termos proíbem redistribuir;
  - NIH ChestX-ray no Google Cloud: bucket com cobrança por quem baixa, sem acesso anônimo.

## Rastreabilidade

| Regra | Teste |
|---|---|
| UIDs válidos (dígitos e pontos, sem zero à esquerda, ≤ 64), determinísticos e distintos | `pacs/dicom.spec.ts` |
| Nome DICOM, data/hora no fuso da clínica, sem CPF | `pacs/dicom.spec.ts` › tags |
| Um estudo por agendamento ativo, URL gravada, cancelados sem imagem, modelo removido | `pacs.e2e-spec.ts` (Orthanc falso) |
| Idempotência: reexecução não regera nem altera linhas | `pacs.e2e-spec.ts` |
| API devolve `imageViewerUrl` | `pacs.e2e-spec.ts` |
| Cancelado sem imagem: cancelar limpa a URL; a API devolve `null` mesmo para cancelado antigo com URL no banco; o `pacs-seed` não gera estudo para ele | `pacs.e2e-spec.ts` › cancelado não tem imagem |
| Fluxo no navegador: lista → tela de laudo → Stone exibe o Raio-X com os dados do paciente | verificado com Playwright contra o compose |
| Disponibilidade no dashboard Saúde da API (PACS UP/DOWN, estudos no PACS, % no período, latência, histórico) | verificado manualmente: `docker compose stop orthanc` → PACS DOWN; volta a UP ao religar |
| Efêmero: Orthanc recriado vazio → `docker compose up -d` repovoa com as mesmas URLs | verificado manualmente (71 estudos) |

## Limitações (assumidas)
- **PACS aberto:** qualquer pessoa com acesso a `pacs.clinica.localhost` vê e pode alterar todos os estudos, inclusive pelo Orthanc Explorer. Os dados são fictícios e o uso é local.
- **Mesma imagem para todos os exames:** inclusive ultrassom e ressonância, com `Modality` continuando `CR`.
- **Agendamentos criados depois da subida:** ficam sem imagem até rodar `make pacs`.
- **Espera pela subida do Orthanc não é um teto rígido:** o `pacs-seed` confere o prazo `PACS_READY_TIMEOUT_MS` só entre as tentativas, e cada tentativa pode durar até `PACS_REQUEST_TIMEOUT_MS`. Se o Orthanc aceita a conexão mas não responde, a espera real chega a ready + request + 1 s (com os padrões, ~151 s no pior caso em vez de 120 s). Com o Orthanc ainda fora do ar (conexão recusada), as tentativas falham na hora e o prazo é respeitado. Mantenha o request timeout bem menor que o de subida.
- **Só pelo caminho padrão:** o `pacs-seed` é um fluxo de demonstração e deve rodar sempre pelo `docker compose up` ou pelo `make pacs`. Nesse caminho, o compose passa todas as variáveis `PACS_*` no `environment:` do serviço. Rodar `run-pacs-seed.js` à mão no host não é suportado: o `.env` só é lido quando `DATABASE_MIGRATION_URL` não está no shell, então as `PACS_*` do `.env` podem ser ignoradas em silêncio e valer os padrões.
- **Marcador gravado nos pixels:** a imagem original traz "L" e as iniciais "ETB" (não identificam paciente).
