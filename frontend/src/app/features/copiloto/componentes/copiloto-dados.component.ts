import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GeoButtonComponent, GeoIconButtonComponent, GeoTabItem, GeoTabPanelDirective, GeoTabsComponent, GeoIconComponent } from '@geo/ui';
import { GeoAsyncStateComponent, NotificationService } from '@geo/ui/feedback';
import { ResultadoTabular } from '../../../core/models/assistente.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { CopilotoStore } from '../copiloto.store';
import { NATUREZA, formatarCelula, rotuloColuna } from '../copiloto-formatos';

/** Colunas de situação/classificação, cujos valores vêm como enum (EM_EXECUCAO, CONCLUIDA...). */
const COLUNA_ENUM = /(status|situacao|tipo|categoria|prioridade|gravidade|natureza|origem|operacao)/i;

/** Mesmo valor da tabela da resposta: "EM EXECUÇÃO" vira "Em execução"; siglas curtas ficam como estão. */
export function formatarCelulaDados(valor: unknown, tipo: string | undefined, coluna = ''): string {
  const texto = formatarCelula(valor, tipo, coluna);
  if (!COLUNA_ENUM.test(coluna) || texto.length <= 3 || !/^[A-ZÀ-Ý][A-ZÀ-Ý_ ]*$/.test(texto)) return texto;
  const frase = texto.replace(/_/g, ' ').toLocaleLowerCase('pt-BR');
  return frase.charAt(0).toLocaleUpperCase('pt-BR') + frase.slice(1);
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; dados: ResultadoTabular };

const NUMERICOS = new Set(['NUMERO', 'INTEIRO', 'DECIMAL', 'MOEDA', 'numero', 'inteiro']);

/**
 * Painel com os dados usados num trecho da resposta (os resultados citados como "(r2, r6)"): o gestor confere a
 * base do número sem precisar entender códigos. Mostra até 500 linhas, com cópia e CSV.
 */
