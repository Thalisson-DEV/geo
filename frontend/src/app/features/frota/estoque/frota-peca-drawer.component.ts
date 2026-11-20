import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoConfirmationService,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { forkJoin, of } from 'rxjs';
import { MovimentoEstoqueFrota, PecaFrota, SaldoPecaFrota, TIPO_MOVIMENTO } from '../../../core/models/frota-pneu.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { moeda, numero, quantidadeMovimento } from './frota-estoque.util';

const NOVO_GRUPO = '__NOVO__';
const GRUPOS_PADRAO = ['Filtros', 'Lubrificantes', 'Freios', 'Suspensão', 'Elétrica', 'Motor', 'Acessórios', 'Consumíveis'];
const UNIDADES: GeoSelectOption<string>[] = ['UN', 'L', 'KG', 'M', 'JG', 'PC', 'CX', 'KIT'].map((u) => ({ label: u, value: u }));

export type OperacaoPeca = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE';

/**
 * Peça da oficina. Aberta de um item, mostra primeiro o que importa naquele almoxarifado (saldo,
 * mínimo, localização e extrato) e deixa o cadastro por último; aberta do catálogo, mostra o
 * cadastro e o saldo em cada almoxarifado.
 */
@Component({
  selector: 'app-frota-peca-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent
  ],
  styles: `
    .saldo { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.5rem 1rem; margin: 0; padding: 0.75rem; border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .saldo dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .saldo dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .botoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .extrato { display: grid; margin: 0; padding: 0; list-style: none; }
    .extrato li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.2rem 0.6rem; align-items: center; padding: 0.55rem 0; border-bottom: 1px solid var(--geo-border); }
    .extrato__det { grid-column: 1 / -1; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .extrato__qtd { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .locais { display: grid; margin: 0; padding: 0; list-style: none; }
    .local { display: flex; width: 100%; align-items: center; gap: 0.75rem; padding: 0.6rem 0.25rem; border: 0; border-bottom: 1px solid var(--geo-border); background: none; color: inherit;
      font: inherit; text-align: start; cursor: pointer; }
    .local:hover { background: var(--geo-surface-subtle); }
    .local:focus-visible { outline: 2px solid var(--geo-ring); outline-offset: -2px; }
    .local__nome { flex: 1; min-width: 0; display: grid; }
    .local__det { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .local__qtd { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .local__seta { color: var(--geo-foreground-muted); }
    .vazio { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <geo-form-drawer [(visible)]="visivel" [title]="peca() ? peca()!.descricao : 'Cadastrar peça'"
      [description]="peca() ? peca()!.codigo + (saldo() ? ' · ' + saldo()!.estoque : '') : 'A peça fica no catálogo da oficina, separado dos materiais do almoxarifado operacional.'"
      [dirty]="alterado()" [loading]="salvando()" size="md">

      @if (saldo(); as s) {
        <dl class="saldo">
          <div><dt>Saldo</dt><dd>{{ numero(s.quantidade) }} {{ s.unidade }}</dd></div>
          <div><dt>Custo médio</dt><dd>{{ s.custoMedio != null ? moeda(s.custoMedio) : '—' }}</dd></div>
          <div><dt>Valor em estoque</dt><dd>{{ moeda(s.valorTotal) }}</dd></div>
        </dl>
        @if (s.abaixoMinimo) {
          <geo-status tone="warning" icon="pi pi-exclamation-triangle">Abaixo do mínimo de {{ numero(s.estoqueMinimo) }} {{ s.unidade }}</geo-status>
        }
        @if (editavel()) {
          <div class="botoes">
            <geo-button size="sm" variant="outline" icon="pi pi-arrow-down-left" label="Entrada" (pressed)="movimentar.emit('ENTRADA')"></geo-button>
            <geo-button size="sm" variant="outline" icon="pi pi-arrow-up-right" label="Saída" [disabled]="s.quantidade <= 0" (pressed)="movimentar.emit('SAIDA')"></geo-button>
            @if (podeTransferir()) {
              <geo-button size="sm" variant="outline" icon="pi pi-arrow-right-arrow-left" label="Transferir" [disabled]="s.quantidade <= 0" (pressed)="movimentar.emit('TRANSFERENCIA')"></geo-button>
            }
            <geo-button size="sm" variant="ghost" icon="pi pi-sliders-h" label="Ajustar" (pressed)="movimentar.emit('AJUSTE')"></geo-button>
          </div>
        }

        <geo-form-section title="Neste almoxarifado" icon="pi pi-map-marker">
          <div class="geo-form-grid">
            <geo-number-input label="Mínimo" [(value)]="minimo" [min]="0" [maxFractionDigits]="3" [showOptional]="true" [disabled]="!editavel()"
              description="Abaixo disso, a peça aparece para repor."></geo-number-input>
            <geo-text-input label="Localização" [(value)]="localizacao" [maxlength]="60" [showOptional]="true" [disabled]="!editavel()" placeholder="Ex.: Prateleira A2"></geo-text-input>
          </div>
        </geo-form-section>

        <geo-form-section title="Últimas movimentações" icon="pi pi-history">
          @if (extrato().length) {
            <ul class="extrato">
              @for (m of extrato(); track m.id) {
                @let t = tipo(m);
                <li>
                  <span><geo-status [tone]="t.tom" [icon]="t.icone">{{ t.rotulo }}</geo-status></span>
                  <span class="extrato__qtd">{{ quantidade(m) }}</span>
                  <span class="extrato__det">{{ m.dataHora | date: 'dd/MM/yyyy HH:mm' }}{{ m.motivoRotulo ? ' · ' + m.motivoRotulo : '' }}{{ m.placa ? ' · ' + placa(m.placa) : '' }}{{ m.numeroOrdemServico ? ' · OS ' + m.numeroOrdemServico : '' }}{{ m.documento ? ' · ' + m.documento : '' }}{{ m.estornado ? ' · estornada' : '' }}</span>
                </li>
              }
            </ul>
            <geo-button variant="link" size="sm" icon="pi pi-list" label="Ver todas as movimentações" (pressed)="verMovimentacoes.emit()"></geo-button>
          } @else {
            <span class="vazio">Nenhuma movimentação ainda.</span>
          }
        </geo-form-section>
      } @else if (peca(); as p) {
        @if (!p.ativo) {
          <span><geo-status tone="neutral" emphasis="outline" icon="pi pi-ban">Peça desativada</geo-status></span>
        }
        @if (locais().length) {
          <geo-form-section title="Saldo por almoxarifado" icon="pi pi-warehouse">
            <ul class="locais">
              @for (l of locais(); track l.idEstoque) {
                <li>
                  <button type="button" class="local" (click)="abrirSaldo.emit(l)" [attr.aria-label]="'Abrir ' + p.descricao + ' em ' + l.estoque">
                    <span class="local__nome">
                      {{ l.estoque }}
                      <span class="local__det">{{ l.localizacao || 'Sem localização' }}{{ l.estoqueMinimo ? ' · mínimo ' + numero(l.estoqueMinimo) : '' }}</span>
                    </span>
                    @if (l.abaixoMinimo) { <geo-status tone="warning" icon="pi pi-exclamation-triangle">Repor</geo-status> }
                    <span class="local__qtd">{{ numero(l.quantidade) }} {{ l.unidade }}</span>
                    <i class="pi pi-angle-right local__seta" aria-hidden="true"></i>
                  </button>
                </li>
              }
            </ul>
          </geo-form-section>
        }
        @if (editavel()) {
          <div class="botoes">
            <geo-button size="sm" variant="outline" icon="pi pi-arrow-down-left" label="Lançar entrada" (pressed)="movimentar.emit('ENTRADA')"></geo-button>
          </div>
          @if (p.saldoTotal > 0) { <span class="vazio">Para desativar a peça, zere o saldo em todos os almoxarifados.</span> }
        }
      }

      <geo-form-section [title]="saldo() ? 'Cadastro da peça' : 'Peça'" icon="pi pi-wrench">
        <div class="geo-form-grid">
          <geo-text-input label="Código" [required]="true" [(value)]="codigo" [maxlength]="50" [disabled]="!editavel()" [error]="erro('codigo')"
            description="Do fabricante ou interno. Cada código só pode ser usado uma vez."></geo-text-input>
          <geo-select label="Unidade" [required]="true" [options]="unidades()" [(value)]="unidade" [disabled]="!editavel()" [error]="erro('unidade')"></geo-select>
        </div>
        <geo-text-input label="Nome" [required]="true" [(value)]="descricao" [maxlength]="355" [disabled]="!editavel()" [error]="erro('descricao')"
          placeholder="Ex.: Filtro de óleo PSL 340"></geo-text-input>
        <div class="geo-form-grid">
          <geo-select label="Grupo" [options]="opcoesGrupo()" [(value)]="grupo" [filter]="true" [clearable]="true" [showOptional]="true" [disabled]="!editavel()"></geo-select>
          @if (grupo() === novoGrupo) {
            <geo-text-input label="Nome do grupo" [required]="true" [(value)]="grupoNovo" [maxlength]="60" [disabled]="!editavel()" [error]="erroGrupo()"></geo-text-input>
          }
        </div>
      </geo-form-section>

      <div drawer-footer class="rodape">
        @if (editavel() && peca() && !saldo() && peca()!.saldoTotal <= 0) {
          <geo-button variant="ghost" icon="pi pi-ban" label="Desativar" ariaLabel="Desativar peça" (pressed)="desativar()"></geo-button>
        }
        <span class="rodape__espaco"></span>
        <geo-button variant="ghost" [label]="editavel() ? 'Cancelar' : 'Fechar'" (pressed)="visivel.set(false)"></geo-button>
        @if (editavel()) {
          <geo-button icon="pi pi-check" [label]="peca() ? 'Salvar alterações' : 'Cadastrar peça'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `
})
export class FrotaPecaDrawerComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly visivel = model(false);
  readonly peca = input<PecaFrota | null>(null);
  readonly saldo = input<SaldoPecaFrota | null>(null);
  readonly grupos = input<string[]>([]);
  readonly podeEditar = input(false);
  /** Mais de um almoxarifado ativo: a transferência faz sentido. */
  readonly podeTransferir = input(false);
  /** No catálogo: a situação da peça em cada almoxarifado ativo, inclusive onde ela ainda não tem saldo. */
  readonly locais = input<SaldoPecaFrota[]>([]);
  /** A peça salva; nulo quando ela foi desativada. */
  readonly salva = output<PecaFrota | null>();
  readonly movimentar = output<OperacaoPeca>();
  readonly abrirSaldo = output<SaldoPecaFrota>();
  readonly verMovimentacoes = output<void>();

  protected readonly novoGrupo = NOVO_GRUPO;
  protected readonly moeda = moeda;
  protected readonly numero = numero;
  protected readonly placa = formatarPlaca;
  protected readonly quantidade = quantidadeMovimento;
  protected readonly salvando = signal(false);
  private readonly tentou = signal(false);
  protected readonly codigo = signal('');
  protected readonly descricao = signal('');
  protected readonly unidade = signal<string | null>('UN');
  protected readonly grupo = signal<string | null>(null);
  protected readonly grupoNovo = signal('');
  protected readonly minimo = signal<number | null>(null);
  protected readonly localizacao = signal('');
  protected readonly extrato = signal<MovimentoEstoqueFrota[]>([]);
  private readonly inicial = signal('');

  protected readonly opcoesGrupo = computed<GeoSelectOption<string>[]>(() => {
    const lista = [...new Set([...GRUPOS_PADRAO, ...this.grupos()])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...lista.map((g) => ({ label: g, value: g })), { label: 'Outro grupo…', value: NOVO_GRUPO }];
  });
  /** As unidades comuns e, na peça já cadastrada, a dela se for outra. */
  protected readonly unidades = computed<GeoSelectOption<string>[]>(() => {
    const gravada = this.peca()?.unidade;
    return gravada && !UNIDADES.some((u) => u.value === gravada) ? [...UNIDADES, { label: gravada, value: gravada }] : UNIDADES;
  });
  /** A peça desativada só se consulta. */
  protected readonly editavel = computed(() => this.podeEditar() && this.peca()?.ativo !== false);
  protected readonly alterado = computed(() => this.editavel() && this.foto() !== this.inicial());
  protected readonly erroGrupo = computed(() => (this.tentou() && this.grupo() === NOVO_GRUPO && !this.grupoNovo().trim() ? 'Informe o nome do grupo.' : undefined));

  constructor() {
    effect(() => {
      if (!this.visivel()) return;
      const peca = this.peca();
      const saldo = this.saldo();
      untracked(() => this.preencher(peca, saldo));
    });
  }

  protected tipo(m: MovimentoEstoqueFrota) {
    return TIPO_MOVIMENTO[m.tipo];
  }

  protected erro(campo: 'codigo' | 'descricao' | 'unidade'): string | undefined {
    if (!this.tentou()) return undefined;
    if (campo === 'codigo') return this.codigo().trim() ? undefined : 'Informe o código.';
    if (campo === 'descricao') return this.descricao().trim() ? undefined : 'Informe o nome.';
    return this.unidade() ? undefined : 'Escolha a unidade.';
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (this.erro('codigo') || this.erro('descricao') || this.erro('unidade') || this.erroGrupo()) return;
    const atual = this.peca();
    const saldo = this.saldo();
    const grupo = this.grupo() === NOVO_GRUPO ? this.grupoNovo().trim() : this.grupo();
    this.salvando.set(true);
    forkJoin([
      this.servico.salvarPeca({ codigo: this.codigo().trim(), descricao: this.descricao().trim(), unidade: this.unidade()!, grupo }, atual?.id),
      saldo ? this.servico.definirParametros(saldo.idEstoque, saldo.idMaterial, this.minimo(), this.localizacao().trim() || null) : of(null)
    ]).subscribe({
      next: ([salva]) => {
        this.salvando.set(false);
        this.notificacoes.success(atual ? `Peça ${salva.codigo} atualizada.` : `Peça ${salva.codigo} cadastrada.`);
        this.inicial.set(this.foto());
        this.salva.emit(salva);
        this.visivel.set(false);
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected async desativar(): Promise<void> {
    const p = this.peca();
    if (!p) return;
    const ok = await this.confirmacao.confirm({
      title: 'Desativar peça',
      message: `${p.descricao} deixa de aparecer nas entradas, saídas e ordens de serviço. O histórico continua guardado.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.desativarPeca(p.id).subscribe({
      next: () => {
        this.notificacoes.success(`Peça ${p.codigo} desativada.`);
        this.salva.emit(null);
        this.visivel.set(false);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private preencher(peca: PecaFrota | null, saldo: SaldoPecaFrota | null): void {
    this.tentou.set(false);
    this.codigo.set(peca?.codigo ?? '');
    this.descricao.set(peca?.descricao ?? '');
    this.unidade.set(peca?.unidade ?? 'UN');
    this.grupo.set(peca?.grupo ?? null);
    this.grupoNovo.set('');
    this.minimo.set(saldo?.estoqueMinimo ?? null);
    this.localizacao.set(saldo?.localizacao ?? '');
    this.extrato.set([]);
    this.inicial.set(this.foto());
    if (saldo) {
      this.servico.movimentos({ idEstoque: saldo.idEstoque, idMaterial: saldo.idMaterial }, { size: 5, sort: ['dataHora,desc'] }).subscribe({
        next: (p) => this.extrato.set(p.content),
        error: () => this.extrato.set([])
      });
    }
  }

  private foto(): string {
    return JSON.stringify([this.codigo(), this.descricao(), this.unidade(), this.grupo(), this.grupoNovo(), this.minimo(), this.localizacao()]);
  }
}
