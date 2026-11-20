import { GEO_STATUS_ICONE_PADRAO } from '@geo/ui';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDrawerComponent,
  GeoFilterPanelComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { Observable, finalize } from 'rxjs';

import {
  AcaoGovernancaResumo,
  CelulaMatrizTreinamento,
  CorpoGovernancaResumo,
  DashboardGovernanca,
  DocumentoGovernancaResumo,
  ItemAtencaoGovernanca,
  ReuniaoGovernancaResumo,
  TipoCorpoGovernanca
} from '../../../core/models/governanca-sst.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { GovernancaSstService } from '../../../core/services/governanca-sst.service';
import { RhService } from '../../../core/services/rh.service';
import { FileDownloadUtil } from '../../../core/utils/file-download.util';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { GovernancaContextoComponent } from './governanca-contexto.component';
import { GovernancaContextoState, normalizarTipoGovernanca } from './governanca-state';

type Secao = 'painel' | 'composicoes' | 'reunioes' | 'documentos' | 'treinamentos' | 'acoes';
// Linhas das cinco seções numa tabela só (corpos, reuniões, documentos, matriz, ações): cada seção lê os próprios campos.
type Linha = Partial<CorpoGovernancaResumo> & Partial<ReuniaoGovernancaResumo> & Partial<DocumentoGovernancaResumo> &
  Partial<CelulaMatrizTreinamento> & Partial<AcaoGovernancaResumo> & { id: string };

const STATUS_POR_SECAO: Record<Secao, string[]> = {
  painel: [],
  composicoes: ['EM_PREPARACAO', 'ATIVO', 'ENCERRADO'],
  reunioes: ['AGENDADA', 'EM_REALIZACAO', 'AGUARDANDO_ATA', 'AGUARDANDO_ASSINATURAS', 'FINALIZADA', 'CANCELADA'],
  documentos: ['VIGENTE', 'A_VENCER', 'VENCIDO', 'SEM_VALIDADE'],
  treinamentos: ['REGULAR', 'A_VENCER', 'VENCIDO', 'AUSENTE', 'INCOMPATIVEL'],
  acoes: ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']
};
const ROTULOS: Record<string, string> = {
  EM_PREPARACAO: 'Em preparação', ATIVO: 'Ativo', ENCERRADO: 'Encerrado', AGENDADA: 'Agendada', EM_REALIZACAO: 'Em andamento',
  AGUARDANDO_ATA: 'Ata pendente', AGUARDANDO_ASSINATURAS: 'Aguardando assinaturas', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada',
  ORDINARIA: 'Ordinária', EXTRAORDINARIA: 'Extraordinária', SIMULADO: 'Simulado', OUTRO: 'Outro', VIGENTE: 'Vigente', A_VENCER: 'A vencer',
  VENCIDO: 'Vencido', SEM_VALIDADE: 'Sem validade', PENDING_REVIEW: 'Aguardando conferência', APPROVED: 'Conferido', REJECTED: 'Rejeitado',
  REGULAR: 'Regular', AUSENTE: 'Certificado ausente', INCOMPATIVEL: 'Incompatível', CONTEXTO_PENDENTE: 'Contexto pendente', ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica',
  CORRETIVA: 'Corretiva', PREVENTIVA: 'Preventiva', INSPECAO: 'Inspeção'
};
const SUCESSO = ['ATIVO', 'VIGENTE', 'REGULAR', 'CONCLUIDA', 'FINALIZADA', 'APPROVED'];
const PERIGO = ['VENCIDO', 'VENCIDA', 'INCOMPATIVEL', 'REJECTED', 'CANCELADA'];
const ATENCAO = ['A_VENCER', 'PENDING_REVIEW', 'AGUARDANDO_ATA', 'AGUARDANDO_ASSINATURAS', 'AUSENTE', 'CONTEXTO_PENDENTE'];

export function rotuloGovernanca(valor?: string | null): string {
  if (!valor) return 'Não informado';
  return ROTULOS[valor] ?? valor.replaceAll('_', ' ').toLocaleLowerCase('pt-BR').replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'));
}

