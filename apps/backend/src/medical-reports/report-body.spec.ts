import { extractPlainText, isEffectivelyEmpty, reportDocumentSchema, type ReportDocument } from './report-body.js';
import { renderReportBodyHtml } from './report-html.js';
import { buildTitle } from './report-view.js';

const valid: ReportDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, textAlign: 'left' }, content: [{ type: 'text', text: 'Conclusão' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'justify' },
      content: [
        { type: 'text', text: 'Menisco medial ' },
        { type: 'text', text: 'íntegro', marks: [{ type: 'bold' }, { type: 'underline' }] },
        { type: 'hardBreak' },
        { type: 'text', text: '<script>alert(1)</script>' },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1, type: null },
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
    },
  ],
};

describe('corpo do laudo (lista fechada de formatações)', () => {
  it('aceita os nós, marcas e atributos permitidos', () => {
    expect(reportDocumentSchema.safeParse(valid).success).toBe(true);
  });

  it('aceita o JSON real produzido pelo editor Tiptap (atributos nulos, listas aninhadas, start)', () => {
    // capturado do Tiptap 3 com as mesmas extensões do frontend
    const fromEditor = {"type":"doc","content":[{"type":"heading","attrs":{"textAlign":"center","level":2},"content":[{"type":"text","text":"Achados"}]},{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"a "},{"type":"text","marks":[{"type":"bold"}],"text":"b"},{"type":"text","text":" "},{"type":"text","marks":[{"type":"italic"}],"text":"c"},{"type":"text","text":" "},{"type":"text","marks":[{"type":"underline"}],"text":"d"},{"type":"hardBreak"},{"type":"text","text":"e"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"x"}]}]}]},{"type":"orderedList","attrs":{"start":3,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"y"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"z"}]}]}]}]}]},{"type":"heading","attrs":{"textAlign":null,"level":3},"content":[{"type":"text","text":"s"}]}]};
    expect(reportDocumentSchema.safeParse(fromEditor).success).toBe(true);
  });

  it.each([
    ['imagem', { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }],
    ['link', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'http://x' } }] }] }] }],
    ['cor', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] }] }] }],
    ['título H1', { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] }],
    ['atributo desconhecido', { type: 'doc', content: [{ type: 'paragraph', attrs: { style: 'x' } }] }],
    ['tabela', { type: 'doc', content: [{ type: 'table', content: [] }] }],
    ['HTML cru', '<p>oi</p>'],
    ['raiz que não é doc', { type: 'paragraph' }],
  ])('rejeita %s', (_label, body) => {
    expect(reportDocumentSchema.safeParse(body).success).toBe(false);
  });

  it('extrai o texto puro (um bloco por linha, listas numeradas)', () => {
    expect(extractPlainText(valid)).toBe('Conclusão\nMenisco medial íntegro\n<script>alert(1)</script>\n1. Item');
  });

  it('considera vazio um documento só com parágrafos/listas sem texto', () => {
    expect(isEffectivelyEmpty(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] }))).toBe(true);
    expect(isEffectivelyEmpty('  \n - \n 1. ')).toBe(true);
    expect(isEffectivelyEmpty('Sem alterações')).toBe(false);
  });

  it('gera HTML escapado e só com as tags permitidas', () => {
    const html = renderReportBodyHtml(valid);
    expect(html).toContain('<strong>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script|<img|<a |<table|style="color/);
    const tags = new Set([...html.matchAll(/<([a-z0-9]+)/g)].map((m) => m[1]));
    for (const tag of tags) expect(['h2', 'h3', 'p', 'strong', 'em', 'u', 'br', 'ol', 'ul', 'li']).toContain(tag);
  });

  it('monta o título sempre com o tipo do exame', () => {
    expect(buildTitle('Ressonância Magnética', '  Joelho direito ')).toBe('Ressonância Magnética — Joelho direito');
    expect(buildTitle('Raio-X', null)).toBe('Raio-X');
    expect(buildTitle('Raio-X', '   ')).toBe('Raio-X');
  });
});
