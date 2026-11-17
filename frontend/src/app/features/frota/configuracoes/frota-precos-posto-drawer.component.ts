import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesDrawerComponent,
  CesFormSectionComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';
import {
  PostoAbastecimento,
  PrecoPosto,
  ProdutoAbastecimento,
  SugestaoPrecoPosto
} from '../../../core/models/frota-abastecimento.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { precoUnitario } from '../abastecimentos/frota-abastecimento.util';

/**
 * Preços do posto por produto, com histórico. O abastecimento registrado calcula o valor pelo
 * preço vigente na data, e a equipe não digita valor no posto (gestores, 23/10/2026). Os preços
 * lidos nos cupons pela Bússola aparecem aqui para confirmar ou descartar.
 */
@Component({
  selector: 'app-frota-precos-posto-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesDrawerComponent,
    CesFormSectionComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesStatusComponent
  ],
  styles: `
    .pp { display: grid; gap: 1.25rem; }
    .pp__vigentes { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.625rem; }
    .pp__cartao { display: grid; gap: 0.25rem; padding: 0.75rem 0.875rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md, 0.5rem);
      background: var(--ces-surface); }
    .pp__cartao strong { font-size: 1.125rem; font-variant-numeric: tabular-nums; }
    .pp__cartao span { font-size: 0.75rem; color: var(--ces-foreground-muted); }
    .pp__cartao--vazio { border-style: dashed; }
    .pp__form { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); gap: 0.625rem; align-items: end; }
    @media (max-width: 560px) { .pp__form { grid-template-columns: 1fr; } }
    .pp__historico { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md, 0.5rem); }
    .pp__linha { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; padding: 0.625rem 0.875rem; font-size: 0.8125rem; }
    .pp__linha + .pp__linha { border-top: 1px solid var(--ces-border); }
    .pp__linha strong { font-variant-numeric: tabular-nums; }
    .pp__linha span { color: var(--ces-foreground-muted); }
    .pp__sugestao { display: grid; gap: 0.5rem; padding: 0.75rem 0.875rem; border: 1px solid var(--ces-warning); border-radius: var(--ces-radius-md, 0.5rem);
      background: var(--ces-warning-soft); }
    .pp__acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .pp__titulo { margin: 0; font-size: 0.875rem; font-weight: 700; }
  `,
  template: `
    <ces-drawer [(visible)]="visible" eyebrow="Preços do posto" [title]="posto()?.nome ?? 'Posto'" size="md">
      @if (carregando() && !precos().length) {
        <ces-async-state state="loading" title="Carregando os preços" [compact]="true"></ces-async-state>
      } @else if (erro()) {
        <ces-async-state state="error" title="Não foi possível carregar os preços" [description]="erro()!" [compact]="true"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></ces-async-state>
      } @else {
        <div class="pp">
          <ces-callout tone="info" [dense]="true" icon="pi pi-calculator">
            Com o preço cadastrado, quem abastece só confirma os litros e o valor sai calculado. Sem preço, o app pede o valor e o abastecimento ganha o alerta de posto sem preço.
          </ces-callout>

          @if (sugestoes().length) {
            <section class="ces-form-stack" aria-label="Preços lidos nos cupons">
              <h3 class="pp__titulo">Preços lidos nos cupons pela Bússola</h3>
              @for (s of sugestoes(); track s.id) {
                <div class="pp__sugestao">
                  <span><strong>{{ s.produto }}</strong>: cadastro {{ s.precoCadastrado == null ? 'sem preço' : preco(s.precoCadastrado) }},
                    cupom de {{ s.dataCupom | date: 'dd/MM' }} {{ preco(s.precoCupom) }}.</span>
                  <div class="pp__acoes">
                    <ces-button size="sm" icon="pi pi-check" label="Atualizar o preço" [loading]="salvando()" (pressed)="decidir(s, true)"></ces-button>
                    <ces-button size="sm" variant="ghost" icon="pi pi-times" label="Manter o atual" (pressed)="decidir(s, false)"></ces-button>
                  </div>
                </div>
              }
            </section>
          }

          <section aria-label="Preços de hoje">
            <div class="pp__vigentes">
              @for (p of produtosAtivos(); track p.id) {
                @if (vigente(p.id); as v) {
                  <div class="pp__cartao">
                    <span>{{ p.nome }}</span>
                    <strong>{{ preco(v.precoUnitario, p.unidade) }}</strong>
                    <span>Desde {{ v.vigenteDesde | date: 'dd/MM/yyyy' }} · {{ v.origemRotulo }}</span>
                  </div>
                } @else {
                  <div class="pp__cartao pp__cartao--vazio">
                    <span>{{ p.nome }}</span>
                    <strong>Sem preço</strong>
                    <span>O app pede o valor a quem abastece</span>
                  </div>
                }
              }
            </div>
          </section>

          @if (podeEditar()) {
            <ces-form-section title="Registrar preço" icon="pi pi-plus" description="O preço novo vale a partir da data; o anterior fica no histórico.">
              <div class="pp__form">
                <ces-select label="Produto" [options]="opcoesProduto()" [(value)]="idProduto"
                  [error]="tentou() && !idProduto() ? 'Escolha o produto.' : undefined"></ces-select>
                <ces-number-input label="Preço" [(value)]="valor" [min]="0.001" [minFractionDigits]="3" [maxFractionDigits]="3" prefix="R$ "
                  [error]="tentou() && !valor() ? 'Informe o preço.' : undefined"></ces-number-input>
                <ces-datepicker label="Vale a partir de" [value]="dataLocal(vigenteDesde())" (valueChange)="vigenteDesde.set(dataIso($event))"></ces-datepicker>
              </div>
              <div class="pp__acoes">
                <ces-button icon="pi pi-check" label="Registrar preço" [loading]="salvando()" (pressed)="registrar()"></ces-button>
              </div>
            </ces-form-section>
          }

          <section aria-labelledby="pp-historico">
            <h3 id="pp-historico" class="pp__titulo">Histórico</h3>
            @if (precos().length) {
              <ul class="pp__historico">
                @for (p of precos(); track p.id) {
                  <li class="pp__linha">
                    <span><strong>{{ p.produto }}</strong> · {{ preco(p.precoUnitario, p.unidade) }}
                      @if (p.vigente) { <ces-status tone="success" emphasis="soft">Vale hoje</ces-status> }</span>
                    <span>{{ p.vigenteDesde | date: 'dd/MM/yyyy' }} · {{ p.origemRotulo }}{{ p.registradoPor ? ' · ' + p.registradoPor : '' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <ces-async-state state="empty" title="Nenhum preço cadastrado" description="Registre o preço de cada produto que o posto vende." [compact]="true"></ces-async-state>
            }
          </section>
        </div>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Fechar" (pressed)="visible.set(false)"></ces-button>
      </div>
    </ces-drawer>
  `
})
export class FrotaPrecosPostoDrawerComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  readonly posto = input<PostoAbastecimento | null>(null);
  readonly produtos = input<ProdutoAbastecimento[]>([]);
  readonly podeEditar = input(false);

  protected readonly precos = signal<PrecoPosto[]>([]);
  protected readonly sugestoes = signal<SugestaoPrecoPosto[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  protected readonly idProduto = signal<string | null>(null);
  protected readonly valor = signal<number | null>(null);
  protected readonly vigenteDesde = signal<string | null>(null);
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;

  protected readonly produtosAtivos = computed(() => this.produtos().filter((p) => p.ativo));
  protected readonly opcoesProduto = computed<CesSelectOption<string>[]>(() => this.produtosAtivos().map((p) => ({ label: p.nome, value: p.id })));

  constructor() {
    effect(() => {
      const posto = this.posto();
      if (this.visible() && posto) untracked(() => this.carregar());
    });
  }

  /** Unidade do produto ('L'/'UN') ou a sigla do preço ('l'/'un'). */
  protected preco(valor: number, unidade = 'L'): string {
    return precoUnitario(valor, unidade.toLowerCase() === 'un' ? 'un' : 'l');
  }

  protected vigente(idProduto: string): PrecoPosto | undefined {
    return this.precos().find((p) => p.idProduto === idProduto && p.vigente);
  }

  protected carregar(): void {
    const posto = this.posto();
    if (!posto) return;
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.precos(posto.id).subscribe({
      next: (lista) => {
        this.precos.set(lista);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
    if (this.podeEditar()) {
      this.servico.sugestoesPreco().subscribe({
        next: (lista) => this.sugestoes.set(lista.filter((s) => s.idPosto === posto.id)),
        error: () => this.sugestoes.set([])
      });
    }
  }

  protected registrar(): void {
    const posto = this.posto();
    this.tentou.set(true);
    if (!posto || !this.idProduto() || !this.valor()) return;
    this.salvando.set(true);
    this.servico.registrarPreco(posto.id, { idProduto: this.idProduto()!, precoUnitario: this.valor()!, vigenteDesde: this.vigenteDesde() })
      .subscribe({
        next: (p) => {
          this.salvando.set(false);
          this.tentou.set(false);
          this.idProduto.set(null);
          this.valor.set(null);
          this.vigenteDesde.set(null);
          this.notificacoes.success(`Preço de ${p.produto} registrado.`);
          this.carregar();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  protected decidir(s: SugestaoPrecoPosto, confirmar: boolean): void {
    this.salvando.set(true);
    (confirmar ? this.servico.confirmarSugestaoPreco(s.id) : this.servico.descartarSugestaoPreco(s.id)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success(confirmar ? `Preço de ${s.produto} atualizado.` : 'Preço mantido.');
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
