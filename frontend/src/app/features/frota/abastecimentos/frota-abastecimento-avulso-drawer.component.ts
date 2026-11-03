import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import {
  AbastecimentoDetalhe,
  PostoAbastecimento,
  ProdutoAbastecimento,
  ROTULO_CATEGORIA_PRODUTO
} from '../../../core/models/frota-abastecimento.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { FrotaService } from '../../../core/services/frota.service';

interface ItemAvulso {
  chave: number;
  idProduto: string | null;
  quantidade: number | null;
}

/**
 * Abastecimento avulso, lançado na web por quem aprova a placa (como a solicitação direta do
 * comercial): já nasce aprovado, com as quantidades, e vai direto para a liberação. Fica marcado
 * como avulso nas listas. A CNH continua bloqueando; a falta de checklist do dia vira alerta.
 */
@Component({
  selector: 'app-frota-abastecimento-avulso-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCalloutComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  styles: `
    .item { display: grid; grid-template-columns: minmax(0, 1fr) 9rem auto; gap: 0.5rem; align-items: end; }
    @media (max-width: 480px) { .item { grid-template-columns: minmax(0, 1fr) auto; } .item ces-number-input { grid-column: 1; } }
  `,
  template: `
    <ces-form-drawer [(visible)]="visible" title="Lançar abastecimento avulso" description="Já sai aprovado por você e vai para a liberação."
      [dirty]="sujo()" [loading]="salvando()" size="md">
      <div class="ces-form-stack">
        <ces-callout tone="info" [dense]="true" icon="pi pi-bolt">
          Use quando o pedido não vier pelo app. Ele aparece como avulso nas listas e segue o fluxo normal: liberação, aviso ao posto e registro pelo condutor.
        </ces-callout>

        <ces-form-section title="Veículo e condutor" icon="pi pi-car">
          <ces-select label="Veículo" [required]="true" [options]="opcoesVeiculo()" [(value)]="idVeiculo" [filter]="true"
            [loading]="carregandoVeiculos()" placeholder="Placas da sua carteira"
            [description]="opcoesVeiculo().length || carregandoVeiculos() ? undefined : 'Sua carteira de aprovação não tem placas. Peça ao gestor da frota.'"
            [error]="tentou() && !idVeiculo() ? 'Escolha o veículo.' : undefined"></ces-select>
          <ces-select label="Condutor" [required]="true" [options]="opcoesCondutor()" [(value)]="idCondutor" [filter]="true"
            placeholder="Quem vai ao posto" description="O condutor vê o abastecimento no app e registra depois de abastecer."
            [error]="tentou() && !idCondutor() ? 'Escolha o condutor.' : undefined"></ces-select>
          <ces-number-input label="KM ou horímetro do painel" [showOptional]="true" [(value)]="medicao" [min]="0" [maxFractionDigits]="1"
            description="Se souber. Informado, passa pela trava: não pode ser menor que o último nem saltar mais de 2.000 km."></ces-number-input>
        </ces-form-section>

        <ces-form-section title="Posto e destino" icon="pi pi-map-marker">
          <ces-select label="Posto" [required]="true" [options]="opcoesPosto()" [(value)]="idPosto" [filter]="true"
            [error]="tentou() && !idPosto() ? 'Escolha o posto.' : undefined"></ces-select>
          <ces-text-input label="Destino" [required]="true" [(value)]="destino" [maxlength]="200" placeholder="Ex.: Juazeiro → Sobradinho"
            [error]="tentou() && !destino().trim() ? 'Informe o destino.' : undefined"></ces-text-input>
        </ces-form-section>

        <ces-form-section title="O que abastecer" icon="pi pi-shopping-bag" description="Um combustível por abastecimento; ARLA, óleo e fluidos separados.">
          @for (item of itens(); track item.chave; let i = $index) {
            <div class="item">
              <ces-select [label]="'Produto ' + (i + 1)" [options]="opcoesProduto()" [value]="item.idProduto"
                (valueChange)="alterarItem(item.chave, { idProduto: $event })"></ces-select>
              <ces-number-input [label]="'Quantidade ' + (i + 1)" [value]="item.quantidade" [min]="0" [maxFractionDigits]="2"
                [suffix]="' ' + unidade(item.idProduto)" (valueChange)="alterarItem(item.chave, { quantidade: $event })"></ces-number-input>
              @if (itens().length > 1) {
                <ces-icon-button icon="pi pi-trash" [label]="'Tirar o produto ' + (i + 1)" tooltip="Tirar" (pressed)="tirarItem(item.chave)"></ces-icon-button>
              }
            </div>
          }
          <ces-button variant="ghost" size="sm" icon="pi pi-plus" label="Adicionar produto" (pressed)="adicionarItem()"></ces-button>
          @if (tentou() && erroItens(); as erro) {
            <ces-callout tone="danger" [dense]="true">{{ erro }}</ces-callout>
          }
        </ces-form-section>

        <ces-textarea label="Observação" [showOptional]="true" [(value)]="observacao" [rows]="2" [maxlength]="500"></ces-textarea>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Lançar aprovado" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaAbastecimentoAvulsoDrawerComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly frota = inject(FrotaService);
  private readonly auth = inject(AuthService);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  readonly lancado = output<AbastecimentoDetalhe>();

  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly idCondutor = signal<string | null>(null);
  protected readonly idPosto = signal<string | null>(null);
  protected readonly medicao = signal<number | null>(null);
  protected readonly destino = signal('');
  protected readonly observacao = signal('');
  protected readonly itens = signal<ItemAvulso[]>([{ chave: 1, idProduto: null, quantidade: null }]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);

  protected readonly carregandoVeiculos = signal(false);
  protected readonly opcoesVeiculo = signal<CesSelectOption<string>[]>([]);
  protected readonly opcoesCondutor = signal<CesSelectOption<string>[]>([]);
  private readonly postos = signal<PostoAbastecimento[]>([]);
  private readonly produtos = signal<ProdutoAbastecimento[]>([]);
  private proximaChave = 2;

  protected readonly opcoesPosto = computed<CesSelectOption<string>[]>(() =>
    this.postos().filter((p) => p.ativo).map((p) => ({ label: p.baseNome ? `${p.nome} · ${p.baseNome}` : p.nome, value: p.id }))
  );
  protected readonly opcoesProduto = computed<CesSelectOption<string>[]>(() =>
    this.produtos().filter((p) => p.ativo).map((p) => ({ label: `${p.nome} · ${ROTULO_CATEGORIA_PRODUTO[p.categoria]}`, value: p.id }))
  );
  protected readonly sujo = computed(() => !!this.idVeiculo() || !!this.destino().trim() || this.itens().some((i) => i.idProduto));
  protected readonly erroItens = computed(() => {
    const preenchidos = this.itens().filter((i) => i.idProduto);
    if (!preenchidos.length) return 'Escolha ao menos um produto.';
    if (preenchidos.some((i) => i.quantidade == null || i.quantidade < 0)) return 'Informe a quantidade de cada produto.';
    if (preenchidos.every((i) => !i.quantidade)) return 'Informe a quantidade de ao menos um produto.';
    const ids = preenchidos.map((i) => i.idProduto);
    if (new Set(ids).size !== ids.length) return 'Um produto aparece mais de uma vez.';
    const combustiveis = preenchidos.filter((i) => this.produtos().find((p) => p.id === i.idProduto)?.categoria === 'COMBUSTIVEL');
    return combustiveis.length > 1 ? 'Lance um combustível por abastecimento.' : null;
  });

  constructor() {
    effect(() => {
      if (this.visible()) untracked(() => this.preparar());
    });
  }

  protected unidade(idProduto: string | null): string {
    return this.produtos().find((p) => p.id === idProduto)?.unidade === 'UN' ? 'un' : 'l';
  }

  protected alterarItem(chave: number, mudanca: Partial<ItemAvulso>): void {
    this.itens.update((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }

  protected adicionarItem(): void {
    this.itens.update((lista) => [...lista, { chave: this.proximaChave++, idProduto: null, quantidade: null }]);
  }

  protected tirarItem(chave: number): void {
    this.itens.update((lista) => lista.filter((i) => i.chave !== chave));
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.idVeiculo() || !this.idCondutor() || !this.idPosto() || !this.destino().trim() || this.erroItens()) return;
    this.salvando.set(true);
    this.servico.lancarAvulso({
      idVeiculo: this.idVeiculo()!,
      idCondutor: this.idCondutor()!,
      idPosto: this.idPosto()!,
      destino: this.destino().trim(),
      medicao: this.medicao(),
      observacao: this.observacao().trim() || null,
      itens: this.itens().filter((i) => i.idProduto).map((i) => ({ idProduto: i.idProduto!, quantidade: i.quantidade ?? 0 }))
    }).subscribe({
      next: (d) => {
        this.salvando.set(false);
        this.notificacoes.success(`Avulso de ${formatarPlaca(d.placa)} lançado e aprovado. Falta liberar.`);
        this.visible.set(false);
        this.lancado.emit(d);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Abre limpo; as listas são buscadas uma vez. */
  private preparar(): void {
    this.idVeiculo.set(null);
    this.idCondutor.set(null);
    this.idPosto.set(null);
    this.medicao.set(null);
    this.destino.set('');
    this.observacao.set('');
    this.itens.set([{ chave: 1, idProduto: null, quantidade: null }]);
    this.tentou.set(false);
    if (!this.postos().length) this.servico.postos(true).subscribe({ next: (p) => this.postos.set(p.content), error: () => undefined });
    if (!this.produtos().length) this.servico.produtos().subscribe({ next: (p) => this.produtos.set(p.content), error: () => undefined });
    if (!this.opcoesCondutor().length) {
      this.frota.listarCondutores({ ativo: true }, { size: 1000 }).subscribe({
        next: (p) => this.opcoesCondutor.set(p.content.map((c) => ({
          label: `${c.nome ?? 'Sem nome'}${c.situacaoCnh === 'VENCIDO' ? ' · CNH vencida' : ''}`,
          value: c.idColaborador
        }))),
        error: () => undefined
      });
    }
    if (!this.opcoesVeiculo().length) {
      // Só as placas da carteira de quem lança: o servidor recusa as outras.
      const eu = this.auth.currentUser()?.id;
      this.carregandoVeiculos.set(true);
      this.servico.carteiras().subscribe({
        next: (lista) => {
          this.carregandoVeiculos.set(false);
          const minha = lista.find((c) => c.idUsuario === eu);
          this.opcoesVeiculo.set((minha?.placas ?? []).map((p) => ({
            label: `${formatarPlaca(p.placa)}${p.descricao ? ' · ' + p.descricao : ''}${p.baseNome ? ' · ' + p.baseNome : ''}`,
            value: p.idVeiculo
          })));
        },
        error: () => this.carregandoVeiculos.set(false)
      });
    }
  }
}
