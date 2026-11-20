import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { EstornarFechamentoRequest, FechamentoDetalhe, MovimentacaoFechamento, PreviaSaldo } from '../../core/fechamento/fechamento.models';
import { falhaDeConexao, mensagemFalha } from '../../core/fechamento/fechamento-ui';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { ToastService } from '../../core/ui/toast.service';
import { FolhaComponent, IconeComponent, QuantidadeComponent, numeroBr } from '../../ui';
import { PreviaSaldoComponent } from './previa-saldo.component';

interface ItemEstorno { id: string; descricao: string; restante: number; quantidade: number; marcado: boolean }

/** Estorno de uma movimentação, inteira ou em parte, com motivo. O saldo pode ficar negativo. */
@Component({
  selector: 'app-folha-estorno-fechamento',
  standalone: true,
  imports: [FolhaComponent, IconeComponent, PreviaSaldoComponent, QuantidadeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-folha [aberta]="!!movimentacao()" (fechar)="fechar.emit()" titulo="Estornar movimentação"
      [descricao]="movimentacao()?.efeitoEstoque === 'FISICO' ? 'O material volta pelo mesmo caminho e o saldo é desfeito.' : 'A movimentação virtual é desfeita; nenhum saldo muda.'">
      <div class="campos">
        <ul class="geo-grupo lista">
          @for (i of itens(); track i.id; let idx = $index) {
            <li class="geo-linha linha">
              <button type="button" role="checkbox" class="caixa" [attr.aria-checked]="i.marcado" (click)="marcar(idx)" [attr.aria-label]="'Estornar ' + i.descricao">
                <geo-icone nome="check" [tamanho]="14" /></button>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ i.descricao }}</span>
                <span class="geo-linha__apoio geo-num">Pode estornar até {{ num(i.restante) }}</span></span>
              @if (i.marcado) {
                <geo-quantidade [valor]="i.quantidade" (valorChange)="quantidade(idx, $event)" [minimo]="0.001" [rotulo]="'quantidade a estornar de ' + i.descricao" />
              }
            </li>
          }
        </ul>
        <label class="geo-campo">
          <span class="geo-campo__rotulo">Motivo do estorno *</span>
          <textarea class="geo-input texto" rows="3" maxlength="500" [value]="motivo()" (input)="motivo.set($any($event.target).value); confirmando.set(false)"
            [attr.aria-invalid]="tentou() && !motivo().trim()" placeholder="Ex.: quantidade marcada errada"></textarea>
          @if (tentou() && !motivo().trim()) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />Informe o motivo do estorno.</span> }
        </label>
        <app-previa-saldo [previa]="previa()" />
      </div>
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="fechar.emit()">Voltar</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="confirmar()" [disabled]="enviando() || !marcados()">
          {{ enviando() ? 'Estornando…' : confirmando() ? 'Toque de novo' : 'Estornar ' + marcados() + (marcados() === 1 ? ' item' : ' itens') }}</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    .campos { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e3) var(--geo-e2); }
    .lista { margin: 0; background: var(--geo-fundo); }
    .linha { flex-wrap: wrap; }
    .texto { min-height: 88px; padding: var(--geo-e3) var(--geo-e4); resize: vertical; }
    .caixa { width: 48px; height: 48px; margin: -10px -6px -10px -10px; border: 0; background: transparent; display: grid; place-items: center; cursor: pointer; color: transparent; }
    .caixa geo-icone { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--geo-linha-forte); display: grid; place-items: center; box-sizing: border-box; }
    .caixa[aria-checked='true'] { color: var(--geo-destaque-texto); }
    .caixa[aria-checked='true'] geo-icone { background: var(--geo-destaque); border-color: var(--geo-destaque); }
    .campos .geo-campo__rotulo, .campos .geo-campo__erro { padding-left: var(--geo-e4); }
  `],
})
export class FolhaEstornoFechamentoComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly toast = inject(ToastService);

  readonly solicitacao = input.required<FechamentoDetalhe>();
  /** A folha fica aberta enquanto houver movimentação escolhida. */
  readonly movimentacao = input<MovimentacaoFechamento | null>(null);
  readonly fechar = output<void>();
  readonly concluido = output<FechamentoDetalhe>();
  readonly recarregar = output<void>();

  readonly itens = signal<ItemEstorno[]>([]);
  readonly motivo = signal('');
  readonly previa = signal<PreviaSaldo | null>(null);
  readonly tentou = signal(false);
  readonly confirmando = signal(false);
  readonly enviando = signal(false);
  private envio: { assinatura: string; chave: string } | null = null;

  readonly marcados = computed(() => this.itens().filter(i => i.marcado && i.quantidade > 0).length);
  private readonly selecionados = computed(() => this.itens().filter(i => i.marcado && i.quantidade > 0).map(i => ({ idItemOperacao: i.id, quantidade: i.quantidade })));

  constructor() {
    effect(() => {
      const m = this.movimentacao();
      untracked(() => {
        this.motivo.set('');
        this.tentou.set(false);
        this.confirmando.set(false);
        this.previa.set(null);
        this.envio = null;
        this.itens.set((m?.itens ?? []).filter(i => i.quantidadeEstornavel > 0).map(i => ({
          id: i.id, descricao: i.descricaoMaterial, restante: i.quantidadeEstornavel, quantidade: i.quantidadeEstornavel, marcado: true,
        })));
      });
    });
    toObservable(this.selecionados).pipe(
      debounceTime(350),
      switchMap(itens => {
        const m = this.movimentacao();
        if (!m || m.efeitoEstoque !== 'FISICO' || !itens.length) return of(null);
        const s = this.solicitacao();
        return this.fechamento.previaEstorno(s.id, m.id, { versaoEsperada: s.versao, motivo: 'previa', itens }).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(),
    ).subscribe(p => this.previa.set(p));
  }

  num(n: number): string {
    return numeroBr(n);
  }

  marcar(idx: number): void {
    this.itens.update(l => l.map((i, k) => (k === idx ? { ...i, marcado: !i.marcado } : i)));
    this.confirmando.set(false);
  }

  quantidade(idx: number, q: number): void {
    const item = this.itens()[idx];
    if (q > item.restante) { this.toast.warning(`No máximo ${numeroBr(item.restante)}.`); return; }
    this.itens.update(l => l.map((i, k) => (k === idx ? { ...i, quantidade: q } : i)));
    this.confirmando.set(false);
  }

  confirmar(): void {
    const s = this.solicitacao();
    const m = this.movimentacao();
    this.tentou.set(true);
    if (!m || this.enviando() || !this.motivo().trim()) return;
    if (!this.confirmando()) { this.confirmando.set(true); return; }
    const pedido: EstornarFechamentoRequest = { versaoEsperada: s.versao, motivo: this.motivo().trim(), itens: this.selecionados() };
    const assinatura = JSON.stringify(pedido);
    if (this.envio?.assinatura !== assinatura) this.envio = { assinatura, chave: this.fechamento.novaChave() };
    this.enviando.set(true);
    this.fechamento.estornar(s.id, m.id, pedido, this.envio.chave).subscribe({
      next: d => {
        this.enviando.set(false);
        this.toast.success('Estorno feito.');
        this.concluido.emit(d);
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.confirmando.set(false);
        if (!falhaDeConexao(e)) this.envio = null;
        this.toast.error(mensagemFalha(e, 'Não foi possível estornar.'));
        if (e.status === 409) this.recarregar.emit();
      },
    });
  }
}
