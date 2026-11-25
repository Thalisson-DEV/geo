import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDrawerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService,
} from '@geo/ui';
import { Canteiro, SaldoPorObra } from '../../../core/models/estoque-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { EstoqueObraService } from '../../../core/services/estoque-obra.service';
import { RhService } from '../../../core/services/rh.service';

/**
 * Canteiros: locais perto das obras onde as equipes deixam material. O cadastro é pequeno (dezenas), por isso a lista
 * vem inteira e a busca é na própria tabela. Ao abrir um canteiro aparece o material dele separado por obra.
 */
@Component({
  selector: 'app-canteiros',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDrawerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Canteiros" icon="pi pi-warehouse"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Canteiros' }]"
        description="Locais perto das obras onde as equipes deixam material. O material continua da obra: a ficha da obra mostra onde ele está.">
        <geo-button actions icon="pi pi-plus" label="Novo canteiro" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-data-table caption="Canteiros cadastrados" mode="client" storageKey="almox-canteiros" searchPlaceholder="Nome, base ou referência"
        rowActionLabel="Ver material" rowActionIcon="pi pi-box" emptyActionLabel="Novo canteiro"
        [columns]="colunas" [rows]="canteiros()" [rowLabel]="rotulo" [state]="estado()"
        [stateTitle]="erro() ? 'Não foi possível carregar os canteiros' : 'Nenhum canteiro cadastrado'"
        [stateDescription]="erro() ?? 'Cadastre os canteiros perto das obras para as equipes deixarem material.'"
        (emptyAction)="novo()" (rowActivate)="abrir($event)">
        <ng-template geoCell="materiais" let-row>
          @if (row.materiais) { {{ row.materiais }} {{ row.materiais === 1 ? 'material' : 'materiais' }} } @else { <span class="geo-cell-muted">Vazio</span> }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" size="icon-sm" (pressed)="editar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-ban" [label]="'Desativar ' + row.nome" size="icon-sm" (pressed)="desativar(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar canteiro' : 'Novo canteiro'" size="sm" [dirty]="alterado()">
      <geo-form-section title="Canteiro" icon="pi pi-warehouse">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="100" placeholder="Ex.: CANTEIRO TIMON NORTE" [error]="erros()['nome']"></geo-text-input>
        <geo-select label="Base operacional" [required]="true" [options]="bases()" [(value)]="idBase" [filter]="true" [error]="erros()['idBaseOperacional']"></geo-select>
        <geo-textarea label="Referência" [(value)]="referencia" [rows]="2" [maxlength]="300" description="Como a equipe acha o canteiro."></geo-textarea>
        <div class="cn-coords">
          <geo-number-input label="Latitude" [(value)]="latitude" [maxFractionDigits]="6" [min]="-90" [max]="90" [useGrouping]="false"></geo-number-input>
          <geo-number-input label="Longitude" [(value)]="longitude" [maxFractionDigits]="6" [min]="-180" [max]="180" [useGrouping]="false"></geo-number-input>
        </div>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar canteiro'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-drawer [visible]="!!aberto()" (visibleChange)="!$event && aberto.set(null)" [title]="aberto()?.nome ?? ''"
      [description]="aberto()?.referencia ?? aberto()?.nomeBase ?? ''" size="md">
      @if (saldo() === null) {
        <geo-async-state state="loading" [compact]="true" title="Carregando o material do canteiro"></geo-async-state>
      } @else if (saldo()!.materiais.length) {
        <table class="cn-tabela">
          <thead><tr><th scope="col">Material</th><th scope="col">De qual obra</th><th scope="col" class="cn-num">Qtd.</th></tr></thead>
          <tbody>
            @for (m of saldo()!.materiais; track m.idMaterial + m.condicao) {
              @for (o of m.obras; track o.idObra) {
                <tr><td>{{ m.codigo }} · {{ m.descricao }}</td><td>Obra {{ o.numero }}</td><td class="cn-num">{{ o.quantidade | number: '1.0-3' }} {{ m.unidade }}</td></tr>
              }
              @if (m.livre > 0) {
                <tr><td>{{ m.codigo }} · {{ m.descricao }}</td><td><geo-status tone="neutral">Livre</geo-status></td><td class="cn-num">{{ m.livre | number: '1.0-3' }} {{ m.unidade }}</td></tr>
              }
            }
          </tbody>
        </table>
      } @else {
        <p class="cn-vazio">Nenhum material neste canteiro.</p>
      }
    </geo-drawer>
  `,
  styles: [`
    .cn-coords { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .cn-tabela { width: 100%; border-collapse: collapse; font-size: var(--geo-font-body); }
    .cn-tabela th { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--geo-border); color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); font-weight: 600; text-align: left; }
    .cn-tabela td { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--geo-border); }
    .cn-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cn-tabela th.cn-num { text-align: right; }
    .cn-vazio { margin: 0; color: var(--geo-foreground-muted); }
  `],
})
export class CanteirosComponent {
  private readonly service = inject(EstoqueObraService);
  private readonly rh = inject(RhService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private inicial = '';

  protected readonly canteiros = signal<Canteiro[]>([]);
  protected readonly estado = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly erro = signal<string | null>(null);
  protected readonly bases = signal<GeoSelectOption<string>[]>([]);

  protected readonly colunas: GeoDataTableColumn<Canteiro>[] = [
    { key: 'nome', header: 'Canteiro', priority: 1 },
    { key: 'nomeBase', header: 'Base operacional', priority: 1, display: (r) => r.nomeBase ?? '—' },
    { key: 'referencia', header: 'Referência', display: (r) => r.referencia ?? '—' },
    { key: 'materiais', header: 'Material agora', type: 'custom', value: (r) => r.materiais, display: (r) => String(r.materiais) },
  ];
  protected readonly rotulo = (r: Canteiro) => r.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<Canteiro | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erros = signal<Record<string, string>>({});
  protected readonly nome = signal('');
  protected readonly idBase = signal<string | null>(null);
  protected readonly referencia = signal('');
  protected readonly latitude = signal<number | null>(null);
  protected readonly longitude = signal<number | null>(null);

  private readonly atual = computed(() => JSON.stringify([this.nome(), this.idBase(), this.referencia(), this.latitude(), this.longitude()]));
  protected readonly alterado = computed(() => this.formularioAberto() && this.atual() !== this.inicial);

  protected readonly aberto = signal<Canteiro | null>(null);
  protected readonly saldo = signal<SaldoPorObra | null>(null);

  constructor() {
    this.carregar();
    this.rh.listarBasesOperacionaisAtivas().subscribe({
      next: (r) => this.bases.set(r.content.map((b) => ({ label: b.nome, value: b.id }))),
    });
  }

  protected carregar(): void {
    this.estado.set('loading');
    this.service.listarCanteiros().subscribe({
      next: (lista) => {
        this.canteiros.set(lista);
        this.estado.set(lista.length ? 'ready' : 'empty');
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.estado.set('error');
      },
    });
  }

  protected novo(): void {
    this.preencher(null);
  }

  protected editar(c: Canteiro): void {
    this.preencher(c);
  }

  protected abrir(c: Canteiro): void {
    this.aberto.set(c);
    this.saldo.set(null);
    this.service.saldoPorObra(c.id).subscribe({
      next: (s) => this.saldo.set(s),
      error: (e) => {
        this.notificacoes.error(getErrorMessage(e));
        this.aberto.set(null);
      },
    });
  }

  protected salvar(): void {
    const erros: Record<string, string> = {};
    if (this.nome().trim().length < 3) erros['nome'] = 'Informe o nome (3 a 100 caracteres).';
    if (!this.idBase()) erros['idBaseOperacional'] = 'Escolha a base operacional.';
    this.erros.set(erros);
    if (Object.keys(erros).length) return;
    const request = {
      nome: this.nome().trim(),
      idBaseOperacional: this.idBase()!,
      referencia: this.referencia().trim() || null,
      latitude: this.latitude(),
      longitude: this.longitude(),
    };
    const atual = this.emEdicao();
    this.salvando.set(true);
    (atual ? this.service.editarCanteiro(atual.id, request) : this.service.criarCanteiro(request)).subscribe({
      next: (c) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(`Canteiro ${c.nome} ${atual ? 'salvo' : 'cadastrado'}.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        const porCampo = errosPorCampo(e);
        if (Object.keys(porCampo).length) {
          this.erros.set(porCampo);
        } else {
          this.notificacoes.error(getErrorMessage(e));
        }
      },
    });
  }

  protected async desativar(c: Canteiro): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar canteiro',
      message: c.materiais
        ? `${c.nome} ainda tem material. Leve ou devolva o material antes; o sistema não desativa canteiro com saldo.`
        : `${c.nome} deixa de aparecer para as equipes. O histórico é mantido.`,
      confirmLabel: 'Desativar',
      variant: 'destructive',
    });
    if (!ok) return;
    this.service.desativarCanteiro(c.id).subscribe({
      next: () => {
        this.notificacoes.success(`Canteiro ${c.nome} desativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e)),
    });
  }

  private preencher(c: Canteiro | null): void {
    this.emEdicao.set(c);
    this.erros.set({});
    this.nome.set(c?.nome ?? '');
    this.idBase.set(c?.idBaseOperacional ?? null);
    this.referencia.set(c?.referencia ?? '');
    this.latitude.set(c?.latitude ?? null);
    this.longitude.set(c?.longitude ?? null);
    this.inicial = this.atual();
    this.formularioAberto.set(true);
  }
}

/** Erros por campo do ProblemDetail (`errors[]` com `field`/`message`), para mostrar no próprio campo. */
function errosPorCampo(e: unknown): Record<string, string> {
  const lista = (e as { error?: { errors?: unknown } })?.error?.errors;
  if (!Array.isArray(lista)) return {};
  const mapa: Record<string, string> = {};
  for (const item of lista as { field?: string; campo?: string; message?: string; mensagem?: string }[]) {
    const campo = item.field ?? item.campo;
    const texto = item.message ?? item.mensagem;
    if (campo && texto) mapa[campo] = texto;
  }
  return mapa;
}
