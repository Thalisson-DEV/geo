import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { silentContext } from '../http/http-context';
import { ConnectivityService } from '../sync/connectivity.service';

export type FacilidadeAvaliacao = 'FACIL' | 'RAZOAVEL' | 'DIFICIL';
export type ProblemaAvaliacao = 'LENTIDAO' | 'SINCRONIZACAO' | 'LOGIN' | 'TELA_TRAVANDO' | 'DADO_SUMIU' | 'OUTRO';

export interface ConviteAvaliacao {
  campanhaId: string;
  titulo: string;
  fim: string;
  convidar: boolean;
  jaRespondeu: boolean;
  ultimaVez: boolean;
}

export interface RespostaAvaliacao {
  estrelas: number;
  facilidade: FacilidadeAvaliacao | null;
  problemas: ProblemaAvaliacao[];
  problemaDetalhe: string | null;
  sugestao: string | null;
  anonima: boolean;
}

export const ROTULO_ESTRELAS: Record<number, string> = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Ótimo' };
export const ROTULO_FACILIDADE: Record<FacilidadeAvaliacao, string> = { FACIL: 'Fácil', RAZOAVEL: 'Razoável', DIFICIL: 'Difícil' };
export const ROTULO_PROBLEMA: Record<ProblemaAvaliacao, string> = {
  LENTIDAO: 'Lentidão',
  SINCRONIZACAO: 'Envio dos dados',
  LOGIN: 'Entrar no app',
  TELA_TRAVANDO: 'Tela travando',
  DADO_SUMIU: 'Informação sumiu',
  OUTRO: 'Outro',
};

/**
 * Quanto tempo depois de abrir o app o convite pode subir na tela Hoje.
 *
 * Curto de propósito: muita equipe abre o app só para lançar e fecha em seguida, e nem
 * sempre está com sinal. Com 2 minutos o convite quase nunca chegava a quem mais usa o app.
 * 15 segundos dá tempo de a tela carregar e a pessoa se situar antes de a folha subir.
 */
const ESPERA_INICIAL_MS = 15_000;
/** Intervalo mínimo entre consultas ao voltar para o app. */
const INTERVALO_MINIMO_MS = 30 * 60_000;

/**
 * Avaliação do aplicativo no app de campo.
 *
 * <p>Mesmas regras do web, com a mesma memória no servidor: quem respondeu, adiou ou
 * recusou no computador não é perguntado de novo no celular, e vice-versa. Aqui o convite
 * só aparece na tela Hoje — nunca no meio de um lançamento — e só com internet: a
 * avaliação não entra na fila de envio, porque não é trabalho de campo e não pode
 * disputar a vez com as notas.</p>
 */
