import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDrawerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, map, of } from 'rxjs';

import { PerfilAcessoResponse } from '../../../../core/models/iam.models';
import {
  ComunicadoResponse,
  RelatorioConfirmacaoResponse,
  SegmentoComunicadoResponse,
  StatusComunicado,
  TipoComunicado
} from '../../../../core/models/notificacao.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { ComunicadosService } from '../../../../core/services/comunicados.service';
import { UsuariosService } from '../../../../core/services/usuarios.service';
import { AjudaListagemComponent } from '../../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, paginaPadrao } from '../../../../shared/listagem/listagem';
import { STATUS_COMUNICADO_OPTIONS, TIPO_COMUNICADO_ICONES, TIPO_COMUNICADO_OPTIONS, TIPO_USUARIO_OPTIONS, formatarDataHora } from '../../notificacoes-ui';

const TIPOS: GeoSelectOption<TipoComunicado | null>[] = [{ label: 'Todos', value: null }, ...TIPO_COMUNICADO_OPTIONS];
const STATUS: GeoSelectOption<StatusComunicado | null>[] = [{ label: 'Todos', value: null }, ...STATUS_COMUNICADO_OPTIONS];
const CONFIRMACAO: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Exigem confirmação', value: true },
  { label: 'Não exigem', value: false }
];
const SITUACAO: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Ativos', value: true },
  { label: 'Inativos', value: false }
];
const TOM_STATUS: Record<StatusComunicado, GeoTone> = { RASCUNHO: 'neutral', PUBLICADO: 'success', ARQUIVADO: 'neutral' };
const TOM_TIPO: Record<TipoComunicado, GeoTone> = { DICA: 'warning', CHANGELOG: 'brand', AVISO: 'info', MANUTENCAO: 'neutral', URGENTE: 'danger' };
const ICONE_STATUS: Record<StatusComunicado, string> = { RASCUNHO: 'pi-pencil', PUBLICADO: 'pi-megaphone', ARQUIVADO: 'pi-inbox' };

