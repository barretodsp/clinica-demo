import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import type { ReportDocument } from './report-body.js';

/** Mesmas extensões do editor (lista fechada), sem nada além do permitido. */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Corpo do laudo em HTML. O JSON já foi validado; o renderer escapa o texto. */
export function renderReportBodyHtml(doc: ReportDocument): string {
  return renderToHTMLString({ content: doc, extensions: EXTENSIONS });
}

/** Documento HTML completo do laudo: título, corpo e assinatura (rodapé fixo). */
export function renderReportDocumentHtml(input: {
  title: string;
  body: ReportDocument;
  professionalName: string;
  professionalRegistration: string;
  publishedAtLabel: string;
}): string {
  return [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>',
    escapeHtml(input.title),
    '</title></head><body><article>',
    `<h1>${escapeHtml(input.title)}</h1>`,
    renderReportBodyHtml(input.body),
    '<footer>',
    `<p><strong>${escapeHtml(input.professionalName)}</strong><br>${escapeHtml(input.professionalRegistration)}</p>`,
    `<p>Publicado em ${escapeHtml(input.publishedAtLabel)}</p>`,
    '</footer></article></body></html>',
  ].join('');
}
