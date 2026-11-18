import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CesAsyncStateComponent, CesCalloutComponent } from '@ces/ui';

import { PreviaSaldo } from '../../../core/models/fechamento-obra.models';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { quantidade } from './fechamento-ui';

/** Saldo resultante por material. Saldo negativo é aviso, nunca bloqueio. */
@Component({
  selector: 'app-fechamento-previa-saldo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesAsyncStateComponent, CesCalloutComponent],
  styleUrl: './fechamento.css',
  template: `
    <section class="fx-previa" aria-labelledby="fx-previa-titulo" aria-live="polite">
      <h3 id="fx-previa-titulo" class="fx-form__titulo">Como o saldo fica</h3>
      @if (carregando() && !previa()) {
        <ces-async-state state="loading" [compact]="true" title="Calculando o saldo" />
      } @else if (previa(); as p) {
        @if (p.deixaSaldoNegativo) {
          <ces-callout tone="warning" title="Algum estoque vai ficar negativo">
            A {{ rotuloAcao() }} segue mesmo assim e o material entra no alerta de saldo negativo.
          </ces-callout>
        }
        <table class="fx-tabela">
          <caption class="fx-sr">Saldo atual e resultante por material e estoque</caption>
          <thead>
            <tr><th scope="col">Material</th><th scope="col">Estoque</th><th scope="col" class="fx-num">Hoje</th><th scope="col" class="fx-num">Fica</th></tr>
          </thead>
          <tbody>
            @for (l of p.linhas; track l.idMaterial + l.estoque.id) {
              <tr [class.fx-negativo]="l.saldoResultante < 0">
                <td><strong>{{ l.codigoMaterial }}</strong></td>
                <td>{{ nomeEstoque(l.estoque.nome) }}</td>
                <td class="fx-num">{{ quantidade(l.saldoAtual) }}</td>
                <td class="fx-num">
                  @if (l.saldoResultante < 0) {
                    <i class="pi pi-exclamation-triangle" aria-hidden="true"></i><span class="fx-sr">Negativo:</span>
                  }
                  {{ quantidade(l.saldoResultante) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="fx-dica">Informe as quantidades para ver o saldo resultante.</p>
      }
    </section>
  `
})
export class FechamentoPreviaSaldoComponent {
  readonly previa = input<PreviaSaldo | null>(null);
  readonly carregando = input(false);
  readonly acao = input<'movimentar' | 'trocar' | 'estornar'>('movimentar');

  protected readonly quantidade = quantidade;
  protected readonly nomeEstoque = formatarAlmoxarifado;
  protected readonly rotuloAcao = computed(() =>
    this.acao() === 'trocar' ? 'troca de efeito' : this.acao() === 'estornar' ? 'reversão' : 'movimentação'
  );
}