@Component({
  selector: 'app-comunicados',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Comunicados"
        icon="pi pi-megaphone"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Comunicação' }, { label: 'Comunicados' }]"
        description="Mural de avisos, dicas e novidades: rascunho, publicação (agora ou agendada), público-alvo e confirmação de leitura."
        helpLabel="Ajuda sobre comunicados"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-plus" label="Novo comunicado" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="comunicados" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Tipo" [options]="tipos" [(value)]="lista.filters.tipo"></geo-select>
          <geo-select label="Status" [options]="status" [(value)]="lista.filters.status"></geo-select>
          <geo-select label="Confirmação de leitura" [options]="confirmacao" [(value)]="lista.filters.exigeConfirmacao"></geo-select>
          <geo-select label="Situação do registro" [options]="situacao" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Comunicados"
        mode="server"
        storageKey="comunicados"
        exportFileName="comunicados"
        searchPlaceholder="Título ou resumo"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo comunicado"
        noResultsTitle="Nenhum comunicado encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os comunicados' : 'Nenhum comunicado criado'"
        [stateDescription]="resultado.error() ?? 'Crie um comunicado para avisar as equipes pelo mural e pelo sino.'"
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
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
        <ng-template geoCell="titulo" let-row>
          <span class="geo-cell-strong">
            <i [class]="icone(row)" aria-hidden="true"></i> {{ row.titulo }}
            @if (row.fixado) {
              <i class="pi pi-thumbtack" aria-label="Fixado no topo"></i>
            }
            @if (row.anexos?.length) {
              <span class="geo-cell-muted"><i class="pi pi-paperclip" aria-hidden="true"></i> {{ row.anexos.length }}</span>
            }
          </span>
          @if (row.resumo) {
            <span class="geo-cell-muted">{{ row.resumo }}</span>
          }
          <span class="geo-cell-chips"><geo-status [tone]="tomTipo(row.tipo)" [icon]="iconeTipo[row.tipo]">{{ row.tipoRotulo }}</geo-status></span>
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="tomStatus(row.status)" [icon]="iconeStatus[row.status]" [emphasis]="row.status === 'ARQUIVADO' ? 'outline' : 'soft'">{{ row.statusRotulo }}</geo-status>
        </ng-template>
        <ng-template geoCell="vigencia" let-row>
          <geo-status [tone]="vigencia(row).tom" emphasis="outline" [icon]="vigencia(row).icone">{{ vigencia(row).rotulo }}</geo-status>
          @if (row.dataInicio) {
            <span class="geo-cell-muted">de {{ quando(row.dataInicio) }}</span>
          }
          @if (row.dataFim) {
            <span class="geo-cell-muted">até {{ quando(row.dataFim) }}</span>
          }
        </ng-template>
        <ng-template geoCell="publico" let-row>
          <span class="geo-cell-chips">
            @for (segmento of row.segmentos; track segmento.id) {
              <geo-status tone="neutral" emphasis="outline" icon="pi-users">{{ alvo(segmento) }}</geo-status>
            }
          </span>
        </ng-template>
        <ng-template geoCell="entrega" let-row>
          @if (row.notificarNoSininho) {
            <span><i class="pi pi-bell" aria-hidden="true"></i> Sino</span>
          }
          @if (row.exigeConfirmacao) {
            <span><i class="pi pi-verified" aria-hidden="true"></i> Exige confirmação</span>
          }
          @if (!row.notificarNoSininho && !row.exigeConfirmacao) {
            <span class="geo-cell-muted">Somente no mural</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (row.status === 'RASCUNHO') {
              <geo-icon-button icon="pi pi-send" [label]="'Publicar ' + row.titulo" size="icon-sm" (pressed)="abrirPublicacao(row)"></geo-icon-button>
            }
            @if (row.status === 'PUBLICADO') {
              <geo-icon-button icon="pi pi-inbox" [label]="'Arquivar ' + row.titulo" size="icon-sm" (pressed)="arquivar(row)"></geo-icon-button>
            }
            @if (row.exigeConfirmacao) {
              <geo-icon-button icon="pi pi-verified" [label]="'Relatório de confirmação de ' + row.titulo" size="icon-sm" (pressed)="abrirRelatorio(row)"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + row.titulo" size="icon-sm" (pressed)="remover(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="publicacaoAberta" title="Publicar comunicado" [description]="$safeNavigationMigration(selecionado()?.titulo)" [dirty]="!!(inicio() || fim())" size="sm">
      <geo-callout tone="info">Sem início, o comunicado entra no ar agora. Com início futuro ele já fica publicado e aparece quando a janela começar.</geo-callout>
      <geo-datepicker label="Início da vigência" [showTime]="true" [(value)]="inicio" [clearable]="true" [showOptional]="true" placeholder="Publicar agora"></geo-datepicker>
      <geo-datepicker label="Fim da vigência" [showTime]="true" [(value)]="fim" [clearable]="true" [showOptional]="true" placeholder="Até arquivar"
        [minDate]="inicio()" [error]="erroPeriodo()"></geo-datepicker>
      @if (selecionado()?.segmentos?.length) {
        <p class="geo-cell-muted">Será entregue a:</p>
        <span class="geo-cell-chips">
          @for (segmento of selecionado()!.segmentos; track segmento.id) {
            <geo-status tone="neutral" emphasis="outline" icon="pi-users">{{ alvo(segmento) }}</geo-status>
          }
        </span>
      }
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Voltar" (pressed)="publicacaoAberta.set(false)"></geo-button>
        <geo-button icon="pi pi-send" label="Publicar" [loading]="salvando()" (pressed)="publicar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-drawer [(visible)]="relatorioAberto" title="Relatório de confirmação" [description]="$safeNavigationMigration(selecionado()?.titulo)" size="lg">
      @if (carregandoRelatorio()) {
        <geo-async-state state="loading" title="Carregando o relatório"></geo-async-state>
      } @else if (relatorio(); as dados) {
        <p class="geo-cell-muted">Prova de comunicação para auditoria: o denominador é o total de destinatários.</p>
        <div class="geo-kpis">
          <div class="geo-kpi" data-tone="info"><span class="geo-kpi__body"><span class="geo-kpi__label">Destinatários</span><span class="geo-kpi__value">{{ dados.totalDestinatarios }}</span></span></div>
          <div class="geo-kpi" data-tone="success"><span class="geo-kpi__body"><span class="geo-kpi__label">Confirmaram</span><span class="geo-kpi__value">{{ dados.totalConfirmados }}</span></span></div>
          <div class="geo-kpi" data-tone="neutral"><span class="geo-kpi__body"><span class="geo-kpi__label">Visualizaram</span><span class="geo-kpi__value">{{ dados.totalVisualizados }}</span></span></div>
          <div class="geo-kpi" [attr.data-tone]="cobertura() === 100 ? 'success' : 'warning'"><span class="geo-kpi__body"><span class="geo-kpi__label">Cobertura</span><span class="geo-kpi__value">{{ cobertura() }}%</span></span></div>
        </div>
        <geo-data-table [caption]="'Confirmados (' + dados.confirmados.length + ')'" [columns]="colunasConfirmados" [rows]="dados.confirmados"
          [rowKey]="chavePessoa" [state]="dados.confirmados.length ? 'ready' : 'empty'" stateTitle="Ninguém confirmou ainda"></geo-data-table>
        <geo-data-table [caption]="'Pendentes (' + dados.pendentes.length + ') · ' + abriramSemConfirmar() + ' abriram sem confirmar'" [columns]="colunasPendentes"
          [rows]="dados.pendentes" [rowKey]="chavePessoa" [state]="dados.pendentes.length ? 'ready' : 'empty'" stateTitle="Todos confirmaram">
          <ng-template geoCell="situacao" let-row>
            @if (row.visualizadoEm) {
              <geo-status tone="warning" [title]="'Abriu em ' + quando(row.visualizadoEm)" icon="pi-eye">Abriu, não confirmou</geo-status>
            } @else {
              <geo-status tone="neutral" emphasis="outline" icon="pi-eye-slash">Nunca abriu</geo-status>
            }
          </ng-template>
        </geo-data-table>
      }
    </geo-drawer>

    <app-ajuda-listagem #ajuda titulo="Comunicados" entidadePlural="comunicados" busca="título ou resumo" rotuloNovo="Novo comunicado">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-sync"></i> Ciclo de vida</h4>
        <p class="help-text-desc"><strong>Rascunho</strong>: tudo pode mudar e nada foi entregue. <strong>Publicado</strong>: com início futuro aparece como "Agendado"; depois disso só o texto pode ser corrigido. <strong>Arquivado</strong>: sai do mural de todos; o relatório de confirmação continua disponível.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-verified"></i> Público-alvo e confirmação</h4>
        <p class="help-text-desc">Combine perfis, tipos de usuário e pessoas. Exigir confirmação ("Li e entendi") bloqueia o adiamento e habilita o relatório de quem confirmou, abriu sem confirmar ou nunca viu.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class ComunicadosComponent {
  private readonly service = inject(ComunicadosService);
  private readonly usuarios = inject(UsuariosService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacaoDialogo = inject(GeoConfirmationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tipos = TIPOS;
  protected readonly status = STATUS;
  protected readonly confirmacao = CONFIRMACAO;
  protected readonly situacao = SITUACAO;
  protected readonly perfis = signal<PerfilAcessoResponse[]>([]);
  /** Logins dos usuários citados nos segmentos da página. */
  private readonly logins = signal<Record<string, string>>({});

  protected readonly lista = geoListState({
    storageKey: 'comunicados',
    filters: {
      tipo: geoFilter.value<TipoComunicado | null>(null, { label: 'Tipo', type: 'string', options: () => TIPOS }),
      status: geoFilter.value<StatusComunicado | null>(null, { label: 'Status', type: 'string', options: () => STATUS }),
      exigeConfirmacao: geoFilter.value<boolean | null>(null, { label: 'Confirmação', param: 'confirmacao', options: () => CONFIRMACAO }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Situação', param: 'situacao', options: () => SITUACAO })
    },
    sort: [{ key: 'criado', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<ComunicadoResponse>((pedido) => this.service.listar(this.filtro(pedido)), { errorMessage: getErrorMessage });
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = (_evento: unknown, limite: number) =>
    this.service.listar({ ...this.filtro(this.lista.request()), page: 0, size: limite }).pipe(map((r) => r.content));

  protected readonly colunas: GeoDataTableColumn<ComunicadoResponse>[] = [
    { key: 'titulo', header: 'Comunicado', type: 'custom', priority: 1, sortField: 'titulo', value: (c) => c.titulo, display: (c) => c.titulo },
    { key: 'apresentacao', header: 'Apresentação', value: (c) => c.apresentacaoRotulo, display: (c) => c.apresentacaoRotulo },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, value: (c) => c.status, display: (c) => c.statusRotulo },
    { key: 'vigencia', header: 'Vigência', type: 'custom', value: (c) => this.vigencia(c).rotulo, display: (c) => this.vigencia(c).rotulo },
    { key: 'publico', header: 'Público-alvo', type: 'custom', value: (c) => c.segmentos.map((s) => this.alvo(s)).join(', '), display: (c) => c.segmentos.map((s) => this.alvo(s)).join(', ') },
    { key: 'entrega', header: 'Entrega', type: 'custom', value: (c) => this.entrega(c), display: (c) => this.entrega(c) },
    { key: 'criado', header: 'Criado em', type: 'date', sortField: 'dataCriacao', value: (c) => c.dataCriacao }
  ];
  protected readonly rotulo = (c: ComunicadoResponse) => c.titulo;

  // Publicação
  protected readonly publicacaoAberta = signal(false);
  protected readonly selecionado = signal<ComunicadoResponse | null>(null);
  protected readonly inicio = signal<Date | null>(null);
  protected readonly fim = signal<Date | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erroPeriodo = computed(() => {
    const inicio = this.inicio();
    const fim = this.fim();
    return inicio && fim && fim <= inicio ? 'O fim precisa ser depois do início.' : undefined;
  });

  // Relatório
  protected readonly relatorioAberto = signal(false);
  protected readonly relatorio = signal<RelatorioConfirmacaoResponse | null>(null);
  protected readonly carregandoRelatorio = signal(false);
  protected readonly cobertura = computed(() => {
    const r = this.relatorio();
    return !r || r.totalDestinatarios === 0 ? 0 : Math.round((r.totalConfirmados / r.totalDestinatarios) * 100);
  });
  protected readonly abriramSemConfirmar = computed(() => this.relatorio()?.pendentes.filter((p) => !!p.visualizadoEm).length ?? 0);
  protected readonly chavePessoa = (p: { idUsuario: string }) => p.idUsuario;
  protected readonly colunasConfirmados: GeoDataTableColumn<RelatorioConfirmacaoResponse['confirmados'][number]>[] = [
    { key: 'login', header: 'Usuário', priority: 1 },
    { key: 'confirmadoEm', header: 'Confirmou em', value: (p) => p.confirmadoEm, display: (p) => formatarDataHora(p.confirmadoEm) }
  ];
  protected readonly colunasPendentes: GeoDataTableColumn<RelatorioConfirmacaoResponse['pendentes'][number]>[] = [
    { key: 'login', header: 'Usuário', priority: 1 },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (p) => (p.visualizadoEm ? 'Abriu' : 'Nunca abriu') }
  ];

  constructor() {
    this.usuarios.listarPerfisAtivos().subscribe({ next: (p) => this.perfis.set(p), error: () => undefined });
    // O formulário volta com `?publicar=<id>` quando o autor escolhe publicar logo após gravar.
    const idParaPublicar = this.route.snapshot.queryParamMap.get('publicar');
    if (idParaPublicar) {
      this.service.buscar(idParaPublicar).subscribe({ next: (c) => this.abrirPublicacao(c), error: () => undefined });
      void this.router.navigate([], { relativeTo: this.route, queryParams: { publicar: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    effect(() => {
      const ids = this.resultado.rows().flatMap((c) => c.segmentos.filter((s) => s.tipoAlvo === 'USUARIO' && !!s.idAlvo).map((s) => s.idAlvo as string));
      untracked(() => this.carregarLogins(ids));
    });
  }

  private filtro(pedido: Parameters<typeof paginaPadrao>[0]) {
    const { filters, query } = this.lista.request();
    return {
      buscaGlobal: query || undefined,
      tipo: filters.tipo ?? undefined,
      status: filters.status ?? undefined,
      exigeConfirmacao: filters.exigeConfirmacao ?? undefined,
      ativo: filters.ativo ?? undefined,
      ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string })
    };
  }

  private carregarLogins(ids: readonly string[]): void {
    const conhecidos = this.logins();
    new Set(ids.filter((id) => !(id in conhecidos))).forEach((id) =>
      this.usuarios
        .buscarUsuarioPorId(id)
        .pipe(catchError(() => of(null)))
        .subscribe((u) => this.logins.update((l) => ({ ...l, [id]: u?.login ?? 'Usuário' })))
    );
  }

  protected icone(c: ComunicadoResponse): string {
    return TIPO_COMUNICADO_ICONES[c.tipo] ?? 'pi pi-megaphone';
  }

  protected readonly iconeTipo: Record<string, string> = TIPO_COMUNICADO_ICONES;
  protected readonly iconeStatus: Record<string, string> = ICONE_STATUS;

  protected tomTipo(t: TipoComunicado): GeoTone {
    return TOM_TIPO[t] ?? 'neutral';
  }

  protected tomStatus(s: StatusComunicado): GeoTone {
    return TOM_STATUS[s] ?? 'neutral';
  }

  /** Não existe status "agendado": os indicadores vêm prontos do servidor. */
  protected vigencia(c: ComunicadoResponse): { rotulo: string; tom: GeoTone; icone: string } {
    if (c.status !== 'PUBLICADO') return { rotulo: '—', tom: 'neutral', icone: 'pi-minus' };
    if (c.agendado) return { rotulo: 'Agendado', tom: 'warning', icone: 'pi-calendar-clock' };
    if (c.vigente) return { rotulo: 'No ar', tom: 'success', icone: 'pi-eye' };
    return { rotulo: 'Fora do ar', tom: 'neutral', icone: 'pi-eye-slash' };
  }

  protected alvo(s: SegmentoComunicadoResponse): string {
    if (s.descricaoAlvo) return s.descricaoAlvo;
    if (s.tipoAlvo === 'TODOS') return 'Todos os usuários';
    if (s.tipoAlvo === 'TIPO_USUARIO') return TIPO_USUARIO_OPTIONS.find((o) => o.value === s.valorAlvo)?.label ?? s.valorAlvo ?? '—';
    if (s.tipoAlvo === 'PERFIL') return this.perfis().find((p) => p.id === s.idAlvo)?.nome ?? 'Perfil de acesso';
    return (s.idAlvo && this.logins()[s.idAlvo]) || 'Usuário';
  }

  private entrega(c: ComunicadoResponse): string {
    const partes = [c.notificarNoSininho ? 'Sino' : null, c.exigeConfirmacao ? 'Exige confirmação' : null].filter(Boolean);
    return partes.length ? partes.join(' · ') : 'Somente no mural';
  }

  protected quando(valor: string | null): string {
    return formatarDataHora(valor);
  }

  protected novo(): void {
    void this.router.navigate(['/notificacoes/admin/comunicados/novo']);
  }

  /** Rascunho abre o formulário completo; publicado, o mesmo formulário só para o texto. Arquivado não edita. */
  protected editar(c: ComunicadoResponse): void {
    if (c.status === 'ARQUIVADO') {
      this.notificacoes.info('Comunicados arquivados não podem ser editados.');
      return;
    }
    void this.router.navigate(['/notificacoes/admin/comunicados', c.id, 'editar']);
  }

  protected abrirPublicacao(c: ComunicadoResponse): void {
    this.selecionado.set(c);
    this.inicio.set(null);
    this.fim.set(null);
    this.publicacaoAberta.set(true);
  }

  protected publicar(): void {
    const atual = this.selecionado();
    if (!atual || this.erroPeriodo()) return;
    const inicio = this.inicio();
    this.salvando.set(true);
    this.service.publicar(atual.id, { dataInicio: inicio?.toISOString() ?? null, dataFim: this.fim()?.toISOString() ?? null }).subscribe({
      next: () => {
        this.publicacaoAberta.set(false);
        this.concluir(inicio && inicio.getTime() > Date.now() ? 'Comunicado publicado e agendado.' : 'Comunicado publicado.');
      },
      error: (e) => this.falhar(e)
    });
  }

  protected async arquivar(c: ComunicadoResponse): Promise<void> {
    const ok = await this.confirmacaoDialogo.confirm({
      title: 'Arquivar comunicado',
      message: `"${c.titulo}" sai do mural de todos os destinatários. O relatório de confirmação continua disponível.`,
      confirmLabel: 'Arquivar'
    });
    if (!ok) return;
    this.service.arquivar(c.id).subscribe({ next: () => this.concluir('Comunicado arquivado.'), error: (e) => this.falhar(e) });
  }

  protected async remover(c: ComunicadoResponse): Promise<void> {
    const ok = await this.confirmacaoDialogo.confirm({
      title: 'Remover comunicado',
      message: `"${c.titulo}" deixa de aparecer nas listagens.`,
      confirmLabel: 'Remover',
      variant: 'destructive'
    });
    if (!ok) return;
    this.service.remover(c.id).subscribe({ next: () => this.concluir('Comunicado removido.'), error: (e) => this.falhar(e) });
  }

  protected abrirRelatorio(c: ComunicadoResponse): void {
    this.selecionado.set(c);
    this.relatorio.set(null);
    this.carregandoRelatorio.set(true);
    this.relatorioAberto.set(true);
    this.service.relatorioConfirmacao(c.id).subscribe({
      next: (dados) => {
        this.relatorio.set(dados);
        this.carregandoRelatorio.set(false);
      },
      error: (e) => {
        this.carregandoRelatorio.set(false);
        this.falhar(e);
      }
    });
  }

  private concluir(mensagem: string): void {
    this.salvando.set(false);
    this.notificacoes.success(mensagem);
    this.lista.reload();
  }

  private falhar(e: unknown): void {
    this.salvando.set(false);
    this.notificacoes.error(getErrorMessage(e));
  }
}
