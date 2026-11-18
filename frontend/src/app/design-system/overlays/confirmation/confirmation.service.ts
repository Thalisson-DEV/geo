import { Injectable, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

export type GeoConfirmationVariant = 'default' | 'destructive';

export interface GeoConfirmationRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: string;
  variant?: GeoConfirmationVariant;
  key?: string;
}

@Injectable({ providedIn: 'root' })
export class GeoConfirmationService {
  private readonly confirmations = inject(ConfirmationService);

  confirm(request: GeoConfirmationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const destructive = request.variant === 'destructive';
      this.confirmations.confirm({
        key: request.key,
        header: request.title,
        message: request.message,
        icon: request.icon ?? (destructive ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle'),
        acceptLabel: request.confirmLabel ?? (destructive ? 'Excluir' : 'Confirmar'),
        rejectLabel: request.cancelLabel ?? 'Cancelar',
        // Variantes semânticas do tema, sem cor fixa: confirmar é a ação primária (perigo se destrutiva)
        // e cancelar é neutra — vermelho no "Cancelar" sugeria que desistir era a ação arriscada.
        acceptButtonProps: { severity: destructive ? 'danger' : undefined },
        rejectButtonProps: { severity: 'secondary', text: true },
        accept: () => resolve(true),
        reject: () => resolve(false)
      });
    });
  }
}
