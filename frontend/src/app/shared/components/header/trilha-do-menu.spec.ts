import { MenuItem } from 'primeng/api';
import { trilhaDoMenu } from './header.component';

describe('trilhaDoMenu', () => {
  const menu: MenuItem[] = [
    { label: 'Início', routerLink: '/home' },
    {
      label: 'Obras',
      items: [
        { label: 'Carteira', routerLink: '/obras' },
        { label: 'Programação', routerLink: '/obras/programacao' },
        { label: 'Oculto', routerLink: '/obras/oculto', visible: false },
      ],
    },
  ];

  it('monta grupo e tela pela rota mais específica', () => {
    expect(trilhaDoMenu(menu, '/obras/programacao?semana=2')).toEqual(['Obras', 'Programação']);
    expect(trilhaDoMenu(menu, '/obras/123')).toEqual(['Obras', 'Carteira']);
  });

  it('ignora itens ocultos e rotas fora do menu', () => {
    expect(trilhaDoMenu(menu, '/obras/oculto')).toEqual(['Obras', 'Carteira']);
    expect(trilhaDoMenu(menu, '/relatorio/x')).toEqual([]);
  });
});
