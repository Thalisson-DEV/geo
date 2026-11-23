import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFileInputComponent,
  GeoFormSectionComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { AnaliseOrcadoFaturado, ObraNaPlanilha } from '../../../core/models/obras-medicoes.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasMedicoesService } from '../../../core/services/obras-medicoes.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { formatarDataParaApi, formatarMoeda } from '../obras-ui';
import { LIMITE_RELATORIO_DETALHADO, bloqueioDoRelatorio, situacaoNaPlanilha } from './medicoes.logic';

const LIMITE_ARQUIVO = 15 * 1024 * 1024;

/**
 * Relatório de medição detalhado: o orçamento gravado de cada obra (ou o orçado da planilha, se ela não tiver) e o
 * faturado da planilha encontram a execução das obras e viram um pacote com Excel, PDF e fotos do book. A planilha é
 * analisada ao ser escolhida e fica só na tela; vai de novo na geração.
 */
@Component({
  selector: 'app-relatorio-medicao-detalhado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    GeoAsyncStateComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFileInputComponent,
    GeoFormSectionComponent,
    GeoPageHeaderComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Relatório de medição detalhado" icon="pi pi-file-export"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Medições' }, { label: 'Relatório detalhado' }]"
        description="Orçamento e faturado do contrato lado a lado com a execução de cada obra, em Excel, PDF e fotos do book num único pacote."
        helpLabel="Ajuda sobre o relatório detalhado" (help)="ajuda.show()">
        <geo-button actions label="Baixar modelo" icon="pi pi-download" variant="outline" [loading]="baixandoModelo()" (pressed)="baixarModelo()"></geo-button>
      </geo-page-header>

      <geo-form-section title="1. Planilha orçado × faturado" icon="pi pi-file-excel"
        description="Aba Faturado e, para obras ainda sem orçamento gravado, as abas Materiais orçados e Mão de obra orçada. Quem já usa a planilha nesse layout pode enviá-la como está.">
        <geo-file-input label="Planilha" accept=".xlsx" [maxBytes]="limiteArquivo" buttonLabel="Escolher a planilha (XLSX)"
          emptyLabel="Até 15 MB. A análise começa ao escolher o arquivo." [file]="arquivo()" (fileChange)="escolher($event)"></geo-file-input>
      </geo-form-section>

      @if (analisando()) {
        <geo-async-state state="loading" title="Lendo a planilha" [compact]="true"></geo-async-state>
      } @else if (erro(); as mensagem) {
        <geo-async-state state="error" title="Não foi possível ler a planilha" [description]="mensagem"></geo-async-state>
      } @else if (analise(); as a) {
        <section class="relatorio__analise" aria-label="Resultado da análise">
          <div class="geo-kpis">
            <div class="geo-kpi" [attr.data-tone]="a.obras.length ? 'info' : 'warning'">
              <span class="geo-kpi__icon"><i class="pi pi-building" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Obras reconhecidas</span>
                <span class="geo-kpi__value">{{ a.obras.length }}</span>
                <span class="geo-kpi__detail">{{ a.linhasMaoDeObra + a.linhasMateriais }} linhas de orçamento · {{ a.linhasFaturado }} de faturado</span></span>
            </div>
            <div class="geo-kpi" data-tone="neutral">
              <span class="geo-kpi__icon"><i class="pi pi-wallet" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Orçado de mão de obra</span>
                <span class="geo-kpi__value">{{ moeda(totalOrcado()) }}</span>
                <span class="geo-kpi__detail">{{ obrasComOrcamento() ? obrasComOrcamento() + ' com orçamento gravado na obra' : 'Da planilha; valor atualizado quando houver' }}</span></span>
            </div>
            <div class="geo-kpi" data-tone="brand">
              <span class="geo-kpi__icon"><i class="pi pi-receipt" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Faturado</span>
                <span class="geo-kpi__value">{{ moeda(totalFaturado()) }}</span>
                <span class="geo-kpi__detail">Lançamentos aprovados; crédito subtrai</span></span>
            </div>
            <div class="geo-kpi" [attr.data-tone]="obrasComPendencia() ? 'warning' : 'success'">
              <span class="geo-kpi__icon"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Obras com pendência</span>
                <span class="geo-kpi__value">{{ obrasComPendencia() }}</span>
                <span class="geo-kpi__detail">Linha com erro ou lançamento a conferir</span></span>
            </div>
          </div>

          @if (a.errosSemObra.length) {
            <geo-callout tone="danger" [dense]="true" [title]="a.errosSemObra.length === 1 ? '1 linha sem o número da obra' : a.errosSemObra.length + ' linhas sem o número da obra'">
              {{ primeiros(a.errosSemObra) }}
            </geo-callout>
          }
          @if (a.naoIdentificadas.length) {
            <geo-callout tone="warning" [dense]="true" [title]="a.naoIdentificadas.length === 1 ? '1 obra não cadastrada' : a.naoIdentificadas.length + ' obras não cadastradas'">
              {{ a.naoIdentificadas.join(', ') }}. Elas ficam fora do relatório e não impedem as demais.
            </geo-callout>
          }

          @if (a.obras.length) {
            <geo-data-table caption="Obras da planilha" exportFileName="obras-orcado-faturado" searchPlaceholder="Obra, título ou município"
              [columns]="colunas" [rows]="a.obras" [rowKey]="chave" [rowLabel]="rotulo" [selectable]="true" [(selection)]="escolhidas"
              [pageSizeOptions]="[10, 25, 50]" [pageSize]="10">
              <ng-template geoCell="obra" let-row>
                <a class="geo-cell-strong" [routerLink]="['/obras', row.idObra]" [attr.aria-label]="'Abrir a ficha da obra ' + row.numero">{{ row.numero }}</a>
                <span class="geo-cell-muted">{{ row.titulo }}</span>
              </ng-template>
              <ng-template geoCell="situacao" let-row>
                <geo-status [tone]="situacaoDe(row).tom" [icon]="situacaoDe(row).icone">{{ situacaoDe(row).rotulo }}</geo-status>
              </ng-template>
              <ng-template geoCell="orcamento" let-row>
                @if (row.revisaoOrcamento) {
                  <geo-status tone="success" icon="pi pi-check" [title]="'O relatório usa a revisão ' + row.revisaoOrcamento + ' do orçamento da obra.'">Revisão {{ row.revisaoOrcamento }} da obra</geo-status>
                } @else {
                  <geo-status tone="neutral" icon="pi pi-file-excel" title="A obra não tem orçamento gravado: o relatório usa o orçado da planilha.">Da planilha</geo-status>
                }
              </ng-template>
              <ng-template geoCell="ultimoFaturamento" let-row>{{ row.ultimoFaturamento ? (row.ultimoFaturamento | date: 'dd/MM/yyyy') : '—' }}</ng-template>
            </geo-data-table>

            @if (podeGravarOrcamento && escolhidasSemOrcamento().length) {
              <geo-callout tone="info" [dense]="true" icon="pi pi-calculator"
                [title]="escolhidasSemOrcamento().length === 1 ? '1 obra escolhida sem orçamento gravado' : escolhidasSemOrcamento().length + ' obras escolhidas sem orçamento gravado'">
                Grave o orçado desta planilha nelas: a ficha passa a mostrar o saldo de cada serviço e material, e nos próximos relatórios a planilha só precisa do faturado.
                <div class="relatorio__gravar">
                  <geo-button variant="outline" size="sm" icon="pi pi-save" label="Gravar o orçado nas obras" [loading]="gravandoOrcamento()" (pressed)="gravarOrcado()"></geo-button>
                </div>
              </geo-callout>
            }

            @for (o of escolhidasComErro(); track o.idObra) {
              <geo-callout tone="danger" [dense]="true" [title]="'Obra ' + o.numero + ': ' + situacaoDe(o).rotulo">{{ primeiros(o.erros) }}</geo-callout>
            }

            <geo-form-section title="2. Dados do relatório" icon="pi pi-sliders-h"
              description="Execução, faturado e medições entram até a data de corte. Fiscal e responsável vão para as assinaturas do PDF.">
              <div class="relatorio__campos">
                <geo-datepicker label="Data de corte" [required]="true" [value]="dataCorte()" [maxDate]="hoje" (valueChange)="dataCorte.set($any($event))"
                  [error]="dataCorte() ? undefined : 'Informe a data de corte.'"></geo-datepicker>
                <geo-text-input label="Fiscal" [(value)]="fiscal" [maxlength]="120" placeholder="Nome do fiscal do contrato" [showOptional]="true"></geo-text-input>
                <geo-text-input label="Responsável" [(value)]="responsavel" [maxlength]="120" placeholder="Quem responde pela medição" [showOptional]="true"></geo-text-input>
              </div>
              <geo-boolean-control kind="toggle" label="Incluir as fotos do book" [(value)]="incluirFotos"
                description="Fotos dos pontos executados, no PDF e numa pasta do pacote. Sem elas o pacote sai mais leve."></geo-boolean-control>
              <div class="geo-actions-row relatorio__acoes">
                @if (bloqueio(); as motivo) {
                  <span class="relatorio__motivo" role="status">{{ motivo }}</span>
                }
                <geo-button icon="pi pi-file-export" [label]="rotuloGerar()" [loading]="gerando()" [disabled]="!!bloqueio() || !dataCorte()" (pressed)="gerar()"></geo-button>
              </div>
            </geo-form-section>
          } @else {
            <geo-callout tone="info" [dense]="true" title="Nenhuma obra cadastrada na planilha">
              Confira a coluna Obra: o número precisa ser o mesmo do cadastro.
            </geo-callout>
          }
        </section>
      }
    </div>

    <app-ajuda-listagem #ajuda titulo="Relatório de medição detalhado" entidadePlural="obras" busca="obra, título ou município" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-file-excel"></i> Planilha</h4>
        <p class="help-text-desc">Baixe o modelo, preencha o faturado e envie. O orçado vem do orçamento gravado em cada obra; para obra sem orçamento, o relatório usa as abas de materiais e mão de obra orçados da planilha, que podem ser gravadas na obra com "Gravar o orçado nas obras". O faturado não fica gravado: a planilha é lida na hora e enviada de novo ao gerar o pacote. Linhas do mesmo item, obra e operação no orçamento são somadas.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-exclamation-triangle"></i> Erros e conferência</h4>
        <p class="help-text-desc">Linha com erro bloqueia só a obra dela. Lançamento faturado com situação diferente de aprovada fica fora do total, e crédito subtrai; os dois aparecem no PDF em "Faturado para conferir".</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calculator"></i> Comparativo</h4>
        <p class="help-text-desc">Cada serviço mostra orçado, executado, faturado e o que falta faturar. O executado vem dos apontamentos até a data de corte, pelo valor congelado na programação. Códigos com e sem zero à esquerda são o mesmo item. Serviço executado acima do orçado, ou fora dele, sai marcado com *.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-images"></i> Pacote</h4>
        <p class="help-text-desc">Até {{ limite }} obras por pacote, cada uma numa pasta com o Excel, o PDF e as fotos do book dos pontos executados.</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .relatorio__analise { display: grid; gap: 1rem; margin-top: 1.25rem; }
    .relatorio__campos { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); margin-bottom: 0.75rem; }
    .relatorio__acoes { justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem; }
    .relatorio__gravar { margin-top: 0.5rem; }
    .relatorio__motivo { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
  `
})
export class RelatorioMedicaoDetalhadoComponent {
  private readonly api = inject(ObrasMedicoesService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly limite = LIMITE_RELATORIO_DETALHADO;
  protected readonly limiteArquivo = LIMITE_ARQUIVO;
  protected readonly moeda = formatarMoeda;
  protected readonly hoje = new Date();

  protected readonly arquivo = signal<File | null>(null);
  protected readonly analise = signal<AnaliseOrcadoFaturado | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly analisando = signal(false);
  protected readonly gerando = signal(false);
  protected readonly baixandoModelo = signal(false);
  protected readonly escolhidas = signal<readonly ObraNaPlanilha[]>([]);
  protected readonly dataCorte = signal<Date | null>(new Date());
  protected readonly fiscal = signal('');
  protected readonly responsavel = signal('');
  protected readonly incluirFotos = signal(true);

  protected readonly podeGravarOrcamento = (inject(AuthService).currentUser()?.permissoes ?? []).includes('obras:obra:write');
  protected readonly gravandoOrcamento = signal(false);
  protected readonly obrasComOrcamento = computed(() => (this.analise()?.obras ?? []).filter((o) => o.revisaoOrcamento).length);
  protected readonly escolhidasSemOrcamento = computed(() => this.escolhidas().filter((o) => !o.revisaoOrcamento && !o.erros.length
    && (o.itensMaoDeObra || o.itensMateriais)));
  protected readonly totalOrcado = computed(() => (this.analise()?.obras ?? []).reduce((t, o) => t + orcadoUsado(o), 0));
  protected readonly totalFaturado = computed(() => (this.analise()?.obras ?? []).reduce((t, o) => t + o.faturado, 0));
  protected readonly obrasComPendencia = computed(() => (this.analise()?.obras ?? []).filter((o) => o.erros.length || o.paraConferir).length);
  protected readonly escolhidasComErro = computed(() => this.escolhidas().filter((o) => o.erros.length));
  protected readonly bloqueio = computed(() => bloqueioDoRelatorio(this.escolhidas(), this.analise()?.errosSemObra.length ?? 0));
  protected readonly rotuloGerar = computed(() => {
    const n = this.escolhidas().length;
    return n > 1 ? `Gerar pacote de ${n} obras` : 'Gerar pacote';
  });

  protected readonly colunas: GeoDataTableColumn<ObraNaPlanilha>[] = [
    { key: 'obra', header: 'Obra', type: 'custom', priority: 1, value: (o) => o.numero, display: (o) => `${o.numero} ${o.titulo}` },
    { key: 'municipio', header: 'Município', value: (o) => o.municipio },
    { key: 'orcadoMaoDeObra', header: 'Orçado mão de obra', type: 'currency', priority: 1, value: (o) => orcadoUsado(o) },
    { key: 'orcadoMateriais', header: 'Orçado materiais', type: 'currency', value: (o) => (o.revisaoOrcamento ? (o.orcamentoGravadoMateriais || null) : o.orcadoMateriais) },
    { key: 'orcamento', header: 'Orçamento usado', type: 'custom', value: (o) => (o.revisaoOrcamento ? 'Revisão da obra' : 'Planilha') },
    { key: 'faturado', header: 'Faturado', type: 'currency', priority: 1, value: (o) => o.faturado },
    { key: 'ultimoFaturamento', header: 'Último faturamento', type: 'custom', value: (o) => o.ultimoFaturamento, display: (o) => o.ultimoFaturamento ?? '' },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (o) => situacaoNaPlanilha(o).rotulo, display: (o) => situacaoNaPlanilha(o).rotulo }
  ];
  protected readonly chave = (o: ObraNaPlanilha) => o.idObra;
  protected readonly rotulo = (o: ObraNaPlanilha) => `obra ${o.numero}`;

  protected escolher(arquivo: File | null): void {
    this.arquivo.set(arquivo);
    this.analise.set(null);
    this.erro.set(null);
    this.escolhidas.set([]);
    if (!arquivo) return;
    this.analisando.set(true);
    this.api.analisarOrcadoFaturado(arquivo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (analise) => {
        this.analisando.set(false);
        this.analise.set(analise);
        // Começa com as obras prontas escolhidas, até o limite do pacote.
        this.escolhidas.set(analise.obras.filter((o) => !o.erros.length).slice(0, LIMITE_RELATORIO_DETALHADO));
      },
      error: (e) => {
        this.analisando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected gerar(): void {
    const arquivo = this.arquivo();
    const data = this.dataCorte();
    if (!arquivo || !data || this.bloqueio()) return;
    this.gerando.set(true);
    this.api.gerarRelatorioDetalhado(arquivo, {
      idsObras: this.escolhidas().map((o) => o.idObra),
      dataCorte: formatarDataParaApi(data) ?? '',
      fiscal: this.fiscal(),
      responsavel: this.responsavel(),
      incluirFotos: this.incluirFotos()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (pacote) => {
        this.gerando.set(false);
        const obras = this.escolhidas();
        baixar(pacote, obras.length === 1 ? `relatorio-medicao-${obras[0].numero}.zip` : `relatorio-medicao-${formatarDataParaApi(data)}.zip`);
        this.notificacoes.success(obras.length === 1 ? `Pacote da obra ${obras[0].numero} gerado.` : `Pacote de ${obras.length} obras gerado.`);
      },
      error: async (e) => {
        this.gerando.set(false);
        this.notificacoes.error(await mensagemDeErroBlob(e));
      }
    });
  }

  /** Grava o orçado da planilha nas obras escolhidas que ainda não têm orçamento. */
  protected async gravarOrcado(): Promise<void> {
    const arquivo = this.arquivo();
    const obras = this.escolhidasSemOrcamento();
    if (!arquivo || !obras.length) return;
    const ok = await this.confirmacao.confirm({
      title: obras.length === 1 ? `Gravar o orçado na obra ${obras[0].numero}?` : `Gravar o orçado em ${obras.length} obras?`,
      message: 'A mão de obra e os materiais orçados da planilha viram a revisão nova do orçamento de cada obra e o valor previsto da carteira.',
      confirmLabel: 'Gravar orçamento'
    });
    if (!ok) return;
    const escolhidas = new Set(this.escolhidas().map((o) => o.idObra));
    this.gravandoOrcamento.set(true);
    this.api.gravarOrcadoDaPlanilha(arquivo, obras.map((o) => o.idObra)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (analise) => {
        this.gravandoOrcamento.set(false);
        this.analise.set(analise);
        this.escolhidas.set(analise.obras.filter((o) => escolhidas.has(o.idObra)));
        this.notificacoes.success(obras.length === 1 ? `Orçamento gravado na obra ${obras[0].numero}.` : `Orçamento gravado em ${obras.length} obras.`);
      },
      error: (e) => {
        this.gravandoOrcamento.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected baixarModelo(): void {
    this.baixandoModelo.set(true);
    this.api.modeloOrcadoFaturado().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (modelo) => {
        this.baixandoModelo.set(false);
        baixar(modelo, 'modelo-orcado-faturado.xlsx');
      },
      error: (e) => {
        this.baixandoModelo.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected situacaoDe(o: ObraNaPlanilha) {
    return situacaoNaPlanilha(o);
  }

  /** Até cinco mensagens; o resto vira contagem. */
  protected primeiros(mensagens: readonly string[]): string {
    const resto = mensagens.length - 5;
    return mensagens.slice(0, 5).join(' · ') + (resto > 0 ? ` · e mais ${resto}` : '');
  }
}

/** O relatório usa o orçamento gravado na obra; sem ele, o orçado da planilha. */
function orcadoUsado(o: ObraNaPlanilha): number {
  return o.revisaoOrcamento ? (o.orcamentoGravadoMaoDeObra ?? 0) : o.orcadoMaoDeObra;
}

function baixar(arquivo: Blob, nome: string): void {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

/** O erro de uma resposta em Blob traz o Problem Details dentro dele. */
async function mensagemDeErroBlob(erro: unknown): Promise<string> {
  const corpo = (erro as { error?: unknown })?.error;
  if (corpo instanceof Blob) {
    try {
      const json = JSON.parse(await corpo.text());
      return json.detail || json.title || getErrorMessage(erro);
    } catch {
      // não era JSON
    }
  }
  return getErrorMessage(erro);
}
