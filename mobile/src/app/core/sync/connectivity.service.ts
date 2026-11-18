import { Injectable, signal, PLATFORM_ID, inject, effect, computed, untracked, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SyncService } from './sync.service';
import { TokenService } from '../auth/token.service';

export type MobileStatusConexao = 'online' | 'offline_sem_rede' | 'dados_moveis_bloqueados' | 'offline_manual';

@Injectable({
  providedIn: 'root'
})
export class ConnectivityService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly tokenService = inject(TokenService, { optional: true });

  private readonly STORAGE_REDES_MOVEIS = 'ces_mobile_usar_redes_moveis';
  static readonly STORAGE_FORCAR_OFFLINE = 'ces_mobile_forcar_offline';

  /** Conexão física de rede informada pelo navegador/sistema operacional */
  readonly hardwareOnline = signal<boolean>(
    isPlatformBrowser(this.platformId) ? (typeof navigator !== 'undefined' ? navigator.onLine : true) : true
  );

  /** Tipo de conexão física ('cellular', 'wifi', 'ethernet', 'unknown', etc.) */
  readonly connectionType = signal<string>('unknown');

  /** Flag indicando se a conexão detectada é de rede móvel (celular) */
  readonly isCellular = signal<boolean>(false);

  /** Preferência do usuário sobre permitir ou não sincronização em redes móveis */
  readonly usarRedesMoveis = signal<boolean>(this.carregarPreferenciaRedesMoveis());

  /**
   * Alternância manual para forçar o app a operar em modo offline. Persistida: se o
   * sistema fechar o app, ele não pode voltar enviando contra a escolha do usuário.
   */
  readonly forcarOffline = signal<boolean>(this.lerPreferencia(ConnectivityService.STORAGE_FORCAR_OFFLINE) === 'true');

  /** Signal principal de conectividade efetiva da aplicação */
  readonly isOnline = signal<boolean>(true);

  /** Indica se o app está offline especificamente devido ao bloqueio de rede móvel */
  readonly isBloqueadoPorDadosMoveis = computed(() => {
    return this.hardwareOnline() && this.isCellular() && !this.usarRedesMoveis() && !this.forcarOffline();
  });

  /** Diagnóstico textual do estado atual de conexão */
  readonly statusConexao = computed<MobileStatusConexao>(() => {
    if (this.forcarOffline()) return 'offline_manual';
    if (!this.hardwareOnline()) return 'offline_sem_rede';
    if (this.isCellular() && !this.usarRedesMoveis()) return 'dados_moveis_bloqueados';
    return 'online';
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.detectarConexaoInicial();
      this.registrarListeners();
      this.atualizarStatus();
    }

    // Gatilho automático para sincronizar o outbox ao voltar a ficar online
    effect(() => {
      this.isOnline();
      this.tokenService?.token();
      this.tokenService?.reautenticacaoNecessaria?.();
      untracked(() => this.enviarFilaSePuder());
    });

    // O Android congela o app em segundo plano e, ao voltar, `isOnline` costuma
    // continuar igual: sem este gatilho a fila só saía com "Sincronizar".
    if (isPlatformBrowser(this.platformId) && typeof document !== 'undefined') {
      const aoVoltarAoApp = () => {
        if (document.visibilityState === 'visible') this.enviarFilaSePuder();
      };
      document.addEventListener('visibilitychange', aoVoltarAoApp);
      inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', aoVoltarAoApp));
    }

    // Se o usuário logar e não houver preferência gravada, aplica o default para CAMPO (false)
    if (this.tokenService) {
      effect(() => {
        const payload = this.tokenService?.getDecodedPayload();
        if (payload && isPlatformBrowser(this.platformId)) {
          const salvo = localStorage.getItem(this.STORAGE_REDES_MOVEIS);
          if (salvo === null) {
            const padrao = payload.tipoUsuario !== 'CAMPO';
            this.usarRedesMoveis.set(padrao);
            localStorage.setItem(this.STORAGE_REDES_MOVEIS, String(padrao));
            this.atualizarStatus();
          }
        }
      });
    }
  }

  /** Envia a fila quando há rede liberada e sessão válida; senão, espera o próximo gatilho. */
  private enviarFilaSePuder(): void {
    const token = this.tokenService?.token();
    const aguardandoLogin = this.tokenService?.reautenticacaoNecessaria?.() ?? true;
    if (this.isOnline() && token && !aguardandoLogin && this.syncService) {
      this.syncService.syncOutbox().catch(err => {
        console.error('Erro ao sincronizar outbox automaticamente:', err);
      });
    }
  }

  private lerPreferencia(chave: string): string | null {
    try {
      return isPlatformBrowser(this.platformId) ? localStorage.getItem(chave) : null;
    } catch {
      return null;
    }
  }

  private carregarPreferenciaRedesMoveis(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      const salvo = localStorage.getItem(this.STORAGE_REDES_MOVEIS);
      if (salvo !== null) {
        return salvo === 'true';
      }
    }
    const payload = this.tokenService?.getDecodedPayload();
    if (payload?.tipoUsuario === 'CAMPO') {
      return false;
    }
    return true;
  }

  private detectarConexaoInicial(): void {
    if (typeof navigator === 'undefined') return;

    const navConn = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
    if (navConn) {
      const type = (navConn.type || 'unknown').toLowerCase();
      this.connectionType.set(type);
      this.isCellular.set(type === 'cellular');
    }
  }

  private registrarListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.hardwareOnline.set(true);
      this.atualizarStatus();
    });

    window.addEventListener('offline', () => {
      this.hardwareOnline.set(false);
      this.atualizarStatus();
    });

    const navConn = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
    if (navConn && typeof navConn.addEventListener === 'function') {
      navConn.addEventListener('change', () => {
        const type = (navConn.type || 'unknown').toLowerCase();
        this.connectionType.set(type);
        this.isCellular.set(type === 'cellular');
        this.atualizarStatus();
      });
    }
  }

  setUsarRedesMoveis(habilitar: boolean): void {
    this.usarRedesMoveis.set(habilitar);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.STORAGE_REDES_MOVEIS, String(habilitar));
    }
    this.atualizarStatus();
  }

  setForcarOffline(forcar: boolean): void {
    this.forcarOffline.set(forcar);
    try {
      if (forcar) localStorage.setItem(ConnectivityService.STORAGE_FORCAR_OFFLINE, 'true');
      else localStorage.removeItem(ConnectivityService.STORAGE_FORCAR_OFFLINE);
    } catch { /* armazenamento indisponível: vale só nesta sessão */ }
    this.atualizarStatus();
  }

  setSimulatedCellular(cellular: boolean): void {
    this.isCellular.set(cellular);
    this.connectionType.set(cellular ? 'cellular' : 'wifi');
    this.atualizarStatus();
  }

  setSimulatedHardwareOnline(online: boolean): void {
    this.hardwareOnline.set(online);
    this.atualizarStatus();
  }

  atualizarStatus(): void {
    const online = !this.forcarOffline() && this.hardwareOnline() && !(this.isCellular() && !this.usarRedesMoveis());
    this.isOnline.set(online);
  }
}
