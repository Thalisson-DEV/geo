import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { GeoIconComponent } from '../../icons/geo-icon.component';
import { resolverIcone } from '../../icons/geo-icons';
import { TooltipModule } from 'primeng/tooltip';
import { GeoActionSize, GeoActionVariant } from '../../core';

@Component({
  selector: 'geo-icon-button',
  standalone: true,
  imports: [GeoIconComponent, ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      [buttonProps]="semAutofocus"
      [icon]="iconeLucide() ? undefined : primeIcon()"
      [rounded]="true"
      [disabled]="disabled() || loading()"
      [loading]="loading()"
      [severity]="primeSeverity()"
      [outlined]="variant() === 'outline'"
      [text]="variant() === 'ghost'"
      [size]="primeSize()"
      [ariaLabel]="label()"
      [styleClass]="styleClass()"
      [pTooltip]="tooltip() || label()"
      [tooltipPosition]="tooltipPosition()"
      (onClick)="pressed.emit()"
    >
      @if (iconeLucide(); as nome) {
        <ng-template #icon let-classe="class">
          <geo-icon [name]="nome" size="sm" [class]="classe" />
        </ng-template>
      }
      <ng-template #loadingicon let-classe="class">
        <geo-icon name="loader-circle" size="sm" [spin]="true" [class]="classe" />
      </ng-template>
    </p-button>
  `
})
export class GeoIconButtonComponent {
  /**
   * O `p-button` repassa `autofocus || buttonProps?.autofocus` ao `pAutoFocus`, que só remove o
   * atributo com `false` exato: sem isto todo botão sai com `autofocus` e o navegador foca o
   * primeiro que aparece depois da carga (rolando a página até ele).
   */
  protected readonly semAutofocus = { autofocus: false };

  readonly icon = input<string>('');
  readonly label = input<string>('');
  readonly tooltip = input<string | undefined>();
  readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');
  readonly variant = input<GeoActionVariant>('ghost');
  readonly size = input<Extract<GeoActionSize, 'icon-sm' | 'icon-md' | 'icon-lg'>>('icon-md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly className = input('');

  readonly pressed = output<void>();

  protected readonly primeIcon = computed(() => {
    const icon = this.icon()?.trim();
    if (!icon) return '';
    if (icon.startsWith('pi-')) return `pi ${icon}`;
    return icon;
  });

  /** Ícone desenhado pelo geo-icon (Lucide) quando o nome tem equivalente registrado. */
  protected readonly iconeLucide = computed(() => resolverIcone(this.icon())?.nome);

  protected readonly primeSeverity = computed(() => {
    switch (this.variant()) {
      case 'destructive':
        return 'danger' as const;
      case 'success':
        return 'success' as const;
      case 'primary':
        return 'primary' as const;
      default:
        return 'secondary' as const;
    }
  });

  protected readonly primeSize = computed(() => {
    if (this.size() === 'icon-sm') return 'small' as const;
    if (this.size() === 'icon-lg') return 'large' as const;
    return undefined;
  });

  protected readonly styleClass = computed(() => {
    const classes = [
      'geo-icon-button',
      `geo-icon-button--${this.variant()}`,
      `geo-icon-button--${this.size()}`
    ];
    if (this.className()) classes.push(this.className());
    return classes.join(' ');
  });
}
