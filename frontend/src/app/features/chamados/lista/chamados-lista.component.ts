import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
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
import { catchError, map, of } from 'rxjs';

import { Chamado, ChamadoFiltros, ChamadoPrioridade, ChamadoStatus, EquipeChamado, TopicoChamado } from '../../../core/models/chamado.models';
import { UsuarioResponse } from '../../../core/models/iam.models';
import { bindDrawerToUrl } from '../../../core/navigation';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ChamadosService } from '../../../core/services/chamados.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, dataIso, dataLocal, paginaPadrao } from '../../../shared/listagem/listagem';
import {
  CHAMADO_PRIORIDADE_LABELS,
  CHAMADO_STATUS_LABELS,
  PRIORIDADE_OPTIONS,
  STATUS_OPTIONS,
  fimDoDiaIso,
  prazoIcon,
  prazoLabel,
  prazoTom,
  prioridadeTom,
  statusIcone,
  statusTom
} from '../chamados-ui';
import { ChamadoNovoDrawerComponent } from '../novo/chamado-novo-drawer.component';

const SIM_NAO: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Sim', value: true },
  { label: 'Não', value: false }
];
const STATUS: GeoSelectOption<ChamadoStatus | null>[] = [{ label: 'Todos', value: null }, ...STATUS_OPTIONS];
const PRIORIDADES: GeoSelectOption<ChamadoPrioridade | null>[] = [{ label: 'Todas', value: null }, ...PRIORIDADE_OPTIONS];

