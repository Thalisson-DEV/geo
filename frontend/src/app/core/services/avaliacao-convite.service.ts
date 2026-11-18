import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConviteAvaliacao } from '../models/avaliacao.models';
import { AuthService } from './auth.service';
import { AvaliacaoService } from './avaliacao.service';
import { ConnectivityService } from './connectivity.service';
import { VersaoAppService } from './versao-app.service';

/**
 * Decide quando convidar o usuário a avaliar o GEO.
 *
 * <p><b>Para não incomodar.</b> Nada aparece logo no login: o convite espera
 * {@link ESPERA_INICIAL_MS} de uso, para chegar a quem já está trabalhando, e não a quem
 * acabou de entrar com pressa. O servidor é consultado na hora só para o menu do usuário
 * já oferecer "Avaliar o GEO" a quem quiser responder por conta própria. Quem responde, adia ou recusa tem isso gravado no
 * servidor — por isso o convite não volta em outro aparelho nem em outra aba.</p>
 *
 * <p>O aviso de versão nova tem prioridade: os dois disputariam o mesmo canto da tela, e
 * atualizar é o que evita perder trabalho.</p>
 */

/** Quanto tempo de uso antes de o convite poder aparecer. */
const ESPERA_INICIAL_MS = 3 * 60_000;

/** Intervalo mínimo entre perguntas ao voltar para a aba. */
const INTERVALO_MINIMO_MS = 30 * 60_000;

@Injectable({ providedIn: 'root' })
export class AvaliacaoConviteService {
  private readonly api = inject(AvaliacaoService);
  private readonly auth = inject(AuthService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly versao = inject(VersaoAppService);

  /** A pesquisa aberta e a situação do usuário nela; `null` = não há pesquisa no ar. */
  readonly convite = signal<ConviteAvaliacao | null>(null);

  /** Drawer do formulário aberto. */
  readonly formularioAberto = signal(false);

  /** Nota já escolhida no próprio convite, para o formulário abrir com ela marcada. */
  readonly estrelasIniciais = signal<number | null>(null);

  /** Esconde o convite nesta aba enquanto o adiamento/recusa vai ao servidor. */
  private readonly dispensado = signal(false);

  /** Já passou o tempo mínimo de uso nesta sessão. O menu não espera; o convite sim. */
  private readonly liberado = signal(false);

  readonly mostrarConvite = computed(() => {
    const convite = this.convite();
    return (
      !!convite &&
      convite.convidar &&
      this.liberado() &&
      !this.dispensado() &&
      !this.formularioAberto() &&
      !this.versao.atualizacaoDisponivel()
    );
  });

  /** Há pesquisa no ar: o menu do usuário mostra "Avaliar o GEO". */
  readonly haPesquisa = computed(() => !!this.convite());

  /**
   * Só o login decide quando recomeçar. Ler `currentUser()` direto faria qualquer
   * atualização da sessão (trocar o tema, renovar o token) zerar o convite e o cronômetro.
   */
  private readonly sessao = computed(() =>
    this.auth.isAuthenticated() ? (this.auth.currentUser()?.login ?? null) : null
  );

  private espera?: ReturnType<typeof setTimeout>;
  private ultimaConsulta = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Cada sessão começa do zero: trocar de usuário não pode herdar o convite do anterior.
    effect(() => {
      const login = this.sessao();
      untracked(() => {
        clearTimeout(this.espera);
        this.convite.set(null);
        this.dispensado.set(false);
        this.formularioAberto.set(false);
        this.liberado.set(false);
        this.ultimaConsulta = 0;
        if (login) {
          void this.consultar();
          this.espera = setTimeout(() => this.liberado.set(true), ESPERA_INICIAL_MS);
        }
      });
    });

    // Quem volta para a aba depois de horas (o adiamento de 3 dias pode ter vencido) é
    // consultado de novo — mas no máximo a cada 30 minutos.
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - this.ultimaConsulta < INTERVALO_MINIMO_MS) return;
      void this.consultar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    destroyRef.onDestroy(() => {
      clearTimeout(this.espera);
      document.removeEventListener('visibilitychange', aoVoltar);
    });
  }

  /** Abre o formulário, pelo convite ou pelo menu do usuário. */
  abrir(estrelas: number | null = null): void {
    this.estrelasIniciais.set(estrelas);
    this.formularioAberto.set(true);
    if (!this.convite()) void this.consultar();
  }

  async adiar(): Promise<void> {
    const convite = this.convite();
    if (!convite) return;
    this.dispensado.set(true);
    try {
      await firstValueFrom(this.api.adiar(convite.campanhaId));
      this.convite.set({ ...convite, convidar: false });
    } catch {
      // Sem rede, o adiamento não foi gravado: o convite fica escondido só nesta aba e o
      // servidor volta a oferecer na próxima sessão. Nada a dizer ao usuário.
    }
  }

  async recusar(): Promise<void> {
    const convite = this.convite();
    if (!convite) return;
    this.dispensado.set(true);
    try {
      await firstValueFrom(this.api.recusar(convite.campanhaId));
      this.convite.set({ ...convite, convidar: false });
    } catch {
      // Mesmo caso do adiamento.
    }
  }

  /** Depois do envio: o convite some e o menu passa a agradecer. */
  marcarRespondida(): void {
    const convite = this.convite();
    if (convite) this.convite.set({ ...convite, convidar: false, jaRespondeu: true });
  }

  async consultar(): Promise<void> {
    if (!this.auth.isAuthenticated() || !this.connectivity.isOnline()) return;
    this.ultimaConsulta = Date.now();
    try {
      this.convite.set(await firstValueFrom(this.api.convite()));
    } catch {
      // Pesquisa é opcional: falhar aqui não pode virar erro na tela de ninguém.
    }
  }
}
