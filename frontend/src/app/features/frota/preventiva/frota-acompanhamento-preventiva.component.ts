import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFilterPanelComponent,
  CesIconButtonComponent,
  CesListShortcutsDirective,
  CesMultiSelectComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService,
  cesFilter,
  cesListState,
  cesUrlParam
} from '@ces/ui';
import { map, tap } from 'rxjs';
import {
  ContagensPreventiva,
  ControlePreventivo,
  FiltroRapidoPreventiva,
  aparenciaPreventiva,
  resumoOsPreventivas
} from '../../../core/models/frota-preventiva.models';
import { contar, formatarMedicao, formatarPlaca, rotuloValorAtual } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { acessoFrota } from '../shared/frota-acesso';
import { basesFrota } from '../shared/frota-lista';
import { FrotaInformarRealizacaoDrawerComponent } from './frota-informar-realizacao-drawer.component';

type Recorte = FiltroRapidoPreventiva | 'TODAS';
const RECORTES: readonly (Recorte | 'AUTO')[] = ['AUTO', 'VENCIDA', 'PROXIMA', 'COM_OS', 'SEM_HISTORICO', 'EM_DIA', 'TODAS'];

interface Atalho {
  valor: Recorte;
  rotulo: string;
  icone: string;
  tom: 'danger' | 'warning' | 'info' | 'success' | 'neutral';
  quantidade: (c: ContagensPreventiva) => number;
  detalhe: string;
}

const ATALHOS: Atalho[] = [
  { valor: 'VENCIDA', rotulo: 'Vencidas', icone: 'pi-exclamation-circle', tom: 'danger', quantidade: (c) => c.vencidas, detalhe: 'Passaram do km, das horas ou da data' },
  { valor: 'PROXIMA', rotulo: 'Próximas', icone: 'pi-clock', tom: 'warning', quantidade: (c) => c.proximas, detalhe: 'Dentro da antecedência do plano' },
  { valor: 'COM_OS', rotulo: 'Com OS aberta', icone: 'pi-wrench', tom: 'info', quantidade: (c) => c.comOs, detalhe: 'Fecham o ciclo quando a OS for concluída' },
  { valor: 'SEM_HISTORICO', rotulo: 'Sem histórico', icone: 'pi-question-circle', tom: 'neutral', quantidade: (c) => c.semHistorico, detalhe: 'Contando desde a entrada no plano' },
  { valor: 'EM_DIA', rotulo: 'Em dia', icone: 'pi-check-circle', tom: 'success', quantidade: (c) => c.emDia, detalhe: 'Longe da próxima revisão' }
];

/** A linha entra nos filtros rápidos como o backend conta: com OS sai de vencida, próxima e em dia. */
function entra(c: ControlePreventivo, recorte: Recorte): boolean {
  if (recorte === 'TODAS') return true;
  if (recorte === 'COM_OS') return !!c.idOrdemServico;
  if (c.idOrdemServico) return false;
  if (recorte === 'SEM_HISTORICO') return c.semHistorico;
  return c.situacao === recorte;
}

/**
 * Acompanhamento da preventiva: cada plano em cada veículo, do mais urgente para o menos. Abre nas
 * vencidas (ou nas próximas), abre a OS em lote — uma por veículo — e recebe a revisão feita fora.
 * Base e plano ficam no painel de filtros (na URL); os indicadores escolhem a situação.
 */
