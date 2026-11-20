import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormSectionComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import {
  Fechamento,
  FechamentoObra,
  LinhaKitFechamento,
  LinhaMaterialFechamento,
  LinhaServicoFechamento,
  MedicaoResumo
} from '../../../core/models/obras-medicoes.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ObrasMedicoesService } from '../../../core/services/obras-medicoes.service';
import { ObrasService } from '../../../core/services/obras.service';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { formatarMoeda } from '../obras-ui';
import { SITUACAO_EXECUCAO, STATUS_MEDICAO, TIPO_MEDICAO, contarCodigos, rotuloCompetencia } from './medicoes.logic';

const LIMITE = 200;
const OPERACAO = { INSTALAR: 'Instalar', RETIRAR: 'Retirar' } as const;

/**
 * Fechamento de uma ou várias obras: lançado × concluído de serviços e materiais, kits e medições. Aceita a coluna de
 * códigos colada do Excel; o resumo vem primeiro e o detalhe abre ao escolher a obra.
 */
@Component({
  selector: 'app-fechamento-obra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFormSectionComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextareaComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Fechamento de obra" icon="pi pi-file-check"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Medições' }, { label: 'Fechamento de obra' }]"
        description="Serviços e materiais lançados × concluídos com o valor executado, kits e medições geradas de uma ou várias obras."
        helpLabel="Ajuda sobre o fechamento" (help)="ajuda.show()">
      </geo-page-header>

      <geo-form-section title="Obras" icon="pi pi-building" description="Busque a obra pelo número ou título, ou cole a coluna de códigos do Excel (um por linha ou separados por vírgula).">
        <div class="fechamento__busca">
          <geo-select label="Adicionar obra" [options]="opcoesObra()" [(value)]="obraEscolhida" [filter]="true" [loading]="buscandoObras()"
            placeholder="Busque pelo número ou título" filterPlaceholder="Número ou título da obra" (search)="buscaObra$.next($event)" (opened)="buscaObra$.next('')"
            (valueChange)="adicionarObra($event)"></geo-select>
        </div>
        <geo-textarea label="Códigos das obras" [labelVisible]="false" [rows]="4" [(value)]="codigos" placeholder="Ex.: 7000001&#10;7100002"
          [description]="quantidade() ? quantidade() + (quantidade() === 1 ? ' código' : ' códigos') + (quantidade() > limite ? ' — o limite é ' + limite + ' por vez' : '') : undefined"
          [error]="quantidade() > limite ? 'Gere o fechamento de até ' + limite + ' obras por vez.' : undefined"></geo-textarea>
        <div class="geo-actions-row fechamento__acoes">
          <geo-button variant="outline" icon="pi pi-file-excel" label="Exportar XLSX" [loading]="exportando()"
            [disabled]="!quantidade() || quantidade() > limite" (pressed)="exportar()"></geo-button>
          <geo-button icon="pi pi-search" label="Gerar fechamento" [loading]="gerando()" [disabled]="!quantidade() || quantidade() > limite" (pressed)="gerar()"></geo-button>
        </div>
      </geo-form-section>

      @if (erro(); as mensagem) {
        <geo-async-state state="error" title="Não foi possível gerar o fechamento" [description]="mensagem"></geo-async-state>
      } @else if (resultado(); as r) {
        @if (r.naoEncontrados.length) {
          <geo-callout tone="warning" [dense]="true" [title]="r.naoEncontrados.length === 1 ? '1 código sem obra' : r.naoEncontrados.length + ' códigos sem obra'">
            {{ r.naoEncontrados.join(', ') }}
          </geo-callout>
        }
        @if (r.obras.length) {
          <geo-data-table title="Resumo" exportFileName="fechamento-resumo" searchPlaceholder="Obra, título ou município"
            rowActionLabel="Ver detalhe" rowActionIcon="pi pi-angle-down" [columns]="colunasResumo" [rows]="r.obras" [rowKey]="chaveObra"
            [rowLabel]="rotuloObra" (rowActivate)="ver($event)">
            <ng-template geoCell="obra" let-row>
              <span class="geo-cell-strong">{{ row.numero }}</span>
              <span class="geo-cell-muted">{{ row.titulo }}</span>
            </ng-template>
            <ng-template geoCell="situacao" let-row>
              <geo-status [tone]="situacaoDe(row).tom" [icon]="situacaoDe(row).icone">{{ situacaoDe(row).rotulo }}</geo-status>
            </ng-template>
            <ng-template geoCell="kits" let-row>{{ row.kitsConcluidos }} de {{ row.kitsLancados }}</ng-template>
          </geo-data-table>
        }

        @if (obra(); as o) {
          <section id="fechamento-obra" tabindex="-1" class="fechamento__obra" [attr.aria-label]="'Fechamento da obra ' + o.numero">
            <header class="fechamento__titulo">
              <h2>{{ o.numero }} <span>{{ o.titulo }}</span></h2>
              <span class="fechamento__links">
                <button type="button" (click)="ir(['/obras', o.idObra])"><i class="pi pi-building" aria-hidden="true"></i> Ficha</button>
                <button type="button" (click)="ir(['/obras', o.idObra, 'planejamento'])"><i class="pi pi-map" aria-hidden="true"></i> Planejamento</button>
                <button type="button" (click)="ir(['/obras/medicoes'])"><i class="pi pi-calculator" aria-hidden="true"></i> Medições</button>
              </span>
            </header>
            <div class="geo-kpis">
              <div class="geo-kpi" [attr.data-tone]="situacao[o.situacao].tom">
                <span class="geo-kpi__icon"><i class="pi pi-box" aria-hidden="true"></i></span>
                <span class="geo-kpi__body"><span class="geo-kpi__label">Kits concluídos</span>
                  <span class="geo-kpi__value">{{ o.kitsConcluidos }} de {{ o.kitsLancados }}</span>
                  <span class="geo-kpi__detail">{{ situacao[o.situacao].rotulo }}</span></span>
              </div>
              <div class="geo-kpi" data-tone="neutral">
                <span class="geo-kpi__icon"><i class="pi pi-map" aria-hidden="true"></i></span>
                <span class="geo-kpi__body"><span class="geo-kpi__label">Planejado</span>
                  <span class="geo-kpi__value">{{ moeda(o.valorPlanejado) }}</span>
                  <span class="geo-kpi__detail">Serviços pelo valor de hoje</span></span>
              </div>
              <div class="geo-kpi" data-tone="info">
                <span class="geo-kpi__icon"><i class="pi pi-check-square" aria-hidden="true"></i></span>
                <span class="geo-kpi__body"><span class="geo-kpi__label">Executado</span>
                  <span class="geo-kpi__value">{{ moeda(o.valorExecutado) }}</span>
                  <span class="geo-kpi__detail">Pelo valor congelado</span></span>
              </div>
              <div class="geo-kpi" [attr.data-tone]="o.valorMedido ? 'success' : 'neutral'">
                <span class="geo-kpi__icon"><i class="pi pi-calculator" aria-hidden="true"></i></span>
                <span class="geo-kpi__body"><span class="geo-kpi__label">Já medido</span>
                  <span class="geo-kpi__value">{{ moeda(o.valorMedido) }}</span>
                  <span class="geo-kpi__detail">{{ o.medicoesAtivas }} {{ o.medicoesAtivas === 1 ? 'medição ativa' : 'medições ativas' }}</span></span>
              </div>
            </div>

            <geo-tabs [(value)]="abaObra" [tabs]="abas()" [ariaLabel]="'Detalhe da obra ' + o.numero">
              <ng-template geoTabPanel="servicos">
                <geo-data-table caption="Serviços" [columns]="colunasServicos" [rows]="o.servicos" [rowKey]="chaveLinha" [exportFileName]="'fechamento-' + o.numero + '-servicos'"
                  [pageSizeOptions]="[25, 50, 100]" [pageSize]="25" stateTitle="Nenhum serviço planejado"></geo-data-table>
              </ng-template>
              <ng-template geoTabPanel="materiais">
                <geo-data-table caption="Materiais" [columns]="colunasMateriais" [rows]="o.materiais" [rowKey]="chaveLinha" [exportFileName]="'fechamento-' + o.numero + '-materiais'"
                  [pageSizeOptions]="[25, 50, 100]" [pageSize]="25" stateTitle="Nenhum material planejado"></geo-data-table>
              </ng-template>
              <ng-template geoTabPanel="kits">
                <geo-data-table caption="Kits lançados × concluídos" [columns]="colunasKits" [rows]="o.kits" [rowKey]="chaveKit" [exportFileName]="'fechamento-' + o.numero + '-kits'"
                  [pageSizeOptions]="[25, 50, 100]" [pageSize]="25" stateTitle="Nenhum kit aplicado">
                  <ng-template geoCell="kit" let-row>
                    <span class="geo-cell-strong">{{ row.codigoKit }}</span>
                    <span class="geo-cell-muted">{{ row.descricao }}</span>
                  </ng-template>
                  <ng-template geoCell="concluidos" let-row>
                    <geo-status [tone]="row.concluidos === row.lancados ? 'success' : row.concluidos ? 'info' : 'neutral'"
                      [icon]="row.concluidos === row.lancados ? 'pi-check-circle' : 'pi-circle'">{{ row.concluidos }} de {{ row.lancados }}</geo-status>
                  </ng-template>
                </geo-data-table>
              </ng-template>
              <ng-template geoTabPanel="medicoes">
                @if (o.medicoes.length) {
                  <geo-data-table caption="Medições" [columns]="colunasMedicoes" [rows]="o.medicoes" [rowKey]="chaveMedicao" [exportFileName]="'fechamento-' + o.numero + '-medicoes'">
                    <ng-template geoCell="status" let-row>
                      <geo-status [tone]="statusDe(row).tom" [icon]="statusDe(row).icone">{{ statusDe(row).rotulo }}</geo-status>
                    </ng-template>
                    <ng-template geoCell="gerada" let-row>{{ row.dataCriacao | date: 'dd/MM/yyyy' }} · {{ row.usuarioCriacao }}</ng-template>
                    <ng-template geoCell="boletim" let-row>
                      <button type="button" class="fechamento__boletim" (click)="ir(['/obras/medicoes', row.id])" [attr.aria-label]="'Abrir o boletim da medição ' + row.numero">Boletim <i class="pi pi-arrow-right" aria-hidden="true"></i></button>
                    </ng-template>
                  </geo-data-table>
                } @else {
                  <geo-callout tone="info" [dense]="true" title="Nenhuma medição gerada">Esta obra ainda não teve medição.</geo-callout>
                }
              </ng-template>
            </geo-tabs>
          </section>
        }
      } @else if (gerando()) {
        <geo-async-state state="loading" title="Gerando o fechamento" [compact]="true"></geo-async-state>
      }
    </div>

    <app-ajuda-listagem #ajuda titulo="Fechamento de obra" entidadePlural="obras" busca="obra, título ou município" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-copy"></i> Vários códigos de uma vez</h4>
        <p class="help-text-desc">Cole a coluna inteira do Excel: cada linha vira um código. Repetidos contam uma vez, e os códigos sem obra aparecem num aviso sem impedir as demais. O limite é {{ limite }} obras por vez.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-wallet"></i> Valores</h4>
        <p class="help-text-desc">O executado e o medido usam o valor congelado na programação. O planejado usa o valor vigente hoje dos serviços planejados, só para comparar. Kit executado antes do sistema conta como concluído.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-file-excel"></i> Planilha</h4>
        <p class="help-text-desc">"Exportar XLSX" gera abas de resumo, serviços, materiais, kits e medições, com a obra em cada linha para filtrar.</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .fechamento__busca { max-width: 28rem; margin-bottom: 0.75rem; }
    .fechamento__acoes { justify-content: flex-end; margin-top: 0.5rem; }
    .fechamento__obra { margin-top: 1.25rem; display: grid; gap: 1rem; scroll-margin-top: 4rem; }
    .fechamento__obra:focus { outline: none; }
    .fechamento__titulo { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .fechamento__titulo h2 { margin: 0; font-size: var(--geo-font-title, 1.125rem); }
    .fechamento__titulo h2 span { color: var(--geo-foreground-muted); font-weight: 400; }
    .fechamento__links { display: inline-flex; gap: 0.75rem; }
    .fechamento__links button { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0; border: 0; background: transparent; color: var(--geo-brand); font: inherit; cursor: pointer; }
    .fechamento__boletim { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; border: 0; background: transparent; color: var(--geo-brand); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .fechamento__links button:focus-visible { outline: 2px solid var(--geo-focus-ring, currentColor); outline-offset: 2px; }
  `
})
export class FechamentoObraComponent {
  private readonly api = inject(ObrasMedicoesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly obrasService = inject(ObrasService);

  /** Busca de obras para quem não tem a lista de códigos à mão. */
  protected readonly buscaObra$ = new Subject<string>();
  protected readonly buscandoObras = signal(false);
  protected readonly opcoesObra = signal<GeoSelectOption<string>[]>([]);
  protected readonly obraEscolhida = signal<string | null>(null);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly limite = LIMITE;
  protected readonly moeda = formatarMoeda;
  protected readonly situacao = SITUACAO_EXECUCAO;
  protected readonly statusMedicao = STATUS_MEDICAO;

  protected readonly codigos = signal('');
  protected readonly quantidade = computed(() => contarCodigos(this.codigos()));
  protected readonly resultado = signal<Fechamento | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly gerando = signal(false);
  protected readonly exportando = signal(false);
  protected readonly escolhida = signal<string | null>(null);
  protected readonly abaObra = signal<string | number | undefined>('servicos');

  protected readonly obra = computed(() => {
    const obras = this.resultado()?.obras ?? [];
    return obras.find((o) => o.idObra === this.escolhida()) ?? (obras.length === 1 ? obras[0] : null);
  });
  protected readonly abas = computed(() => {
    const o = this.obra();
    return [
      { value: 'servicos', label: 'Serviços', icon: 'pi pi-wrench', badge: o?.servicos.length ?? 0 },
      { value: 'materiais', label: 'Materiais', icon: 'pi pi-box', badge: o?.materiais.length ?? 0 },
      { value: 'kits', label: 'Kits', icon: 'pi pi-th-large', badge: o?.kits.length ?? 0 },
      { value: 'medicoes', label: 'Medições', icon: 'pi pi-calculator', badge: o?.medicoes.length ?? 0 }
    ];
  });

  protected readonly colunasResumo: GeoDataTableColumn<FechamentoObra>[] = [
    { key: 'obra', header: 'Obra', type: 'custom', priority: 1, value: (o) => o.numero, display: (o) => `${o.numero} ${o.titulo}` },
    { key: 'municipio', header: 'Município', value: (o) => o.municipio },
    { key: 'situacao', header: 'Execução', type: 'custom', priority: 1, value: (o) => o.situacao, display: (o) => SITUACAO_EXECUCAO[o.situacao].rotulo },
    { key: 'kits', header: 'Kits concluídos', type: 'custom', value: (o) => o.kitsConcluidos, display: (o) => `${o.kitsConcluidos} de ${o.kitsLancados}` },
    { key: 'valorPlanejado', header: 'Planejado', type: 'currency', value: (o) => o.valorPlanejado },
    { key: 'valorExecutado', header: 'Executado', type: 'currency', priority: 1, value: (o) => o.valorExecutado },
    { key: 'valorMedido', header: 'Medido', type: 'currency', value: (o) => o.valorMedido },
    { key: 'medicoesAtivas', header: 'Medições', type: 'integer', value: (o) => o.medicoesAtivas }
  ];
  protected readonly colunasServicos: GeoDataTableColumn<LinhaServicoFechamento>[] = [
    { key: 'codigo', header: 'Código', value: (s) => s.codigo },
    { key: 'descricao', header: 'Serviço', priority: 1, value: (s) => s.descricao },
    { key: 'operacao', header: 'Operação', value: (s) => OPERACAO[s.operacao] },
    { key: 'lancado', header: 'Lançado', type: 'number', value: (s) => s.lancado },
    { key: 'executado', header: 'Executado', type: 'number', priority: 1, value: (s) => s.executado },
    { key: 'percentual', header: '% executado', type: 'number', value: (s) => (s.lancado ? Math.round((s.executado / s.lancado) * 1000) / 10 : null), display: (s) => (s.lancado ? `${((s.executado / s.lancado) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—') },
    { key: 'unidade', header: 'Un.', value: (s) => s.unidade },
    { key: 'valorExecutado', header: 'Valor executado', type: 'currency', value: (s) => s.valorExecutado }
  ];
  protected readonly colunasMateriais: GeoDataTableColumn<LinhaMaterialFechamento>[] = [
    { key: 'codigo', header: 'Código', value: (m) => m.codigo },
    { key: 'descricao', header: 'Material', priority: 1, value: (m) => m.descricao },
    { key: 'operacao', header: 'Operação', value: (m) => OPERACAO[m.operacao] },
    { key: 'lancado', header: 'Lançado', type: 'number', value: (m) => m.lancado },
    { key: 'aplicado', header: 'Aplicado/retirado', type: 'number', priority: 1, value: (m) => m.aplicado },
    { key: 'unidade', header: 'Un.', value: (m) => m.unidade }
  ];
  protected readonly colunasKits: GeoDataTableColumn<LinhaKitFechamento>[] = [
    { key: 'kit', header: 'Kit', type: 'custom', priority: 1, value: (k) => k.codigoKit, display: (k) => `${k.codigoKit ?? ''} ${k.descricao ?? ''}` },
    { key: 'concluidos', header: 'Concluídos', type: 'custom', priority: 1, value: (k) => k.concluidos, display: (k) => `${k.concluidos} de ${k.lancados}` },
    { key: 'locais', header: 'Locais', value: (k) => k.locais.join(', ') }
  ];
  protected readonly colunasMedicoes: GeoDataTableColumn<MedicaoResumo>[] = [
    { key: 'numero', header: 'Medição', value: (m) => m.numero, display: (m) => `#${m.numero}` },
    { key: 'tipo', header: 'Tipo', value: (m) => TIPO_MEDICAO[m.tipo] },
    { key: 'competencia', header: 'Competência', value: (m) => m.competencia, display: (m) => rotuloCompetencia(m.competencia) },
    { key: 'valorTotal', header: 'Valor', type: 'currency', priority: 1, value: (m) => m.valorTotal },
    { key: 'status', header: 'Situação', type: 'custom', value: (m) => m.status, display: (m) => STATUS_MEDICAO[m.status].rotulo },
    { key: 'gerada', header: 'Gerada', type: 'custom', value: (m) => m.dataCriacao, display: (m) => new Date(m.dataCriacao).toLocaleDateString('pt-BR') },
    { key: 'boletim', header: 'Boletim', type: 'custom', sortable: false, searchable: false, exportable: false, align: 'end', value: () => null, display: () => 'Boletim' }
  ];
  protected readonly chaveObra = (o: FechamentoObra) => o.idObra;
  protected readonly rotuloObra = (o: FechamentoObra) => `obra ${o.numero}`;
  protected readonly chaveLinha = (l: { codigo: string | null; operacao: string; unidade: string | null }, i: number) => `${l.codigo}|${l.operacao}|${l.unidade}|${i}`;
  protected readonly chaveKit = (k: LinhaKitFechamento) => k.codigoKit ?? '';
  protected readonly chaveMedicao = (m: MedicaoResumo) => m.id;

  constructor() {
    this.buscaObra$
      .pipe(
        debounceTime(250),
        switchMap((termo) => {
          this.buscandoObras.set(true);
          return this.obrasService.listarObras({ buscaGlobal: termo.trim() || undefined, size: 20 }).pipe(
            map((pagina) => pagina.content.map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.numero }))),
            catchError(() => of([] as GeoSelectOption<string>[]))
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((opcoes) => {
        this.buscandoObras.set(false);
        this.opcoesObra.set(opcoes);
      });
    // A ficha da obra e outras telas abrem o fechamento já com a obra: ?obras=1027601 (vírgula para várias).
    const obras = this.route.snapshot.queryParamMap.get('obras');
    if (obras) {
      this.codigos.set(obras.split(',').map((c) => c.trim()).filter(Boolean).join('\n'));
      if (this.quantidade() && this.quantidade() <= LIMITE) this.gerar();
    }
  }

  /** Acrescenta a obra escolhida à lista (sem repetir) e já gera o fechamento. */
  protected adicionarObra(numero: string | null): void {
    if (!numero) return;
    // O campo volta vazio, pronto para a próxima obra.
    setTimeout(() => this.obraEscolhida.set(null));
    const atuais = this.codigos().split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    if (!atuais.includes(numero)) this.codigos.set([...atuais, numero].join('\n'));
    if (this.quantidade() <= LIMITE) this.gerar();
  }

  protected gerar(): void {
    this.gerando.set(true);
    this.erro.set(null);
    this.resultado.set(null);
    this.escolhida.set(null);
    this.api.fechamento(this.codigos()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.gerando.set(false);
        this.resultado.set(r);
        if (!r.obras.length) this.notificacoes.error('Nenhum dos códigos informados corresponde a uma obra.');
      },
      error: (e) => {
        this.gerando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected exportar(): void {
    this.exportando.set(true);
    this.api.exportarFechamento(this.codigos()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (arquivo) => {
        this.exportando.set(false);
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fechamento-obras-${new Date().toISOString().slice(0, 10)}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.exportando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Mostra o detalhe e leva o foco até ele, que fica abaixo do resumo. */
  protected ver(o: FechamentoObra): void {
    this.escolhida.set(o.idObra);
    setTimeout(() => {
      const secao = document.getElementById('fechamento-obra');
      const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      secao?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
      secao?.focus({ preventScroll: true });
    });
  }

  protected situacaoDe(o: FechamentoObra) {
    return SITUACAO_EXECUCAO[o.situacao];
  }

  protected statusDe(m: MedicaoResumo) {
    return STATUS_MEDICAO[m.status];
  }

  protected ir(rota: string[]): void {
    void this.router.navigate(rota);
  }
}
