import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PreviaSaldo } from '../../core/fechamento/fechamento.models';
import { IconeComponent, numeroBr } from '../../ui';

/** Aviso antes de confirmar: quais saldos ficam negativos. Avisa, nunca impede. */
@Component({
  selector: 'app-previa-saldo',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (negativos().length) {
      <section class="aviso" role="status" aria-label="Saldo negativo">
        <div class="topo"><geo-icone nome="alerta" /><strong>{{ negativos().length === 1 ? 'Um saldo vai ficar negativo' : negativos().length + ' saldos vão ficar negativos' }}</strong></div>
        <ul>
          @for (l of negativos(); track l.idMaterial + l.estoque.id) {
            <li>
              <span class="txt"><span class="material">{{ l.descricaoMaterial }}</span><span class="estoque">{{ l.estoque.nome }}</span></span>
              <span class="numeros geo-num">{{ num(l.saldoAtual) }} <geo-icone nome="seta" [tamanho]="14" /> <strong>{{ num(l.saldoResultante) }}</strong></span>
            </li>
          }
        </ul>
        <p>Você ainda pode confirmar: a falta de saldo não impede a operação.</p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .aviso { display: grid; gap: var(--geo-e2); padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); }
    .topo { display: flex; align-items: center; gap: var(--geo-e2); color: var(--geo-atencao); }
    .topo strong { font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--geo-e2); }
    li { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e3); }
    .txt { display: grid; gap: 1px; min-width: 0; }
    .material { font: 600 .9375rem/1.3 var(--geo-fonte); overflow-wrap: anywhere; }
    .estoque { font: var(--geo-t-apoio); color: var(--geo-texto-2); overflow-wrap: anywhere; }
    .numeros { flex: none; display: inline-flex; align-items: center; gap: 4px; font: 500 .9375rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .numeros strong { font-weight: 700; color: var(--geo-erro); }
    p { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
  `],
})
export class PreviaSaldoComponent {
  readonly previa = input<PreviaSaldo | null>(null);
  readonly negativos = computed(() => (this.previa()?.linhas ?? []).filter(l => l.saldoResultante < 0));

  num(n: number): string {
    return numeroBr(n);
  }
}
