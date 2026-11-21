import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { Subject, catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ObraAProgramar, PreviaProgramacao, ResultadoProgramacao, SituacaoIntervencao, TurnoProgramacao } from '../../../core/models/obras-programacao.models';
import { PlanejamentoObra } from '../../../core/models/obras-planejamento.models';
import { ObrasPlanejamentoService } from '../../../core/services/obras-planejamento.service';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { ObrasService } from '../../../core/services/obras.service';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { formatarDataParaApi, formatarMoeda, parseDataBrParaDate } from '../obras-ui';
import { CondicoesProgramacaoComponent, camposDesligamento } from './condicoes-programacao.component';
import { EquipesProjecaoComponent } from './equipes-projecao.component';
import { proximoDiaDeSemana, sugerirDescricao } from './programacao.logic';
import { locaisProgramaveis } from './programar.logic';

/**
 * Programa itens do planejamento: período, equipe com projeção e condições da intervenção. Aberto pelo planejamento,
 * recebe a obra e os itens marcados; aberto pela tela de programação ("Nova programação"), a obra e os pontos são
 * escolhidos aqui mesmo. As regras são as mesmas nos dois caminhos: prévia e gravação passam pelo mesmo serviço.
 */
@Component({
  selector: 'app-programar-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    CondicoesProgramacaoComponent,
    EquipesProjecaoComponent
  ],
  template: `
    <geo-form-drawer [(visible)]="aberto" [title]="livre() ? 'Nova programação' : 'Programar'" [description]="descricaoDrawer()" [dirty]="alterado()" size="lg">
      @if (livre()) {
        <geo-form-section title="Obra e pontos" icon="pi pi-building" description="As obras com serviço por programar aparecem primeiro, com o valor pendente.">
          <geo-select label="Obra" [required]="true" [options]="opcoesObra()" [value]="obraEscolhida()" (valueChange)="escolherObra($any($event))"
            [filter]="true" [clearable]="true" [loading]="carregandoObras()" placeholder="Busque pelo número ou título"
            [error]="tentou() && !obraEscolhida() ? 'Escolha a obra.' : undefined"></geo-select>
          @if (erroPlano(); as mensagem) {
            <geo-callout tone="danger" [dense]="true">{{ mensagem }}</geo-callout>
          } @else if (carregandoPlano()) {
            <p class="programar__resumo programar__muted" role="status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Lendo o planejamento da obra…</p>
          } @else if (plano(); as pl) {
            @if (!pl.kits.length) {
              <geo-callout tone="warning" [dense]="true">
                Esta obra ainda não tem planejamento: sem kits nos pontos, não há o que programar.
                <a class="programar__link" [routerLink]="['/obras', pl.idObra, 'planejamento']" (click)="aberto.set(false)">Abrir o planejamento</a>
              </geo-callout>
            } @else if (!locais().length) {
              <geo-callout tone="info" [dense]="true">
                Todos os serviços planejados desta obra já estão programados ou concluídos. Para mudar uma programação, abra-a na agenda e use Reprogramar.
              </geo-callout>
            } @else {
              <div class="programar__locais-topo">
                <span><strong>{{ locaisMarcados().size }}</strong> de {{ locais().length }} {{ locais().length === 1 ? 'local' : 'locais' }} com serviço pendente</span>
                <span class="programar__locais-acoes">
                  <button type="button" class="programar__link" (click)="marcarTodos(true)">Marcar todos</button>
                  <button type="button" class="programar__link" (click)="marcarTodos(false)">Desmarcar</button>
                </span>
              </div>
              <ul class="programar__locais" aria-label="Pontos e vãos a programar">
                @for (l of locais(); track l.id) {
                  <li>
                    <geo-boolean-control [label]="l.rotulo + ' · ' + l.kits.join(', ')" [description]="l.servicos + (l.servicos === 1 ? ' serviço pendente' : ' serviços pendentes')"
                      [value]="locaisMarcados().has(l.id)" (valueChange)="marcarLocal(l.id, $event)"></geo-boolean-control>
                  </li>
                }
              </ul>
              @if (tentou() && !idsEfetivos().length) {
                <geo-callout tone="danger" [dense]="true">Marque ao menos um ponto ou vão.</geo-callout>
              }
            }
          }
        </geo-form-section>
      }

      <geo-form-section title="O que será programado" icon="pi pi-list-check">
        <geo-text-input label="Descrição do planejamento" [required]="true" [maxlength]="500" [value]="descricao()" (valueChange)="editarDescricao($event)"
          [error]="tentou() && !descricao().trim() ? 'Informe a descrição do planejamento.' : undefined"></geo-text-input>
        @if (erroPrevia(); as mensagem) {
          <geo-callout tone="danger" [dense]="true">{{ mensagem }}</geo-callout>
        }
        @if (previa(); as p) {
          <p class="programar__resumo">
            <strong>{{ p.itens }} {{ p.itens === 1 ? 'item' : 'itens' }}</strong>:
            {{ p.servicos }} {{ p.servicos === 1 ? 'serviço' : 'serviços' }} e {{ p.materiais }} {{ p.materiais === 1 ? 'material' : 'materiais' }}, {{ moeda(p.valor) }} pelo valor vigente no início.
          </p>
          @if (p.ignoradosProgramados || p.ignoradosConcluidos) {
            <geo-callout tone="warning" [dense]="true">
              {{ foraDaProgramacao(p) }}
            </geo-callout>
          }
          @if (p.materiaisIncluidos) {
            <geo-callout tone="info" [dense]="true">{{ p.materiaisIncluidos }} {{ p.materiaisIncluidos === 1 ? 'material acompanha' : 'materiais acompanham' }} os serviços selecionados.</geo-callout>
          }
          @if (p.servicosSemValor) {
            <geo-callout tone="warning" [dense]="true">Sem valor vigente no início, fora da soma: {{ p.nomesServicosSemValor.join(', ') }}. Confira as Ações do contrato.</geo-callout>
          }
          @if (p.obraSemLocalizacao) {
            <geo-callout tone="warning" [dense]="true">A obra não tem coordenada nem endereço: a equipe não terá "Como chegar" no app. Cadastre a localização na obra.</geo-callout>
          }
          @if (!p.itens) {
            <geo-callout tone="danger" [dense]="true">Nenhum item pendente nesta seleção.</geo-callout>
          }
        } @else if (livre() && !obraEscolhida()) {
          <p class="programar__resumo programar__muted">Escolha a obra para ver os itens, o valor e as equipes.</p>
        }
      </geo-form-section>

      <geo-form-section title="Período" icon="pi pi-calendar">
        <div class="geo-form-grid">
          <geo-datepicker label="Início" [required]="true" [value]="inicio()" (valueChange)="definirInicio($any($event))" [error]="erroPeriodo('inicio')"></geo-datepicker>
          <geo-datepicker label="Fim" [required]="true" [value]="fim()" (valueChange)="definirFim($any($event))" [minDate]="inicio()" [error]="erroPeriodo('fim')"></geo-datepicker>
        </div>
        @if (semDiaUtil()) {
          <geo-callout tone="warning" [dense]="true">Este período não tem dia útil: só fim de semana ou feriado.</geo-callout>
        }
        @if (passaDoPrazo(); as aviso) {
          <geo-callout tone="warning" [dense]="true">{{ aviso }}</geo-callout>
        }
      </geo-form-section>

      <geo-form-section title="Condições da intervenção" icon="pi pi-bolt" description="Linha viva e desligamento precisam de resposta a cada programação.">
        <app-condicoes-programacao [validar]="tentou()" [(linhaViva)]="linhaViva" [(desligamento)]="desligamento"
          [(finalizaObra)]="finalizaObra" [(turno)]="turno" [(situacaoIntervencao)]="situacaoIntervencao" [(observacao)]="observacao"
          [(horaDesligamentoInicio)]="horaDesligamentoInicio" [(horaDesligamentoFim)]="horaDesligamentoFim" [(numeroManobra)]="numeroManobra"></app-condicoes-programacao>
      </geo-form-section>

      @if (materiaisASolicitar(); as qtd) {
        <geo-form-section title="Solicitação de material" icon="pi pi-box"
          description="Ao programar, os materiais a instalar viram uma solicitação técnica ao almoxarifado, com o início como saque previsto.">
          <p class="programar__resumo">
            <strong>{{ qtd }} {{ qtd === 1 ? 'material' : 'materiais' }}</strong> {{ qtd === 1 ? 'será solicitado' : 'serão solicitados' }}
            com saque previsto para <strong>{{ inicioTexto() }}</strong>. Material a retirar da rede volta pela devolução, depois da execução.
          </p>
          <div class="geo-form-grid">
            <geo-select label="Almoxarifado de atendimento" [required]="true" [options]="opcoesAlmoxarifado()" [value]="idAlmoxarifado()"
              (valueChange)="idAlmoxarifado.set($any($event))" [filter]="true" [loading]="carregandoAlmoxarifados()" placeholder="Selecione"
              [error]="tentou() && !idAlmoxarifado() ? 'Escolha o almoxarifado que vai atender.' : undefined"></geo-select>
            @if (exigeOcorrencia()) {
              <geo-text-input label="Ocorrência (OC/OS)" [required]="true" [maxlength]="100" [value]="ocorrencia()" (valueChange)="ocorrencia.set($event)"
                hint="Obra corretiva ou preventiva: a solicitação precisa da OS/OC."
                [error]="tentou() && !ocorrencia().trim() ? 'Informe a OC/OS.' : undefined"></geo-text-input>
            }
          </div>
          @if (previa()?.materiaisForaDeObras?.length) {
            <geo-callout tone="danger" [dense]="true">
              {{ previa()!.materiaisForaDeObras!.length === 1 ? 'Este material não é do processo Obras e impede programar:' : 'Estes materiais não são do processo Obras e impedem programar:' }}
              @for (material of previa()!.materiaisForaDeObras!; track material; let ultimo = $last) {
                <a class="programar__material" [href]="linkMaterial(material)" target="_blank" rel="noopener" [title]="'Abrir o cadastro de ' + material + ' em outra aba'">{{ material }}</a>{{ ultimo ? '.' : '; ' }}
              } Ajuste o processo no cadastro do material (abre em outra aba, sem perder esta programação) ou tire o item do kit.
            </geo-callout>
          }
          @if (saqueEmCimaDaHora()) {
            <geo-callout tone="warning" [dense]="true">Saque com menos de 48 horas: o almoxarifado vê a solicitação como fora do prazo.</geo-callout>
          }
        </geo-form-section>
      }

      <geo-form-section title="Equipe" icon="pi pi-users">
        <app-equipes-projecao [equipes]="previa()?.equipes ?? []" [carregando]="carregando()" [turno]="turno()" [(selecionada)]="idEquipe"></app-equipes-projecao>
        @if (tentou() && !idEquipe()) {
          <geo-callout tone="danger" [dense]="true">Escolha a equipe.</geo-callout>
        }
      </geo-form-section>

      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="aberto.set(false)"></geo-button>
        <geo-button icon="pi pi-calendar-plus" label="Programar" [loading]="salvando()" [disabled]="!previa()?.itens" (pressed)="confirmar()"></geo-button>
      </div>
    </geo-form-drawer>
  `,
  styles: [`
    .programar__resumo { margin: 0; font-size: 0.875rem; }
    .programar__muted { display: flex; gap: 0.5rem; align-items: center; color: var(--geo-foreground-muted); }
    .programar__locais-topo { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; font-size: var(--geo-font-control); }
    .programar__locais-acoes { display: inline-flex; gap: 0.75rem; }
    .programar__link { padding: 0; border: 0; background: transparent; color: var(--geo-brand); font: inherit; font-weight: 600; cursor: pointer; }
    .programar__material { color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
    .programar__link:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .programar__locais { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.25rem 1rem; max-height: 16rem; margin: 0;
      padding: 0.5rem 0.75rem; overflow-y: auto; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); list-style: none; }
  `]
})
export class ProgramarDrawerComponent {
  private readonly api = inject(ObrasProgramacaoService);
  private readonly obrasApi = inject(ObrasService);
  private readonly planejamentoApi = inject(ObrasPlanejamentoService);
  private readonly almoxarifadoApi = inject(AlmoxarifadoService);
  private readonly solicitacoesApi = inject(SolicitacaoMaterialTecnicaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly aberto = model(false);
  /** Sem obra, o drawer vira "Nova programação": a obra e os pontos são escolhidos nele. */
  readonly idObra = input<string | null>(null);
  readonly idsItens = input<readonly string[]>([]);
  /** Texto inicial da descrição, montado com o que foi selecionado. */
  readonly sugestaoDescricao = input('');
  /** Sugestões ao abrir, vindas de onde o usuário clicou (equipe livre, obra a programar, dia da agenda). */
  readonly idEquipeInicial = input<string | null>(null);
  readonly dataInicial = input<Date | null>(null);
  readonly idObraInicial = input<string | null>(null);
  readonly programado = output<ResultadoProgramacao>();

  protected readonly inicio = signal<Date | null>(null);
  protected readonly fim = signal<Date | null>(null);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly descricao = signal('');
  protected readonly linhaViva = signal<boolean | null>(null);
  protected readonly desligamento = signal<boolean | null>(null);
  protected readonly horaDesligamentoInicio = signal('');
  protected readonly horaDesligamentoFim = signal('');
  protected readonly numeroManobra = signal('');
  protected readonly finalizaObra = signal<boolean | null>(null);
  protected readonly turno = signal<TurnoProgramacao | null>(null);
  protected readonly situacaoIntervencao = signal<SituacaoIntervencao | null>(null);
  protected readonly observacao = signal('');
  protected readonly idAlmoxarifado = signal<string | null>(null);
  protected readonly ocorrencia = signal('');
  protected readonly opcoesAlmoxarifado = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoAlmoxarifados = signal(false);
  protected readonly materiaisASolicitar = computed(() => this.previa()?.materiaisASolicitar ?? 0);
  protected readonly exigeOcorrencia = computed(() => {
    const tipo = this.previa()?.tipoObra;
    return tipo === 'CORRETIVA' || tipo === 'PREVENTIVA';
  });
  protected readonly inicioTexto = computed(() => this.inicio()?.toLocaleDateString('pt-BR') ?? '—');
  /** Mesma regra do almoxarifado: saque com menos de dois dias de antecedência é fora do prazo. */
  protected readonly saqueEmCimaDaHora = computed(() => {
    const inicio = this.inicio();
    if (!inicio) return false;
    const hoje = new Date();
    return inicio < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2);
  });
  /** Obra para a qual o almoxarifado já foi sugerido, para não sobrescrever a escolha do usuário. */
  private almoxarifadoSugeridoPara: string | null = null;
  /** Base operacional de cada almoxarifado físico, para sugerir o da base da obra. */
  private basePorAlmoxarifado = new Map<string, string | null>();

