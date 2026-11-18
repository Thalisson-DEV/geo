import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { GeoFileInputComponent, GeoIconButtonComponent } from '@geo/ui';
import { AnexoFrota } from '../../../core/models/frota-seguro.models';

const LIMITE_ARQUIVO = 15 * 1024 * 1024;

/**
 * Anexos da apólice ou do sinistro: lista com baixar e remover e o campo para o próximo arquivo,
 * enviado por quem usa o componente (ao salvar ou na hora).
 */
@Component({
  selector: 'app-frota-anexos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoFileInputComponent, GeoIconButtonComponent],
  styles: `
    :host { display: grid; gap: 0.75rem; }
    .anexos { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .anexo { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .anexo .pi { color: var(--geo-brand); }
    .anexo__texto { flex: 1; min-width: 0; display: grid; }
    .anexo__texto strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .anexo__texto span { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
  `,
  template: `
    @if (anexos().length) {
      <ul class="anexos">
        @for (a of anexos(); track a.id) {
          <li class="anexo">
            <i class="pi" [class.pi-image]="a.contentType?.startsWith('image/')" [class.pi-file]="!a.contentType?.startsWith('image/')" aria-hidden="true"></i>
            <span class="anexo__texto"><strong>{{ a.nome }}</strong><span>Enviado em {{ a.enviadoEm | date: "dd/MM/yyyy 'às' HH:mm" }}</span></span>
            <geo-icon-button icon="pi pi-download" [label]="'Baixar ' + a.nome" tooltip="Baixar" size="icon-sm" (pressed)="baixar.emit(a)"></geo-icon-button>
            @if (podeEditar()) {
              <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + a.nome" tooltip="Remover" size="icon-sm" (pressed)="remover.emit(a)"></geo-icon-button>
            }
          </li>
        }
      </ul>
    }
    @if (podeEditar()) {
      <geo-file-input [label]="rotulo()" [description]="descricao()" accept="application/pdf,image/jpeg,image/png,image/webp"
        [maxBytes]="limite" [(file)]="arquivo" [showOptional]="true"></geo-file-input>
    } @else if (!anexos().length) {
      <p class="geo-cell-muted">Nenhum anexo.</p>
    }
  `
})
export class FrotaAnexosComponent {
  readonly anexos = input<AnexoFrota[]>([]);
  readonly podeEditar = input(false);
  readonly rotulo = input('Anexo');
  readonly descricao = input('PDF ou imagem (JPG, PNG, WebP), até 15 MB.');
  /** Arquivo escolhido e ainda não enviado. */
  readonly arquivo = model<File | null>(null);
  readonly baixar = output<AnexoFrota>();
  readonly remover = output<AnexoFrota>();

  protected readonly limite = LIMITE_ARQUIVO;
}

/** Baixa o blob com o nome do anexo. */
export function salvarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
