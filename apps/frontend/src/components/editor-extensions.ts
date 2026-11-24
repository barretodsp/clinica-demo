import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

/**
 * Lista fechada de formatações (igual à validação do backend):
 * negrito, itálico, sublinhado, títulos H2/H3, listas, alinhamento, quebra de linha, desfazer/refazer.
 * Sem imagens, links, tabelas, cores, código ou citações.
 */
export function reportExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
