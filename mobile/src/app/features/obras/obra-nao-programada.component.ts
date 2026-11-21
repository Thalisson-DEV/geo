import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BarraTopoComponent, IconeComponent } from '../../ui';
import { ToastService } from '../../core/ui/toast.service';
import { TurnoService } from '../../core/turno/turno.service';
import { ObrasContexto } from './obras-contexto';

/**
 * Atividade em obra não programada: a equipe busca a obra pelo número entre as obras do aparelho (ou digita o id que a
 * supervisão passou) e informa o motivo.
 */
@Component({
  selector: 'app-obra-nao-programada',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Obra não programada" (voltar)="voltar()" />
    <p class="explica">Use quando a equipe atuar numa obra que não estava na agenda de hoje.</p>
    <label class="geo-campo"><span>Número da obra</span>
      <input class="geo-input geo-num" inputmode="numeric" [value]="busca()" (input)="busca.set($any($event.target).value)" placeholder="Ex.: 7000001" data-testid="busca-obra"></label>
    <ul class="geo-grupo">
      @for (o of encontradas(); track o.id) {
        <li><button type="button" class="geo-linha geo-linha--acao" role="radio" [attr.aria-checked]="o.id === escolhida()" (click)="escolhida.set(o.id)">
          <span class="geo-selo" [class.geo-selo--destaque]="o.id === escolhida()"><geo-icone [nome]="o.id === escolhida() ? 'check' : 'obra'" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Obra {{ o.numero }}</span><span class="geo-linha__apoio">{{ o.titulo }}</span></span>
        </button></li>
      } @empty {
        @if (busca().trim()) { <li class="geo-linha"><span class="geo-linha__apoio">Nenhuma obra com esse número no aparelho. Confirme o número com a supervisão.</span></li> }
      }
    </ul>
    <label class="geo-campo"><span>Motivo</span>
      <textarea class="geo-input" rows="3" maxlength="1000" [value]="motivo()" (input)="motivo.set($any($event.target).value)"
        placeholder="Ex.: atendimento de emergência pedido pela supervisão" data-testid="motivo-obra"></textarea></label>
    <div class="geo-respiro"></div>
    <div class="geo-rodape-acoes" data-acao-fixa>
      <button type="button" class="geo-btn geo-btn--principal" [disabled]="!escolhida() || !motivo().trim() || salvando()" (click)="salvar()">Registrar</button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .explica { margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem); }
  `],
})
export class ObraNaoProgramadaComponent {
  private readonly ctx = inject(ObrasContexto);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly turno = inject(TurnoService);

  readonly busca = signal('');
  readonly motivo = signal('');
  readonly escolhida = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly encontradas = computed(() => {
    const termo = this.busca().trim();
    return termo ? this.ctx.pacote.obras().filter(o => o.numero.includes(termo)).slice(0, 20) : [];
  });

  async salvar(): Promise<void> {
    const idObra = this.escolhida();
    if (!idObra || !this.motivo().trim()) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de registrar.');
      return;
    }
    this.salvando.set(true);
    try {
      await this.ctx.registros.registrar({ tipo: 'ATIVIDADE', idObra, comando: { idObra, motivo: this.motivo().trim() } });
      this.toast.success('Obra não programada registrada no turno');
      void this.router.navigate(['/hoje'], { replaceUrl: true });
    } finally {
      this.salvando.set(false);
    }
  }

  voltar(): void {
    void this.router.navigate(['/obras']);
  }
}