  protected readonly previa = signal<PreviaProgramacao | null>(null);

  /** "300045 - CONECTOR…" → cadastro de materiais já filtrado pelo código. */
  protected linkMaterial(material: string): string {
    const codigo = material.split(' - ')[0].trim();
    return `/almoxarifado/materiais?busca=${encodeURIComponent(codigo)}`;
  }
  protected readonly erroPrevia = signal<string | null>(null);
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  protected readonly livre = computed(() => !this.idObra());
  protected readonly obraEscolhida = signal<string | null>(null);
  protected readonly opcoesObra = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoObras = signal(false);
  protected readonly plano = signal<PlanejamentoObra | null>(null);
  protected readonly carregandoPlano = signal(false);
  protected readonly erroPlano = signal<string | null>(null);
  protected readonly locais = computed(() => {
    const plano = this.plano();
    return plano ? locaisProgramaveis(plano) : [];
  });
  protected readonly locaisMarcados = signal<ReadonlySet<string>>(new Set());
  private readonly obraEfetiva = computed(() => this.idObra() ?? this.obraEscolhida());
  protected readonly idsEfetivos = computed<string[]>(() => {
    if (!this.livre()) return [...this.idsItens()];
    const marcados = this.locaisMarcados();
    return this.locais().filter((l) => marcados.has(l.id)).flatMap((l) => l.idsItens);
  });
  private readonly descricaoSugerida = computed(() => {
    if (!this.livre()) return this.sugestaoDescricao();
    const marcados = this.locais().filter((l) => this.locaisMarcados().has(l.id));
    return sugerirDescricao(marcados.map((l) => l.rotulo), marcados.flatMap((l) => l.kits));
  });
  /** A descrição acompanha a seleção de pontos até o usuário escrever a dele. */
  private descricaoEditada = false;

