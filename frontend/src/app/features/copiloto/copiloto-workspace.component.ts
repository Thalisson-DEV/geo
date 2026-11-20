import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { GeoButtonComponent, GeoIconButtonComponent } from '@geo/ui';
import { GeoAsyncStateComponent, GeoCalloutComponent } from '@geo/ui/feedback';
import { AssistenteContexto } from '../../core/models/assistente.models';
import { CopilotoStore } from './copiloto.store';
import { CopilotoArtefatoComponent } from './componentes/copiloto-artefato.component';
import { CopilotoArquivosComponent } from './componentes/copiloto-arquivos.component';
import { CopilotoDadosComponent } from './componentes/copiloto-dados.component';
import { CopilotoBoasVindasComponent } from './componentes/copiloto-boas-vindas.component';
import { CopilotoCompositorComponent } from './componentes/copiloto-compositor.component';
import { CopilotoConversasComponent } from './componentes/copiloto-conversas.component';
import { CopilotoMensagemComponent } from './componentes/copiloto-mensagem.component';
import { AuthService } from '../../core/services/auth.service';

/** Lê o contexto de origem enviado pelos atalhos "Analisar com Bússola". */
export function contextoDaUrl(query: ParamMap): AssistenteContexto | null {
  const contexto: AssistenteContexto = {
    pagina: query.get('origem') ?? undefined,
    rota: query.get('rota') ?? undefined,
    entidadeTipo: query.get('tipo') ?? undefined,
    entidadeId: query.get('entidade') ?? undefined,
    rotulo: query.get('rotulo') ?? undefined,
  };
  const filtros: Record<string, string> = {};
  for (const chave of query.keys) {
    if (chave.startsWith('f_')) filtros[chave.slice(2)] = query.get(chave) ?? '';
  }
  if (Object.keys(filtros).length) contexto.filtros = filtros;
  return Object.values(contexto).some((valor) => valor !== undefined) ? contexto : null;
}

const CHAVE_LARGURA = 'geo.copiloto.painel.largura';
const LARGURA_MINIMA = 340;
/** Espaço mínimo que a conversa mantém ao lado do painel. */
const CONVERSA_MINIMA = 380;

const CHAVE_LISTA = 'geo.copiloto.historico.largura';
const LISTA_MINIMA = 200;
const LISTA_MAXIMA = 480;
const LISTA_PADRAO = 280;

function larguraSalva(chave: string, minima: number): number | null {
  try {
    const valor = Number(localStorage.getItem(chave));
    return Number.isFinite(valor) && valor >= minima ? valor : null;
  } catch {
    return null;
  }
}

function salvarLarguraLocal(chave: string, largura: number | null): void {
  try {
    if (largura) localStorage.setItem(chave, String(largura));
    else localStorage.removeItem(chave);
  } catch {
    // Sem armazenamento local a largura vale só nesta visita.
  }
}

/**
 * Workspace da Bússola: histórico de conversas, conversa com linha do tempo das ferramentas e painel
 * de artefatos. Tela própria do GEO (sem widget flutuante), responsiva: no celular, histórico e artefatos
 * ocupam a área da conversa quando abertos.
 */
