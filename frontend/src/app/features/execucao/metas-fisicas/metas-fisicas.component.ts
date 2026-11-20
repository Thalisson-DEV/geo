import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { TipoServicoResponse } from '../../../core/models/execucao.models';
import {
  MetaFisicaRequest,
  MetaFisicaResponse,
  competenciaAtual,
  deslocarCompetencia,
  diasUteisDoMes,
  distribuirPeloParcial,
  nomeMes,
  nomeServico,
  rotuloTipoServico
} from '../../../core/models/meta-fisica.models';
import { formatarDataCurta } from '../../../core/models/meta-faturamento.models';
import { BaseOperacionalResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ExecucaoService } from '../../../core/services/execucao.service';
import { MetasFisicasService } from '../../../core/services/metas-fisicas.service';
import { RhService } from '../../../core/services/rh.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { OPCOES_STATUS, dataIso, dataLocal, paginaPadrao } from '../../../shared/listagem/listagem';
import { AJUSTE_TEXTO_LISTAGEM } from '../../obras/obras-ui';

type Modo = 'MENSAL' | 'PARCIAL';

interface LinhaServico {
  readonly chave: number;
  idTipoServico: string | null;
  /** Meta do mês (modo mensal) ou parcial da Concessionária (modo parcial). */
  valor: number | null;
}

/** Serviços que a Concessionária cobra na meta física, sugeridos numa meta nova. */
const SERVICOS_PADRAO = ['CORTE', 'ENLACE', 'BAIXA ADM'];
const MESES_ANTES = 12;
const MESES_DEPOIS = 6;
const NUMERO = new Intl.NumberFormat('pt-BR');
const DECIMAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toUpperCase();
}

function plural(n: number, um: string, varios: string): string {
  return `${NUMERO.format(n)} ${n === 1 ? um : varios}`;
}