export function tomGovernanca(valor?: string | null): GeoTone {
  if (!valor) return 'neutral';
  if (SUCESSO.includes(valor)) return 'success';
  if (PERIGO.includes(valor)) return 'danger';
  if (ATENCAO.includes(valor)) return 'warning';
  return 'info';
}

const ICONES: Record<string, string> = {
  EM_PREPARACAO: 'pi-pencil', ATIVO: 'pi-check-circle', ENCERRADO: 'pi-lock',
  AGENDADA: 'pi-calendar', EM_REALIZACAO: 'pi-play-circle', AGUARDANDO_ATA: 'pi-file-edit', AGUARDANDO_ASSINATURAS: 'pi-pen-to-square',
  FINALIZADA: 'pi-check-circle', CANCELADA: 'pi-ban',
  VIGENTE: 'pi-check-circle', A_VENCER: 'pi-clock', VENCIDO: 'pi-calendar-times', VENCIDA: 'pi-calendar-times', SEM_VALIDADE: 'pi-minus-circle',
  PENDING_REVIEW: 'pi-search', APPROVED: 'pi-verified', REJECTED: 'pi-times-circle',
  REGULAR: 'pi-check-circle', AUSENTE: 'pi-exclamation-circle', INCOMPATIVEL: 'pi-times-circle', CONTEXTO_PENDENTE: 'pi-question-circle',
  ABERTA: 'pi-inbox', EM_ANDAMENTO: 'pi-play-circle', CONCLUIDA: 'pi-check-circle'
};

/** Ícone da situação; valores sem ícone próprio caem no ícone do tom. */
export function iconeGovernanca(valor?: string | null): string {
  return (valor && ICONES[valor]) || GEO_STATUS_ICONE_PADRAO[tomGovernanca(valor)];
}

