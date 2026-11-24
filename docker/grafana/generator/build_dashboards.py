"""Gera os dashboards provisionados do Grafana (JSON) a partir de consultas legíveis.
Uso: python3 docker/grafana/generator/build_dashboards.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'dashboards')
PG = {'type': 'grafana-postgresql-datasource', 'uid': 'clinicdb'}
LOKI = {'type': 'loki', 'uid': 'loki'}
CLINIC_FILTER = "a.clinic_id::text IN (${clinic:sqlstring})"

_id = [0]


def nid():
    _id[0] += 1
    return _id[0]


def sql_target(sql, fmt='table', ref='A'):
    return {'datasource': PG, 'refId': ref, 'rawQuery': True, 'editorMode': 'code', 'format': fmt, 'rawSql': sql.strip()}


def loki_target(expr, ref='A', legend=None, qtype='range'):
    t = {'datasource': LOKI, 'refId': ref, 'expr': expr.strip(), 'queryType': qtype, 'editorMode': 'code'}
    if legend:
        t['legendFormat'] = legend
    return t


def panel(ptype, title, targets, x, y, w, h, description='', options=None, field=None, transformations=None, ds=PG):
    return {
        'id': nid(), 'type': ptype, 'title': title, 'description': description, 'datasource': ds,
        'gridPos': {'x': x, 'y': y, 'w': w, 'h': h}, 'targets': targets,
        'options': options or {}, 'fieldConfig': {'defaults': field or {}, 'overrides': []},
        'transformations': transformations or [],
    }


CLINIC_VAR = {
    'name': 'clinic', 'label': 'Clínica', 'type': 'query', 'datasource': PG,
    'query': 'SELECT name AS __text, id::text AS __value FROM clinic ORDER BY name',
    'definition': 'SELECT name AS __text, id::text AS __value FROM clinic ORDER BY name',
    'multi': True, 'includeAll': True, 'current': {'selected': True, 'text': ['All'], 'value': ['$__all']},
    'refresh': 1,
}


def textbox(name, label):
    return {'name': name, 'label': label, 'type': 'textbox', 'query': '', 'current': {'text': '', 'value': ''}}


def dashboard(uid, title, panels, variables, time_from='now-30d', time_to='now+30d', description='', refresh=''):
    return {
        'uid': uid, 'title': title, 'description': description, 'tags': ['clinica'], 'timezone': 'America/Sao_Paulo',
        'editable': False, 'schemaVersion': 41, 'version': 1, 'refresh': refresh,
        'time': {'from': time_from, 'to': time_to},
        'templating': {'list': variables}, 'panels': panels,
    }


def stat(title, sql, x, unit='none', description=''):
    return panel('stat', title, [sql_target(sql)], x, 0, 6, 4, description,
                 options={'reduceOptions': {'calcs': ['lastNotNull'], 'values': False}, 'colorMode': 'value', 'graphMode': 'none'},
                 field={'unit': unit, 'color': {'mode': 'fixed', 'fixedColor': 'teal'}})


# ---------------------------------------------------------------- Operação
_id[0] = 0
op = [
    stat('Agendamentos criados', f"""
SELECT count(*) AS value FROM appointment a
WHERE $__timeFilter(a.created_at) AND {CLINIC_FILTER}""", 0, description='Por data de criação (created_at).'),
    stat('Exames no período', f"""
SELECT count(*) AS value FROM appointment a
WHERE a.status = 'SCHEDULED' AND $__timeFilter(a.starts_at) AND {CLINIC_FILTER}""", 6, description='Exames ativos com data (starts_at) no período.'),
    stat('Laudos publicados', f"""
SELECT count(*) AS value FROM medical_report r JOIN appointment a ON a.id = r.appointment_id
WHERE r.status = 'PUBLISHED' AND $__timeFilter(r.published_at) AND {CLINIC_FILTER}""", 12, description='Por data de publicação.'),
    stat('Taxa de cancelamento', f"""
SELECT CASE WHEN count(*) = 0 THEN 0 ELSE 100.0 * count(*) FILTER (WHERE a.status = 'CANCELLED') / count(*) END AS value
FROM appointment a WHERE $__timeFilter(a.starts_at) AND {CLINIC_FILTER}""", 18, unit='percent',
         description='Cancelados ÷ total, entre os exames com data no período.'),
    panel('timeseries', 'Agendamentos criados por dia (por clínica)', [sql_target(f"""
