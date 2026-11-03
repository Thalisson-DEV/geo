import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesConfirmationService,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { forkJoin, of } from 'rxjs';
import { MovimentoEstoqueFrota, PecaFrota, SaldoPecaFrota, TIPO_MOVIMENTO } from '../../../core/models/frota-pneu.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { moeda, numero, quantidadeMovimento } from './frota-estoque.util';

const NOVO_GRUPO = '__NOVO__';
const GRUPOS_PADRAO = ['Filtros', 'Lubrificantes', 'Freios', 'Suspensão', 'Elétrica', 'Motor', 'Acessórios', 'Consumíveis'];
const UNIDADES: CesSelectOption<string>[] = ['UN', 'L', 'KG', 'M', 'JG', 'PC', 'CX', 'KIT'].map((u) => ({ label: u, value: u }));

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
    CesButtonComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent
  ],
  styles: `
    .saldo { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.5rem 1rem; margin: 0; padding: 0.75rem; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md); background: var(--ces-surface-subtle); }
    .saldo dt { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .saldo dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
    .botoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .extrato { display: grid; margin: 0; padding: 0; list-style: none; }
    .extrato li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.2rem 0.6rem; align-items: center; padding: 0.55rem 0; border-bottom: 1px solid var(--ces-border); }
    .extrato__det { grid-column: 1 / -1; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .extrato__qtd { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
    .locais { display: grid; margin: 0; padding: 0; list-style: none; }
    .local { display: flex; width: 100%; align-items: center; gap: 0.75rem; padding: 0.6rem 0.25rem; border: 0; border-bottom: 1px solid var(--ces-border); background: none; color: inherit;
      font: inherit; text-align: start; cursor: pointer; }
    .local:hover { background: var(--ces-surface-subtle); }
    .local:focus-visible { outline: 2px solid var(--ces-ring); outline-offset: -2px; }
    .local__nome { flex: 1; min-width: 0; display: grid; }
    .local__det { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .local__qtd { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .local__seta { color: var(--ces-foreground-muted); }
    .vazio { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <ces-form-drawer [(visible)]="visivel" [title]="peca() ? peca()!.descricao : 'Cadastrar peça'"
      [description]="peca() ? peca()!.codigo + (saldo() ? ' · ' + saldo()!.estoque : '') : 'A peça fica no catálogo da oficina, separado dos materiais do almoxarifado operacional.'"
      [dirty]="alterado()" [loading]="salvando()" size="md">

      @if (saldo(); as s) {
        <dl class="saldo">
          <div><dt>Saldo</dt><dd>{{ numero(s.quantidade) }} {{ s.unidade }}</dd></div>
          <div><dt>Custo médio</dt><dd>{{ s.custoMedio != null ? moeda(s.custoMedio) : '—' }}</dd></div>
          <div><dt>Valor em estoque</dt><dd>{{ moeda(s.valorTotal) }}</dd></div>
        </dl>
        @if (s.abaixoMinimo) {
          <ces-status tone="warning" icon="pi pi-exclamation-triangle">Abaixo do mínimo de {{ numero(s.estoqueMinimo) }} {{ s.unidade }}</ces-status>
        }
        @if (editavel()) {
          <div class="botoes">
            <ces-button size="sm" variant="outline" icon="pi pi-arrow-down-left" label="Entrada" (pressed)="movimentar.emit('ENTRADA')"></ces-button>
            <ces-button size="sm" variant="outline" icon="pi pi-arrow-up-right" label="Saída" [disabled]="s.quantidade <= 0" (pressed)="movimentar.emit('SAIDA')"></ces-button>
            @if (podeTransferir()) {
              <ces-button size="sm" variant="outline" icon="pi pi-arrow-right-arrow-left" label="Transferir" [disabled]="s.quantidade <= 0" (pressed)="movimentar.emit('TRANSFERENCIA')"></ces-button>
            }
            <ces-button size="sm" variant="ghost" icon="pi pi-sliders-h" label="Ajustar" (pressed)="movimentar.emit('AJUSTE')"></ces-button>
          </div>
        }

        <ces-form-section title="Neste almoxarifado" icon="pi pi-map-marker">
          <div class="ces-form-grid">
            <ces-number-input label="Mínimo" [(value)]="minimo" [min]="0" [maxFractionDigits]="3" [showOptional]="true" [disabled]="!editavel()"
              description="Abaixo disso, a peça aparece para repor."></ces-number-input>
            <ces-text-input label="Localização" [(value)]="localizacao" [maxlength]="60" [showOptional]="true" [disabled]="!editavel()" placeholder="Ex.: Prateleira A2"></ces-text-input>
          </div>
        </ces-form-section>

        <ces-form-section title="Últimas movimentações" icon="pi pi-history">
          @if (extrato().length) {
            <ul class="extrato">
              @for (m of extrato(); track m.id) {
                @let t = tipo(m);
                <li>
                  <span><ces-status [tone]="t.tom" [icon]="t.icone">{{ t.rotulo }}</ces-status></span>
                  <span class="extrato__qtd">{{ quantidade(m) }}</span>
                  <span class="extrato__det">{{ m.dataHora | date: 'dd/MM/yyyy HH:mm' }}{{ m.motivoRotulo ? ' · ' + m.motivoRotulo : '' }}{{ m.placa ? ' · ' + placa(m.placa) : '' }}{{ m.numeroOrdemServico ? ' · OS ' + m.numeroOrdemServico : '' }}{{ m.documento ? ' · ' + m.documento : '' }}{{ m.estornado ? ' · estornada' : '' }}</span>
                </li>
              }
            </ul>
            <ces-button variant="link" size="sm" icon="pi pi-list" label="Ver todas as movimentações" (pressed)="verMovimentacoes.emit()"></ces-button>
          } @else {
            <span class="vazio">Nenhuma movimentação ainda.</span>
          }
        </ces-form-section>
      } @else if (peca(); as p) {
        @if (!p.ativo) {
          <span><ces-status tone="neutral" emphasis="outline" icon="pi pi-ban">Peça desativada</ces-status></span>
        }
        @if (locais().length) {
          <ces-form-section title="Saldo por almoxarifado" icon="pi pi-warehouse">
            <ul class="locais">
              @for (l of locais(); track l.idEstoque) {
                <li>
                  <button type="button" class="local" (click)="abrirSaldo.emit(l)" [attr.aria-label]="'Abrir ' + p.descricao + ' em ' + l.estoque">
                    <span class="local__nome">
                      {{ l.estoque }}
                      <span class="local__det">{{ l.localizacao || 'Sem localização' }}{{ l.estoqueMinimo ? ' · mínimo ' + numero(l.estoqueMinimo) : '' }}</span>
                    </span>
                    @if (l.abaixoMinimo) { <ces-status tone="warning" icon="pi pi-exclamation-triangle">Repor</ces-status> }
                    <span class="local__qtd">{{ numero(l.quantidade) }} {{ l.unidade }}</span>
                    <i class="pi pi-angle-right local__seta" aria-hidden="true"></i>
                  </button>
                </li>
              }
            </ul>
          </ces-form-section>
        }
        @if (editavel()) {
          <div class="botoes">
            <ces-button size="sm" variant="outline" icon="pi pi-arrow-down-left" label="Lançar entrada" (pressed)="movimentar.emit('ENTRADA')"></ces-button>
          </div>
          @if (p.saldoTotal > 0) { <span class="vazio">Para desativar a peça, zere o saldo em todos os almoxarifados.</span> }
        }
      }

      <ces-form-section [title]="saldo() ? 'Cadastro da peça' : 'Peça'" icon="pi pi-wrench">
        <div class="ces-form-grid">
          <ces-text-input label="Código" [required]="true" [(value)]="codigo" [maxlength]="50" [disabled]="!editavel()" [error]="erro('codigo')"
            description="Do fabricante ou interno. Cada código só pode ser usado uma vez."></ces-text-input>
          <ces-select label="Unidade" [required]="true" [options]="unidades()" [(value)]="unidade" [disabled]="!editavel()" [error]="erro('unidade')"></ces-select>
        </div>
        <ces-text-input label="Nome" [required]="true" [(value)]="descricao" [maxlength]="355" [disabled]="!editavel()" [error]="erro('descricao')"
          placeholder="Ex.: Filtro de óleo PSL 340"></ces-text-input>
        <div class="ces-form-grid">
          <ces-select label="Grupo" [options]="opcoesGrupo()" [(value)]="grupo" [filter]="true" [clearable]="true" [showOptional]="true" [disabled]="!editavel()"></ces-select>
          @if (grupo() === novoGrupo) {
            <ces-text-input label="Nome do grupo" [required]="true" [(value)]="grupoNovo" [maxlength]="60" [disabled]="!editavel()" [error]="erroGrupo()"></ces-text-input>
          }
        </div>
      </ces-form-section>

      <div drawer-footer class="rodape">
        @if (editavel() && peca() && !saldo() && peca()!.saldoTotal <= 0) {
          <ces-button variant="ghost" icon="pi pi-ban" label="Desativar" ariaLabel="Desativar peça" (pressed)="desativar()"></ces-button>
        }
        <span class="rodape__espaco"></span>
        <ces-button variant="ghost" [label]="editavel() ? 'Cancelar' : 'Fechar'" (pressed)="visivel.set(false)"></ces-button>
        @if (editavel()) {
          <ces-button icon="pi pi-check" [label]="peca() ? 'Salvar alterações' : 'Cadastrar peça'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
        }
      </div>
    </ces-form-drawer>
  `
})
export class FrotaPecaDrawerComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);

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

  protected readonly opcoesGrupo = computed<CesSelectOption<string>[]>(() => {
    const lista = [...new Set([...GRUPOS_PADRAO, ...this.grupos()])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...lista.map((g) => ({ label: g, value: g })), { label: 'Outro grupo…', value: NOVO_GRUPO }];
  });
  /** As unidades comuns e, na peça já cadastrada, a dela se for outra. */
  protected readonly unidades = computed<CesSelectOption<string>[]>(() => {
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
