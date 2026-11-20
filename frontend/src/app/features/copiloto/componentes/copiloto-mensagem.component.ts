import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { GeoButtonComponent, GeoIconButtonComponent, GeoStatusComponent } from '@geo/ui';
import { GeoCalloutComponent, NotificationService } from '@geo/ui/feedback';
import { ArquivoAssistente, ArtefatoAssistente, AssistenteAcao } from '../../../core/models/assistente.models';
import { AuthService } from '../../../core/services/auth.service';
import { MensagemView, CopilotoStore, chaveArtefato, formatarTamanho } from '../copiloto.store';
import { PropostaAcaoView, observacoes, textoFinal } from '../copiloto-pacotes';
import { ICONE_ARTEFATO, ROTULO_ARTEFATO, formatarDuracao } from '../copiloto-formatos';
import { separarProximosPassos, tempoDecorrido, ultimasVersoes } from '../copiloto-texto';
import { resolveChatNavigation } from '../navegacao/copiloto-navegacao';
import { resumoRecorte } from '../contexto/copiloto-contexto';
import { FiltroSugerido, resolverFiltroSugerido } from '../contexto/copiloto-filtro';
import { CopilotoPainelService } from '../painel/copiloto-painel.service';
import { CopilotoCartaoAprovacaoComponent } from './copiloto-cartao-aprovacao.component';
import { CopilotoCartaoCadastroComponent } from './copiloto-cartao-cadastro.component';
import { CopilotoEtapasComponent } from './copiloto-etapas.component';
import { CopilotoMarkdownComponent } from './copiloto-markdown.component';

/** A partir daqui a resposta é tratada como análise longa (aviso de que dá para sair da tela). */
const ANALISE_LONGA_MS = 60_000;

const ROTULO_CATEGORIA: Record<string, string> = {
  PLANILHA: 'Planilha Excel',
  CSV: 'Planilha CSV',
  PDF: 'PDF',
  TEXTO: 'Texto',
  JSON: 'JSON',
  IMAGEM: 'Imagem',
  DOCUMENTO: 'Documento',
};

