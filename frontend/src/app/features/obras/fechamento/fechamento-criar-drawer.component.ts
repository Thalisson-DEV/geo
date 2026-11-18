import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
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

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import { EstoqueResponse } from '../../../core/models/almoxarifado.models';
import { CriarFechamentoRequest, TipoFechamento } from '../../../core/models/fechamento-obra.models';
import { ObraResumoResponse } from '../../../core/models/obras.models';
import { SupervisorMinResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
import { novaChaveIdempotencia } from '../../../core/utils/idempotencia.util';
import { ehFalhaDeTransporte } from '../../../core/utils/solicitacao-tecnica-error.util';
import {
  LinhaMaterial,
  NovaSolicitacaoMateriaisComponent
} from '../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao-materiais.component';
import { TIPOS_FECHAMENTO, dataIsoLocal, iconeTipo, tipoFechamento } from './fechamento-ui';

interface Bloco {
  tipo: TipoFechamento;
  reserva: string;
  dataReserva: Date | null;
  linhas: LinhaMaterial[];
}

const ehFisico = (e: EstoqueResponse) => e.ativo && e.tipoEstoque?.nome?.trim().toUpperCase() === 'FISICO';

/**
 * Nova solicitação de encerramento: para uma obra, uma solicitação por tipo (221, 921, 222, 922),
 * cada uma com seus materiais e, se já existir, a reserva. Sem agendamento, separação ou assinatura.
 */
@Component({
  selector: 'app-fechamento-criar-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    NovaSolicitacaoMateriaisComponent
  ],
  styleUrl: '../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao.css',
  template: `
    <geo-form-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      title="Nova solicitação de encerramento"
      description="Regularize o saldo da obra no SAP. Monte um bloco para cada tipo; cada bloco vira uma solicitação."
      size="lg"
      [resizable]="true"
    >
      <div class="ns">
        @if (erroApoio()) {
          <geo-callout tone="danger" title="Não foi possível carregar obras e almoxarifados">
            {{ erroApoio() }}
            <geo-button label="Tentar de novo" icon="pi pi-refresh" variant="outline" size="sm" (pressed)="carregarApoio()" />
          </geo-callout>
        }

        <section class="ns-secao" aria-labelledby="fc-obra">
          <h3 id="fc-obra" class="ns-secao__titulo"><i class="pi pi-building" aria-hidden="true"></i>Obra e almoxarifado</h3>
          <div class="ns-cartao">
            <geo-select label="Obra" placeholder="Buscar por número ou título" [options]="opcoesObra()" [(value)]="idObra"
              [filter]="true" [loading]="carregando()" [required]="true"
              [error]="tentou() && !idObra() ? 'Escolha a obra.' : undefined" />
            <geo-select label="Almoxarifado" placeholder="Selecione o almoxarifado" [options]="opcoesAlmoxarifado()" [(value)]="idAlmoxarifado"
              [filter]="true" [loading]="carregando()" [required]="true"
              description="Na adição, o material sai daqui para a obra; na devolução, volta para cá."
              [error]="tentou() && !idAlmoxarifado() ? 'Escolha o almoxarifado.' : undefined" />
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="fc-responsaveis">
          <div class="ns-secao__topo">
            <h3 id="fc-responsaveis" class="ns-secao__titulo"><i class="pi pi-users" aria-hidden="true"></i>Responsáveis</h3>
            <span class="ns-secao__dica">Opcional</span>
          </div>
          <div class="ns-cartao">
            <div class="ns-grade">
              <geo-select label="Encarregado" placeholder="Buscar colaborador" [options]="opcoesColaborador()" [(value)]="idEncarregado"
                [filter]="true" [loading]="buscandoColaborador()" (search)="buscaColaborador.search($event)" (opened)="abrirBuscaColaborador()" [clearable]="true" />
              <geo-select label="Supervisor" placeholder="Selecione o supervisor" [options]="opcoesSupervisor()" [(value)]="idSupervisor"
                [filter]="true" [clearable]="true" [loading]="carregando()"
                [description]="coordenador() ? 'Coordenador: ' + coordenador() : 'O coordenador vem do supervisor.'" />
            </div>
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="fc-tipos">
          <h3 id="fc-tipos" class="ns-secao__titulo"><i class="pi pi-sliders-h" aria-hidden="true"></i>Tipos</h3>
          <div class="ns-pilulas" role="group" aria-label="Tipos de solicitação a criar">
            @for (t of tipos; track t.value) {
              <button type="button" class="ns-pilula" [attr.aria-pressed]="tem(t.value)" (click)="alternarTipo(t.value)" [title]="t.descricao">
                <strong>{{ t.value }}</strong> {{ t.nome }}
              </button>
            }
          </div>
          @if (tentou() && !blocos().length) {
            <p class="ns-info ns-info--aviso" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i><span>Escolha ao menos um tipo.</span></p>
          }
        </section>

        @for (b of blocos(); track b.tipo; let i = $index) {
          <section class="ns-secao" [attr.aria-labelledby]="'fc-bloco-' + b.tipo">
            <div class="ns-secao__topo">
              <h3 [id]="'fc-bloco-' + b.tipo" class="ns-secao__titulo">
                <i [class]="iconeTipo(b.tipo)" aria-hidden="true"></i>{{ b.tipo }} · {{ tipo(b.tipo).nome }}
              </h3>
              <span class="ns-secao__dica">{{ tipo(b.tipo).adicao ? 'Almoxarifado → obra' : 'Obra → almoxarifado' }}</span>
            </div>
            <div class="ns-cartao">
              <div class="ns-grade">
                <geo-text-input label="Número da reserva" placeholder="Se já existir no SAP" [value]="b.reserva" (valueChange)="alterarBloco(i, { reserva: $event })"
                  [maxlength]="20"
                  [error]="tentou() && reservaInvalida(b.reserva) ? 'Só números, até 20 dígitos.' : undefined"
                  description="Sem reserva, a solicitação tem 48 horas úteis para recebê-la." />
                <geo-datepicker label="Data da reserva" [value]="b.dataReserva" (valueChange)="alterarBloco(i, { dataReserva: $any($event) })"
                  [maxDate]="hoje" [clearable]="true" [disabled]="!b.reserva.trim()" />
              </div>
            </div>
            <app-nova-solicitacao-materiais processo="OBRAS"
              [linhas]="b.linhas"
              (linhasChange)="alterarBloco(i, { linhas: $event })"
              [idEstoque]="tipo(b.tipo).adicao ? idAlmoxarifado() : null"
              [nomeEstoque]="nomeAlmoxarifado()"
              rotuloOrigem="o almoxarifado"
              [mostrarSaldo]="tipo(b.tipo).adicao"
              [erro]="tentou() && !b.linhas.length ? 'Inclua ao menos um material.' : undefined"
            />
          </section>
        }

        <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" placeholder="Informação para o almoxarifado" />
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo" aria-live="polite">
          @if (blocos().length) {
            <strong>{{ blocos().length }}</strong> {{ blocos().length === 1 ? 'solicitação' : 'solicitações' }}{{ obra() ? ' para a obra ' + obra()!.numero : '' }}
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="visible.set(false)" />
          <geo-button [label]="rotuloCriar()" [icon]="pendente() ? 'pi pi-refresh' : 'pi pi-send'" [loading]="salvando()" (pressed)="criar()" />
        </span>
      </div>
    </geo-form-drawer>
  `
})
export class FechamentoCriarDrawerComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly obrasService = inject(ObrasService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly idObraInicial = input<string | null>(null);
  readonly criadas = output<string[]>();

  protected readonly tipos = TIPOS_FECHAMENTO;
  protected readonly tipo = tipoFechamento;
  protected readonly iconeTipo = iconeTipo;
  protected readonly hoje = new Date();

  private readonly obras = signal<ObraResumoResponse[]>([]);
  private readonly estoques = signal<EstoqueResponse[]>([]);
  private readonly supervisores = signal<SupervisorMinResponse[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erroApoio = signal<string | null>(null);

  protected readonly idObra = signal<string | null>(null);
  protected readonly idAlmoxarifado = signal<string | null>(null);
  protected readonly idEncarregado = signal<string | null>(null);
  protected readonly idSupervisor = signal<string | null>(null);
  protected readonly observacao = signal('');
  protected readonly blocos = signal<Bloco[]>([]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  private readonly envioPendente = signal<{ pedido: CriarFechamentoRequest; chave: string } | null>(null);
  protected readonly pendente = computed(() => !!this.envioPendente());

  protected readonly buscaColaborador = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => (this.idEncarregado() ? [this.idEncarregado()!] : []),
    destroyRef: this.destroyRef
  });
  protected readonly opcoesColaborador = this.buscaColaborador.items;
  protected readonly buscandoColaborador = this.buscaColaborador.loading;

  protected readonly obra = computed(() => this.obras().find((o) => o.id === this.idObra()) ?? null);
  protected readonly opcoesObra = computed<GeoSelectOption<string>[]>(() => this.obras().map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.id })));
  private readonly almoxarifados = computed(() => this.estoques().filter(ehFisico));
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() =>
    this.almoxarifados().map((e) => ({ label: e.nomeIdentificador, value: e.id }))
  );
  protected readonly nomeAlmoxarifado = computed(
    () => this.almoxarifados().find((e) => e.id === this.idAlmoxarifado())?.nomeIdentificador ?? 'o almoxarifado'
  );
  protected readonly opcoesSupervisor = computed<GeoSelectOption<string>[]>(() =>
    this.supervisores().map((s) => ({ label: s.nomeColaborador, value: s.id }))
  );
  protected readonly coordenador = computed(() => this.supervisores().find((s) => s.id === this.idSupervisor())?.nomeCoordenador ?? null);
  protected readonly rotuloCriar = computed(() => {
    if (this.pendente()) return 'Tentar novamente';
    const n = this.blocos().length;
    return n > 1 ? `Criar as ${n} solicitações` : 'Criar solicitação';
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const obra = this.idObraInicial();
      untracked(() => {
        if (this.envioPendente()) return;
        this.limpar();
        if (!this.obras().length) this.carregarApoio();
        if (obra) this.idObra.set(obra);
      });
    });
  }

  protected carregarApoio(): void {
    this.carregando.set(true);
    this.erroApoio.set(null);
    forkJoin({
      obras: this.obrasService.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }),
      estoques: this.almoxarifado.listarEstoquesAtivos(),
      supervisores: this.rh.listarSupervisoresAtivosMin()
    }).subscribe({
      next: ({ obras, estoques, supervisores }) => {
        this.obras.set(obras.content ?? []);
        this.estoques.set(estoques.content ?? []);
        this.supervisores.set(supervisores ?? []);
        if (!this.idAlmoxarifado() && this.almoxarifados().length === 1) this.idAlmoxarifado.set(this.almoxarifados()[0].id);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erroApoio.set(getErrorMessage(e));
      }
    });
  }

  protected abrirBuscaColaborador(): void {
    if (!this.opcoesColaborador().length) this.buscaColaborador.search('');
  }

  protected tem(tipo: TipoFechamento): boolean {
    return this.blocos().some((b) => b.tipo === tipo);
  }

  protected alternarTipo(tipo: TipoFechamento): void {
    if (this.tem(tipo)) {
      const bloco = this.blocos().find((b) => b.tipo === tipo)!;
      if (bloco.linhas.length) {
        this.notificacoes.info(`O bloco ${tipo} saiu com ${bloco.linhas.length} ${bloco.linhas.length === 1 ? 'material' : 'materiais'}.`);
      }
      this.blocos.update((bs) => bs.filter((b) => b.tipo !== tipo));
      return;
    }
    const ordem = TIPOS_FECHAMENTO.map((t) => t.value);
    this.blocos.update((bs) =>
      [...bs, { tipo, reserva: '', dataReserva: null, linhas: [] }].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo))
    );
  }

  protected alterarBloco(indice: number, mudanca: Partial<Bloco>): void {
    this.envioPendente.set(null);
    this.blocos.update((bs) => bs.map((b, i) => (i === indice ? { ...b, ...mudanca } : b)));
  }

  protected reservaInvalida(valor: string): boolean {
    return !!valor.trim() && !/^\d{1,20}$/.test(valor.trim());
  }

  protected criar(): void {
    if (this.salvando()) return;
    this.tentou.set(true);
    const blocos = this.blocos();
    const valido =
      !!this.idObra() &&
      !!this.idAlmoxarifado() &&
      blocos.length > 0 &&
      blocos.every((b) => b.linhas.length > 0 && b.linhas.every((l) => (l.quantidade ?? 0) > 0) && !this.reservaInvalida(b.reserva));
    if (!valido) {
      this.notificacoes.warning('Confira os campos destacados antes de criar.');
      return;
    }
    const envio = this.envioPendente() ?? { pedido: this.montarPedido(), chave: novaChaveIdempotencia() };
    this.envioPendente.set(envio);
    this.salvando.set(true);
    this.service.criar(envio.pedido, envio.chave).subscribe({
      next: ({ ids }) => {
        this.salvando.set(false);
        this.envioPendente.set(null);
        this.notificacoes.success(ids.length === 1 ? 'Solicitação de encerramento criada.' : `${ids.length} solicitações de encerramento criadas.`);
        this.visible.set(false);
        this.criadas.emit(ids);
      },
      error: (e) => {
        this.salvando.set(false);
        if (ehFalhaDeTransporte(e)) {
          this.notificacoes.warning('A conexão caiu antes da resposta. Tente novamente: nada será criado em dobro.');
          return;
        }
        this.envioPendente.set(null);
        this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível criar' });
      }
    });
  }

  private montarPedido(): CriarFechamentoRequest {
    return {
      idObra: this.idObra()!,
      idAlmoxarifadoAtendimento: this.idAlmoxarifado()!,
      idEncarregado: this.idEncarregado(),
      idSupervisor: this.idSupervisor(),
      observacao: this.observacao().trim() || null,
      solicitacoes: this.blocos().map((b) => ({
        tipo: b.tipo,
        numeroReserva: b.reserva.trim() || null,
        dataReserva: b.reserva.trim() ? dataIsoLocal(b.dataReserva) : null,
        itens: b.linhas.map((l) => ({ idMaterial: l.material.id, quantidade: l.quantidade ?? 0 }))
      }))
    };
  }

  private limpar(): void {
    this.idObra.set(null);
    this.idEncarregado.set(null);
    this.idSupervisor.set(null);
    this.observacao.set('');
    this.blocos.set([]);
    this.tentou.set(false);
  }
}