  /** A data ainda é a sugerida pela tela, não a escolhida pelo usuário. */
  private dataSugerida = false;
  private readonly pedidos = new Subject<{ idObra: string; idsItens: string[]; inicio: string; fim: string }>();

  protected readonly periodoValido = computed(() => {
    const inicio = this.inicio();
    const fim = this.fim();
    return !!inicio && !!fim && fim >= inicio;
  });
  protected readonly alterado = computed(() => !!(this.idEquipe() || this.linhaViva() !== null || this.desligamento() !== null || this.obraEscolhida()));
  protected readonly descricaoDrawer = computed(() => {
    if (this.livre() && !this.obraEscolhida()) return 'Escolha a obra, os pontos do planejamento, o período e a equipe.';
    const total = this.idsEfetivos().length;
    return `${total} ${total === 1 ? 'item selecionado' : 'itens selecionados'} no planejamento`;
  });
  protected readonly moeda = formatarMoeda;
  protected readonly semDiaUtil = computed(() => (this.previa()?.equipes[0]?.diasUteis ?? 1) === 0);
  protected readonly passaDoPrazo = computed(() => {
    const previa = this.previa();
    const fim = this.fim();
    if (!previa || !fim) return null;
    const regulado = parseDataBrParaDate(previa.prazoRegulado);
    if (regulado && fim > regulado) return `Termina depois do prazo regulado da obra (${previa.prazoRegulado}).`;
    const previsto = parseDataBrParaDate(previa.prazoPrevisto);
    return previsto && fim > previsto ? `Termina depois da previsão de conclusão da obra (${previa.prazoPrevisto}).` : null;
  });