SELECT (date_trunc('day', a.created_at AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS time,
       c.name AS metric, count(*) AS value
FROM appointment a JOIN clinic c ON c.id = a.clinic_id
WHERE $__timeFilter(a.created_at) AND {CLINIC_FILTER}
GROUP BY 1, 2 ORDER BY 1""", 'time_series')], 0, 4, 12, 8, 'Dia no fuso de cada clínica.',
          options={'legend': {'displayMode': 'list', 'placement': 'bottom'}},
          field={'custom': {'drawStyle': 'bars', 'fillOpacity': 60, 'stacking': {'mode': 'normal'}}}),
    panel('timeseries', 'Cancelamentos por dia (por clínica)', [sql_target(f"""
SELECT (date_trunc('day', a.cancelled_at AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS time,
       c.name AS metric, count(*) AS value
FROM appointment a JOIN clinic c ON c.id = a.clinic_id
WHERE a.status = 'CANCELLED' AND $__timeFilter(a.cancelled_at) AND {CLINIC_FILTER}
GROUP BY 1, 2 ORDER BY 1""", 'time_series')], 12, 4, 12, 8, 'Por data do cancelamento (cancelled_at).',
          options={'legend': {'displayMode': 'list', 'placement': 'bottom'}},
          field={'custom': {'drawStyle': 'bars', 'fillOpacity': 60, 'stacking': {'mode': 'normal'}}, 'color': {'mode': 'palette-classic'}}),
    panel('barchart', 'Exames agendados por tipo (empilhado por clínica)', [sql_target(f"""
SELECT e.name AS tipo, c.name AS clinica, count(*)::int AS total
FROM appointment a JOIN exam_type e ON e.id = a.exam_type_id JOIN clinic c ON c.id = a.clinic_id
WHERE a.status = 'SCHEDULED' AND $__timeFilter(a.starts_at) AND {CLINIC_FILTER}
GROUP BY 1, 2 ORDER BY 1, 2""")], 0, 12, 12, 9, 'Por data do exame (starts_at).',
          options={'stacking': 'normal', 'legend': {'displayMode': 'list', 'placement': 'bottom'}, 'xTickLabelRotation': 0},
          transformations=[{'id': 'groupingToMatrix', 'options': {'columnField': 'clinica', 'rowField': 'tipo', 'valueField': 'total', 'emptyValue': 'zero'}}]),
    panel('bargauge', 'Médicos com mais laudos publicados', [sql_target(f"""
SELECT u.name AS medico, count(*) AS laudos
FROM medical_report r
JOIN appointment a ON a.id = r.appointment_id
JOIN doctor d ON d.id = r.doctor_id
JOIN "user" u ON u.id = d.user_id
WHERE r.status = 'PUBLISHED' AND $__timeFilter(r.published_at) AND {CLINIC_FILTER}
GROUP BY u.name ORDER BY laudos DESC LIMIT 10""")], 12, 12, 12, 9, 'Somente laudos publicados, por data de publicação.',
          options={'orientation': 'horizontal', 'displayMode': 'gradient', 'reduceOptions': {'values': True, 'calcs': [], 'fields': ''}, 'showUnfilled': True},
          field={'color': {'mode': 'continuous-GrYlRd'}}),
    panel('table', 'Ocupação da agenda (agendamentos ativos por dia da semana × horário local)', [sql_target(f"""
SELECT to_char(a.starts_at AT TIME ZONE c.timezone, 'HH24:MI') AS "Horário",
  count(*) FILTER (WHERE extract(isodow FROM a.starts_at AT TIME ZONE c.timezone) = 1) AS "Seg",
  count(*) FILTER (WHERE extract(isodow FROM a.starts_at AT TIME ZONE c.timezone) = 2) AS "Ter",
  count(*) FILTER (WHERE extract(isodow FROM a.starts_at AT TIME ZONE c.timezone) = 3) AS "Qua",
  count(*) FILTER (WHERE extract(isodow FROM a.starts_at AT TIME ZONE c.timezone) = 4) AS "Qui",
  count(*) FILTER (WHERE extract(isodow FROM a.starts_at AT TIME ZONE c.timezone) = 5) AS "Sex"
FROM appointment a JOIN clinic c ON c.id = a.clinic_id
WHERE a.status = 'SCHEDULED' AND $__timeFilter(a.starts_at) AND {CLINIC_FILTER}
GROUP BY 1 ORDER BY 1""")], 0, 21, 12, 11, 'Mapa de calor: horários de pico e ociosos (cor = volume).',
          options={'cellHeight': 'sm', 'showHeader': True},
          field={'custom': {'cellOptions': {'type': 'color-background', 'mode': 'gradient'}, 'align': 'center'},
                 'color': {'mode': 'continuous-GrYlRd'}}),
    panel('barchart', 'Tempo até a publicação do laudo (horas, média e p90)', [sql_target(f"""
SELECT u.name AS medico,
  round(avg(extract(epoch FROM r.published_at - a.starts_at) / 3600)::numeric, 1) AS "Média (h)",
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM r.published_at - a.starts_at) / 3600)::numeric, 1) AS "P90 (h)"
FROM medical_report r
JOIN appointment a ON a.id = r.appointment_id
JOIN doctor d ON d.id = r.doctor_id JOIN "user" u ON u.id = d.user_id
WHERE r.status = 'PUBLISHED' AND $__timeFilter(r.published_at) AND {CLINIC_FILTER}
GROUP BY u.name ORDER BY 2 DESC""")], 12, 21, 12, 11, 'published_at − starts_at, por médico.',
          options={'legend': {'displayMode': 'list', 'placement': 'bottom'}}),
]

# ---------------------------------------------------------------- Saúde da API (Loki)
# Disponibilidade: a sonda docker/uptime grava {app="uptime"} a cada 15 s — target clinic-api (up, apiUp, dbUp, latencyMs)
# e target pacs (up, studies, latencyMs).
UPTIME = '{app="uptime", target="clinic-api"} | json'
PACS = '{app="uptime", target="pacs"} | json'
UP_DOWN = {'type': 'value', 'options': {
    '1': {'text': 'UP', 'color': 'green', 'index': 0},
    '0': {'text': 'DOWN', 'color': 'red', 'index': 1},
    '-1': {'text': 'DESCONHECIDO', 'color': 'text', 'index': 2},
}}
STAT_OPTS = {'reduceOptions': {'calcs': ['lastNotNull'], 'values': False}, 'colorMode': 'background',
             'graphMode': 'none', 'textMode': 'value', 'justifyMode': 'center'}


def uptime_stat(title, selector, field, x, y, description):
    # janela de 1 min: sem sondagem recente (sonda/Loki fora) aparece "SEM DADOS", não um UP antigo
    return panel('stat', title, [loki_target(f'last_over_time({selector} | unwrap {field} [1m]) by (target)', qtype='instant')],
                 x, y, 6, 5, description, ds=LOKI, options=STAT_OPTS,
                 field={'mappings': [UP_DOWN], 'noValue': 'SEM DADOS', 'color': {'mode': 'thresholds'},
                        'thresholds': {'mode': 'absolute', 'steps': [{'color': 'text', 'value': None}]}})


def availability_stat(title, selector, x, y, description):
    return panel('stat', title, [loki_target(f'avg_over_time({selector} | unwrap up [$__range]) by (target)', qtype='instant')],
                 x, y, 6, 5, description, ds=LOKI, options=STAT_OPTS,
                 field={'unit': 'percentunit', 'decimals': 2, 'min': 0, 'max': 1, 'noValue': 'SEM DADOS', 'color': {'mode': 'thresholds'},
                        'thresholds': {'mode': 'absolute', 'steps': [{'color': 'red', 'value': None}, {'color': 'orange', 'value': 0.95},
                                                                     {'color': 'green', 'value': 0.99}]}})


def latency_stat(title, selector, x, y, description):
    return panel('stat', title, [loki_target(f'last_over_time({selector} | unwrap latencyMs [1m]) by (target)', qtype='instant')],
                 x, y, 6, 5, description, ds=LOKI, options={**STAT_OPTS, 'colorMode': 'value'},
                 field={'unit': 'ms', 'noValue': 'SEM DADOS', 'color': {'mode': 'thresholds'},
                        'thresholds': {'mode': 'absolute', 'steps': [{'color': 'green', 'value': None}, {'color': 'orange', 'value': 500},
                                                                     {'color': 'red', 'value': 2000}]}})


_id[0] = 0
availability = [
    # linha 1: estado atual
    uptime_stat('API (backend)', UPTIME, 'apiUp', 0, 0,
                'UP se a API respondeu à última sondagem de GET /api/health/ready (últimos 60 s). '
                'DOWN: sem resposta (container parado, travado ou timeout de 5 s).'),
    uptime_stat('Banco de dados (visto pela API)', UPTIME, 'dbUp', 6, 0,
                'UP se a API conseguiu pingar o Postgres (SELECT 1, timeout 2 s). DESCONHECIDO quando a própria API não responde.'),
    uptime_stat('PACS (Orthanc)', PACS, 'up', 12, 0,
                'UP se o Orthanc respondeu à última sondagem de GET /statistics (últimos 60 s).'),
    panel('stat', 'Estudos no PACS', [loki_target(f'last_over_time({PACS} | unwrap studies [1m]) by (target)', qtype='instant')],
          18, 0, 6, 5, 'Quantidade de estudos no Orthanc (efêmero). 0 com o PACS no ar = o pacs-seed não rodou desde a última recriação '
          '(docker compose up -d ou make pacs).', ds=LOKI, options={**STAT_OPTS, 'colorMode': 'value'},
          field={'noValue': 'SEM DADOS', 'color': {'mode': 'thresholds'},
                 'thresholds': {'mode': 'absolute', 'steps': [{'color': 'orange', 'value': None}, {'color': 'green', 'value': 1}]}}),
    # linha 2: período e latência
    availability_stat('Disponibilidade da API no período', UPTIME, 0, 5,
                      'Fração das sondagens com API e banco OK (HTTP 200) no período selecionado.'),
    availability_stat('Disponibilidade do PACS no período', PACS, 6, 5,
                      'Fração das sondagens com o Orthanc respondendo (HTTP 200) no período selecionado.'),
    latency_stat('Tempo de resposta — API', UPTIME, 12, 5, 'Latência da última chamada a /api/health/ready (inclui o ping no banco).'),
    latency_stat('Tempo de resposta — PACS', PACS, 18, 5, 'Latência da última chamada a /statistics do Orthanc.'),
    panel('state-timeline', 'Histórico UP/DOWN', [
        loki_target(f'min_over_time({UPTIME} | unwrap apiUp [$__auto]) by (target)', ref='A', legend='API'),
        loki_target(f'min_over_time({UPTIME} | unwrap dbUp [$__auto]) by (target)', ref='B', legend='Banco de dados'),
        loki_target(f'min_over_time({PACS} | unwrap up [$__auto]) by (target)', ref='C', legend='PACS (Orthanc)'),
    ], 0, 10, 24, 8, 'Pior estado em cada intervalo (uma queda curta não some na agregação). Faixa vazia = sem sondagem.',
        ds=LOKI, options={'showValue': 'never', 'mergeValues': True, 'rowHeight': 0.8, 'legend': {'showLegend': False}},
        # só mappings: um threshold fixo aqui sobrescreveria as cores do UP/DOWN na timeline
        field={'mappings': [UP_DOWN]}),
]
# passo mínimo ≥ intervalo da sonda (15 s): cada janela tem ao menos uma amostra e a faixa fica contínua
availability[-1]['interval'] = '30s'
_OFFSET = 18

health = availability + [p for p in [
    panel('timeseries', 'Respostas por status HTTP', [loki_target(
        'sum by (statusCode) (count_over_time({app="clinic-api"} | json | event="http.request" [$__auto]))', legend='{{statusCode}}')],
        0, 0, 12, 9, 'Inclui 401/403/409/422/429/5xx.', ds=LOKI,
        field={'custom': {'drawStyle': 'bars', 'fillOpacity': 70, 'stacking': {'mode': 'normal'}}}),
    panel('timeseries', 'Erros por rota (4xx/5xx)', [loki_target(
        'sum by (route, statusCode) (count_over_time({app="clinic-api"} | json | event="http.request" | statusCode >= 400 [$__auto]))',
        legend='{{statusCode}} {{route}}')], 12, 0, 12, 9, ds=LOKI,
        field={'custom': {'drawStyle': 'bars', 'fillOpacity': 70, 'stacking': {'mode': 'normal'}}}),
    panel('timeseries', 'Acessos negados (403) e logins com falha', [loki_target(
        'sum by (event) (count_over_time({app="clinic-api"} | json | event=~"access.denied|auth.login_failed" [$__auto]))',
        legend='{{event}}')], 0, 9, 12, 8, ds=LOKI),
    panel('table', 'Acessos negados e logins com falha — detalhe (usuário, motivo)', [loki_target(
        'sum by (event, actorId, actorRole, code, route, ip) (count_over_time({app="clinic-api"} | json | event=~"access.denied|auth.login_failed" [$__range]))',
        qtype='instant')], 12, 9, 12, 8, ds=LOKI),
    panel('timeseries', 'Latência p95 por rota (ms)', [loki_target(
        'quantile_over_time(0.95, {app="clinic-api"} | json | event="http.request" | unwrap responseTimeMs [$__auto]) by (route)',
        legend='{{route}}')], 0, 17, 24, 9, ds=LOKI, field={'unit': 'ms'}),
]]
for p in health[len(availability):]:
    p['gridPos']['y'] += _OFFSET

# ---------------------------------------------------------------- Linha do tempo do paciente
_id[0] = 0
timeline = [
    panel('table', 'Histórico do paciente (trilha de auditoria — fonte confiável)', [sql_target("""
SELECT e.created_at AS "Quando", e.event AS "Evento", e.actor_type AS "Ator", e.actor_role AS "Papel",
       e.actor_id AS "ID do ator", c.name AS "Clínica", e.appointment_id AS "Agendamento",
       e.medical_report_id AS "Laudo", e.request_id AS "Request ID"
FROM audit_event e LEFT JOIN clinic c ON c.id = e.clinic_id
WHERE e.patient_id::text = ${patientId:sqlstring} AND $__timeFilter(e.created_at)
ORDER BY e.created_at""")], 0, 0, 24, 12,
          'Informe o ID do paciente (patient.id). Agendado, rascunho criado/salvo/descartado, publicado, visualizado, exportado, cancelado.'),
    panel('logs', 'Logs do paciente (Loki — inclui ações da equipe sobre ele)', [loki_target(
        '{app="clinic-api"} |= `$patientId` | json | patientId = `$patientId` and event != ""')], 0, 12, 24, 12, ds=LOKI,
          options={'showTime': True, 'wrapLogMessage': True, 'sortOrder': 'Ascending', 'enableLogDetails': True}),
]

# ---------------------------------------------------------------- Atividade por usuário
_id[0] = 0
activity = [
    panel('table', 'Ações do usuário (auditoria)', [sql_target("""
SELECT e.created_at AS "Quando", e.event AS "Evento", e.actor_role AS "Papel", c.name AS "Clínica",
       e.patient_id AS "Paciente", e.appointment_id AS "Agendamento", e.medical_report_id AS "Laudo", e.request_id AS "Request ID"
FROM audit_event e LEFT JOIN clinic c ON c.id = e.clinic_id
WHERE e.actor_id = ${userId:sqlstring} AND $__timeFilter(e.created_at)
ORDER BY e.created_at DESC""")], 0, 0, 24, 10, 'Informe o ID do usuário (user.id).'),
    panel('timeseries', 'Volume de ações por evento', [loki_target(
        'sum by (event) (count_over_time({app="clinic-api"} |= `$userId` | json | actorId = `$userId` and event != "" [$__auto]))',
        legend='{{event}}')], 0, 10, 24, 8, ds=LOKI, field={'custom': {'drawStyle': 'bars', 'fillOpacity': 70, 'stacking': {'mode': 'normal'}}}),
    panel('logs', 'Tudo o que o usuário fez (Loki)', [loki_target(
        '{app="clinic-api"} |= `$userId` | json | actorId = `$userId` | line_format `{{.actorRole}} {{.event}} {{.method}} {{.route}} {{.statusCode}} | clinic={{.clinicId}} patient={{.patientId}} appt={{.appointmentId}} report={{.medicalReportId}} req={{.requestId}}`')],
          0, 18, 24, 12, ds=LOKI, options={'showTime': True, 'wrapLogMessage': True, 'sortOrder': 'Descending', 'enableLogDetails': True}),
]

dashboards = {
    'operacao.json': dashboard('clinica-operacao', 'Clínica — Operação', op, [CLINIC_VAR],
                               description='Indicadores do banco (Postgres). Período e clínica nos filtros do topo.'),
    'saude-api.json': dashboard('clinica-saude-api', 'Clínica — Saúde da API', health, [], 'now-6h', 'now',
                                description='Disponibilidade da API, do banco e do PACS (sonda externa) e tráfego HTTP (logs no Loki).', refresh='30s'),
    'linha-do-tempo-paciente.json': dashboard('clinica-paciente', 'Clínica — Linha do tempo do paciente', timeline,
                                              [textbox('patientId', 'ID do paciente')], 'now-90d', 'now+1d'),
    'atividade-usuario.json': dashboard('clinica-usuario', 'Clínica — Atividade por usuário', activity,
                                        [textbox('userId', 'ID do usuário')], 'now-30d', 'now+1d'),
}

os.makedirs(OUT, exist_ok=True)
for name, dash in dashboards.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(dash, f, ensure_ascii=False, indent=2)
print('ok:', ', '.join(dashboards))