@Component({
  selector: 'app-copiloto-mensagem',
  standalone: true,
  imports: [
    GeoButtonComponent,
    GeoIconButtonComponent,
    GeoStatusComponent,
    GeoCalloutComponent,
    CopilotoCartaoAprovacaoComponent,
    CopilotoCartaoCadastroComponent,
    CopilotoEtapasComponent,
    CopilotoMarkdownComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copiloto-mensagem.component.html',
  styleUrl: './copiloto-mensagem.component.css',
})
export class CopilotoMensagemComponent {
  private readonly store = inject(CopilotoStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notificacao = inject(NotificationService);
  private readonly painel = inject(CopilotoPainelService);
  private readonly markdown = viewChild('markdown', { read: ElementRef });

  readonly mensagem = input.required<MensagemView>();
  /** Última resposta da conversa: só ela oferece refazer, continuar e próximos passos. */
  readonly ultima = input(false);
  /** Perguntas podem ser editadas e reenviadas enquanto nada está em andamento. */
  readonly podeEditar = input(true);

  readonly abrirArtefato = output<string>();
  readonly verDados = output<string[]>();
  readonly enviarTexto = output<string>();
  readonly editar = output<string>();
  readonly refazer = output<void>();

  protected readonly imagens = signal<Record<string, string>>({});
  protected readonly agora = signal(Date.now());
  protected readonly avaliandoNegativa = signal(false);
  protected readonly motivoEscolhido = signal<string | null>(null);
  protected readonly comentario = signal('');
  protected readonly motivos = ['Dados errados', 'Não entendeu o pedido', 'Incompleta', 'Difícil de entender', 'Demorou demais', 'Outro'];

  protected readonly resposta = computed(() => this.mensagem().resposta ?? null);
  protected readonly avaliacao = computed(() => this.mensagem().avaliacao ?? null);
  /** Recorte do painel usado nesta pergunta (período, filtros, foco) — igual no painel e no workspace. */
  protected readonly recorte = computed(() => {
    const painel = this.mensagem().contexto?.painel;
    return painel ? { painel: painel.nome, resumo: resumoRecorte(painel) } : null;
  });
  protected readonly texto = computed(() => {
    const resposta = this.resposta();
    return resposta ? textoFinal(resposta) : '';
  });
  /** Texto sem o bloco "Próximos passos" (que vira botões) depois que a resposta termina. */
  private readonly partes = computed(() =>
    this.emAndamento() ? { corpo: this.texto(), passos: [] as string[] } : separarProximosPassos(this.texto()));
  protected readonly corpo = computed(() => this.partes().corpo);
  protected readonly passos = computed(() => this.partes().passos);
  protected readonly notas = computed(() => {
    const resposta = this.resposta();
    return resposta ? observacoes(resposta) : [];
  });
  protected readonly emAndamento = computed(() => {
    const resposta = this.resposta();
    return !!resposta && !resposta.concluida;
  });
  private readonly inicio = signal(Date.now());
  protected readonly decorrido = computed(() => tempoDecorrido(this.agora() - this.inicio()));
  protected readonly longa = computed(() => this.emAndamento() && this.agora() - this.inicio() >= ANALISE_LONGA_MS);
  protected readonly pensando = computed(() => this.emAndamento() && !this.texto() && !this.resposta()?.etapas.length);
  protected readonly imagensGeradas = computed(() =>
    ultimasVersoes((this.resposta()?.arquivos ?? []).filter((arquivo) => arquivo.categoria === 'IMAGEM'), (a) => a.nome),
  );
  /** Arquivos entregues (sem imagens, que aparecem inline), só a última versão de cada nome. */
  protected readonly entregaveis = computed(() =>
    ultimasVersoes((this.resposta()?.arquivos ?? []).filter((arquivo) => arquivo.categoria !== 'IMAGEM'),
      (arquivo) => arquivo.nome.toLowerCase()),
  );
  /** Arquivo entregue → artefato que o descreve (planilha e relatório PDF): um cartão só, com "Ver conteúdo". */
  protected readonly artefatoDoArquivo = computed(() => {
    const mapa = new Map<string, ArtefatoAssistente>();
    for (const artefato of this.resposta()?.artefatos ?? []) {
      const id = artefato.arquivoId ?? artefato.especificacao?.arquivo?.id;
      if (id) mapa.set(id, artefato);
    }
    return mapa;
  });
  /** Artefatos da resposta, só a última versão de cada um; os que já aparecem como arquivo entregue ficam no cartão dele. */
  protected readonly artefatos = computed(() => {
    const entregues = new Set(this.entregaveis().map((arquivo) => arquivo.id));
    return ultimasVersoes(this.resposta()?.artefatos ?? [], chaveArtefato).filter((artefato) => {
      const id = artefato.arquivoId ?? artefato.especificacao?.arquivo?.id;
      return !id || !entregues.has(id);
    });
  });
  protected readonly acoes = computed(() => {
    const permissoes = this.auth.currentUser()?.permissoes ?? [];
    return (this.resposta()?.acoes ?? [])
      .map((acao) => ({ acao, destino: resolveChatNavigation(acao, permissoes) }))
      .filter((item) => item.destino !== null);
  });
  /**
   * Filtros sugeridos (`APPLY_FILTER`) que valem para a tabela em tela agora. Fora do painel de origem
   * (workspace, outro dashboard) não aparecem: o filtro só faz sentido onde a tabela existe.
   */
  protected readonly filtrosSugeridos = computed(() => {
    const tabelas = this.painel.contextoAtivo()?.tabelas;
    return (this.resposta()?.acoes ?? [])
      .map((acao) => resolverFiltroSugerido(acao, tabelas))
      .filter((filtro): filtro is FiltroSugerido => filtro !== null)
      .map((filtro) => ({
        filtro,
        resumo: filtro.filtros.map((item) => item.label ?? item.key).join(' e '),
      }));
  });

  protected readonly rodape = computed(() => {
    const resposta = this.resposta();
    if (!resposta?.concluida || resposta.status !== 'CONCLUIDA') return '';
    // Com etapas, o tempo já aparece no cabeçalho delas ("1 etapa · 5,1 s").
    if (resposta.etapas?.length) return '';
    const duracao = formatarDuracao(resposta.duracaoMs ?? this.mensagem().metricas?.duracaoMs);
    return duracao ? `Concluída em ${duracao}` : '';
  });

  protected readonly resumoInterrupcao = computed(() => {
    const feitas = (this.resposta()?.etapas ?? []).filter((etapa) => etapa.status === 'ok').length;
    if (!feitas) return 'Nada chegou a ser consultado.';
    return `${feitas} ${feitas === 1 ? 'etapa foi concluída' : 'etapas foram concluídas'} antes da interrupção; o que foi feito está nas etapas acima.`;
  });

  protected readonly iconeArtefato = ICONE_ARTEFATO;
  protected readonly rotuloArtefato = ROTULO_ARTEFATO;
  protected readonly formatarTamanho = formatarTamanho;

  /** Link de arquivo na linha do tempo: versões substituídas apontam para a versão final com o mesmo nome. */
  protected readonly arquivoAtual = (arquivo: ArquivoAssistente): ArquivoAssistente => {
    const nome = arquivo.nome.toLowerCase();
    const versoes = (this.resposta()?.arquivos ?? []).filter((item) => item.nome.toLowerCase() === nome);
    return versoes.length ? versoes[versoes.length - 1] : arquivo;
  };

  constructor() {
    effect(() => {
      for (const imagem of [...this.imagensGeradas(), ...this.mensagem().anexos.filter((a) => a.categoria === 'IMAGEM')]) {
        if (this.imagens()[imagem.id]) continue;
        this.store
          .urlImagem(imagem.id)
          .then((url) => this.imagens.update((atual) => ({ ...atual, [imagem.id]: url })))
          .catch(() => undefined);
      }
    });

    effect(() => {
      const criada = Date.parse(this.mensagem().dataCriacao ?? '');
      if (Number.isFinite(criada)) this.inicio.set(Math.min(criada, Date.now()));
    });

    // Cronômetro só enquanto a resposta está em andamento.
    effect((aoLimpar) => {
      if (!this.emAndamento()) return;
      const relogio = setInterval(() => this.agora.set(Date.now()), 1000);
      aoLimpar(() => clearInterval(relogio));
    });
  }

  protected baixar(arquivo: ArquivoAssistente): void {
    void this.store.baixar(arquivo);
  }

  protected abrirArquivo(arquivo: ArquivoAssistente): void {
    void this.store.abrirEmNovaAba(arquivo);
  }

  protected abreNoNavegador(arquivo: ArquivoAssistente): boolean {
    return arquivo.categoria === 'PDF' || arquivo.categoria === 'TEXTO';
  }

  protected rotuloArquivo(arquivo: ArquivoAssistente): string {
    return ROTULO_CATEGORIA[arquivo.categoria] ?? (arquivo.nome.split('.').pop()?.toUpperCase() || 'Arquivo');
  }

  protected abrir(artefato: ArtefatoAssistente): void {
    this.abrirArtefato.emit(artefato.codigo);
  }

  /** Número da versão do artefato na conversa (1 quando é a única). */
  protected versoesDe(artefato: ArtefatoAssistente): number {
    const chave = chaveArtefato(artefato);
    const todas = this.store.artefatos().filter((item) => chaveArtefato(item) === chave);
    const posicao = todas.findIndex((item) => item.codigo === artefato.codigo);
    return posicao < 0 ? 1 : posicao + 1;
  }

  /** Cartões refeitos na mesma resposta: mostra só o último de cada cadastro, sem a fila de "sem efeito". */
  protected readonly propostas = computed(() => {
    const lista = this.resposta()?.propostas ?? [];
    const estados = this.store.acoesCartao();
    return lista.filter((proposta, i) => {
      if (estados[proposta.acaoId]?.status !== 'EXPIRADA') return true;
      const chave = (proposta.previa as { chave?: string } | null)?.chave;
      return !chave || !lista.slice(i + 1).some((p) => (p.previa as { chave?: string } | null)?.chave === chave);
    });
  });

  protected ehAprovacao(proposta: PropostaAcaoView): boolean {
    const previa = (this.store.acoesCartao()[proposta.acaoId]?.previa ?? proposta.previa) as { tipo?: string } | null | undefined;
    return previa?.tipo === 'aprovacao';
  }

  protected ehCadastro(proposta: PropostaAcaoView): boolean {
    const previa = proposta.previa as { tipo?: string } | null | undefined;
    return previa?.tipo === 'cadastro' || !!this.store.acoesCartao()[proposta.acaoId]?.previa;
  }

  protected navegar(acao: AssistenteAcao): void {
    const destino = resolveChatNavigation(acao, this.auth.currentUser()?.permissoes ?? []);
    if (destino) void this.router.navigate([destino.route], { queryParams: destino.queryParams });
  }

  protected aplicarFiltro(filtro: FiltroSugerido): void {
    this.painel.aplicarFiltro(filtro);
    this.notificacao.success('Filtro aplicado na tabela. Remova o chip para desfazer.');
  }

  // ---------------------------------------------------------------------------------- copiar e imprimir

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.texto());
      this.notificacao.success('Resposta copiada.');
    } catch {
      this.notificacao.warning('Não foi possível copiar automaticamente. Selecione o texto e copie.');
    }
  }

  protected async copiarPergunta(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.mensagem().texto ?? '');
      this.notificacao.success('Pergunta copiada.');
    } catch {
      this.notificacao.warning('Não foi possível copiar automaticamente.');
    }
  }

  /** Copia como HTML (negrito, listas e tabelas chegam formatados no e-mail ou no Word) e como texto. */
  protected async copiarFormatado(): Promise<void> {
    const html = this.htmlDaResposta();
    try {
      if (typeof ClipboardItem === 'undefined') throw new Error('sem ClipboardItem');
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([this.corpo()], { type: 'text/plain' }),
      })]);
      this.notificacao.success('Resposta copiada com formatação. Cole no e-mail ou no Word.');
    } catch {
      await this.copiar();
    }
  }

  /** Abre a resposta numa página limpa para imprimir ou salvar em PDF pelo navegador. */
  protected imprimir(): void {
    const janela = window.open('', '_blank');
    if (!janela) {
      this.notificacao.warning('O navegador bloqueou a nova janela. Permita pop-ups para imprimir.');
      return;
    }
    const titulo = escaparHtml(this.store.titulo());
    const data = new Date(this.mensagem().dataCriacao ?? Date.now()).toLocaleString('pt-BR');
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>
  body { font: 14px/1.6 Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif; color: CanvasText; background: Canvas; margin: 2rem auto; max-width: 48rem; padding: 0 1rem; }
  header { border-bottom: 2px solid currentColor; margin-bottom: 1.25rem; padding-bottom: 0.5rem; }
  header h1 { font-size: 1.25rem; margin: 0; } header p { margin: 0.2rem 0 0; color: GrayText; font-size: 0.8rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; font-size: 0.85rem; }
  th, td { border: 1px solid GrayText; padding: 0.3rem 0.5rem; text-align: left; } th { font-weight: 600; }
  td[align='right'], th[align='right'] { text-align: right; }
  code { border: 1px solid GrayText; padding: 0 0.25rem; border-radius: 3px; }
  h2, h3 { margin: 1.2rem 0 0.4rem; }
  @media print { body { margin: 0 auto; } }
</style></head><body>
<header><h1>${titulo}</h1><p>Resposta da Bússola · GEO · ${escaparHtml(data)}</p></header>
${this.htmlDaResposta()}
</body></html>`);
    janela.document.close();
    janela.focus();
    setTimeout(() => janela.print(), 300);
  }

  /** HTML renderizado da resposta, sem os controles da tela (índice, botões de tabela e links de dados). */
  private htmlDaResposta(): string {
    const origem = this.markdown()?.nativeElement.querySelector('.markdown-body');
    if (!origem) return `<p>${escaparHtml(this.corpo())}</p>`;
    const copia = origem.cloneNode(true) as HTMLElement;
    copia.querySelectorAll('.markdown-indice, .markdown-tabela__barra, .markdown-dados, .markdown-ordenar__seta').forEach((no) => no.remove());
    copia.querySelectorAll('.markdown-ordenar').forEach((botao) => botao.replaceWith(...Array.from(botao.childNodes)));
    return copia.innerHTML;
  }

  // ---------------------------------------------------------------------------------- avaliação

  protected avaliarPositiva(): void {
    this.avaliandoNegativa.set(false);
    const jaPositiva = this.avaliacao()?.valor === 'POSITIVA';
    void this.store.avaliar(this.mensagem().chave, jaPositiva ? null : 'POSITIVA');
  }

  protected abrirAvaliacaoNegativa(): void {
    const atual = this.avaliacao();
    this.motivoEscolhido.set(atual?.valor === 'NEGATIVA' ? (atual.motivo ?? null) : null);
    this.comentario.set(atual?.valor === 'NEGATIVA' ? (atual.comentario ?? '') : '');
    this.avaliandoNegativa.set(true);
  }

  protected async enviarAvaliacaoNegativa(): Promise<void> {
    const motivo = this.motivoEscolhido();
    if (!motivo) return;
    const salva = await this.store.avaliar(this.mensagem().chave, 'NEGATIVA', motivo, this.comentario().trim() || undefined);
    if (salva) this.avaliandoNegativa.set(false);
  }

  protected iconeArquivo(arquivo: ArquivoAssistente): string {
    switch (arquivo.categoria) {
      case 'PDF':
        return 'pi pi-file-pdf';
      case 'PLANILHA':
      case 'CSV':
        return 'pi pi-file-excel';
      case 'IMAGEM':
        return 'pi pi-image';
      case 'DOCUMENTO':
        return 'pi pi-file-word';
      default:
        return 'pi pi-file';
    }
  }
}

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