@Component({
  selector: 'app-metas-fisicas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AjudaListagemComponent
  ],
  styleUrls: ['../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao.css', './metas-fisicas.component.css'],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Meta física"
        icon="pi pi-bullseye"
        [breadcrumb]="[{ label: 'Comercial' }, { label: 'Meta física' }]"
        description="Quantas notas de cada serviço cada base deve executar no mês, como a Concessionária define."
        helpLabel="Ajuda sobre a meta física"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-chart-bar" variant="secondary" label="Abrir painel" (pressed)="abrirPainel()"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Nova meta" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="execucao-metas-fisicas" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Base operacional" [options]="basesOpcoes()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Mês" [options]="mesesOpcoes()" [(value)]="lista.filters.competencia" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Tipo de serviço" [options]="tiposOpcoes()" [(value)]="lista.filters.idTipoServico" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table [textFit]="ajusteTexto"
        title="Metas"
        mode="server"
        storageKey="execucao-metas-fisicas"
        searchPlaceholder="Base ou descrição"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Nova meta"
        noResultsTitle="Nenhuma meta encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as metas' : 'Nenhuma meta física cadastrada'"
        [stateDescription]="resultado.error() ?? 'Cadastre a meta do mês de cada base com as quantidades de corte, enlace e baixa que a Concessionária enviou.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template geoCell="base" let-row>
          <span class="geo-cell-strong">{{ row.baseOperacional ?? 'Base não encontrada' }}</span>
          <span class="geo-cell-muted">{{ origem(row) }}</span>
        </ng-template>
        <ng-template geoCell="competencia" let-row>
          <span class="geo-cell-strong">{{ nomeMes(row.competencia) }}</span>
          <span class="geo-cell-muted">{{ row.diasUteis }} dias úteis</span>
        </ng-template>
        <ng-template geoCell="total" let-row>
          <span class="geo-cell-strong">{{ plural(row.total, 'nota', 'notas') }}</span>
          <span class="geo-cell-muted">{{ decimal(row.porDiaUtil) }} por dia útil</span>
        </ng-template>
        <ng-template geoCell="servicos" let-row>
          <ul class="mf-chips" [attr.aria-label]="'Serviços da meta de ' + (row.baseOperacional ?? 'base')">
            @for (s of row.servicos; track s.idTipoServico) {
              <li [title]="rotuloTipo(s.codigoTipoServico, s.tipoServico) + ': ' + decimal(s.porDiaUtil) + ' por dia útil'">
                <i class="pi pi-tag" aria-hidden="true"></i>{{ nomeServico(s.tipoServico) }} <strong>{{ numero(s.quantidade) }}</strong>
              </li>
            }
          </ul>
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativa' : 'Inativa' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <geo-icon-button icon="pi pi-copy" [label]="'Repetir a meta de ' + (row.baseOperacional ?? 'base') + ' em outro mês'" tooltip="Repetir em outro mês"
            size="icon-sm" (pressed)="repetir(row)"></geo-icon-button>
          <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar meta de ' : 'Reativar meta de ') + (row.baseOperacional ?? 'base')"
            size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar meta física' : 'Nova meta física'"
      [description]="emEdicao() ? (emEdicao()!.baseOperacional ?? '') + ' · ' + nomeMes(emEdicao()!.competencia) : 'Notas de cada serviço que a base deve executar no mês.'"
      [dirty]="alterado()" size="md">
      <div class="ns">
        <section class="ns-secao" aria-labelledby="mf-base">
          <h3 id="mf-base" class="ns-secao__titulo"><i class="pi pi-building" aria-hidden="true"></i>Base e mês</h3>
          <div class="ns-cartao">
            @if (emEdicao()) {
              <geo-callout tone="info">Base e mês não mudam. Para outro mês, use "Repetir em outro mês" na lista.</geo-callout>
            }
            <div class="ns-grade">
              <geo-select label="Base operacional" [required]="true" [options]="basesOpcoes()" [(value)]="idBase" [filter]="true"
                [readonly]="!!emEdicao()" placeholder="Escolha a base" [error]="erro('base')"></geo-select>
              <geo-select label="Mês" [required]="true" [options]="mesesFormulario()" [value]="competencia()" (valueChange)="trocarMes($event)"
                [readonly]="!!emEdicao()" [error]="erro('mes')"></geo-select>
            </div>
            <geo-text-input label="Descrição" [(value)]="descricao" [maxlength]="200" [showOptional]="true" placeholder="Ex.: Meta enviada no e-mail de 13/11"></geo-text-input>
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="mf-origem">
          <h3 id="mf-origem" class="ns-secao__titulo"><i class="pi pi-envelope" aria-hidden="true"></i>Como a Concessionária enviou</h3>
          <div class="ns-cartao">
            <div class="ns-pilulas" role="radiogroup" aria-labelledby="mf-origem">
              <button type="button" role="radio" class="ns-pilula" [attr.aria-checked]="modo() === 'PARCIAL'" (click)="trocarModo('PARCIAL')">
                <i class="pi pi-calculator" aria-hidden="true"></i>Total do mês e parcial por serviço
              </button>
              <button type="button" role="radio" class="ns-pilula" [attr.aria-checked]="modo() === 'MENSAL'" (click)="trocarModo('MENSAL')">
                <i class="pi pi-list-check" aria-hidden="true"></i>Meta do mês por serviço
              </button>
            </div>
            @if (modo() === 'PARCIAL') {
              <p class="ns-info"><i class="pi pi-info-circle" aria-hidden="true"></i><span>A meta do mês de cada serviço é o total repartido na proporção do parcial. A soma fecha exatamente com o total.</span></p>
              <div class="ns-grade">
                <geo-number-input label="Total de notas do mês" [min]="1" [maxFractionDigits]="0" [required]="true" [(value)]="totalMes"
                  placeholder="Ex.: 626" [error]="erro('total')"></geo-number-input>
                <geo-datepicker label="Parcial calculado até" [value]="parcialAte()" (valueChange)="parcialAte.set($event)" [showOptional]="true"
                  [minDate]="inicioDoMes()" [maxDate]="fimDoMes()" [clearable]="true"></geo-datepicker>
              </div>
            } @else {
              <p class="ns-info"><i class="pi pi-info-circle" aria-hidden="true"></i><span>Informe direto quantas notas de cada serviço a base deve executar no mês.</span></p>
            }
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="mf-servicos">
          <div class="ns-secao__topo">
            <h3 id="mf-servicos" class="ns-secao__titulo"><i class="pi pi-tags" aria-hidden="true"></i>Serviços</h3>
            <span class="ns-secao__dica">Cada nota produtiva conta uma vez, pelo tipo de serviço da nota</span>
          </div>
          @if (!linhas().length) {
            <div class="ns-vazio" [class.ns-vazio--erro]="!!erro('servicos')">
              <i class="pi pi-tags" aria-hidden="true"></i>
              <span>Nenhum serviço na meta. Inclua corte, enlace, baixa ou outro tipo cobrado pela Concessionária.</span>
            </div>
          } @else {
            <ul class="ns-lista">
              @for (linha of linhas(); track linha.chave; let i = $index) {
                <li class="mf-linha">
                  <geo-select [label]="i === 0 ? 'Tipo de serviço' : 'Tipo de serviço da linha ' + (i + 1)" [labelVisible]="i === 0" [options]="tiposDaLinha(i)" [value]="linha.idTipoServico"
                    (valueChange)="alterar(i, { idTipoServico: $event })" [filter]="true" placeholder="Escolha o tipo" [loading]="carregandoTipos()"
                    [error]="erroLinha(i, 'tipo')"></geo-select>
                  <geo-number-input [label]="modo() === 'PARCIAL' ? 'Parcial da Concessionária' : 'Meta do mês'" [labelVisible]="i === 0" [min]="0" [maxFractionDigits]="0"
                    [value]="linha.valor" (valueChange)="alterar(i, { valor: $event })" [placeholder]="modo() === 'PARCIAL' ? 'Ex.: 215' : 'Ex.: 528'"
                    [error]="erroLinha(i, 'valor')"></geo-number-input>
                  <geo-icon-button class="mf-linha__remover" icon="pi pi-trash" [label]="'Tirar o serviço ' + (i + 1) + ' da meta'" tooltip="Tirar da meta" size="icon-sm"
                    (pressed)="remover(i)"></geo-icon-button>
                  @if (resultadoLinha(i); as r) {
                    <p class="mf-linha__resultado"><i class="pi pi-arrow-right" aria-hidden="true"></i><span>{{ r }}</span></p>
                  }
                </li>
              }
            </ul>
          }
          <div>
            <geo-button label="Incluir serviço" icon="pi pi-plus" variant="outline" size="sm" [disabled]="!podeIncluir()" (pressed)="incluir()"></geo-button>
          </div>
        </section>

        @if (distribuicao(); as d) {
          <section class="ns-secao" aria-labelledby="mf-distribuicao">
            <div class="ns-secao__topo">
              <h3 id="mf-distribuicao" class="ns-secao__titulo"><i class="pi pi-calendar" aria-hidden="true"></i>Distribuição no mês</h3>
              <span class="ns-secao__dica">{{ nomeMes(competencia()!) }} · {{ d.diasUteis }} dias úteis</span>
            </div>
            <div class="mf-distribuicao">
              <div class="mf-distribuicao__total">
                <span>Meta do mês</span>
                <strong>{{ plural(d.total, 'nota', 'notas') }}</strong>
                <span>{{ decimal(d.porDia) }} por dia útil</span>
              </div>
              <table class="mf-tabela">
                <caption class="mf-sr">Meta do mês e por dia útil de cada serviço</caption>
                <thead>
                  <tr><th scope="col">Serviço</th><th scope="col" class="mf-num">No mês</th><th scope="col" class="mf-num">Por dia útil</th><th scope="col" class="mf-num">Fatia</th></tr>
                </thead>
                <tbody>
                  @for (s of d.servicos; track s.chave) {
                    <tr>
                      <th scope="row">{{ s.nome }}</th>
                      <td class="mf-num">{{ numero(s.quantidade) }}</td>
                      <td class="mf-num">{{ decimal(s.porDia) }}</td>
                      <td class="mf-num">{{ s.fatia }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (erroServidor(); as mensagem) {
          <geo-callout tone="danger" title="Não foi possível salvar">{{ mensagem }}</geo-callout>
        }
      </div>
      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo">
          @if (distribuicao(); as d) {
            <strong>{{ plural(d.total, 'nota', 'notas') }}</strong> em {{ plural(d.servicos.length, 'serviço', 'serviços') }}
          } @else {
            Preencha os serviços para ver a meta do mês
          }
        </span>
        <div class="ns-rodape__acoes">
          <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
          <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar meta'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        </div>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda titulo="Meta física" artigoPlural="as" entidadePlural="metas" busca="base ou descrição" rotuloNovo="Nova meta">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-bullseye"></i> O que conta para a meta</h4>
        <p class="help-text-desc">Cada nota concluída conta uma vez, pelo tipo de serviço informado no lançamento, para a base da equipe que a lançou. Os serviços executados dentro da nota não somam mais de uma vez. Só contam notas com serviço produtivo: a nota em que todos os serviços são improdutivos (serviço não efetuado por falta de acesso, defeito técnico ou não executado) fica de fora. Para marcar ou desmarcar um serviço como improdutivo, use Financeiro › Cadastros › Ações.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calculator"></i> Total do mês e parcial</h4>
        <p class="help-text-desc">Quando a Concessionária envia o total do mês da base e só o parcial por serviço até uma data, escolha "Total do mês e parcial por serviço". A meta de cada serviço é o total repartido na proporção do parcial: 626 com parcial de 215, 28 e 12 vira 528, 69 e 29.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calendar"></i> Dias úteis</h4>
        <p class="help-text-desc">A meta do mês é distribuída pelos dias úteis (segunda a sexta, sem feriados nacionais). O painel compara o realizado com o esperado até o último dia útil encerrado e mostra quantas notas por dia faltam para fechar o mês.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-copy"></i> Mês seguinte</h4>
        <p class="help-text-desc">Cada mês tem sua meta. Use "Repetir em outro mês" para começar a meta nova com os serviços da atual e ajustar os números.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class MetasFisicasComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly metas = inject(MetasFisicasService);
  private readonly execucao = inject(ExecucaoService);
  private readonly rh = inject(RhService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly nomeMes = nomeMes;
  protected readonly nomeServico = nomeServico;
  protected readonly rotuloTipo = rotuloTipoServico;
  protected readonly plural = plural;

  protected readonly bases = signal<BaseOperacionalResponse[]>([]);
  protected readonly tipos = signal<TipoServicoResponse[]>([]);
  protected readonly carregandoTipos = signal(true);
  protected readonly basesOpcoes = computed(() => this.bases().map((b) => ({ label: b.nome, value: b.id })));
  protected readonly tiposOpcoes = computed<GeoSelectOption<string>[]>(() =>
    this.tipos().map((t) => ({ label: rotuloTipoServico(t.codigo, t.descricao), value: t.id }))
  );
  protected readonly mesesOpcoes = computed<GeoSelectOption<string>[]>(() => {
    const atual = competenciaAtual();
    const opcoes: GeoSelectOption<string>[] = [];
    for (let i = MESES_DEPOIS; i >= -MESES_ANTES; i--) {
      const comp = deslocarCompetencia(atual, i);
      opcoes.push({ label: nomeMes(comp) + (i === 0 ? ' · atual' : ''), value: comp });
    }
    return opcoes;
  });
  protected readonly mesesFormulario = computed(() => {
    const escolhido = this.competencia();
    const opcoes = this.mesesOpcoes();
    return escolhido && !opcoes.some((o) => o.value === escolhido) ? [{ label: nomeMes(escolhido), value: escolhido }, ...opcoes] : opcoes;
  });

  protected readonly lista = geoListState({
    storageKey: 'execucao-metas-fisicas',
    filters: {
      idBaseOperacional: geoFilter.value<string | null>(null, {
        label: 'Base',
        param: 'base',
        format: (id): string | null => (id ? (this.bases().find((b) => b.id === id)?.nome ?? 'selecionada') : null)
      }),
      competencia: geoFilter.value<string | null>(null, { label: 'Mês', param: 'mes', format: (c): string | null => (c ? nomeMes(c) : null) }),
      idTipoServico: geoFilter.value<string | null>(null, {
        label: 'Serviço',
        param: 'servico',
        format: (id): string | null => (id ? (this.tipos().find((t) => t.id === id)?.descricao ?? 'selecionado') : null)
      }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'competencia', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<MetaFisicaResponse>(
    (pedido) => {
      const { filters, query } = this.lista.request();
      return this.metas.listar({ ...filters, buscaGlobal: query || null, ...paginaPadrao(pedido) });
    },
    { errorMessage: getErrorMessage }
  );

  protected readonly colunas: GeoDataTableColumn<MetaFisicaResponse>[] = [
    { key: 'base', header: 'Base', type: 'custom', priority: 1, value: (m) => m.baseOperacional, display: (m) => m.baseOperacional ?? '—' },
    { key: 'competencia', header: 'Mês', type: 'custom', priority: 1, sortField: 'competencia', value: (m) => m.competencia, display: (m) => nomeMes(m.competencia) },
    { key: 'total', header: 'Meta do mês', type: 'custom', priority: 1, value: (m) => m.total, display: (m) => plural(m.total, 'nota', 'notas') },
    {
      key: 'servicos',
      header: 'Serviços',
      type: 'custom',
      value: (m) => m.servicos.length,
      display: (m) => m.servicos.map((s) => `${nomeServico(s.tipoServico)} ${s.quantidade}`).join(' · ')
    },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativa' : 'Inativa') }
  ];
  protected readonly rotulo = (m: MetaFisicaResponse) => `${m.baseOperacional ?? 'Meta'} · ${nomeMes(m.competencia)}`;

  // Formulário
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<MetaFisicaResponse | null>(null);
  protected readonly idBase = signal<string | null>(null);
  protected readonly competencia = signal<string | null>(null);
  protected readonly descricao = signal('');
  protected readonly modo = signal<Modo>('PARCIAL');
  protected readonly totalMes = signal<number | null>(null);
  protected readonly parcialAte = signal<Date | null>(null);
  protected readonly linhas = signal<LinhaServico[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erroServidor = signal<string | null>(null);
  private readonly tentouSalvar = signal(false);
  private readonly fotografia = signal('');
  private proximaChave = 1;

  protected readonly inicioDoMes = computed(() => {
    const c = this.competencia();
    return c ? dataLocal(`${c}-01`) : null;
  });
  protected readonly fimDoMes = computed(() => {
    const c = this.competencia();
    if (!c) return null;
    const [ano, mes] = c.split('-').map(Number);
    return new Date(ano, mes, 0, 12);
  });

  /** Quantidade do mês de cada linha: a informada ou a repartida pelo parcial. */
  private readonly quantidades = computed<(number | null)[]>(() => {
    const linhas = this.linhas();
    if (this.modo() === 'MENSAL') return linhas.map((l) => (l.valor == null || l.valor < 0 ? null : l.valor));
    const repartido = distribuirPeloParcial(this.totalMes(), linhas.map((l) => l.valor));
    return repartido ?? linhas.map(() => null);
  });

  protected readonly distribuicao = computed(() => {
    const comp = this.competencia();
    const linhas = this.linhas();
    const qtd = this.quantidades();
    if (!comp || !linhas.length || qtd.some((q) => q == null)) return null;
    const total = (qtd as number[]).reduce((t, q) => t + q, 0);
    if (total <= 0) return null;
    const diasUteis = diasUteisDoMes(comp);
    return {
      total,
      diasUteis,
      porDia: diasUteis ? total / diasUteis : null,
      servicos: linhas.map((l, i) => ({
        chave: l.chave,
        nome: this.nomeDoTipo(l.idTipoServico),
        quantidade: qtd[i]!,
        porDia: diasUteis ? qtd[i]! / diasUteis : null,
        fatia: DECIMAL.format((qtd[i]! / total) * 100)
      }))
    };
  });

  protected readonly podeIncluir = computed(() => this.linhas().length < this.tipos().length);
  protected readonly alterado = computed(() => this.formularioAberto() && this.estadoFormulario() !== this.fotografia());

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.idBase()) e['base'] = 'Escolha a base.';
    if (!this.competencia()) e['mes'] = 'Escolha o mês.';
    const linhas = this.linhas();
    if (!linhas.length) e['servicos'] = 'Inclua ao menos um serviço.';
    const vistos = new Set<string>();
    linhas.forEach((l, i) => {
      if (!l.idTipoServico) e[`tipo-${i}`] = 'Escolha o tipo.';
      else if (vistos.has(l.idTipoServico)) e[`tipo-${i}`] = 'Tipo repetido.';
      else vistos.add(l.idTipoServico);
      if (l.valor == null || l.valor < 0) e[`valor-${i}`] = this.modo() === 'PARCIAL' ? 'Informe o parcial (0 ou mais).' : 'Informe a meta (0 ou mais).';
    });
    const soma = linhas.reduce((t, l) => t + (l.valor ?? 0), 0);
    if (this.modo() === 'PARCIAL') {
      const total = this.totalMes();
      if (!total || total <= 0) e['total'] = 'Informe o total do mês.';
      if (linhas.length && soma <= 0 && !Object.keys(e).some((k) => k.startsWith('valor-'))) e['valor-0'] = 'A soma dos parciais precisa ser maior que zero.';
    } else if (linhas.length && soma <= 0 && !Object.keys(e).some((k) => k.startsWith('valor-'))) {
      e['valor-0'] = 'A meta precisa ter ao menos uma nota.';
    }
    return e;
  });

  constructor() {
    this.rh.listarBasesOperacionaisAtivas().subscribe({ next: (r) => this.bases.set(r.content), error: () => undefined });
    this.execucao.listarOpcoesTiposServico().subscribe({
      next: (tipos) => {
        this.tipos.set(tipos);
        this.carregandoTipos.set(false);
      },
      error: (e) => {
        this.carregandoTipos.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected numero(n: number | null | undefined): string {
    return n == null || n === undefined ? '—' : NUMERO.format(n);
  }

  protected decimal(n: number | null | undefined): string {
    return n == null || n === undefined ? '—' : DECIMAL.format(n);
  }

  protected origem(m: MetaFisicaResponse): string {
    if (m.totalMesConcessionária) {
      const ate = m.parcialAte ? ` até ${formatarDataCurta(m.parcialAte).slice(0, 5)}` : '';
      return `Total ${NUMERO.format(m.totalMesConcessionária)} repartido pelo parcial${ate}`;
    }
    return m.descricao ?? 'Meta do mês por serviço';
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected erroLinha(i: number, campo: 'tipo' | 'valor'): string | undefined {
    return this.erro(`${campo}-${i}`);
  }

  /** Opções da linha: os tipos ativos que ainda não estão em outra linha (mais o da própria). */
  protected tiposDaLinha(i: number): GeoSelectOption<string>[] {
    const usados = new Set(this.linhas().filter((_, j) => j !== i).map((l) => l.idTipoServico));
    const atual = this.linhas()[i]?.idTipoServico;
    const opcoes = this.tiposOpcoes().filter((o) => !usados.has(o.value));
    const servico = this.emEdicao()?.servicos.find((s) => s.idTipoServico === atual);
    return atual && !opcoes.some((o) => o.value === atual)
      ? [{ label: rotuloTipoServico(servico?.codigoTipoServico, servico?.tipoServico), value: atual }, ...opcoes]
      : opcoes;
  }

  protected resultadoLinha(i: number): string | null {
    const comp = this.competencia();
    const qtd = this.quantidades()[i];
    if (!comp || qtd == null || qtd === undefined) return null;
    const dias = diasUteisDoMes(comp);
    const porDia = dias ? ` · ${DECIMAL.format(qtd / dias)} por dia útil` : '';
    return this.modo() === 'PARCIAL' ? `${plural(qtd, 'nota', 'notas')} no mês${porDia}` : `${DECIMAL.format(dias ? qtd / dias : 0)} por dia útil`;
  }

  protected novo(): void {
    this.prepararNovo(null, competenciaAtual());
    this.linhas.set(this.linhasPadrao());
    this.abrir();
  }

  /** Nova meta para outro mês com os serviços e números da meta escolhida. */
  protected repetir(meta: MetaFisicaResponse): void {
    const atual = competenciaAtual();
    const seguinte = deslocarCompetencia(meta.competencia, 1);
    this.prepararNovo(meta.idBaseOperacional, seguinte > atual ? seguinte : atual);
    this.modo.set('MENSAL');
    this.linhas.set(meta.servicos.map((s) => ({ chave: this.proximaChave++, idTipoServico: s.idTipoServico, valor: s.quantidade })));
    this.descricao.set('');
    this.abrir();
  }

  protected editar(meta: MetaFisicaResponse): void {
    if (!meta.ativo) {
      this.notificacoes.show({ variant: 'info', title: 'Meta inativa', message: 'Reative a meta para editá-la.' });
      return;
    }
    this.emEdicao.set(meta);
    this.idBase.set(meta.idBaseOperacional);
    this.competencia.set(meta.competencia);
    this.descricao.set(meta.descricao ?? '');
    const parcial = meta.totalMesConcessionária != null;
    this.modo.set(parcial ? 'PARCIAL' : 'MENSAL');
    this.totalMes.set(meta.totalMesConcessionária);
    this.parcialAte.set(dataLocal(meta.parcialAte));
    this.linhas.set(
      meta.servicos.map((s) => ({ chave: this.proximaChave++, idTipoServico: s.idTipoServico, valor: parcial ? s.parcialConcessionária : s.quantidade }))
    );
    this.abrir();
  }

  private prepararNovo(idBase: string | null, comp: string): void {
    this.emEdicao.set(null);
    this.idBase.set(idBase);
    this.competencia.set(comp);
    this.descricao.set('');
    this.modo.set('PARCIAL');
    this.totalMes.set(null);
    this.parcialAte.set(comp === competenciaAtual() ? new Date() : null);
  }

  private linhasPadrao(): LinhaServico[] {
    const tipos = this.tipos();
    const escolhidos = SERVICOS_PADRAO.map((nome) => tipos.find((t) => normalizar(t.descricao) === nome)).filter(
      (t): t is TipoServicoResponse => !!t
    );
    return escolhidos.length
      ? escolhidos.map((t) => ({ chave: this.proximaChave++, idTipoServico: t.id, valor: null }))
      : [{ chave: this.proximaChave++, idTipoServico: null, valor: null }];
  }

  private abrir(): void {
    this.tentouSalvar.set(false);
    this.erroServidor.set(null);
    this.fotografia.set(this.estadoFormulario());
    this.formularioAberto.set(true);
  }

  protected trocarMes(comp: string | null): void {
    this.competencia.set(comp);
    const data = this.parcialAte();
    if (comp && data && dataIso(data)?.slice(0, 7) !== comp) this.parcialAte.set(null);
  }

  /** Ao trocar a forma, os números da outra forma viram o ponto de partida (meta do mês calculada). */
  protected trocarModo(modo: Modo): void {
    if (modo === this.modo()) return;
    if (modo === 'MENSAL') {
      const qtd = this.quantidades();
      this.linhas.update((ls) => ls.map((l, i) => ({ ...l, valor: qtd[i] ?? null })));
    } else {
      this.linhas.update((ls) => ls.map((l) => ({ ...l, valor: null })));
    }
    this.modo.set(modo);
  }

  protected alterar(i: number, mudanca: Partial<Omit<LinhaServico, 'chave'>>): void {
    this.linhas.update((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));
  }

  protected incluir(): void {
    this.linhas.update((ls) => [...ls, { chave: this.proximaChave++, idTipoServico: null, valor: null }]);
  }

  protected remover(i: number): void {
    this.linhas.update((ls) => ls.filter((_, j) => j !== i));
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const parcial = this.modo() === 'PARCIAL';
    const request: MetaFisicaRequest = {
      idBaseOperacional: this.idBase()!,
      competencia: this.competencia()!,
      totalMesConcessionária: parcial ? this.totalMes() : null,
      parcialAte: parcial ? dataIso(this.parcialAte()) : null,
      descricao: this.descricao().trim() || null,
      servicos: this.linhas().map((l) => ({
        idTipoServico: l.idTipoServico!,
        quantidade: parcial ? null : l.valor,
        parcialConcessionária: parcial ? l.valor : null
      }))
    };
    const atual = this.emEdicao();
    this.salvando.set(true);
    this.erroServidor.set(null);
    const pedido: Observable<MetaFisicaResponse | null> = atual ? this.metas.atualizar(atual.id, request) : this.metas.criar(request);
    pedido.subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(
          salvo == null
            ? 'Sem conexão: a meta será enviada quando a internet voltar.'
            : `${atual ? 'Meta atualizada' : 'Meta cadastrada'}: ${salvo.baseOperacional ?? 'base'}, ${nomeMes(salvo.competencia).toLowerCase()}, ${plural(salvo.total, 'nota', 'notas')}.`
        );
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.erroServidor.set(getErrorMessage(e));
      }
    });
  }

  protected async alternar(meta: MetaFisicaResponse): Promise<void> {
    const desativar = meta.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar meta física' : 'Reativar meta física',
      message: desativar
        ? `A meta de ${meta.baseOperacional ?? 'base'} em ${nomeMes(meta.competencia).toLowerCase()} sai do painel, mas continua listada e pode ser reativada.`
        : `A meta de ${meta.baseOperacional ?? 'base'} em ${nomeMes(meta.competencia).toLowerCase()} volta a valer no painel.`,
      confirmLabel: desativar ? 'Desativar' : 'Reativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.metas.desativar(meta.id) : this.metas.ativar(meta.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Meta desativada.' : 'Meta reativada.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirPainel(): void {
    const mes = this.lista.filters.competencia();
    void this.router.navigate(['/execucao/dashboard-meta-fisica'], { queryParams: mes ? { mes } : {} });
  }

  private nomeDoTipo(id: string | null): string {
    if (!id) return 'Tipo não escolhido';
    const tipo = this.tipos().find((t) => t.id === id);
    const servico = this.emEdicao()?.servicos.find((s) => s.idTipoServico === id);
    return nomeServico(tipo?.descricao ?? servico?.tipoServico);
  }

  private estadoFormulario(): string {
    return JSON.stringify([
      this.idBase(),
      this.competencia(),
      this.descricao(),
      this.modo(),
      this.totalMes(),
      dataIso(this.parcialAte()),
      this.linhas().map((l) => [l.idTipoServico, l.valor])
    ]);
  }
}