const dataBr = (iso?: string | null) => (iso ? new Date(`${iso.substring(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '');

/**
 * Governança de SST (CIPA ou Brigada): painel de pendências e as listagens de composições,
 * reuniões, documentos, matriz de treinamentos e ações. Cada seção é uma rota; o grupo
 * (CIPA/Brigada) vem do seletor de contexto e nunca mistura registros dos dois.
 */
@Component({
  selector: 'app-governanca-sst',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoStatusComponent,
    GovernancaContextoComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeAdicionar()" (newRequested)="adicionar()">
      <geo-page-header [title]="titulo()" icon="pi pi-shield" [breadcrumb]="breadcrumb()" [description]="descricao()">
        @if (podeAdicionar()) {
          <geo-button actions icon="pi pi-plus" [label]="entidade()" [keyShortcut]="atalhos.newShortcut()" (pressed)="adicionar()"></geo-button>
        }
      </geo-page-header>

      <app-governanca-contexto [tipo]="tipo()" [secao]="secao" (tipoChange)="trocarTipo($event)" />

      <geo-filter-panel #painel [storageKey]="chave" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="secao === 'painel' ? carregandoPainel() : resultado.loading()" (applied)="aplicar()" (cleared)="limpar()" (chipRemoved)="remover($any($event))">
        <div class="geo-filter-grid">
          <geo-multiselect label="Bases operacionais" [options]="basesOpcoes()" [(value)]="lista.filters.bases" placeholder="Todas"></geo-multiselect>
          @if (statusOpcoes.length) {
            <geo-multiselect label="Situação" [options]="statusOpcoes" [(value)]="lista.filters.status" [filter]="false" placeholder="Todas"></geo-multiselect>
          }
          <geo-datepicker label="Período de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="periodo('from', $event)"></geo-datepicker>
          <geo-datepicker label="Período até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="periodo('to', $event)"></geo-datepicker>
        </div>
        <p class="geo-cell-muted">Mostra só {{ tipo() === 'CIPA' ? 'a CIPA' : 'a Brigada de incêndio' }}; para trocar de grupo, use o seletor acima.</p>
      </geo-filter-panel>

      @if (secao === 'painel') {
        @if (erroPainel()) {
          <geo-async-state state="error" title="Não foi possível carregar o painel" [description]="erroPainel()!" actionLabel="Tentar novamente" (action)="carregarPainel()"></geo-async-state>
        } @else if (carregandoPainel() && !dashboard()) {
          <geo-async-state state="loading" title="Calculando as pendências…"></geo-async-state>
        } @else {
          <section class="gov-painel" aria-label="Indicadores e pendências">
            <div class="gov-metricas">
              @for (m of metricas(); track m.secao) {
                <button type="button" class="gov-metrica" (click)="irPara(m.secao)">
                  <geo-status [tone]="m.tom" [icon]="m.icone">{{ m.rotulo }}</geo-status>
                  <strong>{{ m.valor }}</strong>
                </button>
              }
            </div>
            <div class="gov-atencao">
              <h3>O que precisa de atenção</h3>
              <span class="geo-cell-muted">Atualizado em {{ $safeNavigationMigration(dashboard()?.calculadoEm) | date: 'dd/MM/yyyy HH:mm' }}</span>
              @for (item of dashboard()?.atencao ?? []; track item.idRegistro) {
                <button type="button" class="gov-atencao__item" (click)="abrirAtencao(item)">
                  <geo-status [tone]="item.severidade === 'VENCIDO' ? 'danger' : 'warning'" [icon]="item.severidade === 'VENCIDO' ? 'pi-calendar-times' : 'pi-clock'">{{ item.severidade === 'VENCIDO' ? 'Vencido' : 'A vencer' }}</geo-status>
                  <span><strong>{{ item.titulo }}</strong>
                    <span class="geo-cell-muted">{{ rotulo(item.tipo) }}{{ item.prazo ? ' · prazo ' + (item.prazo | date: 'dd/MM/yyyy') : '' }}</span></span>
                  <i class="pi pi-angle-right" aria-hidden="true"></i>
                </button>
              } @empty {
                <geo-async-state state="empty" title="Nenhuma pendência neste recorte" description="Documentos, atas, treinamentos e ações estão em dia."></geo-async-state>
              }
            </div>
          </section>
        }
      } @else {
        <geo-data-table
          [title]="titulo()"
          mode="server"
          [storageKey]="chave"
          [searchPlaceholder]="tipo() === 'CIPA' ? 'Pesquisar nos registros da CIPA' : 'Pesquisar nos registros da Brigada'"
          [rowActionLabel]="acaoLinha()"
          [rowActionIcon]="secao === 'documentos' ? 'pi pi-download' : 'pi pi-arrow-right'"
          [emptyActionLabel]="podeAdicionar() ? entidade() : undefined"
          noResultsTitle="Nenhum registro encontrado com esse recorte."
          [columns]="colunas"
          [rows]="resultado.rows()"
          [totalRecords]="resultado.total()"
          [rowLabel]="rotuloLinha"
          [state]="resultado.state()"
          [stateTitle]="resultado.error() ? 'Não foi possível carregar os registros' : vazioTitulo()"
          [stateDescription]="resultado.error() ?? vazioDescricao()"
          [filtered]="lista.filtered()"
          [(page)]="lista.page"
          [(pageSize)]="lista.pageSize"
          [(sort)]="lista.sort"
          [(query)]="lista.query"
          (lazyLoad)="lista.load($event)"
          (adjustFilters)="painel.expandAndFocus()"
          (clearFilters)="limpar()"
          (emptyAction)="adicionar()"
          (rowActivate)="abrirLinha($event)"
        >
          <ng-template geoCell="principal" let-row>
            @switch (secao) {
              @case ('composicoes') {
                <span class="geo-cell-strong">{{ row.nome }}</span>
                <span class="geo-cell-muted">{{ tipo() === 'CIPA' ? (row.regimeComposicao === 'REPRESENTANTE_NOMEADO' ? 'Representante nomeado' : 'Comissão dimensionada') : 'Equipe de brigadistas' }}</span>
              }
              @case ('reunioes') {
                <span class="geo-cell-strong">{{ row.dataHora | date: 'dd/MM/yyyy HH:mm' }}</span>
                <span class="geo-cell-muted">{{ row.duracaoMinutos }} minutos · {{ rotulo(row.tipo) }}</span>
              }
              @case ('documentos') {
                <span class="geo-cell-strong">{{ row.categoriaNome }}</span>
                <span class="geo-cell-muted" [title]="row.nomeArquivo">{{ row.nomeArquivo }}</span>
              }
              @case ('treinamentos') {
                <span class="geo-cell-strong">{{ row.nomeColaborador }}</span>
                <span class="geo-cell-muted">{{ row.funcaoNome || row.papelCorpo || 'Função não informada' }}</span>
              }
              @default {
                <span class="geo-cell-strong">{{ row.titulo }}</span>
                <span class="geo-cell-muted" [title]="row.descricao">{{ row.descricao }}</span>
              }
            }
          </ng-template>
          <ng-template geoCell="situacao" let-row>
            <geo-status [tone]="tom(situacaoDe(row))" [icon]="icone(situacaoDe(row))">{{ rotulo(situacaoDe(row)) }}</geo-status>
            @if (secao === 'documentos') { <span class="geo-cell-muted">{{ rotulo(row.statusValidade) }}</span> }
          </ng-template>
          <ng-template geoCell="prioridade" let-row>
            <geo-status [tone]="row.prioridade === 'CRITICA' ? 'danger' : row.prioridade === 'ALTA' ? 'warning' : 'neutral'" icon="pi-flag">{{ rotulo(row.prioridade) }}</geo-status>
          </ng-template>
        </geo-data-table>
      }
    </div>

    <geo-drawer [visible]="!!detalheAcao()" (visibleChange)="!$event && detalheAcao.set(null)" title="Detalhes da ação" size="md">
      @if (detalheAcao(); as acao) {
        <p class="geo-cell-muted">{{ rotulo(acao.tipo) }}</p>
        <h3>{{ acao.titulo }}</h3>
        <p>{{ acao.descricao }}</p>
        <dl class="gov-detalhe">
          <div><dt>Responsável</dt><dd>{{ acao.responsavelNome || 'Responsável definido' }}</dd></div>
          <div><dt>Prazo</dt><dd>{{ acao.prazo | date: 'dd/MM/yyyy' }}</dd></div>
          <div><dt>Prioridade</dt><dd><geo-status [tone]="acao.prioridade === 'CRITICA' ? 'danger' : acao.prioridade === 'ALTA' ? 'warning' : 'neutral'" icon="pi-flag">{{ rotulo(acao.prioridade) }}</geo-status></dd></div>
          <div><dt>Situação</dt><dd><geo-status [tone]="tom(acao.status)" [icon]="icone(acao.status)">{{ rotulo(acao.status) }}</geo-status></dd></div>
        </dl>
        <geo-callout tone="info" icon="pi pi-link">Esta ação faz parte somente da {{ tipo() === 'CIPA' ? 'CIPA' : 'Brigada de incêndio' }} selecionada.</geo-callout>
      }
    </geo-drawer>
  `,
  styles: `
    .gov-painel { display: flex; flex-direction: column; gap: var(--geo-space-4, 1rem); }
    .gov-metricas { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--geo-space-3, 0.75rem); }
    .gov-metrica {
      display: flex; flex-direction: column; align-items: flex-start; gap: var(--geo-space-2, 0.5rem);
      padding: var(--geo-space-4, 1rem); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg, 0.75rem);
      background: var(--geo-surface); color: var(--geo-foreground); cursor: pointer; text-align: left;
    }
    .gov-metrica:hover, .gov-metrica:focus-visible { border-color: var(--geo-primary, currentColor); }
    .gov-metrica strong { font-size: 1.5rem; font-weight: 600; }
    .gov-atencao {
      display: flex; flex-direction: column; gap: var(--geo-space-2, 0.5rem); padding: var(--geo-space-4, 1rem);
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg, 0.75rem); background: var(--geo-surface);
    }
    .gov-atencao h3 { margin: 0; color: var(--geo-foreground); font-size: var(--geo-font-body); font-weight: 600; }
    .gov-atencao__item {
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--geo-space-3, 0.75rem);
      padding: var(--geo-space-2, 0.5rem) 0; border: 0; border-top: 1px solid var(--geo-border); background: none;
      color: var(--geo-foreground); cursor: pointer; text-align: left;
    }
    .gov-atencao__item > span { display: flex; flex-direction: column; }
    .gov-detalhe { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--geo-space-3, 0.75rem); margin: var(--geo-space-4, 1rem) 0; }
    .gov-detalhe dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .gov-detalhe dd { margin: 0; }
  `
})
export class GovernancaSstComponent {
  private readonly api = inject(GovernancaSstService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notificacoes = inject(NotificationService);
  private readonly contexto = inject(GovernancaContextoState);

  readonly secao = (this.route.snapshot.data['secao'] as Secao) || 'painel';
  protected readonly tipo = signal<TipoCorpoGovernanca>(
    normalizarTipoGovernanca(this.route.snapshot.queryParamMap.get('tipo')) ??
      normalizarTipoGovernanca(this.route.snapshot.data['tipoCorpo']) ??
      this.contexto.tipo()
  );
  protected readonly chave = `sst-governanca-${this.secao}`;
  protected readonly dataLocal = dataLocal;
  protected readonly rotulo = rotuloGovernanca;
  protected readonly tom = tomGovernanca;
  protected readonly icone = iconeGovernanca;
  protected readonly statusOpcoes: GeoSelectOption<string>[] = STATUS_POR_SECAO[this.secao].map((v) => ({ label: rotuloGovernanca(v), value: v }));
  private readonly bases = signal<{ id: string; nome: string }[]>([]);
  protected readonly basesOpcoes = computed<GeoSelectOption<string>[]>(() => this.bases().map((b) => ({ label: b.nome, value: b.id })));
  private readonly baixando = signal<string | null>(null);

  protected readonly lista = geoListState({
    storageKey: this.chave,
    filters: {
      bases: geoFilter.list<string>([], { label: 'Base', itemLabel: (id) => this.bases().find((b) => b.id === id)?.nome ?? 'base selecionada', countLabel: (n) => `${n} selecionadas` }),
      status: geoFilter.list<string>([], { label: 'Situação', itemLabel: (s) => rotuloGovernanca(s), countLabel: (n) => `${n} selecionadas` }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Período' })
    }
  });
  protected readonly resultado = this.lista.results<Linha>((pedido) => this.listar({ ...this.filtros(), page: pedido.page, size: pedido.size, sort: 'dataCriacao,desc' }), {
    errorMessage: getErrorMessage
  });

  // Painel
  protected readonly dashboard = signal<DashboardGovernanca | null>(null);
  protected readonly carregandoPainel = signal(false);
  protected readonly erroPainel = signal<string | null>(null);
  protected readonly metricas = computed(() => {
    const i = this.dashboard()?.indicadores;
    return [
      { secao: 'composicoes' as Secao, rotulo: 'Composições ativas', icone: 'pi-users', tom: 'info' as GeoTone, valor: i?.corposAtivos ?? 0 },
      { secao: 'reunioes' as Secao, rotulo: 'Atas pendentes', icone: 'pi-calendar', tom: 'warning' as GeoTone, valor: i?.reunioesPendentesAta ?? 0 },
      { secao: 'documentos' as Secao, rotulo: 'Documentos vencidos', icone: 'pi-file-excel', tom: 'danger' as GeoTone, valor: i?.documentosVencidos ?? 0 },
      { secao: 'treinamentos' as Secao, rotulo: 'Treinamentos pendentes', icone: 'pi-graduation-cap', tom: 'warning' as GeoTone, valor: i?.treinamentosIrregulares ?? 0 },
      { secao: 'acoes' as Secao, rotulo: 'Ações em atraso', icone: 'pi-check-square', tom: 'danger' as GeoTone, valor: i?.acoesVencidas ?? 0 }
    ];
  });
  protected readonly detalheAcao = signal<AcaoGovernancaResumo | null>(null);

  protected readonly colunas: GeoDataTableColumn<Linha>[] = this.colunasDaSecao();
  protected readonly rotuloLinha = (l: Linha) => l.nome || l.titulo || l.categoriaNome || l.nomeColaborador || 'Registro';

  protected readonly titulo = computed(() => {
    const cipa = this.tipo() === 'CIPA';
    return {
      painel: 'Visão geral',
      composicoes: cipa ? 'Composição da CIPA' : 'Equipe de brigadistas',
      reunioes: 'Reuniões e atas',
      documentos: cipa ? 'Documentos da CIPA' : 'Documentos de incêndio',
      treinamentos: 'Treinamentos',
      acoes: 'Inspeções e ações'
    }[this.secao];
  });
  protected readonly breadcrumb = computed(() => [{ label: 'Segurança' }, { label: this.tipo() === 'CIPA' ? 'CIPA' : 'Brigada de incêndio' }, { label: this.titulo() }]);
  protected readonly descricao = computed(() =>
    this.secao === 'painel'
      ? 'Pendências de documentos, atas, treinamentos e ações calculadas com as regras confirmadas.'
      : `Registros ${this.tipo() === 'CIPA' ? 'da CIPA' : 'da Brigada de incêndio'}, sempre separados do outro grupo.`
  );
  protected readonly entidade = computed(() =>
    this.secao === 'composicoes' ? (this.tipo() === 'CIPA' ? 'Nova composição' : 'Nova equipe') : this.secao === 'reunioes' ? 'Agendar reunião' : 'Enviar documento'
  );
  protected readonly podeAdicionar = computed(
    () => ['composicoes', 'reunioes', 'documentos'].includes(this.secao) && (this.auth.currentUser()?.permissoes?.includes('sst:governanca:write') ?? false)
  );
  protected readonly acaoLinha = computed(() => ({ composicoes: 'Editar formação', reunioes: 'Abrir reunião', documentos: 'Baixar arquivo', acoes: 'Ver ação' } as Record<string, string>)[this.secao] ?? 'Abrir');
  protected readonly vazioTitulo = computed(() =>
    ({
      composicoes: `Nenhuma ${this.tipo() === 'CIPA' ? 'composição da CIPA' : 'equipe de Brigada'}`,
      reunioes: 'Nenhuma reunião registrada',
      documentos: 'Nenhum documento enviado',
      treinamentos: 'Nenhuma exigência de treinamento',
      acoes: 'Nenhuma ação registrada'
    } as Record<string, string>)[this.secao] ?? 'Nenhum registro'
  );
  protected readonly vazioDescricao = computed(() =>
    ({
      composicoes: 'Cadastre a primeira formação para começar a incluir pessoas.',
      reunioes: 'Agende uma reunião para registrar presença, transcrição e ata.',
      documentos: this.tipo() === 'BRIGADA' ? 'Licenças da edificação, alvarás e atestados aparecerão aqui.' : 'Atas, eleição, posse e outros registros da CIPA aparecerão aqui.',
      treinamentos: 'Configure os requisitos por cargo ou papel e vincule os certificados.',
      acoes: 'Ações geradas em reuniões e inspeções aparecerão aqui.'
    } as Record<string, string>)[this.secao] ?? ''
  );

  constructor() {
    this.contexto.selecionar(this.tipo());
    inject(RhService)
      .listarBasesOperacionaisAtivas()
      .subscribe({ next: (p) => this.bases.set(p.content ?? []), error: () => this.bases.set([]) });
    if (this.secao === 'painel') this.carregarPainel();
  }

  private colunasDaSecao(): GeoDataTableColumn<Linha>[] {
    const principal = (header: string): GeoDataTableColumn<Linha> => ({ key: 'principal', header, type: 'custom', priority: 1, value: (l) => this.rotuloLinha(l) });
    const situacao: GeoDataTableColumn<Linha> = { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (l) => rotuloGovernanca(this.situacaoDe(l)) };
    switch (this.secao) {
      case 'composicoes':
        return [
          principal(this.tipo() === 'CIPA' ? 'Composição' : 'Equipe'),
          { key: 'local', header: 'Local de atuação', value: (l) => l.baseNome, display: (l) => `${l.baseNome} · ${l.unidadeGovernanca} · ${l.uf}` },
          { key: 'mandato', header: 'Mandato / vigência', value: (l) => l.inicioPeriodo, display: (l) => `${dataBr(l.inicioPeriodo)} — ${dataBr(l.fimPeriodo)}` },
          { key: 'integrantes', header: 'Integrantes', type: 'integer', value: (l) => l.quantidadeMembrosAtivos },
          situacao
        ];
      case 'reunioes':
        return [
          principal('Data e horário'),
          { key: 'local', header: 'Local / meio', value: (l) => l.localOuMeio },
          { key: 'pauta', header: 'Pauta', value: (l) => l.pauta },
          { ...situacao, header: 'Situação da ata' }
        ];
      case 'documentos':
        return [
          principal('Documento'),
          { key: 'base', header: 'Base', value: (l) => l.baseNome, display: (l) => l.baseNome || 'Base vinculada' },
          { key: 'emissao', header: 'Emissão', value: (l) => l.dataEmissao, display: (l) => dataBr(l.dataEmissao) || 'Não informada' },
          { key: 'validade', header: 'Validade', value: (l) => l.dataValidade, display: (l) => dataBr(l.dataValidade) || 'Sem validade' },
          { ...situacao, header: 'Conferência' }
        ];
      case 'treinamentos':
        return [
          principal('Colaborador'),
          { key: 'treinamento', header: 'Treinamento exigido', value: (l) => l.treinamentoNome },
          { key: 'validade', header: 'Validade efetiva', value: (l) => l.dataValidadeEfetiva, display: (l) => dataBr(l.dataValidadeEfetiva) || 'Sem certificado válido' },
          situacao,
          { key: 'motivo', header: 'Motivo', value: (l) => l.motivos?.join('; '), display: (l) => l.motivos?.join('; ') || 'Regular' }
        ];
      default:
        return [
          principal('Ação'),
          { key: 'responsavel', header: 'Responsável', value: (l) => l.responsavelNome, display: (l) => l.responsavelNome || 'Responsável definido' },
          { key: 'prioridade', header: 'Prioridade', type: 'custom', value: (l) => rotuloGovernanca(l.prioridade) },
          { key: 'prazo', header: 'Prazo', value: (l) => l.prazo, display: (l) => dataBr(l.prazo) },
          situacao
        ];
    }
  }

  protected situacaoDe(l: Linha): string {
    return (this.secao === 'documentos' ? l.situacaoConferencia : l.status) ?? '';
  }

  /** Recorte no formato da API (cada endpoint lê os nomes que conhece). */
  private filtros(): Record<string, unknown> {
    const { filters: f, query } = this.lista.request();
    const tipo = this.tipo();
    const status = f.status.length ? [...f.status] : undefined;
    const bases = f.bases.length ? [...f.bases] : undefined;
    const inicio = dataLocal(f.periodo.from);
    const fim = dataLocal(f.periodo.to);
    return {
      buscaGlobal: query || undefined,
      tipo: [tipo],
      tiposCorpo: [tipo],
      tipoCorpo: [tipo],
      contexto: [tipo],
      idsBases: bases,
      idBase: bases,
      status: this.secao === 'documentos' ? undefined : status,
      statusValidade: this.secao === 'documentos' ? status : undefined,
      dataInicio: inicio?.toISOString(),
      dataFim: fim?.toISOString(),
      inicio: f.periodo.from ?? undefined,
      fim: f.periodo.to ?? undefined
    };
  }

  private listar(filtros: Record<string, unknown>): Observable<{ content: Linha[]; page: { totalElements: number } }> {
    const lista = (o: Observable<unknown>) => o as Observable<{ content: Linha[]; page: { totalElements: number } }>;
    switch (this.secao) {
      case 'composicoes':
        return lista(this.api.listarCorpos(filtros));
      case 'reunioes':
        return lista(this.api.listarReunioes(filtros));
      case 'documentos':
        return lista(this.api.listarDocumentos(filtros));
      case 'treinamentos':
        return lista(this.api.listarMatriz(filtros));
      default:
        return lista(this.api.listarAcoes(filtros));
    }
  }

  protected carregarPainel(): void {
    this.carregandoPainel.set(true);
    this.erroPainel.set(null);
    this.api
      .dashboard(this.filtros())
      .pipe(finalize(() => this.carregandoPainel.set(false)))
      .subscribe({ next: (d) => this.dashboard.set(d), error: (e) => this.erroPainel.set(getErrorMessage(e)) });
  }

  private recarregar(): void {
    if (this.secao === 'painel') this.carregarPainel();
  }

  protected aplicar(): void {
    this.lista.apply();
    this.recarregar();
  }

  protected limpar(): void {
    this.lista.reset();
    this.recarregar();
  }

  protected remover(chave: string): void {
    this.lista.remove(chave as never);
    this.recarregar();
  }

  protected periodo(ponta: 'from' | 'to', data: Date | null): void {
    this.lista.filters.periodo.update((atual) => ({ ...atual, [ponta]: dataIso(data) }));
  }

  protected rota(secao: Secao): string {
    return `/sst/governanca/${this.tipo().toLowerCase()}/${secao}`;
  }

  protected irPara(secao: Secao): void {
    void this.router.navigateByUrl(this.rota(secao));
  }

  protected trocarTipo(tipo: TipoCorpoGovernanca): void {
    if (tipo === this.tipo()) return;
    this.tipo.set(tipo);
    this.contexto.selecionar(tipo);
    void this.router.navigate(['/sst/governanca', tipo.toLowerCase(), this.secao], { replaceUrl: true });
    if (this.secao === 'painel') this.carregarPainel();
    else this.lista.reload();
  }

  protected adicionar(): void {
    const destino = ({ composicoes: 'composicoes/novo', reunioes: 'reunioes/novo', documentos: 'documentos/novo' } as Record<string, string>)[this.secao];
    if (destino && this.podeAdicionar()) void this.router.navigateByUrl(`/sst/governanca/${destino}?tipo=${this.tipo()}`);
  }

  protected abrirLinha(linha: Linha): void {
    switch (this.secao) {
      case 'composicoes':
        void this.router.navigate(['/sst/governanca/composicoes', linha.id, 'editar'], { queryParams: { tipo: this.tipo() } });
        break;
      case 'reunioes':
        void this.router.navigate(['/sst/governanca', this.tipo().toLowerCase(), 'reunioes', linha.id]);
        break;
      case 'documentos':
        this.baixarDocumento(linha as DocumentoGovernancaResumo);
        break;
      case 'acoes':
        this.api.buscarAcao(linha.id).subscribe({ next: (a) => this.detalheAcao.set(a), error: (e) => this.notificacoes.error(getErrorMessage(e)) });
        break;
    }
  }

  protected abrirAtencao(item: ItemAtencaoGovernanca): void {
    const destino: Record<string, Secao> = { DOCUMENTO: 'documentos', ACAO: 'acoes', REUNIAO: 'reunioes', TREINAMENTO: 'treinamentos', CORPO: 'composicoes', INSPECAO: 'acoes' };
    this.irPara(destino[item.tipo] ?? 'painel');
  }

  private baixarDocumento(item: DocumentoGovernancaResumo): void {
    if (this.baixando()) return;
    this.baixando.set(item.id);
    this.api
      .baixarDocumento(item.id)
      .pipe(finalize(() => this.baixando.set(null)))
      .subscribe({ next: (blob) => FileDownloadUtil.downloadBlob(blob, item.nomeArquivo), error: (e) => this.notificacoes.error(getErrorMessage(e)) });
  }
}
