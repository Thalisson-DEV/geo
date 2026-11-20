import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, type: ToastType = 'info', duration: number = 4000, action?: ToastAction) {
    const id = crypto.randomUUID();
    const toast: Toast = { id, message, type, duration, action };

    this._toasts.update((current) => [...current, toast]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  /**
   * Ação reversível já feita, com "Desfazer" por alguns segundos (no lugar de perguntar "tem certeza?").
   * Quem chama desfaz no `aoDesfazer`; sem toque, a ação simplesmente fica.
   */
  desfazer(message: string, aoDesfazer: () => void, duration = 6000) {
    this.show(message, 'info', duration, { label: 'Desfazer', handler: aoDesfazer });
  }

  success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }

  warning(message: string, duration?: number) {
    this.show(message, 'warning', duration);
  }

  info(message: string, duration?: number) {
    this.show(message, 'info', duration);
  }

  remove(id: string) {
    this._toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
