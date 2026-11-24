import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors.js';
import { parseReportBody } from './medical-reports.service.js';
import { jsonbTextBytes, MAX_BODY_BYTES, type ReportDocument } from './report-body.js';

/**
 * Ponto 1 da revisão: o tamanho do corpo é medido como o CHECK
 * `medical_report_body_size` mede (`octet_length(body::text)` do jsonb).
 * As saídas esperadas abaixo foram conferidas no Postgres 18 com
 * `SELECT $1::jsonb::text` (a paridade também roda contra o banco real
 * em medical-reports.e2e-spec.ts).
 */

const MAX_TEXT = 20_000;

/** Documento válido cujo `jsonbTextBytes` é exatamente `target`. */
function docWithJsonbBytes(target: number, char = 'a'): ReportDocument {
  const charBytes = Buffer.byteLength(char);
  const n = Math.ceil(target / ((MAX_TEXT - 1) * charBytes));
  const texts = Array.from({ length: n }, () => char);
  const make = (): ReportDocument => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: texts.map((text) => ({ type: 'text' as const, text })) }],
  });
  let missing = target - jsonbTextBytes(make());
  for (let i = 0; i < n && missing > 0; i++) {
    const extra = Math.min(MAX_TEXT - 1, Math.floor(missing / charBytes));
    texts[i] += char.repeat(extra);
    missing -= extra * charBytes;
  }
  const doc = make();
  if (jsonbTextBytes(doc) !== target) throw new Error(`não montou ${target} bytes com '${char}'`);
  return doc;
}

/** Captura o DomainError lançado por parseReportBody. */
function rejection(body: unknown): DomainError {
  try {
    parseReportBody(body);
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('parseReportBody aceitou o corpo');
}

const SIZE_MESSAGE = 'O texto do laudo excede o tamanho máximo (100 KB).';

describe('jsonbTextBytes — mesma contagem que octet_length(body::text)', () => {
  it.each<[string, unknown, string]>([
    ['documento mínimo', { type: 'doc', content: [{ type: 'paragraph' }] }, '{"type": "doc", "content": [{"type": "paragraph"}]}'],
    ['array e objeto vazios, null, booleano e inteiros', { a: [], b: {}, c: null, d: true, e: [1, 0, -5, 1000] }, '{"a": [], "b": {}, "c": null, "d": true, "e": [1, 0, -5, 1000]}'],
    ['aspas, barra invertida, barra e escapes curtos', { t: '"\\/\b\f\n\r\t' }, '{"t": "\\"\\\\/\\b\\f\\n\\r\\t"}'],
    ['caracteres de controle como \\u00XX (DEL não é escapado)', { t: '\u0001\u001f\u007f' }, '{"t": "\\u0001\\u001f\u007f"}'],
    ['acento (2 bytes), emoji (4 bytes) e U+2028 sem escape', { t: 'é😀 ' }, '{"t": "é😀 "}'],
    ['valores escalares na raiz', 'x', '"x"'],
  ])('%s', (_label, value, postgresText) => {
    expect(jsonbTextBytes(value)).toBe(Buffer.byteLength(postgresText));
  });

  it('conta bytes UTF-8, não caracteres', () => {
    expect(jsonbTextBytes('é')).toBe(4); // "é" → 2 aspas + 2 bytes
    expect(jsonbTextBytes('😀')).toBe(6); // surrogate pair em JS, 4 bytes em UTF-8
  });

  it('é sempre maior que o JSON compacto quando há ":" ou ","', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }] };
    // 4 ":" + 2 "," → 6 espaços a mais
    expect(jsonbTextBytes(doc) - Buffer.byteLength(JSON.stringify(doc))).toBe(6);
  });

  it('não depende da ordem das chaves (o jsonb reordena, o tamanho não muda)', () => {
    expect(jsonbTextBytes({ type: 'heading', attrs: { level: 2, textAlign: null } })).toBe(
      jsonbTextBytes({ attrs: { textAlign: null, level: 2 }, type: 'heading' }),
    );
  });

  it('trata undefined como o JSON.stringify: some em objeto, vira null em array', () => {
    expect(jsonbTextBytes({ a: 1, b: undefined })).toBe(Buffer.byteLength('{"a": 1}'));
    expect(jsonbTextBytes([1, undefined])).toBe(Buffer.byteLength('[1, null]'));
  });

  it('mede listas aninhadas', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }],
    };
    expect(jsonbTextBytes(doc)).toBe(
      Buffer.byteLength('{"type": "doc", "content": [{"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph"}]}]}]}'),
    );
  });
});

