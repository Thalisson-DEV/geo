import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationService } from '@geo/ui/feedback';
import { CopilotoMarkdownComponent, numeroBr } from './copiloto-markdown.component';

describe('CopilotoMarkdownComponent', () => {
  let fixture: ComponentFixture<CopilotoMarkdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CopilotoMarkdownComponent],
      providers: [{ provide: NotificationService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }],
    }).compileComponents();

    fixture = TestBed.createComponent(CopilotoMarkdownComponent);
  });

  it('renderiza os principais elementos do GitHub Flavored Markdown', () => {
    fixture.componentRef.setInput('content', [
      '# Resumo',
      '',
      '- [x] Item concluído',
      '- [ ] Item pendente',
      '',
      '| Equipe | Total |',
      '| --- | ---: |',
      '| Norte | 12 |',
      '',
      'Use `npm test` e ~~ignore~~ este texto.',
      '',
      '```ts',
      'const total = 12;',
      '```'
    ].join('\n'));
    fixture.detectChanges();

    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;

    expect(markdown.querySelector('h1')?.textContent).toBe('Resumo');
    expect(markdown.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
    expect(markdown.querySelector('[aria-checked="true"]')).toBeTruthy();
    expect(markdown.querySelector('table tbody td')?.textContent).toBe('Norte');
    expect(markdown.querySelector('table tbody td:last-child')?.getAttribute('align')).toBe('right');
    expect(markdown.querySelector('.markdown-table')?.getAttribute('role')).toBe('region');
    expect(markdown.querySelector('code')?.textContent).toBe('npm test');
    expect(markdown.querySelector('del')?.textContent).toBe('ignore');
    expect(markdown.querySelector('pre code')?.textContent).toContain('const total = 12;');
  });

  it('sanitiza HTML perigoso sem remover a formatação segura', () => {
    fixture.componentRef.setInput(
      'content',
      '**Seguro** <img src="x" onerror="alert(1)"> <script>alert(2)</script>'
    );
    fixture.detectChanges();

    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;
    const image = markdown.querySelector('img');

    expect(markdown.querySelector('strong')?.textContent).toBe('Seguro');
    expect(image?.hasAttribute('onerror')).toBe(false);
    expect(markdown.querySelector('script')).toBeNull();
  });

  it('abre links externos com segurança e transforma citações conhecidas em marcadores', () => {
    fixture.componentRef.setInput('content', 'Conforme a norma [1] e o item [7]. Veja [site](https://www.gov.br/nr10).');
    fixture.componentRef.setInput('fontes', [{ numero: 1, url: 'https://www.gov.br/nr10', titulo: 'NR-10' }]);
    fixture.detectChanges();

    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;
    const citacao = markdown.querySelector('sup a.markdown-citacao') as HTMLAnchorElement;
    expect(citacao.textContent).toBe('1');
    expect(citacao.getAttribute('aria-label')).toBe('Fonte 1: NR-10');
    expect(citacao.rel).toBe('noopener noreferrer');
    expect(markdown.textContent).toContain('[7]');
    const link = [...markdown.querySelectorAll('a')].find((a) => a.textContent === 'site') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
  });

  it('troca citações de resultados por um link de dados e avisa quais resultados abrir', () => {
    fixture.componentRef.setInput('content', 'Total de **R$ 10** (r2, r6) no mês (r19).');
    fixture.componentRef.setInput('citacoesClicaveis', true);
    fixture.detectChanges();
    const abertos: string[][] = [];
    fixture.componentInstance.verDados.subscribe((codigos) => abertos.push(codigos));

    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;
    const links = markdown.querySelectorAll<HTMLButtonElement>('button.markdown-dados');
    expect(links).toHaveLength(2);
    expect(markdown.textContent).not.toContain('r19');
    links[0].click();
    expect(abertos).toEqual([['r2', 'r6']]);
  });

  it('sem quem abra os dados, as citações de resultados somem do texto', () => {
    fixture.componentRef.setInput('content', 'Total de R$ 10 (r2).');
    fixture.detectChanges();
    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;
    expect(markdown.textContent?.trim()).toBe('Total de R$ 10.');
  });

  it('ordena tabelas por valores em reais e monta o índice das respostas longas', () => {
    fixture.componentRef.setInput('content', [
      '## Um', '## Dois', '## Três', '## Quatro', '',
      '| Equipe | Valor |', '| --- | ---: |', '| A | R$ 1.860,06 |', '| B | R$ 99,10 |', '| C | R$ 10.000,00 |',
    ].join(String.fromCharCode(10)));
    fixture.componentRef.setInput('indice', true);
    fixture.detectChanges();
    const markdown = fixture.nativeElement.querySelector('.markdown-body') as HTMLElement;

    expect(markdown.querySelectorAll('.markdown-indice__item')).toHaveLength(4);
    const ordenar = markdown.querySelectorAll<HTMLButtonElement>('button.markdown-ordenar')[1];
    ordenar.click();
    const valores = [...markdown.querySelectorAll('tbody tr td:last-child')].map((td) => td.textContent?.trim());
    expect(valores).toEqual(['R$ 99,10', 'R$ 1.860,06', 'R$ 10.000,00']);
    expect(ordenar.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('lê números no padrão brasileiro', () => {
    expect(numeroBr('R$ 1.234,56')).toBe(1234.56);
    expect(numeroBr('11,5%')).toBe(11.5);
    expect(numeroBr('Bonfim')).toBeNull();
  });
});
