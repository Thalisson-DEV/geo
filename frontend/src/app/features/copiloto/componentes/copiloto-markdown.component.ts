import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { NotificationService } from '@geo/ui/feedback';
import { CITACAO_RESULTADOS, codigosResultado } from '../copiloto-texto';

const renderizador = new marked.Renderer();

renderizador.checkbox = ({ checked }: { checked?: boolean }) => `
  <span
    class="task-checkbox${checked ? ' task-checkbox--checked' : ''}"
    role="checkbox"
    aria-checked="${checked ? 'true' : 'false'}"
    aria-disabled="true"
  ></span>`;

/** Tabelas ganham um contêiner rolável para não estourar a largura da conversa em telas estreitas. */
const tabelaPadrao = renderizador.table.bind(renderizador);
renderizador.table = (token) => `<div class="markdown-table" role="region" tabindex="0" aria-label="Tabela">${tabelaPadrao(token)}</div>`;

const PURIFY = {
  ADD_ATTR: ['target', 'rel', 'aria-label', 'aria-checked', 'aria-disabled', 'role', 'tabindex'],
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
};

/** Respostas com pelo menos tantos títulos ganham um índice no topo. */
const TITULOS_PARA_INDICE = 4;
let sequencia = 0;

/**
 * Markdown das respostas da Bússola (GFM via marked + DOMPurify). Depois de sanitizar, o componente acrescenta
 * só controles próprios: citações de fontes externas ([1]) viram marcadores; citações de resultados do GEO
 * ((r2, r6)) viram um link "dados" que abre a tabela usada; tabelas ganham copiar, baixar CSV e ordenar; e
 * respostas longas ganham um índice das seções.
 */
