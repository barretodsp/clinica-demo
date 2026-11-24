import { notifications } from '@mantine/notifications';
import { isApiError } from './api';

/** Mensagens por código de erro da API (o backend já manda mensagens em português; aqui só ajustes). */
const TITLES: Record<number, string> = {
  401: 'Sessão expirada',
  403: 'Acesso negado',
  404: 'Não encontrado',
  409: 'Conflito',
  422: 'Não foi possível concluir',
  429: 'Muitas tentativas',
};

export function notifyError(error: unknown, fallback = 'Erro inesperado. Tente novamente.'): void {
  if (isApiError(error)) {
    if (error.status === 401) return; // o handler global redireciona ao login
    notifications.show({ color: 'red', title: TITLES[error.status] ?? 'Erro', message: error.message });
    return;
  }
  notifications.show({ color: 'red', title: 'Erro', message: fallback });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', title: 'Pronto', message });
}