  constructor() {
    this.pedidos
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erroPrevia.set(null);
        }),
        switchMap(({ idObra, ...pedido }) =>
          this.api.previa(idObra, pedido).pipe(
            catchError((e) => {
              this.erroPrevia.set(getErrorMessage(e));
              return of(null);
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((previa) => {
        this.carregando.set(false);
        this.previa.set(previa);
        this.pularFeriadoDaSugestao(previa);
        // O desligamento marcado nos pontos do planejamento já vem respondido (dá para trocar).
        if (previa?.desligamentoSugerido != null && this.desligamento() === null) this.desligamento.set(previa.desligamentoSugerido);
      });

    effect(() => {
      if (this.aberto()) untracked(() => this.limpar());
    });
    effect(() => {
      const idObra = this.obraEfetiva();
      const ids = this.idsEfetivos();
      if (!this.aberto() || !this.periodoValido() || !idObra) return;
      if (this.livre() && !ids.length) {
        untracked(() => this.previa.set(null));
        return;
      }
      this.pedidos.next({ idObra, idsItens: ids, inicio: formatarDataParaApi(this.inicio())!, fim: formatarDataParaApi(this.fim())! });
    });
    effect(() => {
      const idObra = this.obraEfetiva();
      if (this.aberto() && idObra && this.materiaisASolicitar() > 0 && this.almoxarifadoSugeridoPara !== idObra) {
        untracked(() => this.sugerirAlmoxarifado(idObra));
      }
    });
    effect(() => {
      const sugestao = this.descricaoSugerida();
      if (this.livre() && !this.descricaoEditada) untracked(() => this.descricao.set(sugestao));
    });
  }

  private limpar(): void {
    const dataInicial = this.dataInicial();
    const dia = dataInicial ?? proximoDiaDeSemana(new Date());
    this.inicio.set(dia);
    this.fim.set(dia);
    this.dataSugerida = !dataInicial;
    this.idEquipe.set(this.idEquipeInicial());
    this.descricao.set(this.sugestaoDescricao());
    this.descricaoEditada = false;
    this.linhaViva.set(null);
    this.desligamento.set(null);
    this.horaDesligamentoInicio.set('');
    this.horaDesligamentoFim.set('');
    this.numeroManobra.set('');
    this.finalizaObra.set(false);
    this.turno.set('DIA_TODO');
    this.situacaoIntervencao.set(null);
    this.observacao.set('');
    this.idAlmoxarifado.set(null);
    this.ocorrencia.set('');
    this.almoxarifadoSugeridoPara = null;
    this.tentou.set(false);
    this.previa.set(null);
    if (this.livre()) {
      if (!this.opcoesObra().length) this.carregarObras();
      this.escolherObra(this.idObraInicial());
    }
  }

  /** Obras abertas para escolher: as com serviço pendente primeiro, com o valor que falta programar. */
  private carregarObras(): void {
    this.carregandoObras.set(true);
    forkJoin({
      pendentes: this.api.obrasAProgramar().pipe(catchError(() => of([] as ObraAProgramar[]))),
      todas: this.obrasApi.listarObras({ page: 0, size: 500, sort: 'numero,asc' }).pipe(catchError(() => of(null)))
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ pendentes, todas }) => {
      this.carregandoObras.set(false);
      const comPendencia = new Set(pendentes.map((o) => o.idObra));
      const opcoes: GeoSelectOption<string>[] = pendentes.map((o) => ({ value: o.idObra, label: `${o.numero} · ${o.titulo} — ${formatarMoeda(o.valorPendente)} a programar` }));
      for (const o of todas?.content ?? []) {
        if (!comPendencia.has(o.id) && !o.statusConcluida) opcoes.push({ value: o.id, label: `${o.numero} · ${o.titulo} — nada pendente` });
      }
      this.opcoesObra.set(opcoes);
    });
  }

  protected escolherObra(idObra: string | null): void {
    this.obraEscolhida.set(idObra);
    this.plano.set(null);
    this.erroPlano.set(null);
    this.previa.set(null);
    this.locaisMarcados.set(new Set());
    this.descricaoEditada = false;
    if (!idObra) {
      this.carregandoPlano.set(false);
      return;
    }
    this.carregandoPlano.set(true);
    this.planejamentoApi.buscar(idObra).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (plano) => {
        if (this.obraEscolhida() !== idObra) return;
        this.carregandoPlano.set(false);
        this.plano.set(plano);
        this.locaisMarcados.set(new Set(locaisProgramaveis(plano).map((l) => l.id)));
      },
      error: (e) => {
        if (this.obraEscolhida() !== idObra) return;
        this.carregandoPlano.set(false);
        this.erroPlano.set(e?.status === 404
          ? 'Esta obra ainda não tem planejamento. Abra o planejamento para lançar os pontos e os kits.'
          : getErrorMessage(e));
      }
    });
  }

  /**
   * Almoxarifados físicos para atender. Sugere o da última solicitação técnica da obra; sem histórico, o almoxarifado
   * da base operacional da obra (ou o único que houver).
   */
  private sugerirAlmoxarifado(idObra: string): void {
    this.almoxarifadoSugeridoPara = idObra;
    this.carregandoAlmoxarifados.set(true);
    forkJoin({
      estoques: this.opcoesAlmoxarifado().length ? of(null) : this.almoxarifadoApi.listarEstoquesAtivos().pipe(catchError(() => of(null))),
      ultima: this.solicitacoesApi.listar({ idObra, contexto: 'TECNICO', page: 0, size: 1, sort: 'dataSolicitacao,desc' }).pipe(catchError(() => of(null))),
      obra: this.obrasApi.buscarObraPorId(idObra).pipe(catchError(() => of(null)))
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ estoques, ultima, obra }) => {
      this.carregandoAlmoxarifados.set(false);
      if (estoques) {
        const fisicos = estoques.content.filter((e) => e.tipoEstoque?.nome === 'FISICO');
        this.basePorAlmoxarifado = new Map(fisicos.map((e) => [e.id, e.idBaseOperacional ?? null]));
        this.opcoesAlmoxarifado.set(fisicos.map((e) => ({ value: e.id, label: e.nomeIdentificador })));
      }
      if (this.idAlmoxarifado() || this.obraEfetiva() !== idObra) return;
      const opcoes = this.opcoesAlmoxarifado();
      const anterior = ultima?.content[0]?.idAlmoxarifadoAtendimento;
      const daBase = obra?.baseOperacionalId
        ? opcoes.filter((o) => this.basePorAlmoxarifado.get(o.value) === obra.baseOperacionalId) : [];
      if (anterior && opcoes.some((o) => o.value === anterior)) this.idAlmoxarifado.set(anterior);
      else if (daBase.length === 1) this.idAlmoxarifado.set(daBase[0].value);
      else if (opcoes.length === 1) this.idAlmoxarifado.set(opcoes[0].value);
    });
  }

  protected marcarLocal(id: string, marcado: boolean): void {
    const proximos = new Set(this.locaisMarcados());
    if (marcado) proximos.add(id);
    else proximos.delete(id);
    this.locaisMarcados.set(proximos);
  }

  protected marcarTodos(marcar: boolean): void {
    this.locaisMarcados.set(new Set(marcar ? this.locais().map((l) => l.id) : []));
  }

  protected editarDescricao(texto: string): void {
    if (texto !== this.descricao()) this.descricaoEditada = true;
    this.descricao.set(texto);
  }

  /** A tela não conhece os feriados, o servidor sim: se o dia sugerido caiu num, passa para o seguinte. */
  private pularFeriadoDaSugestao(previa: PreviaProgramacao | null): void {
    const inicio = this.inicio();
    if (!this.dataSugerida || !inicio || !previa?.equipes.length || previa.equipes[0].diasUteis > 0) return;
    const seguinte = proximoDiaDeSemana(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 1));
    this.inicio.set(seguinte);
    this.fim.set(seguinte);
  }

  /** O fim acompanha o início para não sobrar período invertido a cada troca de data. */
  protected definirInicio(data: Date | null): void {
    this.dataSugerida = false;
    this.inicio.set(data);
    const fim = this.fim();
    if (data && (!fim || fim < data)) this.fim.set(data);
  }

  protected definirFim(data: Date | null): void {
    this.dataSugerida = false;
    this.fim.set(data);
  }

  protected foraDaProgramacao(p: PreviaProgramacao): string {
    const partes: string[] = [];
    if (p.ignoradosProgramados) partes.push(`${p.ignoradosProgramados} já ${p.ignoradosProgramados === 1 ? 'programado' : 'programados'}`);
    if (p.ignoradosConcluidos) partes.push(`${p.ignoradosConcluidos} já ${p.ignoradosConcluidos === 1 ? 'concluído' : 'concluídos'}`);
    return `Ficam de fora da programação: ${partes.join(' e ')}.`;
  }

  protected erroPeriodo(campo: 'inicio' | 'fim'): string | undefined {
    if (campo === 'inicio') return this.tentou() && !this.inicio() ? 'Informe o início.' : undefined;
    if (!this.fim()) return this.tentou() ? 'Informe o fim.' : undefined;
    return this.inicio() && this.fim()! < this.inicio()! ? 'O fim não pode ser antes do início.' : undefined;
  }

  protected confirmar(): void {
    this.tentou.set(true);
    const linhaViva = this.linhaViva();
    const desligamento = this.desligamento();
    const finalizaObra = this.finalizaObra();
    const turno = this.turno();
    const situacao = this.situacaoIntervencao();
    const idEquipe = this.idEquipe();
    const idObra = this.obraEfetiva();
    const idsItens = this.idsEfetivos();
    if (!idObra || !idsItens.length || !this.periodoValido() || !idEquipe || !this.descricao().trim() || linhaViva === null
      || desligamento === null || finalizaObra === null || !turno || !situacao) {
      return;
    }
    const comMaterial = this.materiaisASolicitar() > 0;
    if (comMaterial && (!this.idAlmoxarifado() || (this.exigeOcorrencia() && !this.ocorrencia().trim()))) {
      return;
    }
    this.salvando.set(true);
    this.api.programar(idObra, {
      idsItens,
      idEquipe,
      inicio: formatarDataParaApi(this.inicio())!,
      fim: formatarDataParaApi(this.fim())!,
      descricao: this.descricao().trim(),
      linhaViva,
      desligamento,
      finalizaObra,
      turno,
      situacaoIntervencao: situacao,
      observacao: this.observacao().trim() || null,
      idAlmoxarifadoAtendimento: comMaterial ? this.idAlmoxarifado() : null,
      ocorrencia: comMaterial && this.exigeOcorrencia() ? this.ocorrencia().trim() : null,
      ...camposDesligamento(desligamento, this.horaDesligamentoInicio(), this.horaDesligamentoFim(), this.numeroManobra())
    }).subscribe({
      next: (resultado) => {
        this.salvando.set(false);
        this.aberto.set(false);
        const ignorados = resultado.ignoradosProgramados + resultado.ignoradosConcluidos;
        this.notificacoes.success(`Programação #${resultado.programacao.numero} criada para ${resultado.programacao.codigoEquipe}.`
          + (ignorados ? ` ${ignorados} ${ignorados === 1 ? 'item ficou' : 'itens ficaram'} de fora.` : '')
          + (resultado.materiaisSolicitados
            ? ` ${resultado.materiaisSolicitados} ${resultado.materiaisSolicitados === 1 ? 'material solicitado' : 'materiais solicitados'} ao almoxarifado.`
            : ''));
        this.programado.emit(resultado);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
