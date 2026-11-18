import { MenuItem } from 'primeng/api';
import { montarTrilha, trilhaDoMenu } from './header.component';

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

  it('na tela do menu, a trilha é só o caminho do menu', () => {
    expect(montarTrilha(menu, '/obras/programacao', [{ label: 'Obras', route: '/obras' }, { label: 'Programação' }])).toEqual([
      { label: 'Obras' },
      { label: 'Programação' },
    ]);
  });

  it('numa ficha, liga de volta à lista com o recorte e fecha com o registro aberto', () => {
    const pagina = [{ label: 'Obras', route: '/obras', queryParams: { status: 'ATIVA' } }, { label: 'Obra 123' }];
    expect(montarTrilha(menu, '/obras/123', pagina)).toEqual([
      { label: 'Obras' },
      { label: 'Carteira', route: '/obras', queryParams: { status: 'ATIVA' } },
      { label: 'Obra 123' },
    ]);
  });

  it('fora do menu vale a trilha da página', () => {
    expect(montarTrilha(menu, '/relatorio/x', [{ label: 'Relatório' }])).toEqual([{ label: 'Relatório' }]);
  });
});