@Component({
  selector: 'app-chamados-lista',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AjudaListagemComponent,
    ChamadoNovoDrawerComponent
  ],
  styles: [`
    /* Células em uma linha (como /obras): o texto completo fica no title. */
    .cel-linha { display: block; max-width: var(--cel-max, 18rem); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cel-nowrap { white-space: nowrap; }
  `],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="!modoCentral" (newRequested)="novo()">
      <geo-page-header
        [title]="titulo"
        icon="pi pi-ticket"
        [breadcrumb]="[{ label: 'Chamados' }, { label: modoCentral ? 'Central de atendimento' : 'Meus chamados' }]"
        [description]="modoCentral ? 'Chamados das equipes de atendimento, do prazo de resolução mais próximo ao mais distante.' : 'Chamados que você abriu, da última interação para trás.'"
        helpLabel="Ajuda sobre chamados"
        (help)="ajuda.show()"
      >
        @if (!modoCentral) {
          <geo-button actions icon="pi pi-plus" label="Novo chamado" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel [storageKey]="chave" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Protocolo" [value]="lista.filters.protocolo() ?? ''" (valueChange)="lista.filters.protocolo.set($event || null)" placeholder="CH-AAAAMMDD-..."></geo-text-input>
          <geo-select label="Tópico" [options]="topicosOpcoes()" [(value)]="lista.filters.topicoId" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          @if (modoCentral) {
            <geo-select label="Equipe" [options]="equipesOpcoes()" [(value)]="lista.filters.equipeId" [clearable]="true" [filter]="true" placeholder="Todas"
              [loading]="equipes.loading()" (opened)="equipes.open()" (search)="equipes.search($event)"></geo-select>
          }
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.status"></geo-select>
          <geo-select label="Prioridade" [options]="prioridadeOpcoes" [(value)]="lista.filters.prioridade"></geo-select>
          @if (modoCentral) {
            <geo-select label="Solicitante" [options]="usuariosOpcoes()" [(value)]="lista.filters.solicitanteId" [clearable]="true" [filter]="true" placeholder="Todos"
              [loading]="usuarios.loading()" (opened)="usuarios.open()" (search)="usuarios.search($event)"></geo-select>
            <geo-select label="Responsável" [options]="usuariosOpcoes()" [(value)]="lista.filters.responsavelId" [clearable]="true" [filter]="true" placeholder="Todos"
              [loading]="usuarios.loading()" (opened)="usuarios.open()" (search)="usuarios.search($event)"></geo-select>
          }
          <geo-datepicker label="Abertos a partir de" [value]="dataLocal(lista.filters.abertura().from)" [clearable]="true" (valueChange)="abertura('from', $event)"></geo-datepicker>
          <geo-datepicker label="Abertos até" [value]="dataLocal(lista.filters.abertura().to)" [clearable]="true" (valueChange)="abertura('to', $event)"></geo-datepicker>
          <geo-select label="1ª resposta vencida" [options]="simNao" [(value)]="lista.filters.primeiraRespostaVencida"></geo-select>
          <geo-select label="Resolução vencida" [options]="simNao" [(value)]="lista.filters.resolucaoVencida"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        [title]="titulo"
        mode="server"
        [storageKey]="chave"
        exportFileName="chamados"
        searchPlaceholder="Protocolo ou assunto"
        rowActionLabel="Abrir"
        rowActionIcon="pi pi-arrow-right"
        [emptyActionLabel]="modoCentral ? undefined : 'Novo chamado'"
        noResultsTitle="Nenhum chamado encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os chamados' : modoCentral ? 'Nenhum chamado na fila' : 'Você ainda não abriu chamados'"
        [stateDescription]="resultado.error() ?? (modoCentral ? 'Os chamados abertos para as suas equipes aparecem aqui.' : 'Abra um chamado para pedir ajuda a uma equipe de atendimento.')"
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [textFit]="ajusteTexto"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="abrir($event)"
      >
        <ng-template geoCell="protocolo" let-row><span class="geo-cell-strong cel-nowrap">{{ row.protocolo }}</span></ng-template>
        <ng-template geoCell="assunto" let-row>
          <span class="cel-linha" style="--cel-max: 16rem" [title]="row.assunto">{{ row.assunto }}</span>
          <span class="geo-cell-muted cel-linha" style="--cel-max: 16rem" [title]="row.topico?.nome ?? ''">{{ row.topico?.nome }}</span>
        </ng-template>
        <ng-template geoCell="atendimento" let-row>
          <span class="cel-linha" style="--cel-max: 10rem" [title]="row.equipeAtendimento?.nome ?? ''">{{ row.equipeAtendimento?.nome }}</span>
          @if (modoCentral) {
            <span class="geo-cell-muted cel-linha" style="--cel-max: 10rem">{{ nomeUsuario(row.usuarioResponsavelId) }}</span>
          }
        </ng-template>
        <ng-template geoCell="prioridade" let-row>
          <geo-status [tone]="prioridadeTom(row.prioridade)" icon="pi-flag">{{ prioridadeLabel(row.prioridade) }}</geo-status>
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status class="cel-nowrap" [tone]="statusTom(row.status)" [icon]="statusIcone(row.status)">{{ statusLabel(row.status) }}</geo-status>
        </ng-template>
        <ng-template geoCell="prazo" let-row>
          <geo-status [tone]="prazoTom(row)" [icon]="prazoIcon(row)" emphasis="outline">{{ prazoLabel(row) }}</geo-status>
          <span class="geo-cell-muted">{{ row.dataLimiteResolucao | date: 'dd/MM/yy HH:mm' }}</span>
        </ng-template>
        <ng-template geoRowActions let-row>
          <geo-icon-button icon="pi pi-copy" [label]="'Copiar protocolo ' + row.protocolo" size="icon-sm" (pressed)="copiarProtocolo(row)"></geo-icon-button>
        </ng-template>
      </geo-data-table>
    </div>

    @if (!modoCentral) {
      <!-- Abertura de chamado (drawer, ?novo=1) -->
      <app-chamado-novo-drawer [visible]="drawerUrl.open()" (visibleChange)="!$event && drawerUrl.close()" (chamadoAberto)="lista.reload()" />
    }

    <app-ajuda-listagem #ajuda [titulo]="titulo" entidadePlural="chamados" busca="protocolo, assunto ou descrição" rotuloNovo="Novo chamado" [podeCriar]="!modoCentral">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-clock"></i> Prazo (SLA)</h4>
        <p class="help-text-desc">A coluna Prazo de resolução mostra a situação em texto e ícone (No prazo, Vence em breve — a menos de 4 horas —, Vencido, Pausado, Concluído no prazo ou fora dele, Cancelado) e a data limite. Os filtros "1ª resposta vencida" e "Resolução vencida" isolam os atrasados.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-arrow-right"></i> Detalhes</h4>
        <p class="help-text-desc">Clique na linha (ou em Abrir) para ver a linha do tempo, os anexos e as ações disponíveis. O botão de cópia ao lado copia o protocolo.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class ChamadosListaComponent implements OnInit {
  private readonly service = inject(ChamadosService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);

  protected readonly modoCentral = inject(ActivatedRoute).snapshot.data['modo'] === 'central';
  protected readonly titulo = this.modoCentral ? 'Fila de chamados' : 'Meus chamados';
  protected readonly chave = this.modoCentral ? 'chamados-fila' : 'chamados-meus';
  protected readonly statusOpcoes = STATUS;
  protected readonly prioridadeOpcoes = PRIORIDADES;
  protected readonly simNao = SIM_NAO;
  protected readonly dataLocal = dataLocal;
  protected readonly statusTom = statusTom;
  protected readonly statusIcone = statusIcone;
  protected readonly prioridadeTom = prioridadeTom;
  protected readonly prazoTom = prazoTom;
  protected readonly prazoIcon = prazoIcon;
  protected readonly prazoLabel = prazoLabel;
  protected readonly statusLabel = (s: ChamadoStatus) => CHAMADO_STATUS_LABELS[s];
  protected readonly prioridadeLabel = (p: ChamadoPrioridade) => CHAMADO_PRIORIDADE_LABELS[p];

  protected readonly topicos = signal<TopicoChamado[]>([]);
  protected readonly topicosOpcoes = computed<GeoSelectOption<string>[]>(() => this.topicos().map((t) => ({ label: t.nome, value: t.id })));
  /** Logins de usuários já conhecidos (filtros e coluna de responsável). */
  private readonly logins = signal<Record<string, string>>({});
  private readonly destroyRef = inject(DestroyRef);
  protected readonly drawerUrl = bindDrawerToUrl();

  protected readonly equipes = new RemoteLookup<EquipeChamado>(
    {
      identify: (e) => e.id,
      selectedKeys: () => (this.lista.filters.equipeId() ? [this.lista.filters.equipeId()!] : []),
      load: ({ query, page, size }) => this.service.listarEquipes({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'nome,asc' })
    },
    this.destroyRef
  );
  protected readonly equipesOpcoes = computed<GeoSelectOption<string>[]>(() => this.equipes.items().map((e) => ({ label: e.nome, value: e.id })));
  protected readonly usuarios = new RemoteLookup<UsuarioResponse>(
    {
      identify: (u) => u.id,
      selectedKeys: () => [this.lista.filters.solicitanteId(), this.lista.filters.responsavelId()].filter((id): id is string => !!id),
      load: ({ query, page, size }) => this.usuariosService.listarUsuarios({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'login,asc' })
    },
    this.destroyRef
  );
  protected readonly usuariosOpcoes = computed<GeoSelectOption<string>[]>(() => this.usuarios.items().map((u) => ({ label: u.login, value: u.id })));

  protected readonly lista = geoListState({
    storageKey: this.chave,
    filters: {
      protocolo: geoFilter.value<string | null>(null, { label: 'Protocolo' }),
      topicoId: geoFilter.value<string | null>(null, {
        label: 'Tópico',
        param: 'topico',
        format: (id): string | null => (id ? (this.topicos().find((t) => t.id === id)?.nome ?? 'tópico selecionado') : null)
      }),
      equipeId: geoFilter.value<string | null>(null, {
        label: 'Equipe',
        param: 'equipe',
        format: (id): string | null => (id ? (this.equipes.items().find((e) => e.id === id)?.nome ?? 'equipe selecionada') : null)
      }),
      status: geoFilter.value<ChamadoStatus | null>(null, { label: 'Status', type: 'string', options: () => STATUS }),
      prioridade: geoFilter.value<ChamadoPrioridade | null>(null, { label: 'Prioridade', type: 'string', options: () => PRIORIDADES }),
      solicitanteId: geoFilter.value<string | null>(null, { label: 'Solicitante', param: 'solicitante', format: (id): string | null => (id ? this.nomeUsuario(id) : null) }),
      responsavelId: geoFilter.value<string | null>(null, { label: 'Responsável', param: 'responsavel', format: (id): string | null => (id ? this.nomeUsuario(id) : null) }),
      abertura: geoFilter.range({ from: null, to: null }, { label: 'Abertura' }),
      primeiraRespostaVencida: geoFilter.value<boolean | null>(null, { label: '1ª resposta vencida', param: 'primeiraResposta', options: () => SIM_NAO }),
      resolucaoVencida: geoFilter.value<boolean | null>(null, { label: 'Resolução vencida', param: 'resolucao', options: () => SIM_NAO })
    },
    sort: [this.modoCentral ? { key: 'prazo', direction: 'asc' } : { key: 'ultima', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<Chamado>((pedido) => this.listar(this.filtro(pedido)), { errorMessage: getErrorMessage });
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = (_evento: unknown, limite: number) =>
    this.listar({ ...this.filtro(this.lista.request()), page: 0, size: limite }).pipe(map((r) => r.content));

  protected readonly colunas: GeoDataTableColumn<Chamado>[] = [
    { key: 'protocolo', header: 'Protocolo', type: 'custom', priority: 1, sortField: 'protocolo', value: (c) => c.protocolo, display: (c) => c.protocolo },
    { key: 'assunto', header: 'Chamado', type: 'custom', priority: 1, value: (c) => c.assunto, display: (c) => `${c.assunto} (${c.topico?.nome ?? ''})` },
    { key: 'atendimento', header: 'Atendimento', type: 'custom', value: (c) => c.equipeAtendimento?.nome, display: (c) => c.equipeAtendimento?.nome ?? '—' },
    { key: 'prioridade', header: 'Prioridade', type: 'custom', sortField: 'prioridade', value: (c) => c.prioridade, display: (c) => CHAMADO_PRIORIDADE_LABELS[c.prioridade] },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, sortField: 'status', value: (c) => c.status, display: (c) => CHAMADO_STATUS_LABELS[c.status] },
    { key: 'prazo', header: 'Prazo de resolução', type: 'custom', sortField: 'dataLimiteResolucao', value: (c) => c.dataLimiteResolucao, display: (c) => `${new Date(c.dataLimiteResolucao).toLocaleString('pt-BR')} (${prazoLabel(c)})` },
    { key: 'ultima', header: 'Última interação', type: 'date', sortField: 'dataUltimaInteracao', value: (c) => c.dataUltimaInteracao }
  ];
  protected readonly rotulo = (c: Chamado) => c.protocolo;
  /** Linhas de uma linha só (como /obras): o texto longo fica no title da célula. */
  protected readonly ajusteTexto = { minColumnWidth: '7.5rem', maxLines: 1 } as const;

  constructor() {
    this.service.listarTopicosAtivos().subscribe({ next: (t) => this.topicos.set(t), error: () => undefined });
    // Logins do solicitante/responsável da página e dos filtros vindos da URL.
    effect(() => {
      const ids = [
        ...this.resultado.rows().flatMap((c) => [c.usuarioSolicitanteId, c.usuarioResponsavelId]),
        this.lista.filters.solicitanteId(),
        this.lista.filters.responsavelId()
      ];
      untracked(() => this.carregarLogins(ids));
    });
  }

  ngOnInit(): void {
    // A fila não abre chamados: um ?novo=1 nela é ignorado.
    if (!this.modoCentral) this.drawerUrl.connect(() => undefined);
  }

  private listar(filtros: ChamadoFiltros) {
    return this.modoCentral ? this.service.listarFila(filtros) : this.service.listarMeus(filtros);
  }

  private filtro(pedido: Parameters<typeof paginaPadrao>[0]): ChamadoFiltros {
    const { filters, query } = this.lista.request();
    const de = dataLocal(filters.abertura.from);
    const ate = dataLocal(filters.abertura.to);
    return {
      ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string }),
      buscaGlobal: query || undefined,
      protocolo: filters.protocolo?.trim() || undefined,
      topicoId: filters.topicoId ?? undefined,
      equipeId: this.modoCentral ? (filters.equipeId ?? undefined) : undefined,
      prioridade: filters.prioridade ?? undefined,
      status: filters.status ?? undefined,
      usuarioSolicitanteId: this.modoCentral ? (filters.solicitanteId ?? undefined) : undefined,
      usuarioResponsavelId: this.modoCentral ? (filters.responsavelId ?? undefined) : undefined,
      dataAberturaInicio: de ? fimDoDiaIso(de, false) : undefined,
      dataAberturaFim: ate ? fimDoDiaIso(ate, true) : undefined,
      slaPrimeiraRespostaVencido: filters.primeiraRespostaVencida ?? undefined,
      slaResolucaoVencido: filters.resolucaoVencida ?? undefined,
      ativo: true
    };
  }

  private carregarLogins(ids: readonly (string | null | undefined)[]): void {
    const conhecidos = this.logins();
    new Set(ids.filter((id): id is string => !!id && !(id in conhecidos))).forEach((id) =>
      this.usuariosService
        .buscarUsuarioPorId(id)
        .pipe(catchError(() => of(null)))
        .subscribe((u) => {
          this.logins.update((atual) => ({ ...atual, [id]: u?.login ?? 'usuário removido' }));
          if (u) this.usuarios.setSeed([u]);
        })
    );
  }

  protected nomeUsuario(id?: string | null): string {
    if (!id) return 'Não atribuído';
    return this.logins()[id] ?? this.usuarios.items().find((u) => u.id === id)?.login ?? '…';
  }

  protected abertura(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.abertura.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected abrir(c: Chamado): void {
    void this.router.navigate([this.modoCentral ? '/chamados/fila' : '/chamados/meus', c.id]);
  }

  protected copiarProtocolo(c: Chamado): void {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    const manual = () => this.notificacoes.warning(`Copie manualmente: ${c.protocolo}`, { title: 'Não foi possível copiar' });
    if (!clipboard) {
      manual();
      return;
    }
    clipboard.writeText(c.protocolo).then(() => this.notificacoes.success(`Protocolo ${c.protocolo} copiado.`), manual);
  }

  protected novo(): void {
    if (!this.modoCentral) this.drawerUrl.openNew();
  }
}
