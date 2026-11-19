import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { forkJoin } from 'rxjs';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { EstoqueResponse } from '../../../../core/models/almoxarifado.models';
import { ObraResponse, ObraResumoResponse } from '../../../../core/models/obras.models';
import { EquipeResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { CriarSolicitacaoTecnicaRequest } from '../../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { RhService } from '../../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../../core/services/solicitacao-material-tecnica.service';
import { novaChaveIdempotencia } from '../../../../core/utils/idempotencia.util';
import { ehFalhaDeTransporte, mensagemErroSolicitacao, normalizeOcorrencia } from '../../../../core/utils/solicitacao-tecnica-error.util';
import { LinhaMaterial, NovaSolicitacaoMateriaisComponent } from './nova-solicitacao-materiais.component';
import { dataCivil, foraDoPrazo, hoje, membrosDaEquipe } from './nova-solicitacao.util';

const ehTipo = (e: EstoqueResponse, ...tipos: string[]) => tipos.includes(e.tipoEstoque?.nome?.trim().toUpperCase() ?? '');

/**
 * Nova solicitação técnica (221/921): material do almoxarifado para a obra. Só a obra, o almoxarifado
 * e os materiais são obrigatórios; data, equipe e quem retira podem ficar para o planejamento.
 * Materiais 221 e 921 juntos viram duas solicitações, uma de cada tipo.
 */
@Component({
  selector: 'app-nova-solicitacao-tecnica-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    NovaSolicitacaoMateriaisComponent
  ],
  styleUrl: './nova-solicitacao.css',
  template: `
    <geo-form-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      title="Nova solicitação técnica (221/921)"
      description="Material do almoxarifado para a obra. Data do saque e equipe podem ficar para o planejamento."
      size="lg"
      [resizable]="true"
    >
      <div class="ns">
        @if (erroApoio()) {
          <geo-callout tone="danger" title="Não foi possível carregar obras e equipes">
            {{ erroApoio() }}
            <geo-button label="Tentar de novo" icon="pi pi-refresh" variant="outline" size="sm" (pressed)="carregarApoio(null)" />
          </geo-callout>
        }

        <section class="ns-secao" aria-labelledby="nst-obra">
          <h3 id="nst-obra" class="ns-secao__titulo"><i class="pi pi-building" aria-hidden="true"></i>Obra e atendimento</h3>
          <div class="ns-cartao">
            <geo-select
              label="Obra"
              placeholder="Buscar por número ou título"
              [options]="opcoesObra()"
              [value]="idObra()"
              (valueChange)="trocarObra($event)"
              [filter]="true"
              [loading]="carregando()"
              [required]="true"
              [error]="tentou() && !idObra() ? 'Escolha a obra.' : undefined"
              [description]="descricaoObra()"
            />
            @if (exigeOcorrencia()) {
              <geo-text-input
                [label]="'Número da ' + rotuloExecucao()"
                [value]="ocorrencia()"
                (valueChange)="ocorrencia.set($event)"
                [maxlength]="100"
                [required]="true"
                placeholder="Como está na ordem"
                [error]="tentou() && !ocorrencia().trim() ? 'Informe o número da ' + rotuloExecucao() + '.' : undefined"
                [description]="'O material vai para esta ' + rotuloExecucao() + ', não para a obra inteira.'"
              />
              @if (ocorrenciasDaObra().length) {
                <div class="ns-pilulas" role="group" [attr.aria-label]="rotuloExecucao() + ' já usadas nesta obra'">
                  @for (oc of ocorrenciasDaObra(); track oc) {
                    <button type="button" class="ns-pilula ns-pilula--pequena" [attr.aria-pressed]="normalizar(ocorrencia()) === oc" (click)="ocorrencia.set(oc)">
                      <i class="pi pi-history" aria-hidden="true"></i>{{ oc }}
                    </button>
                  }
                </div>
              }
            }
            <geo-select
              label="Almoxarifado que atende"
              placeholder="Selecione o almoxarifado"
              [options]="opcoesAlmoxarifado()"
              [(value)]="idAlmoxarifado"
              [filter]="true"
              [loading]="carregando()"
              [required]="true"
              [error]="tentou() && !idAlmoxarifado() ? 'Escolha o almoxarifado.' : undefined"
              [description]="sugerido() ? 'Sugerido pela base de saque da obra.' : undefined"
            />
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="nst-materiais">
          <div class="ns-secao__topo">
            <h3 id="nst-materiais" class="ns-secao__titulo"><i class="pi pi-box" aria-hidden="true"></i>Materiais</h3>
            @if (linhas().length) {
              <span class="ns-secao__dica">{{ linhas().length }} {{ linhas().length === 1 ? 'material' : 'materiais' }} · {{ total() | number: '1.0-3' }} no total</span>
            }
          </div>
          <app-nova-solicitacao-materiais processo="OBRAS"
            [(linhas)]="linhas"
            [comTipo]="true"
            [idEstoque]="idAlmoxarifado()"
            [nomeEstoque]="nomeAlmoxarifado()"
            rotuloOrigem="o almoxarifado"
            [erro]="tentou() && !linhas().length ? 'Inclua ao menos um material.' : undefined"
          />
          @if (tiposJuntos()) {
            <geo-callout tone="info" title="Vão ser criadas duas solicitações">
              Os materiais 221 e 921 seguem separados: uma solicitação para cada tipo, com o mesmo planejamento.
            </geo-callout>
          }
        </section>

        <section class="ns-secao" aria-labelledby="nst-saque">
          <div class="ns-secao__topo">
            <h3 id="nst-saque" class="ns-secao__titulo"><i class="pi pi-calendar" aria-hidden="true"></i>Planejamento do saque</h3>
            <span class="ns-secao__dica">Opcional agora</span>
          </div>
          <div class="ns-cartao">
            <div class="ns-grade">
              <geo-datepicker
                label="Saque previsto"
                [value]="dataPrevista()"
                (valueChange)="dataPrevista.set($any($event))"
                [minDate]="hoje"
                [clearable]="true"
                [description]="dataPrevista() ? undefined : 'Sem data, entra na fila como A planejar.'"
              />
              <geo-select
                label="Equipe"
                placeholder="A definir"
                [options]="opcoesEquipe()"
                [value]="idEquipe()"
                (valueChange)="trocarEquipe($event)"
                [filter]="true"
                [clearable]="true"
                [loading]="carregando()"
              />
              @if (!foraEquipe()) {
                <geo-select
                  class="ns-grade--larga"
                  label="Quem retira"
                  [placeholder]="idEquipe() ? 'Membro da equipe' : 'Escolha a equipe primeiro'"
                  [options]="opcoesMembro()"
                  [(value)]="idColaborador"
                  [disabled]="!idEquipe()"
                  [clearable]="true"
                />
              } @else {
                <geo-select
                  class="ns-grade--larga"
                  label="Quem retira"
                  placeholder="Buscar colaborador"
                  [options]="opcoesColaborador()"
                  [(value)]="idColaborador"
                  [filter]="true"
                  [loading]="buscandoColaborador()"
                  (search)="buscaColaborador.search($event)"
                  (opened)="abrirBuscaColaborador()"
                  [clearable]="true"
                />
              }
            </div>
            <geo-boolean-control kind="toggle" label="Retirada por alguém de outra equipe" [value]="foraEquipe()" (valueChange)="trocarForaEquipe($event)" />
            @if (prazoCurto()) {
              <p class="ns-info ns-info--aviso" aria-live="polite">
                <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                <span>Saque em menos de 48 horas: a solicitação fica marcada como <strong>fora do prazo</strong>.</span>
              </p>
            }
            <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" placeholder="Informação para o almoxarifado e a equipe" />
          </div>
        </section>
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo" aria-live="polite">
          @if (linhas().length) {
            <strong>{{ linhas().length }}</strong> {{ linhas().length === 1 ? 'material' : 'materiais' }}{{ obra() ? ' para a obra ' + obra()!.numero : '' }}
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="visible.set(false)" />
          <geo-button [label]="pendente() ? 'Tentar novamente' : tiposJuntos() ? 'Criar as 2 solicitações' : 'Criar solicitação'"
            [icon]="pendente() ? 'pi pi-refresh' : 'pi pi-send'" [loading]="salvando()" (pressed)="criar()" />
        </span>
      </div>
    </geo-form-drawer>
  `
})
export class NovaSolicitacaoTecnicaDrawerComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly obrasService = inject(ObrasService);
  private readonly rh = inject(RhService);
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  /** Obra já escolhida (ficha da obra, "Solicitar materiais"). */
  readonly idObraInicial = input<string | null>(null);
  /** Ids criados: a lista recarrega e, se for uma só, abre o detalhe. */
  readonly criada = output<string[]>();

  protected readonly hoje = hoje();
  protected readonly normalizar = normalizeOcorrencia;
  private readonly obras = signal<ObraResumoResponse[]>([]);
  private readonly equipes = signal<EquipeResponse[]>([]);
  private readonly estoques = signal<EstoqueResponse[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erroApoio = signal<string | null>(null);

  protected readonly idObra = signal<string | null>(null);
  protected readonly obraDetalhe = signal<ObraResponse | null>(null);
  protected readonly ocorrenciasDaObra = signal<string[]>([]);
  protected readonly ocorrencia = signal('');
  protected readonly idAlmoxarifado = signal<string | null>(null);
  protected readonly sugerido = signal(false);
  protected readonly dataPrevista = signal<Date | null>(null);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly idColaborador = signal<string | null>(null);
  protected readonly foraEquipe = signal(false);
  protected readonly observacao = signal('');
  protected readonly linhas = signal<LinhaMaterial[]>([]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  /** Envio que caiu na rede: repete com a mesma chave para não duplicar. */
  private readonly envioPendente = signal<{ pedido: CriarSolicitacaoTecnicaRequest; chave: string } | null>(null);
  protected readonly pendente = computed(() => !!this.envioPendente());

  protected readonly buscaColaborador = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => (this.idColaborador() ? [this.idColaborador()!] : []),
    destroyRef: this.destroyRef
  });
  protected readonly opcoesColaborador = this.buscaColaborador.items;
  protected readonly buscandoColaborador = this.buscaColaborador.loading;

  protected readonly obra = computed(() => this.obras().find((o) => o.id === this.idObra()) ?? null);
  private readonly controle = computed(() => this.obraDetalhe()?.controleExecucao ?? this.obra()?.controleExecucao ?? null);
  protected readonly exigeOcorrencia = computed(() => this.controle() === 'OS' || this.controle() === 'OC');
  protected readonly rotuloExecucao = computed(() => (this.controle() === 'OS' ? 'OS' : 'OC'));
  protected readonly descricaoObra = computed(() => {
    const o = this.obraDetalhe() ?? this.obra();
    if (!o) return undefined;
    const tipo = o.tipoObraNome || 'tipo não informado';
    return this.exigeOcorrencia() ? `${tipo} · material controlado por ${this.rotuloExecucao()}` : `${tipo} · material direto na obra`;
  });
  protected readonly equipe = computed(() => this.equipes().find((e) => e.id === this.idEquipe()) ?? null);
  private readonly almoxarifados = computed(() => this.estoques().filter((e) => e.ativo && ehTipo(e, 'FISICO', 'OBRA')));
  protected readonly nomeAlmoxarifado = computed(() => this.almoxarifados().find((e) => e.id === this.idAlmoxarifado())?.nomeIdentificador ?? 'o almoxarifado');

  protected readonly opcoesObra = computed<GeoSelectOption<string>[]>(() => this.obras().map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.id })));
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() => this.almoxarifados().map((e) => ({ label: e.nomeIdentificador, value: e.id })));
  protected readonly opcoesEquipe = computed<GeoSelectOption<string>[]>(() =>
    this.equipes().map((e) => ({ label: `${e.codigo} · ${e.tipoEquipe?.nome ?? 'Equipe'}`, value: e.id }))
  );
  protected readonly opcoesMembro = computed<GeoSelectOption<string>[]>(() => membrosDaEquipe(this.equipe()));
  protected readonly tiposJuntos = computed(() => new Set(this.linhas().map((l) => l.tipo)).size > 1);
  protected readonly prazoCurto = computed(() => foraDoPrazo(this.dataPrevista()));
  protected readonly total = computed(() => this.linhas().reduce((t, l) => t + (l.quantidade ?? 0), 0));

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const obra = this.idObraInicial();
      untracked(() => {
        this.limpar();
        if (this.obras().length) {
          if (obra) this.trocarObra(obra);
        } else {
          this.carregarApoio(obra);
        }
      });
    });
  }

  protected carregarApoio(idObra: string | null): void {
    this.carregando.set(true);
    this.erroApoio.set(null);
    forkJoin({
      obras: this.obrasService.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }),
      equipes: this.rh.listarEquipes({ ativo: true, size: 1000, sort: 'codigo,asc' }),
      estoques: this.almoxarifado.listarEstoquesAtivos()
    }).subscribe({
      next: ({ obras, equipes, estoques }) => {
        this.obras.set(obras.content ?? []);
        this.equipes.set(equipes.content ?? []);
        this.estoques.set(estoques.content ?? []);
        this.carregando.set(false);
        if (idObra) this.trocarObra(idObra);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erroApoio.set(getErrorMessage(e));
      }
    });
  }

  protected trocarObra(id: string | null): void {
    this.idObra.set(id);
    this.obraDetalhe.set(null);
    this.ocorrencia.set('');
    this.ocorrenciasDaObra.set([]);
    if (this.sugerido()) {
      this.idAlmoxarifado.set(null);
      this.sugerido.set(false);
    }
    if (!id) return;
    this.obrasService.buscarObraPorId(id).subscribe({
      next: (o) => {
        if (this.idObra() !== id) return;
        this.obraDetalhe.set(o);
        // A base de saque padrão da obra sugere o almoxarifado; dá para trocar.
        if (!this.idAlmoxarifado() && o.baseOperacionalId) {
          const daBase = this.almoxarifados().find((e) => ehTipo(e, 'FISICO') && e.idBaseOperacional === o.baseOperacionalId);
          if (daBase) {
            this.idAlmoxarifado.set(daBase.id);
            this.sugerido.set(true);
          }
        }
      }
    });
    this.service.obterProjecaoObra(id).subscribe({
      next: (p) => {
        if (this.idObra() !== id) return;
        // "88412" e "OC-88412" são a mesma ordem: mostra uma vez, preferindo a forma com prefixo.
        const porNumero = new Map<string, string>();
        for (const g of p.ocorrencias ?? []) {
          const codigo = normalizeOcorrencia(g.codigo);
          if (!codigo) continue;
          const numero = codigo.replace(/^(OS|OC)[\s-]*/, '');
          const atual = porNumero.get(numero);
          if (!atual || (!/^(OS|OC)/.test(atual) && /^(OS|OC)/.test(codigo))) porNumero.set(numero, codigo);
        }
        this.ocorrenciasDaObra.set([...porNumero.values()].slice(0, 8));
      },
      error: () => this.ocorrenciasDaObra.set([])
    });
  }

  protected trocarEquipe(id: string | null): void {
    this.idEquipe.set(id);
    if (!this.foraEquipe() && !this.opcoesMembro().some((o) => o.value === this.idColaborador())) this.idColaborador.set(null);
  }

  protected trocarForaEquipe(valor: boolean): void {
    this.foraEquipe.set(valor);
    this.idColaborador.set(null);
  }

  protected abrirBuscaColaborador(): void {
    if (!this.opcoesColaborador().length) this.buscaColaborador.search('');
  }

  protected criar(): void {
    if (this.salvando()) return;
    const envio = this.envioPendente() ?? this.montarPedido();
    if (!envio) return;
    this.envioPendente.set(envio);
    this.salvando.set(true);
    this.service.criar(envio.pedido, envio.chave).subscribe({
      next: (r) => {
        this.salvando.set(false);
        this.envioPendente.set(null);
        const criadas = r.solicitacoesCriadas ?? [];
        this.notificacoes.success(
          criadas.length > 1 ? `${criadas.length} solicitações técnicas criadas (uma por tipo).` : 'Solicitação técnica criada.'
        );
        this.visible.set(false);
        this.criada.emit(criadas.map((c) => c.id));
      },
      error: (e) => {
        this.salvando.set(false);
        if (ehFalhaDeTransporte(e)) {
          this.notificacoes.warning('A conexão caiu antes da resposta. Tente novamente: a solicitação não vai duplicar.');
          return;
        }
        this.envioPendente.set(null);
        this.notificacoes.error(mensagemErroSolicitacao(e), { title: 'Não foi possível criar a solicitação' });
      }
    });
  }

  private montarPedido(): { pedido: CriarSolicitacaoTecnicaRequest; chave: string } | null {
    this.tentou.set(true);
    const linhas = this.linhas();
    if (!this.idObra() || !this.idAlmoxarifado()) {
      this.notificacoes.warning('Escolha a obra e o almoxarifado.');
      return null;
    }
    const ocorrencia = normalizeOcorrencia(this.ocorrencia());
    if (this.exigeOcorrencia() && !ocorrencia) {
      this.notificacoes.warning(`Informe o número da ${this.rotuloExecucao()}.`);
      return null;
    }
    if (!linhas.length) {
      this.notificacoes.warning('Inclua ao menos um material.');
      return null;
    }
    const semQuantidade = linhas.find((l) => !((l.quantidade ?? 0) > 0));
    if (semQuantidade) {
      this.notificacoes.warning(`${semQuantidade.material.codigo}: informe a quantidade.`);
      return null;
    }
    const pedido: CriarSolicitacaoTecnicaRequest = {
      idObra: this.idObra()!,
      idAlmoxarifadoAtendimento: this.idAlmoxarifado()!,
      idEquipe: this.idEquipe(),
      idColaboradorSaque: this.idColaborador(),
      saqueForaEquipe: this.foraEquipe(),
      dataPrevista: this.dataPrevista() ? dataCivil(this.dataPrevista()!) : null,
      observacao: this.observacao().trim() || null,
      itens: linhas.map((l) => ({ idMaterial: l.material.id, tipoMovimentacao: l.tipo ?? 'ADICAO_COMUM', quantidade: l.quantidade! }))
    };
    if (this.exigeOcorrencia()) pedido.ocorrencia = ocorrencia;
    return { pedido, chave: novaChaveIdempotencia() };
  }

  private limpar(): void {
    this.idObra.set(null);
    this.obraDetalhe.set(null);
    this.ocorrencia.set('');
    this.ocorrenciasDaObra.set([]);
    this.idAlmoxarifado.set(null);
    this.sugerido.set(false);
    this.dataPrevista.set(null);
    this.idEquipe.set(null);
    this.idColaborador.set(null);
    this.foraEquipe.set(false);
    this.observacao.set('');
    this.linhas.set([]);
    this.tentou.set(false);
    this.envioPendente.set(null);
  }
}
