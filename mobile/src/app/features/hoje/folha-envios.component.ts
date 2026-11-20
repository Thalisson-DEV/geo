import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FilaEnvioService } from '../../core/sync/fila-envio.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { FolhaComponent, StatusEnvioComponent, IconeComponent, VazioComponent } from '../../ui';

/** Folha "Envios": cada item da fila com seu estado e o que fazer. */
@Component({
  selector: 'app-folha-envios',
  standalone: true,
  imports: [FolhaComponent, StatusEnvioComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-folha [aberta]="aberta()" (fechar)="fechar.emit()" titulo="Envios"
      [descricao]="rede.isOnline() ? 'Saem pela ordem em que foram lançados.' : 'Sem internet. Vão sozinhos quando o sinal voltar.'">
      @if (fila.itens().length) {
        <ul class="geo-grupo lista">
          @for (item of fila.itens(); track item.id) {
            <li>
              <div class="geo-linha">
                @if (item.estado === 'conflict' || item.estado === 'error') {
                  <span class="geo-selo" [class.geo-selo--erro]="item.estado === 'conflict'" [class.geo-selo--atencao]="item.estado === 'error'">
                    <geo-icone nome="alerta" />
                  </span>
                }
                <div class="geo-linha__texto">
                  <span class="geo-linha__titulo geo-num">{{ item.titulo }}</span>
                  <span class="geo-linha__apoio geo-num">{{ item.motivo ?? item.detalhe }}</span>
                </div>
                <geo-status-envio [estado]="item.estado" />
              </div>
            </li>
          }
        </ul>
      } @else {
        <geo-vazio icone="check" titulo="Tudo enviado" texto="Nada esperando para sair deste aparelho." />
      }
      <div rodape class="rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="fechar.emit()">Fechar</button>
        <button type="button" class="geo-btn geo-btn--principal" (click)="enviar()"
          [disabled]="!rede.isOnline() || fila.enviandoAgora() || !fila.itens().length">
          <geo-icone nome="atualizar" [tamanho]="18" />{{ fila.enviandoAgora() ? 'Enviando…' : 'Enviar agora' }}
        </button>
      </div>
    </geo-folha>
  `,
  styles: [`
    .lista { margin-bottom: var(--geo-e2); background: var(--geo-fundo); }
    .rodape { display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) 0; }
    .rodape .geo-btn { flex: 1; }
  `],
})
export class FolhaEnviosComponent {
  readonly fila = inject(FilaEnvioService);
  readonly rede = inject(ConnectivityService);
  private readonly toast = inject(ToastService);
  readonly aberta = input(false);
  readonly fechar = output<void>();

  async enviar(): Promise<void> {
    const r = await this.fila.enviarAgora();
    if (r === 'enviado' && this.fila.total() === 0) this.toast.success('Tudo enviado');
    if (r === 'falhou') this.toast.warning('Alguns itens não saíram. Tentamos de novo sozinhos.');
  }
}
