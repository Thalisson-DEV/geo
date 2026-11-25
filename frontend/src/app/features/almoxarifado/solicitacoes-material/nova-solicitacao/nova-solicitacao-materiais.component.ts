import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { GeoButtonComponent, GeoIconButtonComponent, GeoNumberInputComponent, GeoSelectComponent, GeoStatusComponent, NotificationService } from '@geo/ui';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { MaterialResponse } from '../../../../core/models/almoxarifado.models';
import { TipoSolicitacaoTecnica } from '../../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { ehProcessoObras, processoMaterial } from '../../shared/processo-material';

export type TipoItemTecnico = Extract<TipoSolicitacaoTecnica, 'ADICAO_COMUM' | 'ADICAO_CONCRETO'>;

export interface LinhaMaterial {
  chave: number;
  material: MaterialResponse;
  quantidade: number | null;
  /** Só na técnica: 221 (comum) ou 921 (concreto). */
  tipo?: TipoItemTecnico;
}

const TIPOS: { value: TipoItemTecnico; codigo: string; nome: string }[] = [
  { value: 'ADICAO_COMUM', codigo: 'Comum', nome: 'Comum' },
  { value: 'ADICAO_CONCRETO', codigo: 'Concreto', nome: 'Concreto' }
];

let proximaChave = 1;

/**
 * Materiais de uma nova solicitação: busca o material, mostra o que a origem tem e deixa ajustar a
 * quantidade na própria linha. Pedir além do saldo é permitido (o almoxarifado decide), mas avisa.
 */
