import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoButtonComponent, NotificationService } from '@geo/ui';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';

import { FechamentoDetalhe, ItemFechamento, PreviaSaldo } from '../../../core/models/fechamento-obra.models';
import { MaterialResponse } from '../../../core/models/almoxarifado.models';
import { QuantidadeUnidadeComponent } from '../../almoxarifado/shared/quantidade-unidade.component';
import { daUnidadeBase, paraUnidadeBase } from '../../almoxarifado/shared/unidade-material';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { novaChaveIdempotencia } from '../../../core/utils/idempotencia.util';
import { ehFalhaDeTransporte } from '../../../core/utils/solicitacao-tecnica-error.util';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { FechamentoPreviaSaldoComponent } from './fechamento-previa-saldo.component';
import { quantidade, tipoFechamento } from './fechamento-ui';

/**
 * Aba Movimentar do painel: marca o que o almoxarifado já movimentou no SAP. A quantidade vem
 * preenchida com o que falta e pode ser menor (parcial). Toda movimentação muda o saldo do GEO
 * (almoxarifado ↔ obra), igual ao que aconteceu no SAP.
 */
@Component({
  selector: 'app-fechamento-movimentar-painel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoButtonComponent, FechamentoPreviaSaldoComponent, QuantidadeUnidadeComponent],
  styleUrls: ['../../almoxarifado/solicitacoes-material/solicitacao-comercial-detalhe.component.css', './fechamento.css'],
  styles: `
    .fm-bloco { margin-top: 0.75rem; }
  `,
  template: `
    <div class="dd-entrega">
      <div class="dd-secao-topo">
        <span class="dd-muted">{{ resumo() }}</span>
        <span class="dd-linha-botoes">
          <geo-button label="Movimentar tudo o que falta" icon="pi pi-check-square" variant="ghost" size="sm" (pressed)="preencherTudo()" />
          <geo-button label="Zerar" icon="pi pi-eraser" variant="ghost" size="sm" (pressed)="zerarTudo()" />
        </span>
      </div>

      <ul class="dd-entrega__lista" aria-label="Materiais desta movimentação">
        @for (item of pendentes(); track item.id) {
          <li class="dd-entrega__item dd-aprov__item">
            <div class="dd-material">
              <strong>{{ item.descricaoMaterial }}</strong>
              <span class="dd-muted">{{ item.codigoMaterial }} · falta {{ quantidade(item.quantidadePendente) }} {{ item.unidade || 'UN' }} de {{ quantidade(item.quantidade) }}</span>
            </div>
            <div class="dd-aprov__campos">
              <app-quantidade-unidade class="dd-aprov__quantidade" [label]="'Quantidade de ' + item.codigoMaterial + ' movimentada no SAP'" [labelVisible]="false"
                [material]="materialDe(item)" [maxBase]="item.quantidadePendente"
                [value]="quantidades()[item.id] ?? null" (valueChange)="definir(item.id, $event)"
                [unidade]="unidades()[item.id] ?? null" (unidadeChange)="trocarUnidade(item.id, $event)"
                [error]="erroItem(item)" />
            </div>
          </li>
        }
      </ul>

      <p class="fm-bloco fx-dica"><i class="pi pi-arrow-right-arrow-left" aria-hidden="true"></i> {{ textoFisico() }}: o saldo do GEO muda junto.</p>
      <div class="fm-bloco"><app-fechamento-previa-saldo [previa]="previa()" [carregando]="carregandoPrevia()" acao="movimentar" /></div>
    </div>
  `
})
export class FechamentoMovimentarPainelComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly notificacoes = inject(NotificationService);

  readonly solicitacao = input.required<FechamentoDetalhe>();
  readonly movimentada = output<FechamentoDetalhe>();
  readonly conflito = output<void>();

  protected readonly quantidade = quantidade;
  protected readonly quantidades = signal<Record<string, number | null>>({});
  protected readonly previa = signal<PreviaSaldo | null>(null);
  protected readonly carregandoPrevia = signal(false);
  readonly salvando = signal(false);
  /** A conexão caiu antes da resposta: repetir reaproveita a mesma chave e não movimenta em dobro. */
  readonly pendenteEnvio = signal(false);
  private chave: string | null = null;
  private readonly pedirPrevia = new Subject<void>();

  protected readonly pendentes = computed(() => this.solicitacao().itens.filter((i) => i.quantidadePendente > 0));
  /** Unidade escolhida por item; ausente = unidade do material. */
  protected readonly unidades = signal<Record<string, string | null>>({});
  private readonly itensValidos = computed(() =>
    Object.entries(this.quantidades())
      .filter(([, q]) => (q ?? 0) > 0)
      .map(([idItem, q]) => ({ idItem, quantidade: q as number, unidade: this.unidades()[idItem] || undefined }))
  );
  /** Quantos materiais entram nesta movimentação. */
  readonly itensMarcados = computed(() => this.itensValidos().length);
  protected readonly resumo = computed(() => {
    const marcados = this.itensMarcados();
    const total = this.pendentes().length;
    return marcados ? `${marcados} de ${total} ${total === 1 ? 'material' : 'materiais'} nesta movimentação` : 'Informe o que foi movimentado no SAP.';
  });
  protected readonly textoFisico = computed(() => {
    const s = this.solicitacao();
    const almoxarifado = formatarAlmoxarifado(s.almoxarifadoAtendimento.nome);
    return tipoFechamento(s.tipo).adicao ? `Tira de ${almoxarifado} e põe na obra` : `Tira da obra e põe em ${almoxarifado}`;
  });

  constructor() {
    effect(() => {
      this.solicitacao();
      untracked(() => {
        this.preencherTudo();
        this.previa.set(null);
      });
    });
    this.pedirPrevia
      .pipe(
        debounceTime(300),
        switchMap(() => {
          const s = this.solicitacao();
          const itens = this.itensValidos();
          if (!itens.length) return of(null);
          this.carregandoPrevia.set(true);
          return this.service.previaMovimentacao(s.id, { versaoEsperada: s.versao, itens }).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed()
      )
      .subscribe((previa) => {
        this.previa.set(previa);
        this.carregandoPrevia.set(false);
      });
  }

  protected materialDe(item: ItemFechamento): Pick<MaterialResponse, 'unidadeMedida' | 'equivalencias'> {
    return { unidadeMedida: item.unidade ?? undefined, equivalencias: item.equivalencias ?? [] };
  }

  /** Na unidade do material, como o servidor confere com o que falta. */
  private base(item: ItemFechamento): number {
    return paraUnidadeBase(this.materialDe(item), this.quantidades()[item.id] ?? 0, this.unidades()[item.id]) ?? 0;
  }

  protected trocarUnidade(idItem: string, unidade: string | null): void {
    const item = this.pendentes().find((i) => i.id === idItem);
    const anterior = this.unidades()[idItem] ?? null;
    const atual = this.quantidades()[idItem];
    this.unidades.update((u) => ({ ...u, [idItem]: unidade }));
    // Mantém a mesma quantidade física: só muda a unidade em que ela aparece.
    if (item && atual) {
      const base = paraUnidadeBase(this.materialDe(item), atual, anterior) ?? 0;
      this.definir(idItem, daUnidadeBase(this.materialDe(item), base, unidade));
    } else {
      this.invalidarEnvio();
    }
  }

  protected preencherTudo(): void {
    this.unidades.set({});
    const quantidades: Record<string, number | null> = {};
    this.pendentes().forEach((i) => (quantidades[i.id] = i.quantidadePendente));
    this.alterarQuantidades(quantidades);
  }

  protected zerarTudo(): void {
    const quantidades: Record<string, number | null> = {};
    this.pendentes().forEach((i) => (quantidades[i.id] = 0));
    this.alterarQuantidades(quantidades);
  }

  protected definir(idItem: string, valor: number | null): void {
    this.alterarQuantidades({ ...this.quantidades(), [idItem]: valor });
  }

  private alterarQuantidades(quantidades: Record<string, number | null>): void {
    this.quantidades.set(quantidades);
    this.invalidarEnvio();
    this.pedirPrevia.next();
  }

  protected erroItem(item: ItemFechamento): string | undefined {
    return this.base(item) > item.quantidadePendente ? `Restam ${quantidade(item.quantidadePendente)} ${item.unidade || 'UN'} a movimentar.` : undefined;
  }

  private invalidarEnvio(): void {
    this.chave = null;
    this.pendenteEnvio.set(false);
  }

  confirmar(): void {
    const s = this.solicitacao();
    if (this.salvando()) return;
    const itens = this.itensValidos();
    const excede = this.pendentes().some((i) => this.base(i) > i.quantidadePendente);
    if (!itens.length || excede) {
      if (!itens.length) this.notificacoes.warning('Informe a quantidade de ao menos um material.');
      return;
    }
    this.chave ??= novaChaveIdempotencia();
    this.salvando.set(true);
    this.service.movimentar(s.id, { versaoEsperada: s.versao, itens }, this.chave).subscribe({
      next: (detalhe) => {
        this.salvando.set(false);
        this.notificacoes.success('Movimentação registrada e saldo atualizado.');
        this.movimentada.emit(detalhe);
      },
      error: (e) => {
        this.salvando.set(false);
        if (ehFalhaDeTransporte(e)) {
          this.pendenteEnvio.set(true);
          this.notificacoes.warning('A conexão caiu antes da resposta. Tente novamente: nada será movimentado em dobro.');
          return;
        }
        this.chave = null;
        if (e?.status === 409) {
          this.notificacoes.warning('Alguém alterou esta solicitação. Os dados foram atualizados; confira e confirme de novo.');
          this.conflito.emit();
          return;
        }
        this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível movimentar' });
      }
    });
  }
}