@Component({
  selector: 'app-frota-acompanhamento-preventiva',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFilterPanelComponent,
    CesIconButtonComponent,
    CesListShortcutsDirective,
    CesMultiSelectComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    FrotaInformarRealizacaoDrawerComponent
  ],
  styles: `
    .ces-kpi[aria-pressed='true'] { border-color: var(--ces-brand); box-shadow: inset 3px 0 0 var(--ces-brand), var(--ces-shadow-sm); }
    .falta--danger { color: var(--ces-danger-text); font-weight: 600; }
    .falta--warning { color: var(--ces-warning-text); font-weight: 600; }
  `,
  template: `
    <div class="ces-page" cesListShortcuts>
      <section class="ces-kpis" aria-label="Situação da preventiva">
        @for (a of atalhos; track a.valor) {
          @let n = contagens() ? a.quantidade(contagens()!) : null;
          <button type="button" class="ces-kpi" [attr.data-tone]="n ? a.tom : 'neutral'" [attr.aria-pressed]="recorte() === a.valor"
            (click)="escolher(a.valor)" [attr.aria-label]="a.rotulo + ': ' + (n ?? 0) + '. ' + (recorte() === a.valor ? 'Mostrar todas' : 'Mostrar só essas')">
            <span class="ces-kpi__icon" aria-hidden="true"><i [class]="'pi ' + a.icone"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">{{ a.rotulo }}</span>
              <span class="ces-kpi__value">{{ n ?? '—' }}</span>
              <span class="ces-kpi__detail">{{ a.detalhe }}</span>
            </span>
            <i class="pi ces-kpi__go" [class.pi-angle-right]="recorte() !== a.valor" [class.pi-times]="recorte() === a.valor" aria-hidden="true"></i>
          </button>
        }
      </section>

      <ces-filter-panel #painelFiltros storageKey="frota-preventiva-acompanhamento" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></ces-multiselect>
          <ces-select label="Plano" [options]="opcoesPlano()" [(value)]="lista.filters.idPlano" placeholder="Todos" [clearable]="true"></ces-select>
        </div>
      </ces-filter-panel>

      <ces-data-table [title]="titulo()" [description]="descricao()" storageKey="frota-preventiva-acompanhamento"
        exportFileName="preventiva-acompanhamento" searchPlaceholder="Placa ou plano"
        [columns]="colunas" [rows]="linhas()" [rowKey]="chave" [rowLabel]="rotulo"
        [state]="resultado.state() === 'ready' && !linhas().length ? 'empty' : resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar a preventiva' : vazioTitulo()"
        [stateDescription]="resultado.error() ?? vazioDescricao()"
        [emptyActionLabel]="semPlanos() && acesso.editarPreventiva() ? 'Novo plano' : undefined" (emptyAction)="irParaPlanos()"
        noResultsTitle="Nenhum plano encontrado com esse recorte." [filtered]="lista.filtered()"
        (adjustFilters)="painelFiltros.expandAndFocus()" (clearFilters)="lista.reset()"
        [selectable]="podeAbrirOs()" [(selection)]="selecionados"
        rowActionLabel="Ficha do veículo" (rowActivate)="verVeiculo($event)">
        <ng-container table-actions>
          @if (recorte() !== 'TODAS') {
            <ces-button size="sm" variant="ghost" icon="pi pi-filter-slash" label="Ver todas as situações" (pressed)="escolher('TODAS')"></ces-button>
          }
        </ng-container>
        <ces-button selection-actions size="sm" icon="pi pi-wrench" [label]="rotuloAbrirSelecionados()" [loading]="abrindo()"
          [disabled]="!livresSelecionados().length" (pressed)="abrirOs(selecionados())"></ces-button>

        <ng-template cesCell="veiculo" let-row>
          <span class="ces-cell-strong">{{ placa(row.placa) }}</span>
          <span class="ces-cell-muted">{{ row.base ?? 'Sem base' }}</span>
        </ng-template>
        <ng-template cesCell="plano" let-row>
          <span class="ces-cell-strong">{{ row.plano }}</span>
          <span class="ces-cell-muted">{{ row.frequencia }}</span>
        </ng-template>
        <ng-template cesCell="situacao" let-row>
          @let ap = aparencia(row);
          <ces-status [tone]="ap.tom" [icon]="ap.icone">{{ ap.rotulo }}</ces-status>
          @if (row.numeroOrdemServico) {
            <span class="ces-cell-muted">OS {{ row.numeroOrdemServico }} · {{ row.situacaoRotulo.toLowerCase() }}</span>
          }
        </ng-template>
        <ng-template cesCell="falta" let-row>
          <span class="ces-cell-strong" [class.falta--danger]="row.situacao === 'VENCIDA'" [class.falta--warning]="row.situacao === 'PROXIMA'">{{ primeiraMaiuscula(row.falta) }}</span>
          @if (row.previsao && row.situacao !== 'VENCIDA') {
            <span class="ces-cell-muted">Previsão {{ row.previsao | date: 'dd/MM/yyyy' }}</span>
          }
        </ng-template>
        <ng-template cesCell="ultima" let-row>
          @if (row.semHistorico) {
            <ces-status tone="neutral" emphasis="outline" icon="pi-question-circle">Sem histórico</ces-status>
            <span class="ces-cell-muted">Contando desde {{ row.baseData | date: 'dd/MM/yyyy' }}</span>
          } @else {
            {{ row.baseData | date: 'dd/MM/yyyy' }}{{ row.baseMedicao != null ? ' · ' + medicao(row.baseMedicao, row.unidade) : '' }}
            <span class="ces-cell-muted">{{ row.baseOrigemRotulo }}</span>
          }
        </ng-template>
        <ng-template cesCell="proxima" let-row>
          {{ proxima(row) }}
          <span class="ces-cell-muted">{{ rotuloAtual(row.unidade) }}: {{ medicao(row.medicaoAtual, row.unidade) }}</span>
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            @if (row.idOrdemServico) {
              <ces-icon-button icon="pi pi-external-link" [label]="'Ver a OS ' + row.numeroOrdemServico" tooltip="Ver a OS" size="icon-sm" (pressed)="verOs(row.idOrdemServico)"></ces-icon-button>
            } @else if (podeAbrirOs()) {
              <ces-icon-button icon="pi pi-wrench" [label]="'Abrir OS de ' + rotulo(row)" tooltip="Abrir OS" size="icon-sm" [disabled]="abrindo()" (pressed)="abrirOs([row])"></ces-icon-button>
            }
            @if (acesso.editarPreventiva()) {
              <ces-icon-button icon="pi pi-history" [label]="'Informar a última realização de ' + rotulo(row)" tooltip="Informar última realização" size="icon-sm" (pressed)="informar(row)"></ces-icon-button>
            }
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <app-frota-informar-realizacao-drawer [(visivel)]="informarAberto" [controle]="emInforme()" (registrado)="lista.reload()"></app-frota-informar-realizacao-drawer>
  `
})
export class FrotaAcompanhamentoPreventivaComponent {
  private readonly preventiva = inject(FrotaPreventivaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();
  protected readonly atalhos = ATALHOS;
  protected readonly placa = formatarPlaca;
  protected readonly medicao = formatarMedicao;
  protected readonly rotuloAtual = rotuloValorAtual;
  protected readonly aparencia = aparenciaPreventiva;

  private readonly escolhido = cesUrlParam<Recorte | 'AUTO'>({ param: 'situacao', values: RECORTES, default: 'AUTO' });
  protected readonly opcoesPlano = signal<CesSelectOption<string>[]>([]);
  protected readonly contagens = signal<ContagensPreventiva | null>(null);
  protected readonly selecionados = signal<readonly ControlePreventivo[]>([]);
  protected readonly abrindo = signal(false);
  protected readonly informarAberto = signal(false);
  protected readonly emInforme = signal<ControlePreventivo | null>(null);

  protected readonly lista = cesListState({
    storageKey: 'frota-preventiva-acompanhamento',
    queryParam: false,
    filters: {
      idsBase: cesFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      idPlano: cesFilter.value<string | null>(null, { label: 'Plano', param: 'plano', options: () => this.opcoesPlano() })
    }
  });
  /** A lista inteira vem de uma vez (o recorte por situação é local); as contagens vêm junto. */
  protected readonly resultado = this.lista.results(
    (req) =>
      this.preventiva
        .acompanhamento({ situacao: [], idBase: req.filters.idsBase, idPlano: req.filters.idPlano, idVeiculo: null, busca: null }, { page: 0, size: 2000 })
        .pipe(
          tap((r) => this.contagens.set(r.contagens)),
          map((r) => r.pagina.content)
        ),
    { immediate: true }
  );

  protected readonly podeAbrirOs = computed(() => this.acesso.editarPreventiva() && this.acesso.editarOs());
  protected readonly semPlanos = computed(() => this.contagens() !== null && !this.contagens()!.todas && !this.lista.filtered());

  /** Sem escolha na URL, abre nas vencidas; sem vencidas, nas próximas; sem nenhuma, em todas. */
  protected readonly recorte = computed<Recorte>(() => {
    const escolhido = this.escolhido();
    if (escolhido !== 'AUTO') return escolhido;
    const c = this.contagens();
    if (!c) return 'TODAS';
    return c.vencidas ? 'VENCIDA' : c.proximas ? 'PROXIMA' : 'TODAS';
  });
  protected readonly linhas = computed(() => this.resultado.rows().filter((c) => entra(c, this.recorte())));
  protected readonly titulo = computed(() => {
    const r = this.recorte();
    return r === 'TODAS' ? 'Todos os planos' : ATALHOS.find((a) => a.valor === r)!.rotulo;
  });
  protected readonly descricao = computed(() => {
    if (this.resultado.loading() && !this.resultado.rows().length) return undefined;
    const n = this.linhas().length;
    const veiculos = new Set(this.linhas().map((c) => c.idVeiculo)).size;
    return n ? `${contar(n, 'plano', 'planos')} em ${contar(veiculos, 'veículo', 'veículos')}` : 'Nenhum plano';
  });
  protected readonly vazioTitulo = computed(() => {
    if (this.semPlanos()) return 'Nenhum veículo acompanhado';
    switch (this.recorte()) {
      case 'VENCIDA': return 'Nenhuma preventiva vencida';
      case 'PROXIMA': return 'Nenhuma preventiva próxima';
      case 'COM_OS': return 'Nenhuma OS preventiva aberta';
      case 'SEM_HISTORICO': return 'Todos os planos já têm uma realização';
      case 'EM_DIA': return 'Nenhum plano em dia';
      default: return 'Nenhum plano nesse recorte';
    }
  });
  protected readonly vazioDescricao = computed(() => this.semPlanos()
    ? 'Cadastre um plano de preventiva. Os veículos dos tipos cobertos aparecem aqui na hora.'
    : this.recorte() === 'TODAS' ? undefined : 'Os indicadores acima mostram as outras situações.');
  /** Só os planos sem OS entram na abertura em lote. */
  protected readonly livresSelecionados = computed(() => this.selecionados().filter((c) => !c.idOrdemServico));
  protected readonly rotuloAbrirSelecionados = computed(() => {
    const veiculos = new Set(this.livresSelecionados().map((c) => c.idVeiculo)).size;
    return veiculos > 1 ? `Abrir ${veiculos} OS` : 'Abrir OS';
  });

  protected readonly colunas: CesDataTableColumn<ControlePreventivo>[] = [
    { key: 'veiculo', header: 'Veículo', type: 'custom', priority: 1, value: (c) => c.placa, display: (c) => `${formatarPlaca(c.placa)} ${c.base ?? ''}` },
    { key: 'plano', header: 'Plano', type: 'custom', priority: 1, value: (c) => c.plano, display: (c) => `${c.plano} ${c.frequencia}` },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (c) => aparenciaPreventiva(c).rotulo, display: (c) => aparenciaPreventiva(c).rotulo },
    { key: 'falta', header: 'Quanto falta', type: 'custom', priority: 1, value: (c) => c.previsao ?? '', display: (c) => c.falta },
    { key: 'ultima', header: 'Última realização', type: 'custom', priority: 2, value: (c) => c.baseData, display: (c) => c.baseData },
    { key: 'proxima', header: 'Próxima', type: 'custom', priority: 2, value: (c) => c.proximaData ?? '', display: (c) => this.proxima(c) }
  ];
  protected readonly chave = (c: ControlePreventivo) => c.id;
  protected readonly rotulo = (c: ControlePreventivo) => `${c.plano} do ${formatarPlaca(c.placa)}`;