@Injectable({ providedIn: 'root' })
export class AvaliacaoService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly rede = inject(ConnectivityService);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/avaliacoes`;

  readonly convite = signal<ConviteAvaliacao | null>(null);
  /** Formulário completo aberto (a folha cresceu, ou veio pelo item em Conta). */
  readonly folhaAberta = signal(false);
  readonly estrelasIniciais = signal<number | null>(null);
  /**
   * A tela Hoje está visível e sem lançamento pela metade. Só ali o convite pode subir:
   * nunca no meio de uma execução, de uma solicitação ou de um formulário.
   */
  readonly conviteNaTela = signal(false);
  /** O formulário foi aberto a partir do convite: fechar sem enviar conta como "responder depois". */
  private veioDoConvite = false;

  private readonly liberado = signal(false);
  private readonly dispensado = signal(false);

  /** A folha pequena do convite, que sobe sozinha na tela Hoje. */
  readonly mostrarConvite = computed(() => {
    const c = this.convite();
    return !!c && c.convidar && this.liberado() && this.conviteNaTela() && !this.dispensado() && !this.folhaAberta() && this.rede.isOnline();
  });

  /** Há pesquisa no ar: o Perfil mostra "Avaliar o app". */
  readonly haPesquisa = computed(() => !!this.convite());

  /** Só a troca de usuário recomeça o convite; renovar o token gera outro objeto, não outra pessoa. */
  private readonly idUsuario = computed(() => this.auth.currentUser()?.id ?? null);

  private espera?: ReturnType<typeof setTimeout>;
  private ultimaConsulta = 0;

  constructor() {
    effect(() => {
      const id = this.idUsuario();
      untracked(() => {
        clearTimeout(this.espera);
        this.convite.set(null);
        this.liberado.set(false);
        this.dispensado.set(false);
        this.folhaAberta.set(false);
        this.ultimaConsulta = 0;
        if (id) {
          void this.consultar();
          this.espera = setTimeout(() => this.liberado.set(true), ESPERA_INICIAL_MS);
        }
      });
    });

    // Sem internet no login (comum no campo), a consulta fica para quando a rede voltar.
    effect(() => {
      if (this.rede.isOnline() && untracked(() => !this.convite() && !!this.idUsuario())) {
        untracked(() => void this.consultar());
      }
    });

    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.ultimaConsulta >= INTERVALO_MINIMO_MS) {
        void this.consultar();
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.espera);
      document.removeEventListener('visibilitychange', aoVoltar);
    });
  }

  abrir(estrelas: number | null = null): void {
    this.veioDoConvite = this.mostrarConvite();
    this.estrelasIniciais.set(estrelas);
    this.folhaAberta.set(true);
    if (!this.convite()) void this.consultar();
  }

  /** Fechar o formulário sem enviar. Se ele nasceu do convite, vale como "responder depois". */
  fecharFormulario(): void {
    // Adiar antes de fechar: o adiamento esconde o convite na hora (parte síncrona), senão a
    // folha pequena reapareceria por um quadro entre fechar o formulário e o adiamento.
    if (this.veioDoConvite && !this.convite()?.jaRespondeu) void this.adiar();
    this.veioDoConvite = false;
    this.folhaAberta.set(false);
  }

  async adiar(): Promise<void> {
    await this.dispensar('adiamento');
  }

  async recusar(): Promise<void> {
    await this.dispensar('recusa');
  }

  /** Envia a avaliação. Lança o erro HTTP para a folha mostrar a mensagem. */
  async responder(resposta: RespostaAvaliacao): Promise<void> {
    const c = this.convite();
    if (!c) throw new Error('Nenhuma pesquisa aberta.');
    await firstValueFrom(
      this.http.post<void>(`${this.baseUrl}/${c.campanhaId}/respostas`, {
        ...resposta,
        origem: 'CAMPO',
        versaoApp: environment.versaoApp,
      }, { context: silentContext() })
    );
    this.convite.set({ ...c, convidar: false, jaRespondeu: true });
  }

  async consultar(): Promise<void> {
    if (!this.auth.currentUser()?.id || !this.rede.isOnline()) return;
    // Login e volta da rede podem disparar juntos: uma consulta basta.
    if (Date.now() - this.ultimaConsulta < 5_000) return;
    this.ultimaConsulta = Date.now();
    try {
      const resposta = await firstValueFrom(
        this.http.get<ConviteAvaliacao | null>(`${this.baseUrl}/convite`, { context: silentContext() })
      );
      this.convite.set(resposta ?? null);
    } catch {
      // Pesquisa é opcional: falhar aqui nunca vira aviso para a equipe.
    }
  }

  private async dispensar(acao: 'adiamento' | 'recusa'): Promise<void> {
    const c = this.convite();
    if (!c) return;
    this.dispensado.set(true);
    try {
      await firstValueFrom(this.http.post<void>(`${this.baseUrl}/${c.campanhaId}/${acao}`, {}, { context: silentContext() }));
      this.convite.set({ ...c, convidar: false });
    } catch {
      // Sem rede: some só neste aparelho até o app reabrir; o servidor volta a oferecer depois.
    }
  }
}
