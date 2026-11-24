import { z } from 'zod';

/**
 * Corpo do laudo: JSON do Tiptap restrito a uma lista fechada de formatações.
 * Qualquer outro tipo de nó, marca ou atributo é rejeitado (422 INVALID_REPORT_BODY).
 *
 * Blocos: doc, paragraph, heading (2|3), bulletList, orderedList, listItem
 * Inline:  text, hardBreak
 * Marcas:  bold, italic, underline
 */

export type TextAlign = 'left' | 'center' | 'right' | 'justify' | null;
export type MarkType = 'bold' | 'italic' | 'underline';

export interface TextNode {
  type: 'text';
  text: string;
  marks?: { type: MarkType }[];
}
export interface HardBreakNode {
  type: 'hardBreak';
}
export type InlineNode = TextNode | HardBreakNode;

export interface ParagraphNode {
  type: 'paragraph';
  attrs?: { textAlign?: TextAlign };
  content?: InlineNode[];
}
export interface HeadingNode {
  type: 'heading';
  attrs: { level: 2 | 3; textAlign?: TextAlign };
  content?: InlineNode[];
}
export interface ListItemNode {
  type: 'listItem';
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}
export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}
export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number; type?: null };
  content: ListItemNode[];
}
export type BlockNode = ParagraphNode | HeadingNode | BulletListNode | OrderedListNode;

export interface ReportDocument {
  type: 'doc';
  content: BlockNode[];
}

/** Tamanho máximo do JSON serializado (o banco tem CHECK equivalente). */
export const MAX_BODY_BYTES = 100 * 1024;

const textAlign = z.enum(['left', 'center', 'right', 'justify']).nullable().optional();
/** O editor pode serializar `attrs: {}` vazio; qualquer atributo é recusado. */
const noAttrs = z.strictObject({}).optional();
const mark = z.strictObject({ type: z.enum(['bold', 'italic', 'underline']), attrs: noAttrs });

const textNode = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1).max(20_000),
  marks: z.array(mark).max(3).optional(),
});
const hardBreakNode = z.strictObject({ type: z.literal('hardBreak'), attrs: noAttrs });
const inlineNode = z.discriminatedUnion('type', [textNode, hardBreakNode]);

const paragraphNode = z.strictObject({
  type: z.literal('paragraph'),
  attrs: z.strictObject({ textAlign }).optional(),
  content: z.array(inlineNode).optional(),
});
const headingNode = z.strictObject({
  type: z.literal('heading'),
  attrs: z.strictObject({ level: z.union([z.literal(2), z.literal(3)]), textAlign }),
  content: z.array(inlineNode).optional(),
});

const listItemNode: z.ZodType<ListItemNode> = z.lazy(() =>
  z.strictObject({
    type: z.literal('listItem'),
    attrs: noAttrs,
    content: z.array(z.union([paragraphNode, bulletListNode, orderedListNode])).min(1),
  }),
) as z.ZodType<ListItemNode>;
const bulletListNode: z.ZodType<BulletListNode> = z.lazy(() =>
  z.strictObject({ type: z.literal('bulletList'), attrs: noAttrs, content: z.array(listItemNode).min(1) }),
);
const orderedListNode: z.ZodType<OrderedListNode> = z.lazy(() =>
  z.strictObject({
    type: z.literal('orderedList'),
    attrs: z.strictObject({ start: z.number().int().min(1).optional(), type: z.null().optional() }).optional(),
    content: z.array(listItemNode).min(1),
  }),
);

const blockNode = z.union([paragraphNode, headingNode, bulletListNode, orderedListNode]);

export const reportDocumentSchema: z.ZodType<ReportDocument> = z.strictObject({
  type: z.literal('doc'),
  content: z.array(blockNode).max(2_000),
}) as z.ZodType<ReportDocument>;

/** Documento vazio usado ao iniciar um laudo. */
export function emptyReportDocument(): ReportDocument {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

type AnyNode = ReportDocument | BlockNode | ListItemNode | InlineNode;

/**
 * Texto puro do laudo: um bloco por linha. Usado para bloquear a publicação
 * de laudo vazio e como `conclusion` na exportação FHIR.
 */
export function extractPlainText(doc: ReportDocument): string {
  const lines: string[] = [];
  const inlineText = (nodes?: InlineNode[]) =>
    (nodes ?? []).map((n) => (n.type === 'text' ? n.text : '\n')).join('');
  const walk = (node: AnyNode, prefix = ''): void => {
    switch (node.type) {
      case 'doc':
        node.content.forEach((n) => walk(n));
        break;
      case 'paragraph':
      case 'heading':
        lines.push(prefix + inlineText(node.content));
        break;
      case 'bulletList':
        node.content.forEach((item) => walk(item, '- '));
        break;
      case 'orderedList':
        node.content.forEach((item, i) => walk(item, `${(node.attrs?.start ?? 1) + i}. `));
        break;
      case 'listItem':
        node.content.forEach((n, i) => walk(n, i === 0 ? prefix : '  '));
        break;
      default:
        break;
    }
  };
  walk(doc);
  return lines
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Laudo vazio = sem texto além de espaços, marcadores de lista ou formatação. */
export function isEffectivelyEmpty(plainText: string): boolean {
  return plainText.split('\n').every((line) => line.replace(/^\s*(?:-|\d+\.)?\s*/, '').trim() === '');
}