@Component({
  selector: 'app-copiloto-markdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="copiloto-markdown markdown-body" [innerHTML]="html()" (click)="aoClicar($event)"></div>`,
  styleUrl: './copiloto-markdown.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class CopilotoMarkdownComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly notificacao = inject(NotificationService);
  private readonly prefixo = `md${++sequencia}`;

  readonly content = input<string | null | undefined>('');
  /** Fontes conhecidas: citações [n] com número existente viram links para a fonte. */
  readonly fontes = input<readonly { numero: number; url: string; titulo: string }[]>([]);
  /** Mostra o índice das seções em respostas longas. */
  readonly indice = input(false);
  /** Ferramentas das tabelas (copiar, CSV, ordenar). */
  readonly ferramentasTabela = input(true);
  /** Citações de resultados viram link quando há quem abra os dados. */
  readonly citacoesClicaveis = input(false);

  /** Códigos de resultado citados (r2, r6...) cujo link foi clicado. */
  readonly verDados = output<string[]>();

  readonly html = computed<SafeHtml>(() => {
    const bruto = this.content() || '';
    const html = marked.parse(bruto, { async: false, breaks: false, gfm: true, renderer: renderizador }) as string;
    const limpo = DOMPurify.sanitize(html, PURIFY) as string;
    // Seguro: o HTML do modelo já passou pelo DOMPurify; o pós-processamento só acrescenta elementos próprios.
    return this.sanitizer.bypassSecurityTrustHtml(this.pos(limpo));
  });

  private pos(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
    this.citarFontes(container);
    this.citarResultados(container);
    if (this.ferramentasTabela()) this.equiparTabelas(container);
    if (this.indice()) this.montarIndice(container);
    return container.innerHTML;
  }

  // ---------------------------------------------------------------------------------- pós-processamento

  private textos(container: HTMLElement, padrao: RegExp): Text[] {
    const caminhante = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nos: Text[] = [];
    while (caminhante.nextNode()) {
      const no = caminhante.currentNode as Text;
      padrao.lastIndex = 0;
      if (padrao.test(no.data) && !no.parentElement?.closest('code, pre, a, button')) nos.push(no);
    }
    return nos;
  }

  private substituir(no: Text, padrao: RegExp, criar: (trecho: string, grupos: string[]) => Node | string): void {
    const fragmento = document.createDocumentFragment();
    let ultimo = 0;
    padrao.lastIndex = 0;
    for (let achado = padrao.exec(no.data); achado; achado = padrao.exec(no.data)) {
      fragmento.append(no.data.slice(ultimo, achado.index));
      fragmento.append(criar(achado[0], achado.slice(1)));
      ultimo = achado.index + achado[0].length;
    }
    fragmento.append(no.data.slice(ultimo));
    no.replaceWith(fragmento);
  }

  private citarFontes(container: HTMLElement): void {
    const fontes = new Map(this.fontes().map((fonte) => [fonte.numero, fonte]));
    const padrao = /\[(\d{1,3})\]/g;
    for (const no of this.textos(container, padrao)) {
      this.substituir(no, padrao, (trecho, [numero]) => {
        const fonte = fontes.get(Number(numero));
        if (!fonte || !/^https?:\/\//i.test(fonte.url)) return trecho;
        const link = document.createElement('a');
        link.href = fonte.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'markdown-citacao';
        link.setAttribute('aria-label', `Fonte ${numero}: ${fonte.titulo}`);
        link.textContent = numero;
        const sup = document.createElement('sup');
        sup.append(link);
        return sup;
      });
    }
  }

  /** "(r2, r6)" vira um link discreto "dados" (ou some, quando não há quem abra os dados). */
  private citarResultados(container: HTMLElement): void {
    const padrao = new RegExp(CITACAO_RESULTADOS.source, 'g');
    const clicavel = this.citacoesClicaveis();
    for (const no of this.textos(container, padrao)) {
      this.substituir(no, padrao, (trecho) => {
        if (!clicavel) return '';
        const codigos = codigosResultado(trecho);
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'markdown-dados';
        botao.dataset['acao'] = 'dados';
        botao.dataset['resultados'] = codigos.join(',');
        botao.title = 'Ver os dados usados neste trecho';
        botao.setAttribute('aria-label', `Ver os dados usados neste trecho (${codigos.length} ${codigos.length === 1 ? 'tabela' : 'tabelas'})`);
        botao.innerHTML = '<i class="pi pi-table" aria-hidden="true"></i><span>dados</span>';
        const espaco = document.createDocumentFragment();
        espaco.append(' ', botao);
        return espaco;
      });
    }
  }

  private equiparTabelas(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>('.markdown-table').forEach((rolagem) => {
      const tabela = rolagem.querySelector('table');
      if (!tabela) return;
      const linhas = tabela.querySelectorAll('tbody tr').length;
      tabela.querySelectorAll<HTMLElement>('thead th').forEach((th, indice) => {
        if (linhas < 2) return;
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'markdown-ordenar';
        botao.dataset['acao'] = 'ordenar';
        botao.dataset['coluna'] = String(indice);
        botao.setAttribute('aria-label', `Ordenar por ${th.textContent?.trim() ?? 'esta coluna'}`);
        botao.append(...Array.from(th.childNodes));
        const seta = document.createElement('i');
        seta.className = 'pi pi-sort-alt markdown-ordenar__seta';
        seta.setAttribute('aria-hidden', 'true');
        botao.append(seta);
        th.append(botao);
        th.setAttribute('aria-sort', 'none');
      });
      const bloco = document.createElement('div');
      bloco.className = 'markdown-tabela';
      const barra = document.createElement('div');
      barra.className = 'markdown-tabela__barra';
      barra.setAttribute('role', 'group');
      barra.setAttribute('aria-label', 'Ações da tabela');
      barra.innerHTML = `
        <span class="markdown-tabela__total">${linhas} ${linhas === 1 ? 'linha' : 'linhas'}</span>
        <button type="button" class="markdown-tabela__acao" data-acao="copiar-tabela"><i class="pi pi-copy" aria-hidden="true"></i>Copiar</button>
        <button type="button" class="markdown-tabela__acao" data-acao="csv-tabela"><i class="pi pi-download" aria-hidden="true"></i>CSV</button>`;
      rolagem.replaceWith(bloco);
      bloco.append(barra, rolagem);
    });
  }

  private montarIndice(container: HTMLElement): void {
    const titulos = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3'));
    if (titulos.length < TITULOS_PARA_INDICE) return;
    const nav = document.createElement('nav');
    nav.className = 'markdown-indice';
    nav.setAttribute('aria-label', 'Seções desta resposta');
    const rotulo = document.createElement('span');
    rotulo.className = 'markdown-indice__rotulo';
    rotulo.textContent = 'Nesta resposta';
    nav.append(rotulo);
    titulos.forEach((titulo, indice) => {
      const id = `${this.prefixo}-s${indice}`;
      titulo.id = id;
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'markdown-indice__item';
      botao.dataset['acao'] = 'ir';
      botao.dataset['alvo'] = id;
      botao.textContent = titulo.textContent?.trim() ?? '';
      nav.append(botao);
    });
    container.prepend(nav);
  }

  // ---------------------------------------------------------------------------------- interação

  protected aoClicar(evento: MouseEvent): void {
    const botao = (evento.target as HTMLElement | null)?.closest<HTMLElement>('button[data-acao]');
    if (!botao) return;
    evento.preventDefault();
    switch (botao.dataset['acao']) {
      case 'dados':
        this.verDados.emit((botao.dataset['resultados'] ?? '').split(',').filter(Boolean));
        break;
      case 'ir': {
        const alvo = this.host.nativeElement.querySelector<HTMLElement>(`#${botao.dataset['alvo']}`);
        const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        alvo?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
        break;
      }
      case 'ordenar':
        this.ordenar(botao);
        break;
      case 'copiar-tabela':
        void this.copiarTabela(botao);
        break;
      case 'csv-tabela':
        this.baixarCsv(botao);
        break;
    }
  }

  private tabelaDe(botao: HTMLElement): HTMLTableElement | null {
    return botao.closest('.markdown-tabela')?.querySelector('table') ?? null;
  }

  private celulas(tabela: HTMLTableElement): string[][] {
    return Array.from(tabela.rows).map((linha) =>
      Array.from(linha.cells).map((celula) => (celula.textContent ?? '').replace(/\s+/g, ' ').trim()));
  }

  private async copiarTabela(botao: HTMLElement): Promise<void> {
    const tabela = this.tabelaDe(botao);
    if (!tabela) return;
    try {
      await navigator.clipboard.writeText(this.celulas(tabela).map((linha) => linha.join('\t')).join('\n'));
      this.notificacao.success('Tabela copiada. Cole direto no Excel.');
    } catch {
      this.notificacao.warning('Não foi possível copiar automaticamente. Use o botão CSV.');
    }
  }

  private baixarCsv(botao: HTMLElement): void {
    const tabela = this.tabelaDe(botao);
    if (!tabela) return;
    const csv = this.celulas(tabela)
      .map((linha) => linha.map((valor) => (/[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor)).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tabela-bussola.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  private ordenar(botao: HTMLElement): void {
    const tabela = botao.closest('table');
    const th = botao.closest('th');
    const corpo = tabela?.tBodies[0];
    if (!tabela || !th || !corpo) return;
    const coluna = Number(botao.dataset['coluna']);
    const crescente = th.getAttribute('aria-sort') !== 'ascending';
    tabela.querySelectorAll('thead th').forEach((outro) => {
      outro.setAttribute('aria-sort', 'none');
      outro.querySelector('.markdown-ordenar__seta')?.setAttribute('class', 'pi pi-sort-alt markdown-ordenar__seta');
    });
    th.setAttribute('aria-sort', crescente ? 'ascending' : 'descending');
    botao.querySelector('.markdown-ordenar__seta')?.setAttribute('class',
      `pi ${crescente ? 'pi-sort-amount-up-alt' : 'pi-sort-amount-down'} markdown-ordenar__seta`);
    const todas = Array.from(corpo.rows);
    // A linha de total (primeira célula "Total") continua no fim, fora da ordenação.
    const total = todas.length > 2 && /^total/i.test(todas[todas.length - 1].cells[0]?.textContent?.trim() ?? '')
      ? todas[todas.length - 1] : null;
    const linhas = total ? todas.slice(0, -1) : todas;
    const chave = (linha: HTMLTableRowElement) => linha.cells[coluna]?.textContent?.trim() ?? '';
    const numericas = linhas.every((linha) => !chave(linha) || numeroBr(chave(linha)) !== null);
    linhas.sort((a, b) => {
      const comparacao = numericas
        ? (numeroBr(chave(a)) ?? Number.NEGATIVE_INFINITY) - (numeroBr(chave(b)) ?? Number.NEGATIVE_INFINITY)
        : chave(a).localeCompare(chave(b), 'pt-BR', { numeric: true });
      return crescente ? comparacao : -comparacao;
    });
    corpo.append(...linhas, ...(total ? [total] : []));
  }
}

/** "R$ 1.234,56", "11,5%", "-3" → número; texto comum → null. */
export function numeroBr(valor: string): number | null {
  const limpo = valor.replace(/R\$|%|\s/g, '');
  if (!/^-?[\d.]+(,\d+)?$/.test(limpo)) return null;
  const numero = Number(limpo.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}