@Component({
  selector: 'app-copiloto-workspace',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    GeoButtonComponent,
    GeoIconButtonComponent,
    GeoAsyncStateComponent,
    GeoCalloutComponent,
    CopilotoArtefatoComponent,
    CopilotoArquivosComponent,
    CopilotoDadosComponent,
    CopilotoBoasVindasComponent,
    CopilotoCompositorComponent,
    CopilotoConversasComponent,
    CopilotoMensagemComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copiloto-workspace.component.html',
  styleUrl: './copiloto-workspace.component.css',
})
export class CopilotoWorkspaceComponent {
  protected readonly store = inject(CopilotoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titulo = inject(Title);
  private readonly auth = inject(AuthService);
  protected readonly podeConectarIa = computed(() => !!this.auth.currentUser()?.permissoes?.includes('assistente:conexao:use'));

  private readonly rolagem = viewChild<ElementRef<HTMLElement>>('rolagem');
  private readonly conteudo = viewChild<ElementRef<HTMLElement>>('conteudo');
  private readonly ws = viewChild<ElementRef<HTMLElement>>('ws');
  private readonly compositor = viewChild(CopilotoCompositorComponent);

  protected readonly rascunho = signal('');
  protected readonly desktop = signal(typeof window === 'undefined' || window.matchMedia?.('(min-width: 1024px)').matches !== false);
  protected readonly listaAberta = signal(this.desktop());
  protected readonly grudado = signal(true);
  protected readonly arrastando = signal(false);
  protected readonly painelAberto = computed(() => {
    const painel = this.store.painel();
    return painel !== null && (painel.tipo !== 'artefato' || this.store.artefatoSelecionado() !== null);
  });
  protected readonly painelCheio = signal(false);
  protected readonly redimensionando = signal(false);
  /** Largura escolhida pelo usuário (null = proporção padrão). Guardada só neste navegador. */
  protected readonly larguraPainel = signal<number | null>(larguraSalva(CHAVE_LARGURA, LARGURA_MINIMA));
  protected readonly LARGURA_MINIMA = LARGURA_MINIMA;
  /** Largura do histórico de conversas, ajustável pelo usuário e guardada só neste navegador. */
  protected readonly larguraLista = signal<number>(Math.min(LISTA_MAXIMA, larguraSalva(CHAVE_LISTA, LISTA_MINIMA) ?? LISTA_PADRAO));
  protected readonly LISTA_MINIMA = LISTA_MINIMA;
  protected readonly LISTA_MAXIMA = LISTA_MAXIMA;
  protected readonly rotuloPainel = computed(() => {
    switch (this.store.painel()?.tipo) {
      case 'dados':
        return 'Dados usados na resposta';
      case 'arquivos':
        return 'Arquivos da conversa';
      default:
        return 'Painel de artefatos';
    }
  });
  protected readonly totalArquivos = computed(() =>
    this.store.artefatosAtuais().length + this.store.arquivosAtuais().filter((arquivo) => arquivo.origem === 'GERADO').length);
  /** Chave da última resposta: só ela oferece refazer, continuar e próximos passos. */
  protected readonly ultimaResposta = computed(() => {
    const lista = this.store.mensagens();
    for (let i = lista.length - 1; i >= 0; i--) if (lista[i].papel === 'ASSISTENTE') return lista[i].chave;
    return null;
  });
  /** Conversa mais recente para "continuar de onde parou" na tela inicial. */
  protected readonly ultimaConversa = computed(() =>
    this.store.conversaId() ? null : (this.store.conversas().find((conversa) => !conversa.fixada) ?? this.store.conversas()[0] ?? null));
  protected readonly listaVisivel = computed(() => this.listaAberta() && !this.painelAberto());

  constructor() {
    void this.store.iniciar();

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, query]) => this.aplicarRota(params.get('id'), query));

    // Primeira mensagem de uma conversa nova: a URL passa a apontar para a conversa criada.
    effect(() => {
      const id = this.store.conversaId();
      untracked(() => {
        if (id && this.route.snapshot.paramMap.get('id') !== id) {
          void this.router.navigate(['/bussola', id], { replaceUrl: true });
        }
      });
    });

    effect(() => this.titulo.setTitle(`${this.store.titulo()} · Bússola`));

    // Trocar de conversa sempre começa pelo fim (o "Ir para o fim" da conversa anterior não vaza para a nova).
    effect(() => {
      this.store.conversaId();
      untracked(() => {
        this.grudado.set(true);
        requestAnimationFrame(() => this.irParaOFim(false));
      });
    });
    effect(() => {
      if (!this.painelAberto()) this.painelCheio.set(false);
    });

    // Conteúdo que cresce depois de renderizar (imagens, tabelas, cartões) mantém a conversa no fim.
    if (typeof ResizeObserver !== 'undefined') {
      const observador = new ResizeObserver(() => {
        if (this.grudado()) this.irParaOFim(false);
        else this.aoRolar();
      });
      effect(() => {
        const conteudo = this.conteudo()?.nativeElement;
        observador.disconnect();
        if (conteudo) observador.observe(conteudo);
      });
      inject(DestroyRef).onDestroy(() => observador.disconnect());
    }

    effect(() => {
      this.store.mensagens();
      untracked(() => {
        if (this.grudado()) requestAnimationFrame(() => this.irParaOFim(false));
      });
    });

    const midia = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 1024px)') : undefined;
    if (midia) {
      const aoMudar = (evento: MediaQueryListEvent) => {
        this.desktop.set(evento.matches);
        this.listaAberta.set(evento.matches);
      };
      midia.addEventListener('change', aoMudar);
      inject(DestroyRef).onDestroy(() => midia.removeEventListener('change', aoMudar));
    }
  }

  // ---------------------------------------------------------------------------------- navegação

  protected conectarIa(): void {
    void this.router.navigate(['/bussola/conectar-ia']);
  }

  protected nova(): void {
    this.store.novaConversa();
    this.rascunho.set('');
    if (!this.desktop()) this.listaAberta.set(false);
    void this.router.navigate(['/bussola']);
    setTimeout(() => this.compositor()?.focar());
  }

  protected abrirConversa(id: string): void {
    if (!this.desktop()) this.listaAberta.set(false);
    void this.router.navigate(['/bussola', id]);
  }

  protected async excluir(id: string): Promise<void> {
    const eraAtual = this.store.conversaId() === id;
    const excluida = await this.store.excluir(id);
    if (excluida && eraAtual) void this.router.navigate(['/bussola']);
  }

  protected alternarLista(): void {
    if (this.painelAberto() && this.desktop()) {
      this.fecharPainel();
      this.listaAberta.set(true);
      return;
    }
    this.listaAberta.update((aberta) => !aberta);
  }

  // ---------------------------------------------------------------------------------- mensagens

  protected editar(texto: string): void {
    this.rascunho.set(texto);
    setTimeout(() => this.compositor()?.focar());
  }

  protected async refazer(chave: string): Promise<void> {
    this.grudado.set(true);
    await this.store.refazer(chave);
  }

  protected fecharPainel(): void {
    this.store.fecharPainel();
    this.painelCheio.set(false);
  }

  protected aoEsc(): void {
    if (this.painelCheio()) this.painelCheio.set(false);
    else if (this.painelAberto()) this.fecharPainel();
  }

  // ---------------------------------------------------------------------------------- painel redimensionável

  protected iniciarRedimensionamento(evento: PointerEvent, alvoLargura: 'painel' | 'lista'): void {
    const ws = this.ws()?.nativeElement;
    if (!ws || evento.button !== 0) return;
    evento.preventDefault();
    const alvo = evento.currentTarget as HTMLElement;
    alvo.setPointerCapture(evento.pointerId);
    this.redimensionando.set(true);
    const mover = (movimento: PointerEvent) => {
      const caixa = ws.getBoundingClientRect();
      if (alvoLargura === 'lista') this.definirLista(movimento.clientX - caixa.left);
      else this.definirLargura(caixa.right - movimento.clientX);
    };
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover);
      alvo.removeEventListener('pointerup', soltar);
      alvo.removeEventListener('pointercancel', soltar);
      this.redimensionando.set(false);
      this.salvarLarguras();
    };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', soltar);
  }

  protected redimensionarPeloTeclado(evento: KeyboardEvent, alvoLargura: 'painel' | 'lista'): void {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
    evento.preventDefault();
    const passo = evento.key === 'ArrowLeft' ? -40 : 40;
    if (alvoLargura === 'lista') {
      this.definirLista(this.larguraLista() + passo);
    } else {
      const atual = this.larguraPainel()
        ?? this.ws()?.nativeElement.querySelector('.ws__painel')?.getBoundingClientRect().width ?? 480;
      this.definirLargura(atual - passo);
    }
    this.salvarLarguras();
  }

  protected redefinirLista(): void {
    this.larguraLista.set(LISTA_PADRAO);
    this.salvarLarguras();
  }

  private definirLista(largura: number): void {
    this.larguraLista.set(Math.round(Math.min(LISTA_MAXIMA, Math.max(LISTA_MINIMA, largura))));
  }

  private definirLargura(largura: number): void {
    const total = this.ws()?.nativeElement.getBoundingClientRect().width ?? window.innerWidth;
    const lista = this.listaVisivel() ? this.larguraLista() : 0;
    const maxima = Math.max(LARGURA_MINIMA, total - lista - CONVERSA_MINIMA);
    this.larguraPainel.set(Math.round(Math.min(maxima, Math.max(LARGURA_MINIMA, largura))));
  }

  private salvarLarguras(): void {
    salvarLarguraLocal(CHAVE_LARGURA, this.larguraPainel());
    salvarLarguraLocal(CHAVE_LISTA, this.larguraLista() === LISTA_PADRAO ? null : this.larguraLista());
  }

  protected async enviar(texto: string): Promise<void> {
    this.rascunho.set('');
    this.grudado.set(true);
    const enviada = this.store.enviar(texto);
    setTimeout(() => this.compositor()?.focar());
    if (!(await enviada)) this.rascunho.set(texto);
  }

  protected usarSugestao(pergunta: string): void {
    this.rascunho.set(pergunta);
    setTimeout(() => this.compositor()?.focar());
  }

  protected abrirArtefato(codigo: string): void {
    this.store.abrirArtefato(codigo);
  }

  // ---------------------------------------------------------------------------------- rolagem e arquivos

  protected aoRolar(): void {
    const elemento = this.rolagem()?.nativeElement;
    if (!elemento) return;
    const distancia = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight;
    this.grudado.set(distancia < 80);
  }

  protected irParaOFim(suave = true): void {
    const elemento = this.rolagem()?.nativeElement;
    if (!elemento) return;
    // Tela inicial (sem mensagens) fica no topo: o título e as sugestões vêm primeiro.
    if (this.store.vazia()) {
      elemento.scrollTop = 0;
      this.grudado.set(true);
      return;
    }
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    elemento.scrollTo({ top: elemento.scrollHeight, behavior: suave && !reduzir ? 'smooth' : 'auto' });
    this.grudado.set(true);
  }

  protected aoArrastar(evento: DragEvent): void {
    if (!evento.dataTransfer?.types?.includes('Files')) return;
    evento.preventDefault();
    this.arrastando.set(true);
  }

  protected aoSairArrasto(evento: DragEvent): void {
    const atual = evento.currentTarget as HTMLElement | null;
    const destino = evento.relatedTarget as Node | null;
    if (!atual || !destino || !atual.contains(destino)) this.arrastando.set(false);
  }

  protected aoSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando.set(false);
    const arquivos = [...(evento.dataTransfer?.files ?? [])];
    if (arquivos.length && this.store.disponivel()) this.store.anexar(arquivos);
  }

  private aplicarRota(id: string | null, query: ParamMap): void {
    if (id) {
      void this.store.abrirConversa(id);
      return;
    }
    const contexto = contextoDaUrl(query);
    if (this.store.conversaId() !== null || contexto) this.store.novaConversa(contexto);
    const pergunta = query.get('pergunta');
    if (pergunta) this.rascunho.set(pergunta);
  }
}
