import { RichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import { useEffect } from 'react';
import type { ReportDocument } from '../lib/types';
import { reportExtensions } from './editor-extensions';

interface Props {
  initialContent: ReportDocument;
  onChange: (doc: ReportDocument) => void;
  disabled?: boolean;
}

/** Editor do laudo (Tiptap via @mantine/tiptap), salvo como JSON. */
export function ReportEditor({ initialContent, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: reportExtensions('Descreva o laudo…'),
    content: initialContent,
    editable: !disabled,
    immediatelyRender: true,
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as ReportDocument),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <RichTextEditor editor={editor} className="report-content">
      <RichTextEditor.Toolbar sticky stickyOffset={60}>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Underline />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.H2 />
          <RichTextEditor.H3 />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.BulletList />
          <RichTextEditor.OrderedList />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.AlignLeft />
          <RichTextEditor.AlignCenter />
          <RichTextEditor.AlignRight />
          <RichTextEditor.AlignJustify />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Undo />
          <RichTextEditor.Redo />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>
      <RichTextEditor.Content />
    </RichTextEditor>
  );
}
