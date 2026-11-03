import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CesDrawerComponent, CesStatusComponent } from '@ces/ui';
import { MovimentoEstoqueFrota, TIPO_MOVIMENTO } from '../../../core/models/frota-pneu.models';
import { formatarPlaca, rotuloOs } from '../../../core/models/frota.models';
import { localMovimento, moeda, quantidadeMovimento } from './frota-estoque.util';

/** Tudo o que foi registrado numa movimentação: quem, quando, de onde, para quem e por quanto. */
@Component({
  selector: 'app-frota-estoque-movimento-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, CesDrawerComponent, CesStatusComponent],
  styles: `
    .selos { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem; }
  `,
  template: `
    <ces-drawer [(visible)]="visivel" eyebrow="Movimentação" [title]="movimento()?.descricao ?? ''" size="sm">
      @if (movimento(); as m) {
        <div class="selos">
          <ces-status [tone]="tipo(m).tom" [icon]="tipo(m).icone">{{ tipo(m).rotulo }}</ces-status>
          @if (m.estornado) { <ces-status tone="neutral" icon="pi pi-replay" emphasis="outline">Estornada</ces-status> }
        </div>
        <dl class="ces-sheet">
          <div><dt>Quando</dt><dd>{{ m.dataHora | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
          <div><dt>Quem lançou</dt><dd>{{ m.usuario ?? '—' }}</dd></div>
          <div><dt>Código</dt><dd>{{ m.codigo }}</dd></div>
          <div><dt>Motivo</dt><dd>{{ m.motivoRotulo ?? '—' }}</dd></div>
          <div class="ces-sheet__wide"><dt>Almoxarifado</dt><dd>{{ local(m) }}</dd></div>
          <div><dt>Quantidade</dt><dd class="ces-cell-num">{{ quantidade(m) }}</dd></div>
          <div><dt>Valor unitário</dt><dd class="ces-cell-num">{{ m.valorUnitario != null ? moeda(m.valorUnitario) : '—' }}</dd></div>
          <div><dt>Valor total</dt><dd class="ces-cell-num ces-cell-strong">{{ moeda(m.valorTotal) }}</dd></div>
          @if (m.documento) { <div><dt>Nota fiscal ou recibo</dt><dd>{{ m.documento }}</dd></div> }
          @if (m.fornecedor) { <div><dt>Fornecedor</dt><dd>{{ m.fornecedor }}</dd></div> }
          @if (m.idVeiculo && m.placa) { <div><dt>Veículo</dt><dd><a [routerLink]="['/frota/veiculos', m.idVeiculo]">{{ placa(m.placa) }}</a></dd></div> }
          @if (m.idOrdemServico) { <div><dt>Ordem de serviço</dt><dd><a [routerLink]="['/frota/ordens-servico', m.idOrdemServico]">{{ rotuloOs(m.numeroOrdemServico) }}</a></dd></div> }
          @if (m.observacao) { <div class="ces-sheet__wide"><dt>Observação</dt><dd>{{ m.observacao }}</dd></div> }
        </dl>
      }
    </ces-drawer>
  `
})
export class FrotaEstoqueMovimentoDetalheComponent {
  readonly visivel = model(false);
  readonly movimento = input<MovimentoEstoqueFrota | null>(null);

  protected readonly moeda = moeda;
  protected readonly quantidade = quantidadeMovimento;
  protected readonly local = localMovimento;
  protected readonly placa = formatarPlaca;
  protected readonly rotuloOs = rotuloOs;

  protected tipo(m: MovimentoEstoqueFrota) {
    return TIPO_MOVIMENTO[m.tipo];
  }
}
