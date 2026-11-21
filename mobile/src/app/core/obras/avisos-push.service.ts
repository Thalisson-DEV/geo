import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Avisos de mudança na agenda por Web Push. Só com o app instalado e o service worker ativo (no iPhone, a partir do
 * app na tela inicial). Sem isso, ou sem as chaves no servidor, os avisos aparecem ao abrir o app (pacote).
 */
@Injectable({ providedIn: 'root' })
export class AvisosPushService {
  private readonly http = inject(HttpClient);
  private readonly push = inject(SwPush, { optional: true });
  private readonly baseUrl = environment.apiBaseUrl;

  readonly ativo = signal(false);
  readonly disponivel = signal(!!this.push?.isEnabled && typeof Notification !== 'undefined');

  constructor() {
    this.push?.subscription.subscribe(s => this.ativo.set(!!s));
  }

  /** Pede a permissão (precisa de toque da pessoa) e registra este aparelho no servidor. */
  async ativar(): Promise<'ok' | 'indisponivel' | 'negado' | 'sem-chave'> {
    if (!this.push?.isEnabled) return 'indisponivel';
    const { chavePublica } = await firstValueFrom(this.http.get<{ chavePublica: string }>(`${this.baseUrl}/v1/obras/campo/push/chave`));
    if (!chavePublica) return 'sem-chave';
    try {
      const assinatura = await this.push.requestSubscription({ serverPublicKey: chavePublica });
      const json = assinatura.toJSON();
      await firstValueFrom(this.http.post(`${this.baseUrl}/v1/obras/campo/push/assinaturas`,
        { endpoint: json.endpoint, p256dh: json.keys?.['p256dh'], auth: json.keys?.['auth'] }));
      return 'ok';
    } catch {
      return 'negado';
    }
  }

  async desativar(): Promise<void> {
    if (!this.push?.isEnabled) return;
    const atual = await firstValueFrom(this.push.subscription);
    if (atual) {
      const json = atual.toJSON();
      await firstValueFrom(this.http.post(`${this.baseUrl}/v1/obras/campo/push/assinaturas/cancelamento`,
        { endpoint: json.endpoint, p256dh: json.keys?.['p256dh'] ?? '-', auth: json.keys?.['auth'] ?? '-' })).catch(() => undefined);
    }
    await this.push.unsubscribe().catch(() => undefined);
  }
}
