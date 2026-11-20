import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService, Toast } from '../../../core/ui/toast.service';
import { IconeComponent, NomeIcone } from '../../../ui';

const ICONES: Record<string, NomeIcone> = { success: 'check', error: 'alerta', warning: 'alerta', info: 'info' };

/**
 * Avisos curtos no rodapé, no estilo da snackbar do Android: superfície escura,
 * acima da barra de abas, um toque fecha. Erros são anunciados com prioridade.
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pilha">
      @for (t of toastService.toasts(); track t.id) {
        <div class="aviso" [class]="'aviso ' + t.type" [attr.role]="t.type === 'error' ? 'alert' : 'status'" (click)="toastService.remove(t.id)">
          <geo-icone class="icone" [nome]="icone(t)" [tamanho]="20" />
          <span class="msg">{{ t.message }}</span>
          @if (t.action) {
            <button type="button" class="acao" (click)="runAction($event, t)">{{ t.action.label }}</button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .pilha { position: fixed; left: var(--geo-nav-lateral); right: 0; z-index: 100; display: grid; justify-items: center; gap: var(--geo-e2); pointer-events: none;
      padding: 0 var(--geo-e3); bottom: calc(var(--geo-barra-abas) + var(--geo-rodape-acao) + var(--geo-safe-base) + var(--geo-e3)); }
    .aviso { pointer-events: auto; width: min(100%, 520px); display: flex; align-items: center; gap: var(--geo-e3); min-height: 52px;
      padding: var(--geo-e2) var(--geo-e2) var(--geo-e2) var(--geo-e4); border-radius: 14px; background: var(--geo-inverso); color: var(--geo-inverso-texto);
      box-shadow: var(--geo-sombra-flutuante); font: 500 .9375rem/1.35 var(--geo-fonte); animation: subir 220ms var(--geo-curva); cursor: pointer; }
    .msg { flex: 1; min-width: 0; padding: 6px 0; overflow-wrap: anywhere; }
    .icone { flex: none; }
    .success .icone { color: var(--geo-inverso-ok); }
    .error .icone { color: var(--geo-inverso-erro); }
    .warning .icone { color: var(--geo-inverso-atencao); }
    .info .icone { color: var(--geo-inverso-destaque); }
    .acao { flex: none; min-height: 40px; padding: 0 var(--geo-e3); border: 0; border-radius: 10px; background: transparent; color: var(--geo-inverso-destaque);
      font: 600 .9375rem/1 var(--geo-fonte); cursor: pointer; }
    .acao:active { background: var(--geo-inverso-pressionado); }
    @keyframes subir { from { opacity: 0; transform: translateY(12px); } }
  `],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  icone(t: Toast): NomeIcone {
    return ICONES[t.type] ?? 'info';
  }

  runAction(event: Event, toast: Toast): void {
    event.stopPropagation();
    toast.action?.handler();
    this.toastService.remove(toast.id);
  }
}