describe('parseReportBody — limite de 100 KB e corpo inválido sempre em 422', () => {
  it('aceita corpo com exatamente MAX_BODY_BYTES no formato do banco', () => {
    const doc = docWithJsonbBytes(MAX_BODY_BYTES);
    const parsed = parseReportBody(doc);
    expect(parsed.doc).toEqual(doc);
    expect(parsed.text.length).toBeGreaterThan(0);
  });

  it('recusa corpo com MAX_BODY_BYTES + 1 (422 INVALID_REPORT_BODY)', () => {
    const error = rejection(docWithJsonbBytes(MAX_BODY_BYTES + 1));
    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.code).toBe('INVALID_REPORT_BODY');
    expect(error.message).toBe(SIZE_MESSAGE);
  });

  it('regressão: recusa corpo que cabe em JSON compacto mas estoura no jsonb (antes: 500 no CHECK)', () => {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Sem alterações.', marks: [{ type: 'bold' }] }] };
    const body = { type: 'doc', content: Array.from({ length: 1_000 }, () => paragraph) };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(jsonbTextBytes(body)).toBeGreaterThan(MAX_BODY_BYTES);
    expect(rejection(body).message).toBe(SIZE_MESSAGE);
  });

  it('mede bytes: texto acentuado com menos de 100 K caracteres mas mais de 100 KB é recusado', () => {
    const doc = docWithJsonbBytes(MAX_BODY_BYTES + 2, 'é');
    expect(JSON.stringify(doc).length).toBeLessThan(MAX_BODY_BYTES); // em caracteres cabe; em bytes, não
    expect(rejection(doc).message).toBe(SIZE_MESSAGE);
  });

  it('aceita texto acentuado que cabe exatamente no limite', () => {
    expect(() => parseReportBody(docWithJsonbBytes(MAX_BODY_BYTES, 'é'))).not.toThrow();
  });

  it('formatação inválida é reportada antes do tamanho (com os detalhes do schema)', () => {
    const doc = docWithJsonbBytes(MAX_BODY_BYTES + 1000);
    const body = { ...doc, content: [...doc.content, { type: 'image', attrs: { src: 'x' } }] };
    const error = rejection(body);
    expect(error.code).toBe('INVALID_REPORT_BODY');
    expect(error.message).not.toBe(SIZE_MESSAGE);
    expect(error.details?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining('content') })]));
  });

  it('limita os detalhes do schema a 5 problemas', () => {
    const body = { type: 'doc', content: Array.from({ length: 20 }, () => ({ type: 'image' })) };
    expect(rejection(body).details?.issues).toHaveLength(5);
  });

  it('recusa caractere nulo no texto com 422 (o jsonb do Postgres daria 22P05 → 500)', () => {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\u0000b' }] }] };
    const error = rejection(body);
    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.code).toBe('INVALID_REPORT_BODY');
  });

  it('aceita os outros caracteres de controle (o jsonb os escapa)', () => {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\u0001\t\u007fb' }] }] };
    expect(() => parseReportBody(body)).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['string', 'texto'],
    ['número', 42],
    ['array', []],
    ['objeto vazio', {}],
    ['doc sem content', { type: 'doc' }],
    ['texto vazio', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }],
    ['texto acima de 20 000 caracteres', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(MAX_TEXT + 1) }] }] }],
    ['mais de 2 000 blocos', { type: 'doc', content: Array.from({ length: 2_001 }, () => ({ type: 'paragraph' })) }],
  ])('recusa %s com 422 INVALID_REPORT_BODY, sem lançar outro tipo de erro', (_label, body) => {
    const error = rejection(body);
    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.code).toBe('INVALID_REPORT_BODY');
  });
});