  constructor() {
    this.preventiva.planos(true).subscribe({
      next: (planos) => this.opcoesPlano.set(planos.map((p) => ({ label: p.nome, value: p.id }))),
      error: () => undefined
    });
    effect(() => {
      this.recorte();
      this.resultado.rows();
      untracked(() => this.selecionados.set([]));
    });
  }

  /** Clicar no indicador mostra só aquela situação; clicar de novo volta a todas. */
  protected escolher(valor: Recorte): void {
    this.escolhido.set(this.recorte() === valor && valor !== 'TODAS' ? 'TODAS' : valor);
  }

  protected proxima(c: ControlePreventivo): string {
    const partes = [
      c.proximaMedicao != null ? formatarMedicao(c.proximaMedicao, c.unidade) : null,
      c.proximaData ? c.proximaData.split('-').reverse().join('/') : null
    ].filter(Boolean);
    return partes.length ? partes.join(' ou ') : 'Aguardando a primeira leitura';
  }

  protected primeiraMaiuscula(texto: string): string {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  protected async abrirOs(controles: readonly ControlePreventivo[]): Promise<void> {
    const livres = controles.filter((c) => !c.idOrdemServico);
    if (!livres.length) {
      this.notificacoes.warning('Os planos escolhidos já têm OS aberta.');
      return;
    }
    const ignorados = controles.length - livres.length;
    const aviso = ignorados ? ` ${contar(ignorados, 'plano já tem', 'planos já têm')} OS aberta e fica de fora.` : '';
    const placas = [...new Set(livres.map((c) => formatarPlaca(c.placa)))];
    const veiculos = placas.length;
    const ok = await this.confirmacao.confirm({
      title: veiculos > 1 ? `Abrir ${veiculos} OS preventivas` : 'Abrir OS preventiva',
      message: (veiculos > 1
        ? `Uma OS por veículo (${placas.join(', ')}), com os itens e o roteiro de ${contar(livres.length, 'plano', 'planos')}. Entram como pendentes para agendar com a oficina; se o veículo já tiver uma preventiva esperando, o plano entra nela.`
        : `${placas[0]}: ${livres.map((c) => c.plano).join(', ')}. A OS entra como pendente, com os itens e o roteiro do plano; se o veículo já tiver uma preventiva esperando, o plano entra nela.`) + aviso,
      confirmLabel: veiculos > 1 ? `Abrir ${veiculos} OS` : 'Abrir OS'
    });
    if (!ok) return;
    this.abrindo.set(true);
    this.preventiva.abrirOs(livres.map((c) => c.id)).subscribe({
      next: (r) => {
        this.abrindo.set(false);
        this.selecionados.set([]);
        const unica = r.ordens.length === 1 ? r.ordens[0] : null;
        this.notificacoes.success(resumoOsPreventivas(r, formatarPlaca), {
          action: unica
            ? { label: `Ver a OS ${unica.numero}`, run: () => this.verOs(unica.id) }
            : { label: 'Ver as OS', run: () => this.escolher('COM_OS') }
        });
        this.lista.reload();
      },
      error: (e) => {
        this.abrindo.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected informar(c: ControlePreventivo): void {
    this.emInforme.set(c);
    this.informarAberto.set(true);
  }

  protected verVeiculo(c: ControlePreventivo): void {
    void this.router.navigate(['/frota/veiculos', c.idVeiculo], { queryParams: { aba: 'preventiva' } });
  }

  protected verOs(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id]);
  }

  protected irParaPlanos(): void {
    void this.router.navigate(['/frota/cadastros/planos-preventiva']);
  }
}
