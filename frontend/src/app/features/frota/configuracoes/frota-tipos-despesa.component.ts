import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoRowActionsDirective,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { TipoDespesa } from '../../../core/models/frota-despesa.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaDespesaService } from '../../../core/services/frota-despesa.service';
import { acessoFrota } from '../shared/frota-acesso';

/** Subtipo no formulário; a chave estável evita recriar o campo a cada letra digitada. */
interface SubtipoEditavel {
  chave: number;
  nome: string;
}

/**
 * Catálogo de tipos de despesa (aba das configurações): lavagem, pedágio, mensalidade e os
 * tipos que a empresa criar, cada um com subtipos opcionais.
 */
@Component({
  selector: 'app-frota-tipos-despesa',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoRowActionsDirective,
    GeoStatusComponent,
    GeoTextInputComponent
  ],
  styles: `
    .subtipos { display: grid; gap: 0.5rem; }
    .subtipos__linha { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; align-items: start; }
    .subtipos__linha geo-icon-button { margin-top: 0.25rem; }
    .subtipos__cabecalho { display: grid; gap: 0.125rem; }
    .subtipos__titulo { font-size: var(--geo-font-label, 0.875rem); font-weight: 600; color: var(--geo-foreground); }
    .subtipos__ajuda { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
  `,
  template: `
    <geo-data-table title="Tipos de despesa"
      description="Os tipos e subtipos que aparecem ao lançar uma despesa do veículo e na planilha de importação. Desativar não apaga as despesas já lançadas."
      storageKey="frota-tipos-despesa" exportFileName="tipos-despesa" searchPlaceholder="Filtrar nesta lista"
      [columns]="colunas" [rows]="tipos()" [rowKey]="chave" [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar os tipos' : 'Nenhum tipo de despesa cadastrado'"
      [stateDescription]="erro() ?? 'Cadastre tipos como Lavagem ou Pedágio para lançar as despesas dos veículos.'"
      [rowClickable]="acesso.editarDespesa()" (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (acesso.editarDespesa()) {
          <geo-button size="sm" icon="pi pi-plus" label="Novo tipo" (pressed)="abrir(null)"></geo-button>
        }
      </ng-container>
      <ng-template geoCell="nome" let-row><span class="geo-cell-strong">{{ row.nome }}</span></ng-template>
      <ng-template geoCell="subtipos" let-row>
        @if (row.subtipos.length) {
          {{ nomesSubtipos(row) }}
        } @else {
          <span class="geo-cell-muted">Sem subtipos</span>
        }
      </ng-template>
      <ng-template geoCell="ativo" let-row>
        <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
      </ng-template>
      <ng-template geoRowActions let-row>
        @if (acesso.editarDespesa()) {
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar tipo" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
              [tooltip]="row.ativo ? 'Desativar tipo' : 'Reativar tipo'" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
          </span>
        }
      </ng-template>
    </geo-data-table>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar tipo de despesa' : 'Novo tipo de despesa'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" [loading]="salvando()" size="sm">
      <div class="geo-form-stack">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="80"
          placeholder="Ex.: Lavagem" [error]="tentou() && !nome().trim() ? 'Informe o nome.' : undefined"></geo-text-input>

        <div class="subtipos" role="group" aria-labelledby="subtipos-titulo">
          <span class="subtipos__cabecalho">
            <span id="subtipos-titulo" class="subtipos__titulo">Subtipos</span>
            <span class="subtipos__ajuda">Opcionais, como Completa ou Externa na lavagem. Tirar um subtipo não muda as despesas que já o usam.</span>
          </span>
          @for (s of subtipos(); track s.chave; let i = $index) {
            <div class="subtipos__linha">
              <geo-text-input [label]="'Subtipo ' + (i + 1)" [labelVisible]="false" [value]="s.nome" [maxlength]="80"
                placeholder="Nome do subtipo" (valueChange)="renomear(s.chave, $event)"
                [error]="tentou() && repetido(s) ? 'Subtipo repetido.' : undefined"></geo-text-input>
              <geo-icon-button icon="pi pi-times" [label]="'Tirar o subtipo ' + (s.nome || (i + 1))" tooltip="Tirar subtipo" size="icon-sm"
                (pressed)="remover(s.chave)"></geo-icon-button>
            </div>
          }
          <div>
            <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Adicionar subtipo" (pressed)="adicionar()"></geo-button>
          </div>
        </div>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaTiposDespesaComponent {
  private readonly servico = inject(FrotaDespesaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  protected readonly acesso = acessoFrota();
  private readonly documento = inject(DOCUMENT);

  protected readonly tipos = signal<TipoDespesa[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<TipoDespesa | null>(null);
  protected readonly nome = signal('');
  protected readonly subtipos = signal<SubtipoEditavel[]>([]);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  private proximaChave = 0;

  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.erro() ? 'error' : this.tipos().length ? 'ready' : 'empty'));
  private readonly nomesInformados = computed(() => this.subtipos().map((s) => s.nome.trim()).filter(Boolean));
  protected readonly alterado = computed(() => {
    const e = this.emEdicao();
    const antes = (e?.subtipos ?? []).map((s) => s.nome);
    const agora = this.nomesInformados();
    return this.nome() !== (e?.nome ?? '') || antes.length !== agora.length || antes.some((n, i) => n !== agora[i]);
  });

  protected readonly colunas: GeoDataTableColumn<TipoDespesa>[] = [
    { key: 'nome', header: 'Tipo', type: 'custom', priority: 1, value: (t) => t.nome, display: (t) => t.nome },
    { key: 'subtipos', header: 'Subtipos', type: 'custom', priority: 1, value: (t) => t.subtipos.length, display: (t) => this.nomesSubtipos(t) },
    { key: 'ativo', header: 'Situação', type: 'custom', priority: 1, value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (t: TipoDespesa) => t.id;

  constructor() {
    this.carregar();
  }

  protected nomesSubtipos(t: TipoDespesa): string {
    return t.subtipos.map((s) => s.nome).join(', ');
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.tipos(false).subscribe({
      next: (t) => {
        this.tipos.set(t);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }

  protected abrir(tipo: TipoDespesa | null): void {
    this.emEdicao.set(tipo);
    this.nome.set(tipo?.nome ?? '');
    this.subtipos.set((tipo?.subtipos ?? []).map((s) => ({ chave: this.proximaChave++, nome: s.nome })));
    this.tentou.set(false);
    this.formularioAberto.set(true);
  }

  protected adicionar(): void {
    this.subtipos.update((lista) => [...lista, { chave: this.proximaChave++, nome: '' }]);
    // O drawer fica fora do host (overlay): procura o último campo de subtipo no documento.
    setTimeout(() => {
      const campos = this.documento.querySelectorAll<HTMLInputElement>('.subtipos__linha input');
      campos[campos.length - 1]?.focus();
    });
  }

  protected renomear(chave: number, nome: string): void {
    this.subtipos.update((lista) => lista.map((s) => (s.chave === chave ? { ...s, nome } : s)));
  }

  protected remover(chave: number): void {
    this.subtipos.update((lista) => lista.filter((s) => s.chave !== chave));
  }

  protected repetido(s: SubtipoEditavel): boolean {
    const nome = s.nome.trim().toLocaleLowerCase('pt-BR');
    return !!nome && this.subtipos().some((o) => o.chave !== s.chave && o.nome.trim().toLocaleLowerCase('pt-BR') === nome);
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.nome().trim() || this.subtipos().some((s) => this.repetido(s))) return;
    this.salvando.set(true);
    this.servico.salvarTipo({ nome: this.nome().trim(), subtipos: this.nomesInformados() }, this.emEdicao()?.id).subscribe({
      next: (tipo) => {
        this.salvando.set(false);
        this.emEdicao.set(tipo);
        this.formularioAberto.set(false);
        this.notificacoes.success(`Tipo ${tipo.nome} salvo.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(tipo: TipoDespesa): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: tipo.ativo ? 'Desativar tipo' : 'Reativar tipo',
      message: tipo.ativo
        ? `${tipo.nome} deixa de aparecer ao lançar despesas e na importação. As despesas já lançadas continuam com ele.`
        : `${tipo.nome} volta a aparecer ao lançar despesas.`,
      confirmLabel: tipo.ativo ? 'Desativar' : 'Reativar',
      variant: tipo.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.servico.alternarTipo(tipo).subscribe({
      next: () => {
        this.notificacoes.success(tipo.ativo ? `${tipo.nome} desativado.` : `${tipo.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}
