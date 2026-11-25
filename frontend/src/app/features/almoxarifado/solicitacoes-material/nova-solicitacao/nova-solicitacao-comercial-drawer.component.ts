import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, model, output, signal, untracked } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoSelectComponent,
  GeoSelectOption,
  NotificationService
} from '@geo/ui';
import { forkJoin } from 'rxjs';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { EstoqueResponse } from '../../../../core/models/almoxarifado.models';
import { EquipeResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { RhService } from '../../../../core/services/rh.service';
import { LinhaMaterial, NovaSolicitacaoMateriaisComponent } from './nova-solicitacao-materiais.component';
import { dataCivil, foraDoPrazo, hoje, membrosDaEquipe } from './nova-solicitacao.util';

const ehTipo = (e: EstoqueResponse, tipo: string) => e.tipoEstoque?.nome?.trim().toUpperCase() === tipo;

/**
 * Nova solicitação comercial (221): do almoxarifado físico para o estoque de campo da equipe.
 * Um formulário só: quem retira, de onde sai, quando, e os materiais com o saldo da origem.
 */
@Component({
  selector: 'app-nova-solicitacao-comercial-drawer',
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
    NovaSolicitacaoMateriaisComponent
  ],
  styleUrl: './nova-solicitacao.css',
  template: `
    <geo-form-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      title="Nova solicitação comercial (221)"
      description="Material do almoxarifado para o estoque de campo da equipe. Passa por aprovação antes de sair."
      size="lg"
      [resizable]="true"
    >
      <div class="ns">
        @if (erroApoio()) {
          <geo-callout tone="danger" title="Não foi possível carregar equipes e estoques">
            {{ erroApoio() }}
            <geo-button label="Tentar de novo" icon="pi pi-refresh" variant="outline" size="sm" (pressed)="carregarApoio()" />
          </geo-callout>
        }

        <section class="ns-secao" aria-labelledby="nsc-saque">
          <h3 id="nsc-saque" class="ns-secao__titulo"><i class="pi pi-users" aria-hidden="true"></i>Saque</h3>
          <div class="ns-cartao">
            <div class="ns-grade">
              <geo-select
                label="Equipe"
                placeholder="Selecione a equipe"
                [options]="opcoesEquipe()"
                [value]="idEquipe()"
                (valueChange)="trocarEquipe($event)"
                [filter]="true"
                [loading]="carregando()"
                [required]="true"
                [error]="erroEquipe()"
                [description]="destino() ? 'Entra no estoque de campo ' + destino()!.nomeIdentificador + '.' : undefined"
              />
              <geo-select
                label="Sai do almoxarifado"
                placeholder="Selecione o almoxarifado"
                [options]="opcoesOrigem()"
                [(value)]="idOrigem"
                [filter]="true"
                [loading]="carregando()"
                [required]="true"
                [error]="tentou() && !idOrigem() ? 'Escolha o almoxarifado.' : undefined"
              />
              <geo-datepicker
                label="Retirada prevista"
                [value]="dataPrevista()"
                (valueChange)="dataPrevista.set($any($event))"
                [minDate]="hoje"
                [required]="true"
                [error]="tentou() && !dataPrevista() ? 'Informe a data da retirada.' : undefined"
                description="Peça com 48 horas de antecedência."
              />
              @if (!foraEquipe()) {
                <geo-select
                  label="Quem retira"
                  [placeholder]="idEquipe() ? 'Membro da equipe' : 'Escolha a equipe primeiro'"
                  [options]="opcoesMembro()"
                  [(value)]="idColaborador"
                  [disabled]="!idEquipe()"
                  [clearable]="true"
                  [showOptional]="true"
                  description="Pode ficar para a hora da entrega."
                />
              } @else {
                <geo-select
                  label="Quem retira"
                  placeholder="Buscar colaborador"
                  [options]="opcoesColaborador()"
                  [(value)]="idColaborador"
                  [filter]="true"
                  [loading]="buscandoColaborador()"
                  (search)="buscaColaborador.search($event)"
                  (opened)="abrirBuscaColaborador()"
                  [clearable]="true"
                  [showOptional]="true"
                />
              }
            </div>
            <geo-boolean-control kind="toggle" label="Retirada por alguém de outra equipe" [value]="foraEquipe()" (valueChange)="trocarForaEquipe($event)" />
            @if (prazoCurto()) {
              <p class="ns-info ns-info--aviso" aria-live="polite">
                <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                <span>Retirada em menos de 48 horas: a solicitação fica marcada como <strong>fora do prazo</strong>.</span>
              </p>
            }
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="nsc-materiais">
          <div class="ns-secao__topo">
            <h3 id="nsc-materiais" class="ns-secao__titulo"><i class="pi pi-box" aria-hidden="true"></i>Materiais</h3>
            @if (linhas().length) {
              <span class="ns-secao__dica">{{ linhas().length }} {{ linhas().length === 1 ? 'material' : 'materiais' }} · {{ total() | number: '1.0-3' }} no total</span>
            }
          </div>
          <app-nova-solicitacao-materiais processo="COMERCIAL"
            [(linhas)]="linhas"
            [idEstoque]="idOrigem()"
            [nomeEstoque]="nomeOrigem()"
            rotuloOrigem="o almoxarifado"
            [erro]="tentou() && !linhas().length ? 'Inclua ao menos um material.' : undefined"
          />
        </section>
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo" aria-live="polite">
          @if (linhas().length) {
            <strong>{{ linhas().length }}</strong> {{ linhas().length === 1 ? 'material' : 'materiais' }}{{ destino() ? ' para ' + destino()!.nomeIdentificador : '' }}
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="visible.set(false)" />
          <geo-button label="Criar solicitação" icon="pi pi-send" [loading]="salvando()" (pressed)="criar()" />
        </span>
      </div>
    </geo-form-drawer>
  `
})
export class NovaSolicitacaoComercialDrawerComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly criada = output<void>();

  protected readonly hoje = hoje();
  private readonly estoques = signal<EstoqueResponse[]>([]);
  private readonly equipes = signal<EquipeResponse[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erroApoio = signal<string | null>(null);

  protected readonly idEquipe = signal<string | null>(null);
  protected readonly idOrigem = signal<string | null>(null);
  protected readonly dataPrevista = signal<Date | null>(null);
  protected readonly idColaborador = signal<string | null>(null);
  protected readonly foraEquipe = signal(false);
  protected readonly linhas = signal<LinhaMaterial[]>([]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);

  protected readonly buscaColaborador = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => (this.idColaborador() ? [this.idColaborador()!] : []),
    destroyRef: this.destroyRef
  });
  protected readonly opcoesColaborador = this.buscaColaborador.items;
  protected readonly buscandoColaborador = this.buscaColaborador.loading;

  protected readonly equipe = computed(() => this.equipes().find((e) => e.id === this.idEquipe()) ?? null);
  protected readonly destino = computed(() => this.estoques().find((e) => e.ativo && e.idEquipe === this.idEquipe() && ehTipo(e, 'CAMPO')) ?? null);
  protected readonly origens = computed(() => this.estoques().filter((e) => e.ativo && ehTipo(e, 'FISICO')));
  protected readonly nomeOrigem = computed(() => this.origens().find((e) => e.id === this.idOrigem())?.nomeIdentificador ?? 'o almoxarifado');
  protected readonly opcoesEquipe = computed<GeoSelectOption<string>[]>(() =>
    this.equipes().map((e) => ({ label: `${e.codigo} · ${e.tipoEquipe?.nome ?? 'Equipe'}`, value: e.id }))
  );
  protected readonly opcoesOrigem = computed<GeoSelectOption<string>[]>(() => this.origens().map((e) => ({ label: e.nomeIdentificador, value: e.id })));
  protected readonly opcoesMembro = computed<GeoSelectOption<string>[]>(() => membrosDaEquipe(this.equipe()));
  protected readonly erroEquipe = computed(() => {
    if (this.idEquipe() && !this.carregando() && !this.destino()) return 'Esta equipe não tem estoque de campo ativo. Regularize o cadastro dela.';
    return this.tentou() && !this.idEquipe() ? 'Escolha a equipe.' : undefined;
  });
  protected readonly prazoCurto = computed(() => foraDoPrazo(this.dataPrevista()));
  protected readonly total = computed(() => this.linhas().reduce((t, l) => t + (l.quantidade ?? 0), 0));

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.limpar();
        if (!this.equipes().length) this.carregarApoio();
      });
    });
  }

  protected carregarApoio(): void {
    this.carregando.set(true);
    this.erroApoio.set(null);
    forkJoin({
      estoques: this.almoxarifado.listarEstoquesAtivos(),
      equipes: this.rh.listarEquipes({ ativo: true, size: 1000, sort: 'codigo,asc' })
    }).subscribe({
      next: ({ estoques, equipes }) => {
        this.estoques.set(estoques.content ?? []);
        this.equipes.set(equipes.content ?? []);
        this.carregando.set(false);
        if (this.origens().length === 1) this.idOrigem.set(this.origens()[0].id);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erroApoio.set(getErrorMessage(e));
      }
    });
  }

  protected trocarEquipe(id: string | null): void {
    this.idEquipe.set(id);
    if (!this.foraEquipe() && !this.opcoesMembro().some((o) => o.value === this.idColaborador())) this.idColaborador.set(null);
    // Sugere o almoxarifado da base da equipe.
    const base = this.equipe()?.baseOperacional?.id;
    if (base && !this.idOrigem()) {
      const daBase = this.origens().find((e) => e.idBaseOperacional === base);
      if (daBase) this.idOrigem.set(daBase.id);
    }
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
    this.tentou.set(true);
    const linhas = this.linhas();
    if (!this.idEquipe() || !this.destino() || !this.idOrigem() || !this.dataPrevista()) {
      return this.notificacoes.warning('Preencha a equipe, o almoxarifado e a data da retirada.');
    }
    if (!linhas.length) return this.notificacoes.warning('Inclua ao menos um material.');
    const semQuantidade = linhas.find((l) => !((l.quantidade ?? 0) > 0));
    if (semQuantidade) return this.notificacoes.warning(`${semQuantidade.material.codigo}: informe a quantidade.`);

    this.salvando.set(true);
    this.almoxarifado
      .criarSolicitacaoDireta({
        idEstoqueOrigem: this.idOrigem()!,
        idEquipe: this.idEquipe()!,
        dataPrevista: dataCivil(this.dataPrevista()!),
        idColaboradorSaque: this.idColaborador(),
        saqueForaEquipe: this.foraEquipe(),
        itens: linhas.map((l) => ({ idMaterial: l.material.id, quantidade: l.quantidade! }))
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.notificacoes.success('Solicitação comercial criada. Agora ela aguarda aprovação.');
          this.visible.set(false);
          this.criada.emit();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível criar a solicitação' });
        }
      });
  }

  private limpar(): void {
    this.idEquipe.set(null);
    this.idOrigem.set(this.origens().length === 1 ? this.origens()[0].id : null);
    this.dataPrevista.set(null);
    this.idColaborador.set(null);
    this.foraEquipe.set(false);
    this.linhas.set([]);
    this.tentou.set(false);
  }
}
