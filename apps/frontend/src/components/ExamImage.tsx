import { Anchor, Button, Text, Tooltip } from '@mantine/core';
import { IconPhotoScan } from '@tabler/icons-react';

/** PACS de demonstração: abre o Stone Web Viewer direto na URL gravada no agendamento (nova aba). */
export function ExamImageButton({ url }: { url: string | null }) {
  if (!url) {
    return (
      <Tooltip label="Este agendamento não tem imagem no PACS de demonstração">
        <Button variant="light" size="xs" leftSection={<IconPhotoScan size={16} />} disabled>
          Visualizar exame
        </Button>
      </Tooltip>
    );
  }
  return (
    <Button component="a" href={url} target="_blank" rel="noopener noreferrer" variant="light" size="xs" leftSection={<IconPhotoScan size={16} />}>
      Visualizar exame
    </Button>
  );
}

/** Célula da lista de agendamentos (não dispara o clique da linha). */
export function ExamImageLink({ url }: { url: string | null }) {
  if (!url) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Anchor href={url} target="_blank" rel="noopener noreferrer" size="sm" onClick={(e) => e.stopPropagation()}>
      <IconPhotoScan size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
      Ver exame
    </Anchor>
  );
}
