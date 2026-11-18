import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CesButtonComponent, CesFormDrawerComponent, CesNumberInputComponent, CesTextareaComponent, NotificationService } from '@ces/ui';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';

import { FechamentoDetalhe, MovimentacaoFechamento, PreviaSaldo } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { novaChaveIdempotencia } from '../../../core/utils/idempotencia.util';
import { ehFalhaDeTransporte } from '../../../core/utils/solicitacao-tecnica-error.util';
import { dataHora, quantidade } from './fechamento-ui';
import { FechamentoPreviaSaldoComponent } from './fechamento-previa-saldo.component';

/** Estorna uma movimentação inteira ou parte dela, com motivo. Se era física, desfaz o saldo na mesma proporção. */
@Component({
  selector: 'app-fechamento-estorno-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesButtonComponent, CesFormDrawerComponent, CesNumberInputComponent, CesTextareaComponent, FechamentoPreviaSaldoComponent],
  styleUrl: './fechamento.css',
  template: `
    <ces-form-drawer [visible]="visible()" (visibleChange)="visible.set($event)" title="Estornar movimentação" size="md"
      [description]="descricao()" [dirty]="true">
      @if (movimentacao(); as m) {
        <div class="fx-form">
          <section aria-labelledby="fe-itens">
            <h3 id="fe-itens" class="fx-form__titulo">Quanto estornar</h3>
            <ul class="fx-linhas">
              @for (item of estornaveis(); track item.id) {
                <li class="fx-linha">
                  <span class="fx-linha__material">
                    <strong>{{ item.codigoMaterial }}</strong>
                    <span class="fx-linha__desc" [title]="item.descricaoMaterial">{{ item.descricaoMaterial }}</span>
                    <span class="fx-linha__meta">Pode estornar até {{ quantidade(item.quantidadeEstornavel) }}</span>
                  </span>
                  <ces-number-input class="fx-linha__qtd" [label]="'Estornar de ' + item.codigoMaterial" [labelVisible]="false"
                    [min]="0" [max]="item.quantidadeEstornavel" [maxFractionDigits]="3"
                    [value]="quantidades()[item.id] ?? null" (valueChange)="definir(item.id, $event)"
                    [error]="(quantidades()[item.id] ?? 0) > item.quantidadeEstornavel ? 'Até ' + quantidade(item.quantidadeEstornavel) + '.' : undefined" />
                </li>
              }
            </ul>
            <p class="fx-dica">A quantidade estornada volta a ficar pendente na solicitação.</p>
          </section>
          <ces-textarea label="Motivo" [(value)]="motivo" [rows]="3" [maxlength]="500" [required]="true"
            placeholder="Ex.: lançado em dobro no SAP" [error]="tentou() && !motivo().trim() ? 'Informe o motivo do estorno.' : undefined" />
          @if (m.efeitoEstoque === 'FISICO') {
            <app-fechamento-previa-saldo [previa]="previa()" [carregando]="carregandoPrevia()" acao="estornar" />
          } @else {
            <p class="fx-dica">Movimentação virtual: o estorno não mexe no saldo.</p>
          }
        </div>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)" />
        <ces-button variant="destructive" icon="pi pi-undo" [label]="pendenteEnvio() ? 'Tentar novamente' : 'Estornar'" [loading]="salvando()" (pressed)="confirmar()" />
      </div>
    </ces-form-drawer>
  `
})
export class FechamentoEstornoDrawerComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  readonly solicitacao = input<FechamentoDetalhe | null>(null);
  readonly movimentacao = input<MovimentacaoFechamento | null>(null);
  readonly estornada = output<FechamentoDetalhe>();
  readonly conflito = output<void>();

  protected readonly quantidade = quantidade;
  protected readonly quantidades = signal<Record<string, number | null>>({});
  protected readonly motivo = signal('');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly pendenteEnvio = signal(false);
  protected readonly previa = signal<PreviaSaldo | null>(null);
  protected readonly carregandoPrevia = signal(false);
  private chave: string | null = null;
  private readonly pedirPrevia = new Subject<void>();

  protected readonly estornaveis = computed(() => (this.movimentacao()?.itens ?? []).filter((i) => i.quantidadeEstornavel > 0));
  protected readonly descricao = computed(() => {
    const m = this.movimentacao();
    return m ? `Movimentação de ${dataHora(m.realizadaEm)}` : undefined;
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const m = this.movimentacao();
      untracked(() => {
        const inicial: Record<string, number | null> = {};
        (m?.itens ?? []).filter((i) => i.quantidadeEstornavel > 0).forEach((i) => (inicial[i.id] = i.quantidadeEstornavel));
        this.quantidades.set(inicial);
        this.motivo.set('');
        this.tentou.set(false);
        this.chave = null;
        this.pendenteEnvio.set(false);
        this.previa.set(null);
        this.pedirPrevia.next();
      });
    });
    this.pedirPrevia
      .pipe(
        debounceTime(300),
        switchMap(() => {
          const s = this.solicitacao();
          const m = this.movimentacao();
          const itens = this.itensValidos();
          if (!s || !m || m.efeitoEstoque !== 'FISICO' || !itens.length) return of(null);
          this.carregandoPrevia.set(true);
          return this.service
            .previaEstorno(s.id, m.id, { versaoEsperada: s.versao, motivo: 'previa', itens })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed()
      )
      .subscribe((previa) => {
        this.previa.set(previa);
        this.carregandoPrevia.set(false);
      });
  }

  protected definir(id: string, valor: number | null): void {
    this.quantidades.update((q) => ({ ...q, [id]: valor }));
    this.chave = null;
    this.pendenteEnvio.set(false);
    this.pedirPrevia.next();
  }

  private itensValidos(): { idItemOperacao: string; quantidade: number }[] {
    return Object.entries(this.quantidades())
      .filter(([, q]) => (q ?? 0) > 0)
      .map(([idItemOperacao, q]) => ({ idItemOperacao, quantidade: q as number }));
  }

  protected confirmar(): void {
    const s = this.solicitacao();
    const m = this.movimentacao();
    if (!s || !m || this.salvando()) return;
    this.tentou.set(true);
    const itens = this.itensValidos();
    const excede = this.estornaveis().some((i) => (this.quantidades()[i.id] ?? 0) > i.quantidadeEstornavel);
    if (!this.motivo().trim() || !itens.length || excede) {
      if (!itens.length) this.notificacoes.warning('Informe quanto estornar de ao menos um material.');
      return;
    }
    this.chave ??= novaChaveIdempotencia();
    this.salvando.set(true);
    this.service.estornar(s.id, m.id, { versaoEsperada: s.versao, motivo: this.motivo().trim(), itens }, this.chave).subscribe({
      next: (detalhe) => {
        this.salvando.set(false);
        this.notificacoes.success('Movimentação estornada.');
        this.visible.set(false);
        this.estornada.emit(detalhe);
      },
      error: (e) => {
        this.salvando.set(false);
        if (ehFalhaDeTransporte(e)) {
          this.pendenteEnvio.set(true);
          this.notificacoes.warning('A conexão caiu antes da resposta. Tente novamente: nada será estornado em dobro.');
          return;
        }
        this.chave = null;
        if (e?.status === 409) {
          this.notificacoes.warning('Alguém alterou esta solicitação. Os dados foram atualizados; confira e confirme de novo.');
          this.conflito.emit();
          return;
        }
        this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível estornar' });
      }
    });
  }
}