@Component({
  selector: 'app-copiloto-dados',
  standalone: true,
  imports: [GeoIconComponent, NgTemplateOutlet, GeoButtonComponent, GeoIconButtonComponent, GeoAsyncStateComponent, GeoTabsComponent, GeoTabPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dados" aria-labelledby="copiloto-dados-titulo">
      <header class="dados__cabecalho">
        <span class="dados__icone" aria-hidden="true"><geo-icon class="geo-icon--texto" name="table"></geo-icon></span>
        <div class="dados__titulos">
          <h2 class="dados__titulo" id="copiloto-dados-titulo">Dados usados na resposta</h2>
          <p class="dados__subtitulo">Tabelas que a Bússola consultou para chegar a esses números</p>
        </div>
        <ng-content select="[acoes-painel]"></ng-content>
        <geo-icon-button icon="x" label="Fechar os dados" size="icon-sm" (pressed)="fechar.emit()"></geo-icon-button>
      </header>

      @if (codigos().length > 1) {
        <geo-tabs class="dados__abas" [value]="ativa()" (valueChange)="ativa.set(+($event ?? 0))" [tabs]="abas()"
          [lazy]="false" ariaLabel="Tabelas citadas">
          @for (codigo of codigos(); track codigo; let i = $index) {
            <ng-template [geoTabPanel]="i"><ng-container [ngTemplateOutlet]="corpo"></ng-container></ng-template>
          }
        </geo-tabs>
      } @else {
        <ng-container [ngTemplateOutlet]="corpo"></ng-container>
      }
    </section>

    <ng-template #corpo>
      <div class="dados__corpo">
        @switch (estado().tipo) {
          @case ('carregando') {
            <geo-async-state state="loading" [compact]="true" title="Carregando os dados"></geo-async-state>
          }
          @case ('erro') {
            <geo-async-state state="error" [compact]="true" title="Não foi possível abrir estes dados"
              [description]="erroAtual()" actionLabel="Tentar novamente" actionIcon="refresh-cw"
              (action)="carregar(codigoAtivo(), true)"></geo-async-state>
          }
          @default {
            @if (dados(); as d) {
              <div class="dados__resumo">
                <div class="dados__resumo-texto">
                  <strong>{{ d.titulo }}</strong>
                  <span>{{ natureza[d.natureza] || d.natureza }} · {{ d.total.toLocaleString('pt-BR') }} {{ d.total === 1 ? 'linha' : 'linhas' }}@if (d.linhas.length < d.total) { · mostrando {{ d.linhas.length.toLocaleString('pt-BR') }} }</span>
                </div>
                <geo-button variant="ghost" size="sm" icon="copy" label="Copiar" (pressed)="copiar(d)"></geo-button>
                <geo-button variant="secondary" size="sm" icon="download" label="CSV" (pressed)="baixarCsv(d)"></geo-button>
              </div>
              @if (d.linhas.length) {
                <div class="dados__tabela" role="region" tabindex="0" [attr.aria-label]="d.titulo">
                  <table>
                    <caption class="geo-sr-only">{{ d.titulo }}: {{ d.linhas.length }} de {{ d.total }} linhas</caption>
                    <thead>
                      <tr>
                        @for (coluna of d.colunas; track $index) {
                          <th scope="col" [class.num]="numerica(coluna.tipo)">{{ rotuloColuna(coluna.nome) }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (linha of d.linhas; track $index) {
                        <tr>
                          @for (celula of linha; track $index) {
                            <td [class.num]="numerica(d.colunas[$index]?.tipo)">{{ formatarCelulaDados(celula, d.colunas[$index]?.tipo?.toLowerCase(), d.colunas[$index]?.nome) }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (d.linhas.length < d.total) {
                  <p class="dados__nota">
                    Para a base completa ({{ d.total.toLocaleString('pt-BR') }} linhas), peça à Bússola para exportar em Excel.
                  </p>
                }
              } @else {
                <geo-async-state state="empty" [compact]="true" title="Nenhuma linha neste resultado"></geo-async-state>
              }
            }
          }
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: flex; flex: 1; min-width: 0; min-height: 0; }
    .dados { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: var(--geo-surface); }
    .dados__cabecalho {
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--geo-border);
    }
    .dados__icone {
      display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
      width: 2.2rem; height: 2.2rem; border-radius: var(--geo-radius-sm);
      background: var(--geo-brand-soft); color: var(--geo-brand);
    }
    .dados__titulos { flex: 1; min-width: 0; }
    .dados__titulo { margin: 0; font-size: var(--geo-font-title); font-weight: 600; color: var(--geo-foreground); }
    .dados__subtitulo { margin: 0.1rem 0 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); }
    .dados__abas { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; }
    .dados__aba:focus-visible, .dados__tabela:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: -2px; }
    .dados__corpo { flex: 1; min-height: 0; overflow: auto; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.7rem; }
    .dados__resumo { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .dados__resumo-texto { flex: 1; min-width: 12rem; display: flex; flex-direction: column; }
    .dados__resumo-texto strong { font-size: var(--geo-font-body); color: var(--geo-foreground); }
    .dados__resumo-texto span { font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); }
    .dados__tabela { overflow: auto; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); max-height: 70vh; }
    table { width: 100%; border-collapse: collapse; font-size: var(--geo-font-table); font-variant-numeric: tabular-nums; }
    th, td { padding: 0.4rem 0.65rem; border-bottom: 1px solid var(--geo-border); text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; z-index: 1; background: var(--geo-surface-muted); font-weight: 600; }
    tbody tr:nth-child(even) { background: var(--geo-surface-subtle); }
    .num { text-align: right; }
    .dados__nota { margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); }
  `,
})
export class CopilotoDadosComponent {
  private readonly store = inject(CopilotoStore);
  private readonly notificacao = inject(NotificationService);

  readonly codigos = input.required<readonly string[]>();
  readonly fechar = output<void>();

  protected readonly ativa = signal(0);
  protected readonly abas = computed<GeoTabItem[]>(() =>
    this.codigos().map((codigo, i) => ({ value: i, label: this.tituloDe(codigo) || 'Tabela ' + (i + 1) })));
  private readonly estados = signal<Record<string, Estado>>({});
  protected readonly codigoAtivo = computed(() => this.codigos()[Math.min(this.ativa(), this.codigos().length - 1)] ?? '');
  protected readonly estado = computed<Estado>(() => this.estados()[this.codigoAtivo()] ?? { tipo: 'carregando' });
  protected readonly dados = computed(() => {
    const estado = this.estado();
    return estado.tipo === 'pronto' ? estado.dados : null;
  });
  protected readonly erroAtual = computed(() => {
    const estado = this.estado();
    return estado.tipo === 'erro' ? estado.mensagem : '';
  });

  protected readonly natureza = NATUREZA;
  protected readonly formatarCelulaDados = formatarCelulaDados;
  protected readonly rotuloColuna = rotuloColuna;

  constructor() {
    effect(() => {
      this.codigos();
      untracked(() => this.ativa.set(0));
    });
    // Só o código ativo dispara a carga; o estado lido e gravado em carregar() não é rastreado.
    effect(() => {
      const codigo = this.codigoAtivo();
      if (codigo) untracked(() => void this.carregar(codigo));
    });
  }

  protected tituloDe(codigo: string): string {
    const estado = this.estados()[codigo];
    return estado?.tipo === 'pronto' ? estado.dados.titulo : '';
  }

  protected numerica(tipo: string | undefined): boolean {
    return !!tipo && NUMERICOS.has(tipo);
  }

  async carregar(codigo: string, forcar = false): Promise<void> {
    if (!codigo || (!forcar && this.estados()[codigo]?.tipo === 'pronto')) return;
    this.estados.update((atual) => ({ ...atual, [codigo]: { tipo: 'carregando' } }));
    try {
      const dados = semIdentificadores(await this.store.resultado(codigo));
      this.estados.update((atual) => ({ ...atual, [codigo]: { tipo: 'pronto', dados } }));
      // Títulos das demais abas aparecem assim que cada uma carregar.
      for (const outro of this.codigos()) if (outro !== codigo && !this.estados()[outro]) void this.carregar(outro);
    } catch (erro) {
      this.estados.update((atual) => ({ ...atual, [codigo]: { tipo: 'erro', mensagem: getErrorMessage(erro) } }));
    }
  }

  private linhasTexto(dados: ResultadoTabular): string[][] {
    return [
      dados.colunas.map((coluna) => rotuloColuna(coluna.nome)),
      ...dados.linhas.map((linha) => linha.map((celula, i) => formatarCelulaDados(celula, dados.colunas[i]?.tipo?.toLowerCase(), dados.colunas[i]?.nome))),
    ];
  }

  protected async copiar(dados: ResultadoTabular): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linhasTexto(dados).map((linha) => linha.join('\t')).join('\n'));
      this.notificacao.success('Dados copiados. Cole direto no Excel.');
    } catch {
      this.notificacao.warning('Não foi possível copiar automaticamente. Use o botão CSV.');
    }
  }

  protected baixarCsv(dados: ResultadoTabular): void {
    const csv = this.linhasTexto(dados)
      .map((linha) => linha.map((valor) => (/[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor)).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dados.titulo.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'dados'}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tira as colunas de identificador interno (UUID): não dizem nada ao gestor; o número da nota continua. */
export function semIdentificadores(dados: ResultadoTabular): ResultadoTabular {
  const manter = dados.colunas.map((coluna, indice) => {
    if (coluna.tipo === 'UUID') return false;
    const valor = dados.linhas.find((linha) => linha[indice] !== null && linha[indice] !== undefined)?.[indice];
    return !(typeof valor === 'string' && UUID.test(valor));
  });
  if (manter.every(Boolean) || !manter.some(Boolean)) return dados;
  return {
    ...dados,
    colunas: dados.colunas.filter((_, indice) => manter[indice]),
    linhas: dados.linhas.map((linha) => linha.filter((_, indice) => manter[indice])),
  };
}
