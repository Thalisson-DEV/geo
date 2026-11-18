import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  CesButtonComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { ItemManutencao, OpcoesFrota, ROTULO_TIPO_ITEM, TipoItemManutencao } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';

/**
 * Catálogo de itens de manutenção (aba das configurações). Cada item tem a natureza do
 * financeiro e, opcionalmente, a própria janela de repetição.
 */
@Component({
  selector: 'app-frota-itens-manutencao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  template: `
    <ces-data-table title="Itens de manutenção"
      [description]="'Peças e mão de obra das OS. A mesma placa com o mesmo item dentro da janela conta como repetição (padrão: ' + janelaPadrao() + ' dias).'"
      storageKey="frota-itens-manutencao" exportFileName="itens-manutencao" searchPlaceholder="Filtrar nesta lista"
      [columns]="colunas" [rows]="itens()" [rowKey]="chave" [state]="estado()"
      stateTitle="Nenhum item de manutenção cadastrado"
      stateDescription="Cadastre itens como Pastilha de freio ou Troca de óleo para abrir OS."
      [rowClickable]="acesso.configurar()" (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (acesso.configurar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Novo item" (pressed)="abrir(null)"></ces-button>
        }
      </ng-container>
      <ng-template cesCell="diasRepeticao" let-row>
        @if (row.diasRepeticao) {
          {{ row.diasRepeticao }} dias
        } @else {
          <span class="ces-cell-muted">Padrão ({{ janelaPadrao() }} dias)</span>
        }
      </ng-template>
      <ng-template cesCell="ativo" let-row>
        <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
      </ng-template>
      <ng-template cesRowActions let-row>
        @if (acesso.configurar()) {
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar item" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
            <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
              [tooltip]="row.ativo ? 'Desativar item' : 'Reativar item'" size="icon-sm" (pressed)="alternar(row)"></ces-icon-button>
          </span>
        }
      </ng-template>
    </ces-data-table>

    <ces-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar item' : 'Novo item de manutenção'"
      [description]="emEdicao()?.nome" [dirty]="alterado()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        <ces-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="120"
          placeholder="Ex.: Pastilha de freio dianteira" [error]="tentou() && !nome().trim() ? 'Informe o nome.' : undefined"></ces-text-input>
        <ces-select label="Tipo" [required]="true" [options]="tipos" [(value)]="tipo"
          description="Peça entra em Peças e consumíveis da execução; mão de obra, em Serviços. A OS do plano preventivo já nasce com os dois."></ces-select>
        <ces-select label="Natureza" [required]="true" [options]="naturezas()" [(value)]="natureza" [filter]="true"
          description="A mesma lista do financeiro: entra pré-preenchida na compra." [error]="tentou() && !natureza() ? 'Escolha a natureza.' : undefined"></ces-select>
        <ces-number-input label="Janela de repetição" [(value)]="diasRepeticao" [min]="1" [max]="730" suffix=" dias" [showOptional]="true"
          [description]="'Em branco, usa a janela padrão de ' + janelaPadrao() + ' dias.'"></ces-number-input>
        <ces-textarea label="Descrição" [(value)]="descricao" [rows]="2" [maxlength]="255" [showOptional]="true"></ces-textarea>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar item'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaItensManutencaoComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  protected readonly acesso = acessoFrota();

  readonly opcoes = input<OpcoesFrota | null>(null);
  readonly janelaPadrao = input<number>(90);

  protected readonly itens = signal<ItemManutencao[]>([]);
  protected readonly carregando = signal(false);
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<ItemManutencao | null>(null);
  protected readonly nome = signal('');
  protected readonly natureza = signal<string | null>(null);
  protected readonly descricao = signal('');
  protected readonly diasRepeticao = signal<number | null>(null);
  protected readonly tipo = signal<TipoItemManutencao | null>('MAO_DE_OBRA');
  protected readonly tipos: CesSelectOption<TipoItemManutencao>[] = [
    { label: ROTULO_TIPO_ITEM.PECA, value: 'PECA' },
    { label: ROTULO_TIPO_ITEM.MAO_DE_OBRA, value: 'MAO_DE_OBRA' }
  ];
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.itens().length ? 'ready' : 'empty'));
  protected readonly naturezas = computed<CesSelectOption<string>[]>(() =>
    (this.opcoes()?.naturezasServico ?? []).map((n) => ({ label: n.rotulo, value: n.valor }))
  );
  protected readonly alterado = computed(() => {
    const e = this.emEdicao();
    return (
      this.nome() !== (e?.nome ?? '') ||
      this.natureza() !== (e?.natureza ?? null) ||
      this.descricao() !== (e?.descricao ?? '') ||
      this.diasRepeticao() !== (e?.diasRepeticao ?? null) ||
      this.tipo() !== (e?.tipo ?? 'MAO_DE_OBRA')
    );
  });

  protected readonly colunas: CesDataTableColumn<ItemManutencao>[] = [
    { key: 'nome', header: 'Item', priority: 1 },
    { key: 'tipoRotulo', header: 'Tipo', priority: 1, display: (i) => ROTULO_TIPO_ITEM[i.tipo ?? 'MAO_DE_OBRA'] },
    { key: 'naturezaRotulo', header: 'Natureza', priority: 1 },
    { key: 'diasRepeticao', header: 'Janela de repetição', type: 'custom', value: (i) => i.diasRepeticao ?? 0, display: (i) => (i.diasRepeticao ? `${i.diasRepeticao} dias` : 'Padrão') },
    { key: 'descricao', header: 'Descrição', display: (i) => i.descricao ?? '' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (i) => i.ativo, display: (i) => (i.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (i: ItemManutencao) => i.id;

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.frota.itensManutencao().subscribe({
      next: (p) => {
        this.itens.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrir(item: ItemManutencao | null): void {
    this.emEdicao.set(item);
    this.nome.set(item?.nome ?? '');
    this.natureza.set(item?.natureza ?? null);
    this.descricao.set(item?.descricao ?? '');
    this.diasRepeticao.set(item?.diasRepeticao ?? null);
    this.tipo.set(item?.tipo ?? 'MAO_DE_OBRA');
    this.tentou.set(false);
    this.formularioAberto.set(true);
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.nome().trim() || !this.natureza()) return;
    this.salvando.set(true);
    this.frota.salvarItemManutencao({
      nome: this.nome().trim(),
      natureza: this.natureza()!,
      descricao: this.descricao().trim() || null,
      diasRepeticao: this.diasRepeticao(),
      tipo: this.tipo() ?? 'MAO_DE_OBRA'
    }, this.emEdicao()?.id).subscribe({
      next: (item) => {
        this.salvando.set(false);
        this.emEdicao.set(item);
        this.formularioAberto.set(false);
        this.notificacoes.success(`Item ${item.nome} salvo.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(item: ItemManutencao): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: item.ativo ? 'Desativar item' : 'Reativar item',
      message: item.ativo
        ? `${item.nome} deixa de aparecer em novas OS. As OS que já usam o item continuam com ele.`
        : `${item.nome} volta a aparecer em novas OS.`,
      confirmLabel: item.ativo ? 'Desativar' : 'Reativar',
      variant: item.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.frota.alternarItemManutencao(item).subscribe({
      next: () => {
        this.notificacoes.success(item.ativo ? `${item.nome} desativado.` : `${item.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}
