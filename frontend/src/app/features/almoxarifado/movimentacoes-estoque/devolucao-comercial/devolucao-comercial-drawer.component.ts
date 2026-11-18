import { iconeCondicao } from '../../../../shared/utils/movimentacao.utils';
import { DecimalPipe } from '@angular/common';
import { ItemDevolucaoComercialRequest } from '../../../../core/models/almoxarifado.models';
import { QuantidadeUnidadeComponent } from '../../shared/quantidade-unidade.component';
import { paraUnidadeBase } from '../../shared/unidade-material';
import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';

import { DevolucaoComercialRequest, EstoqueResponse, MaterialResponse, SaldoResponse } from '../../../../core/models/almoxarifado.models';
import { EquipeResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { createFormDraft } from '../../../../core/navigation';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { RhService } from '../../../../core/services/rh.service';
import { rotuloCondicao, tomCondicao } from '../../../../shared/utils/movimentacao.utils';
import { DevolucaoSeriesPickerComponent } from './devolucao-series-picker.component';

type Condicao = 'NOVO' | 'SUCATA';

interface LinhaDevolucao {
  chave: number;
  material: MaterialResponse;
  condicao: Condicao;
  quantidade: number | null;
  /** Unidade escolhida; nula = unidade do material. */
  unidade?: string | null;
  series: string[];
  /** Falso: o almoxarifado não guarda o material e ele sai em baixa na mesma operação. */
  guardar: boolean;
}

interface Rascunho {
  idEquipe: string | null;
  idDestino: string | null;
  observacao: string;
  linhas: LinhaDevolucao[];
}

function condicaoDe(saldo: SaldoResponse): Condicao {
  return saldo.condicao === 'SUCATA' ? 'SUCATA' : 'NOVO';
}

function tipoDe(estoque: EstoqueResponse): string {
  return estoque.tipoEstoque?.nome?.trim().toUpperCase() ?? '';
}

/** Devolução do estoque de campo de uma equipe comercial (222) para um almoxarifado físico. */
@Component({
  selector: 'app-devolucao-comercial-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QuantidadeUnidadeComponent,
    DecimalPipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
    DevolucaoSeriesPickerComponent
  ],
  styleUrl: '../../solicitacoes-material/nova-solicitacao/nova-solicitacao.css',
  styles: `
    .dc-item + .dc-item { border-top: 1px solid var(--geo-border); }
    .dc-item .ns-item { grid-template-columns: minmax(0, 1fr) minmax(9.5rem, auto) auto; }
    .dc-qtd-unidade { max-width: 15rem; }
    .dc-item--erro { box-shadow: inset 3px 0 0 var(--geo-danger); }
    .dc-qtd { font-size: var(--geo-font-control); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .dc-destino { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0 0.875rem 0.75rem; }
    .dc-erro { margin: 0; padding: 0 0.875rem 0.75rem; font-size: var(--geo-font-caption); color: var(--geo-danger-text, var(--geo-danger)); }
    .dc-series { padding: 0.75rem 0.875rem; border-top: 1px dashed var(--geo-border); background: var(--geo-surface-subtle); }
    .dc-resumo { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  `,
  template: `
    <geo-form-drawer #drawer [visible]="visible()" (visibleChange)="visible.set($event)" title="Devolução comercial (222)"
      description="A equipe devolve o material do estoque de campo e o almoxarifado recebe na hora." size="lg" [resizable]="true"
      [dirty]="alterado()" discardMessage="Os materiais e dados desta devolução serão perdidos.">
      <div class="ns">
        <section class="ns-secao" aria-labelledby="dc-quem">
          <h3 id="dc-quem" class="ns-secao__titulo"><i class="pi pi-users" aria-hidden="true"></i>Quem devolve e quem recebe</h3>
          <div class="ns-cartao">
            <div class="ns-grade">
              <geo-select label="Equipe que devolve" placeholder="Selecione" [options]="opcoesEquipe()" [value]="idEquipe()" (valueChange)="trocarEquipe($event)"
                [loading]="carregandoEquipes()" [filter]="true" [required]="true" [error]="tentou() && !idEquipe() ? 'Escolha a equipe.' : undefined" />
              <geo-select label="Almoxarifado que recebe" placeholder="Selecione" [options]="opcoesDestino()" [value]="idDestino()" (valueChange)="idDestino.set($event)"
                [filter]="true" [required]="true" [error]="tentou() && !idDestino() ? 'Escolha o almoxarifado.' : undefined" />
            </div>
            @if (idEquipe() && !estoqueCampo()) {
              <geo-callout tone="warning" title="Equipe sem estoque de campo">Sem estoque de campo ativo, a devolução não tem de onde sair. Cadastre o estoque da equipe antes.</geo-callout>
            }
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="dc-materiais">
          <div class="ns-secao__topo">
            <h3 id="dc-materiais" class="ns-secao__titulo"><i class="pi pi-box" aria-hidden="true"></i>Materiais</h3>
            <div class="ns-pilulas" role="radiogroup" aria-label="Condição do material a incluir">
              @for (c of condicoes; track c) {
                <button type="button" class="ns-pilula ns-pilula--pequena" role="radio" [attr.aria-checked]="condicaoFiltro() === c" (click)="condicaoFiltro.set(c)">
                  {{ rotuloCondicao(c) }} <strong>{{ contagem()[c] }}</strong>
                </button>
              }
            </div>
          </div>

          <geo-select label="Incluir material" [placeholder]="estoqueCampo() ? 'Buscar no saldo da equipe' : 'Escolha a equipe primeiro'" [options]="opcoesSaldo()" [value]="escolhido()"
            (valueChange)="escolher($event)" [filter]="true" [loading]="carregandoSaldos()" [disabled]="!estoqueCampo()"
            [description]="estoqueCampo() && !carregandoSaldos() && !opcoesSaldo().length ? 'Nada nesta condição para incluir.' : undefined" />

          @if (linhas().length) {
            <ul class="ns-lista" aria-label="Materiais da devolução">
              @for (linha of linhas(); track linha.chave) {
                <li class="dc-item" [class.dc-item--erro]="acimaDoSaldo(linha)" [attr.data-dc-linha]="linha.chave">
                  <div class="ns-item">
                    <div class="ns-item__material">
                      <span class="ns-item__nome" [title]="linha.material.descricao">{{ linha.material.descricao }}</span>
                      <span class="ns-item__meta">
                        <span>{{ linha.material.codigo }} · {{ unidade(linha) }}</span>
                        <geo-status [tone]="tomCondicao(linha.condicao)" [icon]="iconeCondicao(linha.condicao)">{{ rotuloCondicao(linha.condicao) }}</geo-status>
                        <span [class.ns-item__saldo--falta]="acimaDoSaldo(linha)">Equipe tem {{ saldo(linha) | number: '1.0-3' }}</span>
                      </span>
                    </div>
                    @if (linha.material.detalhaSerie) {
                      <span class="ns-item__qtd dc-qtd">{{ linha.series.length }} {{ linha.series.length === 1 ? 'série' : 'séries' }}</span>
                    } @else {
                      <app-quantidade-unidade class="ns-item__qtd dc-qtd-unidade" [material]="linha.material" [label]="'Quantidade de ' + linha.material.codigo" [labelVisible]="false"
                        [value]="linha.quantidade" (valueChange)="alterar(linha, { quantidade: $event })"
                        [unidade]="linha.unidade ?? null" (unidadeChange)="alterar(linha, { unidade: $event })"
                        [error]="tentou() && !(quantidade(linha) > 0) ? 'Informe a quantidade.' : undefined" />
                    }
                    <geo-icon-button icon="pi pi-trash" [label]="'Tirar ' + linha.material.codigo + ' da devolução'" tooltip="Tirar da devolução" size="icon-sm" (pressed)="remover(linha)" />
                  </div>
                  @if (acimaDoSaldo(linha)) {
                    <p class="dc-erro" role="alert">A quantidade passa do saldo da equipe.</p>
                  }
                  <div class="dc-destino">
                    <span class="ns-secao__dica">No almoxarifado</span>
                    <div class="ns-pilulas" role="radiogroup" [attr.aria-label]="'O que fazer com ' + linha.material.codigo + ' no almoxarifado'">
                      <button type="button" class="ns-pilula ns-pilula--pequena" role="radio" [attr.aria-checked]="linha.guardar" (click)="alterar(linha, { guardar: true })">
                        <i class="pi pi-inbox" aria-hidden="true"></i>Guardar no estoque
                      </button>
                      <button type="button" class="ns-pilula ns-pilula--pequena" role="radio" [attr.aria-checked]="!linha.guardar" (click)="alterar(linha, { guardar: false })">
                        <i class="pi pi-trash" aria-hidden="true"></i>Dar baixa
                      </button>
                    </div>
                  </div>
                  @if (linha.material.detalhaSerie) {
                    <div class="dc-series">
                      <app-devolucao-series-picker [series]="disponiveis(linha)" [loading]="carregandoSeries()[chaveSeries(linha)] ?? false" [condicao]="linha.condicao"
                        [selecionadas]="linha.series" (selecionadasChange)="alterar(linha, { series: $event })" />
                    </div>
                  }
                </li>
              }
            </ul>
          } @else {
            <div class="ns-vazio">
              <i class="pi pi-box" aria-hidden="true"></i>
              <span>Nenhum material ainda. Escolha a condição e busque no saldo da equipe.</span>
            </div>
          }
        </section>

        <section class="ns-secao" aria-labelledby="dc-observacao">
          <h3 id="dc-observacao" class="ns-secao__titulo"><i class="pi pi-comment" aria-hidden="true"></i>Observação</h3>
          <div class="ns-cartao">
            <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" placeholder="Ex.: sobra do turno, material retirado da rede" />
          </div>
        </section>
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="dc-resumo" aria-live="polite">
          @if (linhas().length) {
            <geo-status tone="info" icon="pi pi-inbox">{{ resumo().guardar }} para guardar</geo-status>
            @if (resumo().baixa) {
              <geo-status tone="neutral" icon="pi pi-trash">{{ resumo().baixa }} em baixa</geo-status>
            }
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="drawer.requestClose()" />
          <geo-button label="Registrar devolução" icon="pi pi-check-circle" [loading]="salvando()" [disabled]="!linhas().length" (pressed)="registrar()" />
        </span>
      </div>
    </geo-form-drawer>
  `
})
export class DevolucaoComercialDrawerComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly injector = inject(Injector);

  readonly visible = model(false);
  readonly estoques = input<EstoqueResponse[]>([]);
  /** Devolução gravada: quem abriu atualiza a lista. */
  readonly registrada = output<void>();

  protected readonly condicoes: Condicao[] = ['SUCATA', 'NOVO'];
  protected readonly rotuloCondicao = rotuloCondicao;
  protected readonly tomCondicao = tomCondicao;
  protected readonly iconeCondicao = iconeCondicao;

  private readonly equipes = signal<EquipeResponse[]>([]);
  protected readonly carregandoEquipes = signal(false);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly idDestino = signal<string | null>(null);
  protected readonly observacao = signal('');
  protected readonly linhas = signal<LinhaDevolucao[]>([]);
  protected readonly saldos = signal<SaldoResponse[]>([]);
  private readonly series = signal<Record<string, string[]>>({});
  protected readonly carregandoSeries = signal<Partial<Record<string, boolean>>>({});
  /** A devolução comercial é quase sempre sucata, que sai em baixa: abre nela. */
  protected readonly condicaoFiltro = signal<Condicao>('SUCATA');
  protected readonly escolhido = signal<string | null>(null);
  protected readonly carregandoSaldos = signal(false);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  private proximaChave = 1;
  private estavaAberto = false;
  private consultaSaldos = 0;
  private restaurado = false;

  /** Só em memória: as linhas podem trazer números de série (dado sensível). */
  private readonly rascunho = createFormDraft<Rascunho>({
    id: 'devolucao-comercial',
    route: '/almoxarifado/movimentacoes',
    persist: false,
    read: () => ({ idEquipe: this.idEquipe(), idDestino: this.idDestino(), observacao: this.observacao(), linhas: this.linhas() }),
    write: (valor) => {
      this.restaurado = true;
      this.idEquipe.set(valor.idEquipe);
      this.idDestino.set(valor.idDestino);
      this.observacao.set(valor.observacao);
      this.linhas.set(valor.linhas ?? []);
      this.proximaChave = Math.max(0, ...(valor.linhas ?? []).map((l) => l.chave)) + 1;
    }
  });

  protected readonly opcoesEquipe = computed<GeoSelectOption<string>[]>(() =>
    this.equipes().map((e) => ({ label: `${e.codigo} — ${e.tipoEquipe?.nome || 'Equipe'}`, value: e.id }))
  );
  protected readonly opcoesDestino = computed<GeoSelectOption<string>[]>(() =>
    this.estoques()
      .filter((e) => e.ativo && tipoDe(e) === 'FISICO')
      .map((e) => ({ label: e.nomeIdentificador, value: e.id }))
  );
  protected readonly estoqueCampo = computed(() => this.estoques().find((e) => e.ativo && e.idEquipe === this.idEquipe() && tipoDe(e) === 'CAMPO') ?? null);
  private readonly idEstoqueCampo = computed(() => this.estoqueCampo()?.id ?? null);

  /** Saldos com quantidade que ainda não estão na devolução. */
  private readonly saldosLivres = computed(() =>
    this.saldos().filter((s) => s.quantidade > 0 && !this.linhas().some((l) => l.material.id === s.material.id && l.condicao === condicaoDe(s)))
  );
  protected readonly contagem = computed<Record<Condicao, number>>(() => ({
    NOVO: this.saldosLivres().filter((s) => condicaoDe(s) === 'NOVO').length,
    SUCATA: this.saldosLivres().filter((s) => condicaoDe(s) === 'SUCATA').length
  }));
  protected readonly opcoesSaldo = computed<GeoSelectOption<string>[]>(() =>
    this.saldosLivres()
      .filter((s) => condicaoDe(s) === this.condicaoFiltro())
      .map((s) => ({
        label: `${s.material.codigo} — ${s.material.descricao} · saldo ${s.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`,
        value: s.id
      }))
  );
  protected readonly resumo = computed(() => ({
    guardar: this.linhas().filter((l) => l.guardar).length,
    baixa: this.linhas().filter((l) => !l.guardar).length
  }));
  protected readonly alterado = computed(() => !!this.linhas().length || !!this.observacao().trim() || !!this.idEquipe() || !!this.idDestino());

  constructor() {
    this.rascunho.restore();
    effect(() => {
      const aberto = this.visible();
      untracked(() => {
        if (aberto && !this.estavaAberto) {
          if (!this.restaurado) this.limpar();
          this.restaurado = false;
          this.carregarEquipes();
        } else if (!aberto && this.estavaAberto) {
          this.limpar();
          this.rascunho.clear();
        }
        this.estavaAberto = aberto;
      });
    });
    effect(() => {
      const id = this.idEstoqueCampo();
      untracked(() => this.carregarSaldos(id));
    });
  }

  private limpar(): void {
    this.idEquipe.set(null);
    this.idDestino.set(null);
    this.observacao.set('');
    this.linhas.set([]);
    this.series.set({});
    this.condicaoFiltro.set('SUCATA');
    this.tentou.set(false);
  }

  private carregarEquipes(): void {
    if (this.equipes().length || this.carregandoEquipes()) return;
    this.carregandoEquipes.set(true);
    this.rh.listarEquipes({ ativo: true, size: 1000, sort: 'codigo,asc' }).subscribe({
      next: (r) => {
        this.equipes.set(r.content ?? []);
        this.carregandoEquipes.set(false);
      },
      error: () => {
        this.carregandoEquipes.set(false);
        this.notificacoes.warning('Não foi possível carregar as equipes.');
      }
    });
  }

  private carregarSaldos(idEstoque: string | null): void {
    const consulta = ++this.consultaSaldos;
    this.saldos.set([]);
    if (!idEstoque) return this.carregandoSaldos.set(false);
    this.carregandoSaldos.set(true);
    this.almoxarifado.listarSaldos({ idEstoque, size: 1000 }).subscribe({
      next: (r) => {
        if (consulta !== this.consultaSaldos) return;
        this.saldos.set(r.content ?? []);
        this.carregandoSaldos.set(false);
        this.linhas().filter((l) => l.material.detalhaSerie).forEach((l) => this.carregarSeries(l));
      },
      error: () => {
        if (consulta !== this.consultaSaldos) return;
        this.carregandoSaldos.set(false);
        this.notificacoes.warning('Não foi possível carregar o saldo da equipe.');
      }
    });
  }

  protected chaveSeries(l: Pick<LinhaDevolucao, 'material' | 'condicao'>): string {
    return `${l.material.id}|${l.condicao}`;
  }

  private carregarSeries(linha: LinhaDevolucao): void {
    const chave = this.chaveSeries(linha);
    if (this.series()[chave]) return;
    this.carregandoSeries.update((atual) => ({ ...atual, [chave]: true }));
    this.almoxarifado.listarSeriais({ idEstoque: this.idEstoqueCampo(), idMaterial: linha.material.id, condicao: linha.condicao, ativo: true, size: 1000 }).subscribe({
      next: (r) => {
        const lista = (r.content ?? [])
          .filter((s) => !s.condicao || s.condicao === linha.condicao)
          .map((s) => s.numSerie)
          .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        this.series.update((atual) => ({ ...atual, [chave]: lista }));
        this.carregandoSeries.update((atual) => ({ ...atual, [chave]: false }));
      },
      error: () => {
        this.carregandoSeries.update((atual) => ({ ...atual, [chave]: false }));
        this.notificacoes.warning(`Não foi possível carregar as séries de ${linha.material.codigo}.`);
      }
    });
  }

  /** As linhas vêm do saldo da equipe: trocar a equipe começa a lista de novo. */
  protected trocarEquipe(id: string | null): void {
    if (id === this.idEquipe()) return;
    if (this.linhas().length) this.notificacoes.info('Os materiais saíram da lista porque a equipe mudou.');
    this.idEquipe.set(id);
    this.linhas.set([]);
    this.series.set({});
  }

  protected escolher(id: string | null): void {
    const saldo = this.saldos().find((s) => s.id === id);
    if (!id || !saldo) return;
    this.escolhido.set(id);
    setTimeout(() => this.escolhido.set(null));
    const condicao = condicaoDe(saldo);
    // Sucata devolvida normalmente vai para descarte; material novo volta para a prateleira.
    const linha: LinhaDevolucao = { chave: this.proximaChave++, material: saldo.material, condicao, quantidade: null, series: [], guardar: condicao === 'NOVO' };
    this.linhas.update((ls) => [...ls, linha]);
    if (linha.material.detalhaSerie) this.carregarSeries(linha);
    afterNextRender(() => document.querySelector<HTMLElement>(`[data-dc-linha="${linha.chave}"] input`)?.focus(), { injector: this.injector });
  }

  protected alterar(linha: LinhaDevolucao, mudanca: Partial<LinhaDevolucao>): void {
    this.linhas.update((ls) => ls.map((l) => (l.chave === linha.chave ? { ...l, ...mudanca } : l)));
  }

  protected remover(linha: LinhaDevolucao): void {
    this.linhas.update((ls) => ls.filter((l) => l.chave !== linha.chave));
  }

  protected unidade(l: LinhaDevolucao): string {
    return l.material.unidadeMedida || 'UN';
  }

  protected quantidade(l: LinhaDevolucao): number {
    return l.material.detalhaSerie ? l.series.length : (paraUnidadeBase(l.material, l.quantidade, l.unidade) ?? 0);
  }

  protected saldo(l: LinhaDevolucao): number {
    return this.saldos()
      .filter((s) => s.material.id === l.material.id && condicaoDe(s) === l.condicao)
      .reduce((soma, s) => soma + s.quantidade, 0);
  }

  /** Material com série vale pelas séries que a equipe tem, mesmo com o saldo divergente. */
  protected acimaDoSaldo(l: LinhaDevolucao): boolean {
    return !l.material.detalhaSerie && !this.carregandoSaldos() && this.quantidade(l) > this.saldo(l);
  }

  protected disponiveis(l: LinhaDevolucao): string[] {
    return this.series()[this.chaveSeries(l)] ?? [];
  }

  private problema(): string | null {
    if (!this.idEquipe()) return 'Escolha a equipe.';
    if (!this.estoqueCampo()) return 'A equipe não tem estoque de campo ativo.';
    if (!this.idDestino()) return 'Escolha o almoxarifado.';
    for (const l of this.linhas()) {
      if (!(this.quantidade(l) > 0)) return `${l.material.codigo}: informe ${l.material.detalhaSerie ? 'as séries' : 'a quantidade'}.`;
      if (this.acimaDoSaldo(l)) return `${l.material.codigo}: a quantidade passa do saldo da equipe.`;
    }
    return null;
  }

  private pedido(): DevolucaoComercialRequest {
    return {
      idEquipe: this.idEquipe()!,
      idEstoqueDestino: this.idDestino()!,
      observacao: this.observacao().trim() || undefined,
      itens: this.linhas().flatMap<ItemDevolucaoComercialRequest>((l) =>
        l.material.detalhaSerie
          ? l.series.map((numSerie) => ({ idMaterial: l.material.id, quantidade: 1, condicao: l.condicao, numSerie, guardarNoEstoque: l.guardar }))
          : [{ idMaterial: l.material.id, quantidade: l.quantidade!, condicao: l.condicao, guardarNoEstoque: l.guardar, unidade: l.unidade || undefined }]
      )
    };
  }

  protected async registrar(): Promise<void> {
    if (this.salvando()) return;
    this.tentou.set(true);
    const problema = this.problema();
    if (problema) return this.notificacoes.warning(problema);

    const { baixa } = this.resumo();
    const n = this.linhas().length;
    const ok = await this.confirmacao.confirm({
      title: 'Registrar devolução',
      message: `${n} ${n === 1 ? 'material sai' : 'materiais saem'} do estoque da equipe agora.${baixa ? ` ${baixa} em baixa: não ${baixa === 1 ? 'fica' : 'ficam'} no almoxarifado.` : ''}`,
      confirmLabel: 'Registrar devolução'
    });
    if (!ok) return;

    this.salvando.set(true);
    this.almoxarifado.registrarDevolucaoComercial(this.pedido()).subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success('Devolução registrada.');
        this.registrada.emit();
        this.visible.set(false);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível registrar a devolução' });
      }
    });
  }
}