@Component({
  selector: 'app-nova-solicitacao-materiais',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, GeoButtonComponent, GeoIconButtonComponent, GeoNumberInputComponent, GeoSelectComponent, GeoStatusComponent],
  styleUrl: './nova-solicitacao.css',
  template: `
    <div class="ns-secao">
      <div class="ns-incluir">
        <geo-select
          label="Material"
          placeholder="Buscar por código ou descrição"
          [options]="opcoes()"
          [value]="idEscolhido()"
          (valueChange)="escolher($event)"
          [filter]="true"
          filterPlaceholder="Digite o código ou a descrição"
          [loading]="buscando()"
          [clearable]="true"
          (search)="buscar($event)"
          (opened)="abrirBusca()"
        />
        <geo-number-input
          label="Quantidade"
          [min]="0"
          [maxFractionDigits]="3"
          [value]="quantidade()"
          (valueChange)="quantidade.set($event)"
          [suffix]="escolhido() ? ' ' + unidade(escolhido()!) : undefined"
        />
        <geo-button label="Incluir" icon="pi pi-plus" variant="outline" [disabled]="!escolhido() || !((quantidade() ?? 0) > 0) || !!foraDoProcesso()" (pressed)="incluir()" />
      </div>

      @if (comTipo()) {
        <div class="ns-pilulas" role="radiogroup" aria-label="Tipo do material a incluir">
          @for (t of tipos; track t.value) {
            <button type="button" class="ns-pilula ns-pilula--pequena" role="radio" [attr.aria-checked]="tipo() === t.value" (click)="tipo.set(t.value)">
              <strong>{{ t.codigo }}</strong> {{ t.nome }}
            </button>
          }
        </div>
      }

      @if (foraDoProcesso(); as aviso) {
        <p class="ns-info ns-info--aviso" role="alert">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          <span>{{ aviso }}</span>
        </p>
      } @else if (mostrarSaldo() && escolhido(); as m) {
        <p class="ns-info" aria-live="polite">
          <i class="pi pi-warehouse" aria-hidden="true"></i>
          @if (!idEstoque()) {
            <span>Escolha {{ rotuloOrigem() }} para ver o saldo.</span>
          } @else if (saldo(m.id) === undefined) {
            <span>Consultando o saldo em {{ nomeEstoque() }}...</span>
          } @else {
            <span><strong>{{ saldo(m.id) | number: '1.0-3' }} {{ unidade(m) }}</strong> disponíveis em {{ nomeEstoque() }}{{ m.detalhaSerie ? ' · material com nº de série' : '' }}</span>
          }
        </p>
      }

      @if (linhas().length) {
        <ul class="ns-lista" aria-label="Materiais da solicitação">
          @for (l of linhas(); track l.chave; let i = $index) {
            <li class="ns-item">
              <div class="ns-item__material">
                <span class="ns-item__nome" [title]="l.material.descricao">{{ l.material.descricao }}</span>
                <span class="ns-item__meta">
                  <span>{{ l.material.codigo }} · {{ unidade(l.material) }}</span>
                  @if (l.tipo) {
                    <geo-status tone="brand" icon="pi pi-cart-plus">{{ codigoTipo(l.tipo) }}</geo-status>
                  }
                  @if (mostrarSaldo() && idEstoque() && saldo(l.material.id) !== undefined) {
                    <span [class.ns-item__saldo--falta]="falta(l)">
                      {{ falta(l) ? 'Passa do saldo: ' : 'Saldo: ' }}{{ saldo(l.material.id) | number: '1.0-3' }}
                    </span>
                  }
                </span>
              </div>
              <geo-number-input
                class="ns-item__qtd"
                [label]="'Quantidade de ' + l.material.codigo"
                [labelVisible]="false"
                [min]="0"
                [maxFractionDigits]="3"
                [suffix]="' ' + unidade(l.material)"
                [value]="l.quantidade"
                (valueChange)="alterar(i, $event)"
                [error]="!((l.quantidade ?? 0) > 0) ? 'Informe a quantidade.' : undefined"
              />
              <geo-icon-button icon="pi pi-trash" [label]="'Tirar ' + l.material.codigo + ' da solicitação'" tooltip="Tirar da solicitação" size="icon-sm" (pressed)="remover(i)" />
            </li>
          }
        </ul>
      } @else {
        <div class="ns-vazio" [class.ns-vazio--erro]="!!erro()">
          <i class="pi pi-box" aria-hidden="true"></i>
          <span>{{ erro() || 'Nenhum material ainda. Busque acima e inclua com a quantidade.' }}</span>
        </div>
      }
    </div>
  `
})
export class NovaSolicitacaoMateriaisComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Estoque de onde o material sai: o saldo é consultado nele. */
  readonly idEstoque = input<string | null>(null);
  readonly nomeEstoque = input('a origem');
  readonly rotuloOrigem = input('a origem');
  /** Técnica: cada material escolhe 221 ou 921. */
  readonly comTipo = input(false);
  /** Fechamento de devolução: o material sai da obra e o saldo dela não é consultado aqui. */
  readonly mostrarSaldo = input(true);
  readonly erro = input<string | undefined>();
  /**
   * Processo aceito: 'OBRAS' na técnica e no fechamento, 'COMERCIAL' na comercial (qualquer
   * material que não seja de Obras). Nulo não confere.
   */
  readonly processo = input<'OBRAS' | 'COMERCIAL' | null>(null);
  readonly linhas = model<LinhaMaterial[]>([]);

  protected readonly tipos = TIPOS;
  protected readonly tipo = signal<TipoItemTecnico>('ADICAO_COMUM');
  protected readonly idEscolhido = signal<string | null>(null);
  protected readonly escolhido = signal<MaterialResponse | null>(null);
  protected readonly quantidade = signal<number | null>(null);
  private readonly saldos = signal<Record<string, number | undefined>>({});

  private readonly busca = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => (this.idEscolhido() ? [this.idEscolhido()!] : []),
    destroyRef: this.destroyRef
  });
  protected readonly opcoes = this.busca.items;
  protected readonly buscando = this.busca.loading;

  /** Material escolhido de outro processo: explica por que não entra e não deixa incluir. */
  protected readonly foraDoProcesso = computed(() => {
    const m = this.escolhido();
    const aceito = this.processo();
    if (!m || !aceito || !m.processo?.nome) return null;
    const obras = ehProcessoObras(m.processo.nome);
    if (obras === (aceito === 'OBRAS')) return null;
    const nome = processoMaterial(m.processo.nome)?.rotulo ?? m.processo.nome;
    return aceito === 'OBRAS'
      ? `${m.codigo} é do processo ${nome} e não entra em solicitação de obras. Se ele também é usado em obras, ajuste o processo no cadastro do material.`
      : `${m.codigo} é do processo Obras: peça pela solicitação técnica ou de fechamento.`;
  });

  protected readonly total = computed(() => this.linhas().reduce((t, l) => t + (l.quantidade ?? 0), 0));

  constructor() {
    // Trocou a origem: o saldo é outro.
    effect(() => {
      const estoque = this.idEstoque();
      untracked(() => {
        this.saldos.set({});
        if (!estoque) return;
        const ids = new Set([...this.linhas().map((l) => l.material.id), ...(this.escolhido() ? [this.escolhido()!.id] : [])]);
        ids.forEach((id) => this.consultarSaldo(id));
      });
    });
  }

  protected abrirBusca(): void {
    if (!this.opcoes().length) this.busca.search('');
  }

  protected buscar(texto: string): void {
    this.busca.search(texto);
  }

  protected escolher(id: string | null): void {
    this.idEscolhido.set(id);
    this.escolhido.set(null);
    if (!id) return;
    this.almoxarifado.buscarMaterialPorId(id).subscribe({
      next: (m) => {
        if (this.idEscolhido() !== id) return;
        this.escolhido.set(m);
        this.consultarSaldo(m.id);
      },
      error: () => this.notificacoes.warning('Não foi possível carregar o material.')
    });
  }

  protected incluir(): void {
    const material = this.escolhido();
    const quantidade = this.quantidade();
    if (!material || !quantidade || quantidade <= 0 || this.foraDoProcesso()) return;
    const tipo = this.comTipo() ? this.tipo() : undefined;
    const existente = this.linhas().findIndex((l) => l.material.id === material.id && l.tipo === tipo);
    if (existente >= 0) {
      // Mesmo material (e tipo) de novo: soma na linha que já existe.
      this.alterar(existente, (this.linhas()[existente].quantidade ?? 0) + quantidade);
      this.notificacoes.info(`${material.codigo} já estava na lista: a quantidade foi somada.`);
    } else {
      this.linhas.update((ls) => [...ls, { chave: proximaChave++, material, quantidade, tipo }]);
    }
    this.idEscolhido.set(null);
    this.escolhido.set(null);
    this.quantidade.set(null);
  }

  protected alterar(indice: number, quantidade: number | null): void {
    this.linhas.update((ls) => ls.map((l, i) => (i === indice ? { ...l, quantidade } : l)));
  }

  protected remover(indice: number): void {
    this.linhas.update((ls) => ls.filter((_, i) => i !== indice));
  }

  protected saldo(idMaterial: string): number | undefined {
    return this.saldos()[idMaterial];
  }

  /** Pede mais do que a origem tem (somando as linhas do mesmo material). */
  protected falta(l: LinhaMaterial): boolean {
    const saldo = this.saldo(l.material.id);
    if (saldo === undefined) return false;
    const pedido = this.linhas()
      .filter((x) => x.material.id === l.material.id)
      .reduce((t, x) => t + (x.quantidade ?? 0), 0);
    return pedido > saldo;
  }

  protected unidade(m: MaterialResponse): string {
    return m.unidadeMedida || 'UN';
  }

  protected codigoTipo(tipo: TipoItemTecnico): string {
    return TIPOS.find((t) => t.value === tipo)?.codigo ?? '';
  }

  private consultarSaldo(idMaterial: string): void {
    const estoque = this.idEstoque();
    if (!estoque || this.saldos()[idMaterial] !== undefined) return;
    this.almoxarifado.listarSaldos({ idEstoque: estoque, idMaterial, size: 100 }).subscribe({
      next: (r) => {
        if (this.idEstoque() !== estoque) return;
        const total = (r.content ?? []).filter((s) => s.condicao !== 'SUCATA').reduce((t, s) => t + (Number(s.quantidade) || 0), 0);
        this.saldos.update((atual) => ({ ...atual, [idMaterial]: total }));
      },
      error: () => this.saldos.update((atual) => ({ ...atual, [idMaterial]: 0 }))
    });
  }
}
