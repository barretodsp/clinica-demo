/** Contas de demonstração (dados fictícios do seed). Senha de todas: Demo@2026. */
export const DEMO_PASSWORD = 'Demo@2026';

export interface DemoAccount {
  name: string;
  email: string;
  detail: string;
}

export const DEMO_ACCOUNTS: { role: string; accounts: DemoAccount[] }[] = [
  {
    role: 'Atendentes',
    accounts: [
      { name: 'Paula Ribeiro', email: 'paula@mail.com', detail: 'São Paulo' },
      { name: 'Marcos Teixeira', email: 'marcos@mail.com', detail: 'Belo Horizonte' },
      { name: 'Iara Monteiro', email: 'iara@mail.com', detail: 'Manaus' },
      { name: 'Tiago Barros', email: 'tiago@mail.com', detail: 'Rio Branco' },
    ],
  },
  {
    role: 'Médicos',
    accounts: [
      { name: 'Dra. Ana Souza', email: 'ana@mail.com', detail: 'só São Paulo' },
      { name: 'Dr. Bruno Lima', email: 'bruno@mail.com', detail: 'só Manaus' },
      { name: 'Dr. Carlos Mendes', email: 'carlos@mail.com', detail: 'São Paulo e Belo Horizonte' },
      { name: 'Dra. Daniela Rocha', email: 'daniela@mail.com', detail: 'todas as clínicas' },
      { name: 'Dr. Eduardo Nunes', email: 'eduardo@mail.com', detail: 'Manaus e Rio Branco' },
    ],
  },
  {
    role: 'Pacientes',
    accounts: [
      { name: 'João Pereira', email: 'joao@mail.com', detail: 'SP e Manaus · laudo publicado' },
      { name: 'Silvia Costa', email: 'silvia@mail.com', detail: 'BH e Rio Branco · laudo publicado' },
      { name: 'Maria Oliveira', email: 'maria@mail.com', detail: 'São Paulo' },
      { name: 'Rafael Gomes', email: 'rafael@mail.com', detail: 'São Paulo' },
      { name: 'José Antônio Silva', email: 'jose@mail.com', detail: 'Manaus' },
      { name: 'Beatriz Lopes', email: 'beatriz@mail.com', detail: 'Manaus · laudo publicado' },
      { name: 'Carla Duarte', email: 'carla@mail.com', detail: 'BH · laudo publicado' },
      { name: 'Fernando Reis', email: 'fernando@mail.com', detail: 'Belo Horizonte' },
      { name: 'Juliana Martins', email: 'juliana@mail.com', detail: 'Rio Branco' },
      { name: 'Ricardo Freitas', email: 'ricardo@mail.com', detail: 'Rio Branco · laudo em rascunho (invisível)' },
      { name: 'Lúcia Fernandes', email: 'lucia@mail.com', detail: 'sem agendamentos' },
      { name: 'Pedro Almeida', email: 'pedro@mail.com', detail: 'sem agendamentos' },
    ],
  },
];
