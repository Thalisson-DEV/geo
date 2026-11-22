import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BarraTopoComponent, FotoExibida, FotosComponent, IconeComponent, SegmentadoComponent, VazioComponent } from '../../ui';
import { ToastService } from '../../core/ui/toast.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { DocumentacaoObra, FotoVisitaFila, ModeloChecklist, PerguntaChecklist, SupervisaoService } from '../../core/obras/supervisao.service';
import {
  NAO_SE_APLICA, RespostaVisita, RespostasVisita, alternar, faltando, marcarRestantesComoConforme, montarRespostas, naoConformidades,
  opcoesDe, restantesConformes, situacao, temOpcoes,
} from '../../core/obras/visita-previa';
import { db } from '../../core/db/app-db';
import { ColaboradorLocal } from '../../core/db/models';
import { TokenService } from '../../core/auth/token.service';
import { LocalizacaoService } from '../../core/obras/localizacao.service';
import { Carimbo, montarCarimbo } from '../../core/fotos/carimbo';
import { EvidenciaPreparada } from '../../core/sst/evidencia-foto.util';
import { RascunhoService, VinculoRascunho } from '../../core/sessao/rascunho.service';
import { RascunhoStore } from '../../core/sessao/rascunho.store';

/** Foto da visita no aparelho: o arquivo fica no rascunho (`idAnexo`) até a visita entrar na fila. */
interface FotoVisita { id: string; idPergunta: string | null; idAnexo: string | null; nome: string; tipo: string; blob: Blob; url: string }

interface RascunhoVisita {
  idModelo: string | null;
  passo: number;
  respostas: RespostasVisita;
  observacoes: string;
  responsavel: string | null;
  fotos: { id: string; idPergunta: string | null; idAnexo: string | null; nome: string; tipo: string }[];
}

/**
 * Documentação técnica da obra pelo supervisor no app: resumo (visitas, fichas As Built, documentos), visita prévia
 * em passos (um por grupo do modelo, como a APR) e geração do As Built e do book. Cada resposta diz na hora se vira
 * não conformidade no relatório, e qualquer pergunta aceita foto. Tudo fica no rascunho do aparelho e a visita, com as
 * fotos, entra na fila: sem sinal, sai depois.
 */
@Component({
  selector: 'app-documentacao-obra',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, VazioComponent, SegmentadoComponent, FotosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modelo(); as m) {
      <geo-barra-topo [titulo]="'Visita prévia · ' + tituloPasso()" [subtitulo]="'Passo ' + (passo() + 1) + ' de ' + totalPassos() + ' · Obra ' + numero" (voltar)="voltar()" />
      <div class="geo-passos" aria-hidden="true">@for (x of passosVisuais(); track $index) { <i [class.feito]="$index <= passo()"></i> }</div>
      <p class="geo-sr-only" aria-live="polite">Passo {{ passo() + 1 }} de {{ totalPassos() }}: {{ tituloPasso() }}</p>

      <div class="corpo">
        @if (grupoAtual(); as g) {
          <div class="progresso">
            <span class="geo-num">{{ respondidasNoGrupo() }} de {{ g.perguntas.length }} respondidas</span>
            @if (naoConformesNoGrupo()) { <span class="nc-contagem"><geo-icone nome="alerta" [tamanho]="16" />{{ naoConformesNoGrupo() }} não {{ naoConformesNoGrupo() === 1 ? 'conforme' : 'conformes' }}</span> }
          </div>
          @if (restantesNoGrupo().length) {
            <button type="button" class="geo-btn geo-btn--neutro restantes" (click)="marcarRestantes()" data-testid="restantes-conforme">
              <geo-icone nome="check" /> Marcar {{ restantesNoGrupo().length }} {{ restantesNoGrupo().length === 1 ? 'restante' : 'restantes' }} como conforme
            </button>
          }
          <ul class="perguntas">
            @for (p of g.perguntas; track p.id) {
              @let sit = situacaoDe(p);
              <li class="geo-grupo pergunta" [attr.data-situacao]="sit" [class.sem-resposta]="tentou() && p.obrigatoria && !sit"
                [attr.aria-invalid]="tentou() && p.obrigatoria && !sit ? true : null">
                <span class="enunciado">{{ p.enunciado }}@if (!p.obrigatoria) { <span class="opcional"> (opcional)</span> }</span>
                @if (temOpcoes(p) && p.tipo === 'ESCOLHA_UNICA' && opcoesDe(p).length <= 3) {
                  <geo-segmentado [rotulo]="p.enunciado" [opcoes]="segmentos(p)" [valor]="respostas()[p.id]?.selecionadas?.[0] ?? ''" (valorChange)="marcar(p, $event)" />
                } @else if (temOpcoes(p)) {
                  <div class="opcoes" role="group" [attr.aria-label]="p.enunciado">
                    @for (o of opcoesDe(p); track o) {
                      <button type="button" class="opcao" [attr.aria-pressed]="marcada(p, o)" (click)="marcar(p, o)">
                        @if (marcada(p, o)) { <geo-icone nome="check" [tamanho]="16" /> }{{ o }}</button>
                    }
                  </div>
                } @else {
                  <input class="geo-input" [type]="p.tipo === 'NUMERO' ? 'number' : p.tipo === 'DATA' ? 'date' : 'text'"
                    [attr.inputmode]="p.tipo === 'NUMERO' ? 'decimal' : null" [value]="respostas()[p.id]?.valor ?? ''"
                    [attr.aria-label]="p.enunciado" (input)="texto(p, $any($event.target).value)">
                }
                @switch (sit) {
                  @case ('NAO_CONFORME') {
                    <p class="retorno retorno--nc" role="status"><geo-icone nome="alerta" [tamanho]="18" />
                      <span><strong>Não conforme</strong> · o esperado é "{{ p.opcaoConforme }}". Entra no parecer do relatório. Registre com foto.</span></p>
                  }
                  @case ('CONFORME') { <p class="retorno retorno--ok"><geo-icone nome="check" [tamanho]="16" /> Conforme</p> }
                }
                @if (tentou() && p.obrigatoria && !sit) { <p class="retorno retorno--falta">Responda esta pergunta.</p> }
                @if (sit === 'NAO_CONFORME' || fotosDa(p.id).length || fotoAberta() === p.id) {
                  <geo-fotos [rotulo]="'Fotos: ' + p.enunciado" [fotos]="fotosDa(p.id)" [galeria]="true" [carimbo]="carimbo(p.enunciado)"
                    [rotuloCamera]="fotosDa(p.id).length ? 'Mais uma' : 'Tirar foto'" (adicionada)="adicionarFoto(p.id, $event)" (removida)="removerFoto($event)" />
                } @else {
                  <button type="button" class="add-foto" (click)="fotoAberta.set(p.id)"><geo-icone nome="camera" [tamanho]="18" /> Adicionar foto</button>
                }
              </li>
            }
          </ul>
        } @else {
          @if (ncs().length) {
            <div class="parecer parecer--nc" role="status">
              <strong><geo-icone nome="alerta" [tamanho]="18" /> {{ ncs().length }} {{ ncs().length === 1 ? 'não conformidade vai' : 'não conformidades vão' }} para o relatório</strong>
              <ul>@for (n of ncs(); track n.pergunta.id) { <li>{{ n.grupo }} · {{ n.pergunta.enunciado }} <b>{{ n.resposta }}</b>
                @if (!fotosDa(n.pergunta.id).length) { <span class="sem-foto"> · sem foto</span> }</li> }</ul>
            </div>
          } @else if (!faltas().length) {
            <div class="parecer parecer--ok"><geo-icone nome="check" /> Nenhuma não conformidade: a obra pode seguir como no projeto.</div>
          }
          @if (faltas().length) {
            <div class="faltas" role="alert">
              <strong>{{ faltas().length === 1 ? 'Falta 1 resposta obrigatória' : 'Faltam ' + faltas().length + ' respostas obrigatórias' }}</strong>
              <ul>@for (f of faltas(); track f.pergunta.id) { <li><button type="button" class="ir" (click)="irPara(f.passo)">{{ f.grupo }} · {{ f.pergunta.enunciado }}</button></li> }</ul>
            </div>
          }
          <h2 class="geo-secao">Fotos gerais</h2>
          <div class="fotos-gerais">
            <geo-fotos rotulo="Fotos gerais da visita" [fotos]="fotosDa(null)" [galeria]="true" [carimbo]="carimbo('Visão geral')"
              (adicionada)="adicionarFoto(null, $event)" (removida)="removerFoto($event)" />
          </div>
          <label class="geo-campo"><span>Responsável pela visita</span>
            <select class="geo-input" [value]="responsavel() ?? ''" (change)="responsavel.set($any($event.target).value || null)" data-testid="responsavel-visita">
              <option value="">Escolha quem fez a visita</option>
              @for (c of colaboradores(); track c.id) { <option [value]="c.id" [selected]="c.id === responsavel()">{{ c.nomeCompleto }}</option> }
            </select></label>
          @if (tentou() && !responsavel()) { <p class="retorno retorno--falta campo-erro">Escolha quem fez a visita.</p> }
          <label class="geo-campo"><span>Observações para a equipe (opcional)</span>
            <textarea class="geo-input" rows="3" maxlength="2000" [value]="observacoes()" (input)="observacoes.set($any($event.target).value)"></textarea></label>
        }
      </div>

      <div class="geo-respiro"></div>
      <div class="geo-rodape-acoes" data-acao-fixa>
        @if (passo() > 0) { <button type="button" class="geo-btn geo-btn--neutro" (click)="irPara(passo() - 1)">Anterior</button> }
        @else { <button type="button" class="geo-btn geo-btn--neutro" (click)="sair()">Cancelar</button> }
        @if (grupoAtual()) {
          <button type="button" class="geo-btn geo-btn--principal" (click)="continuar()" data-testid="visita-avancar">Continuar</button>
        } @else {
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="salvando()" (click)="salvarVisita()" data-testid="registrar-visita">Registrar visita</button>
        }
      </div>
    } @else {
      <geo-barra-topo [titulo]="'Obra ' + numero" [subtitulo]="subtitulo" (voltar)="voltar()" />
      @if (doc(); as d) {
        <h2 class="geo-secao">Situação</h2>
        <ul class="geo-grupo">
          <li class="geo-linha"><span class="geo-selo" [class.geo-selo--ok]="d.visitaRealizada || visitasNaFila() > 0"><geo-icone nome="inspecao" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Visita prévia</span>
              <span class="geo-linha__apoio">{{ resumoVisitas(d) }}</span></span></li>
          <li class="geo-linha"><span class="geo-selo" [class.geo-selo--ok]="d.asBuilt.pontosExecutados > 0 && !d.asBuilt.pontosPendentes.length"><geo-icone nome="documento" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">As Built</span>
              <span class="geo-linha__apoio geo-num">{{ d.asBuilt.fichasCompletas }} de {{ d.asBuilt.pontosExecutados }} fichas completas{{ d.asBuilt.pontosSemEvidencia.length ? ' · ' + d.asBuilt.pontosSemEvidencia.length + ' sem foto' : '' }}</span></span></li>
          <li class="geo-linha"><span class="geo-selo"><geo-icone nome="documento" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Documentos</span>
              <span class="geo-linha__apoio">{{ d.documentos.length ? d.documentos.map(rotuloDoc).join(', ') : 'Nenhum gerado' }}</span></span></li>
        </ul>
        <h2 class="geo-secao">Lançar</h2>
        <ul class="geo-grupo">
          @for (m of modelos(); track m.id) {
            <li><button type="button" class="geo-linha geo-linha--acao" (click)="iniciar(m)">
              <span class="geo-selo geo-selo--destaque"><geo-icone nome="mais" /></span>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ rascunhoDe() === m.id ? 'Continuar visita prévia' : 'Visita prévia' }}</span>
                <span class="geo-linha__apoio">{{ m.titulo }}{{ rascunhoDe() === m.id ? ' · rascunho guardado no aparelho' : '' }}</span></span>
              <geo-icone nome="avancar" [tamanho]="18" /></button></li>
          }
          <li><button type="button" class="geo-linha geo-linha--acao" (click)="gerar('as-built')">
            <span class="geo-selo"><geo-icone nome="documento" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Gerar As Built</span><span class="geo-linha__apoio">Sai quando houver sinal</span></span></button></li>
          <li><button type="button" class="geo-linha geo-linha--acao" (click)="gerar('book')">
            <span class="geo-selo"><geo-icone nome="imagem" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Gerar book de fotos</span><span class="geo-linha__apoio">Sai quando houver sinal</span></span></button></li>
        </ul>
      } @else if (erro()) {
        <geo-vazio icone="sem_rede" titulo="Precisa de internet" texto="A documentação da obra é consultada no servidor. Conecte e tente de novo." />
      } @else {
        <div class="geo-esqueletos" role="status" aria-label="Carregando a documentação"></div>
      }
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .corpo { flex: 1; padding-bottom: var(--geo-e6); }
    .progresso { display: flex; flex-wrap: wrap; gap: var(--geo-e3); align-items: center; justify-content: space-between;
      margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .nc-contagem { display: inline-flex; align-items: center; gap: 4px; color: var(--geo-erro); font-weight: 600; }
    .restantes { margin: var(--geo-e3) var(--geo-margem) 0; width: calc(100% - 2 * var(--geo-margem)); }
    .perguntas { list-style: none; margin: var(--geo-e3) 0 0; padding: 0; display: grid; gap: var(--geo-e3); }
    .pergunta { display: grid; gap: var(--geo-e2); padding: var(--geo-e3) var(--geo-e4); border-left: 4px solid transparent; }
    .pergunta[data-situacao='NAO_CONFORME'] { border-left-color: var(--geo-erro); }
    .pergunta[data-situacao='CONFORME'] { border-left-color: var(--geo-ok); }
    .pergunta.sem-resposta { outline: 1.5px solid var(--geo-erro); }
    .enunciado { font: var(--geo-t-corpo-forte); }
    .opcional { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .opcoes { display: flex; flex-wrap: wrap; gap: var(--geo-e2); }
    .opcao { min-height: var(--geo-alvo); padding: 0 var(--geo-e4); border-radius: var(--geo-r-pilula); border: 1px solid var(--geo-borda-campo);
      background: var(--geo-superficie); color: var(--geo-texto); font: 500 .9375rem/1 var(--geo-fonte); display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; touch-action: manipulation; }
    .opcao:active { background: var(--geo-superficie-2); }
    .opcao[aria-pressed='true'] { background: var(--geo-destaque-suave); color: var(--geo-destaque); border-color: var(--geo-destaque); font-weight: 600; }
    .retorno { display: flex; gap: var(--geo-e2); align-items: flex-start; margin: 0; font: var(--geo-t-apoio); }
    .retorno--nc { padding: var(--geo-e2) var(--geo-e3); border-radius: var(--geo-r-campo, 10px); background: var(--geo-erro-suave); color: var(--geo-texto); }
    .retorno--nc geo-icone { color: var(--geo-erro); flex-shrink: 0; }
    .retorno--ok { color: var(--geo-ok); font-weight: 600; align-items: center; }
    .retorno--falta { color: var(--geo-erro); }
    .campo-erro { margin: var(--geo-e2) var(--geo-margem) 0; }
    .add-foto { justify-self: start; display: inline-flex; align-items: center; gap: var(--geo-e2); min-height: var(--geo-alvo); padding: 0 var(--geo-e2);
      margin-left: calc(-1 * var(--geo-e2)); border: 0; background: transparent; color: var(--geo-destaque); font: var(--geo-t-corpo-forte); cursor: pointer; }
    .parecer, .faltas { margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); font: var(--geo-t-apoio); }
    .parecer strong, .faltas strong { display: flex; align-items: center; gap: var(--geo-e2); font: var(--geo-t-corpo-forte); }
    .parecer ul, .faltas ul { margin: var(--geo-e2) 0 0; padding-left: 1.2em; display: grid; gap: 4px; }
    .parecer--nc, .faltas { background: var(--geo-erro-suave); }
    .parecer--ok { display: flex; gap: var(--geo-e2); align-items: center; background: var(--geo-ok-suave); }
    .sem-foto { color: var(--geo-erro); }
    .ir { border: 0; background: transparent; padding: 4px 0; color: var(--geo-destaque); font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
    .fotos-gerais { margin: 0 var(--geo-margem); }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem) 0; }
  `],
})
export class DocumentacaoObraComponent implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly servico = inject(SupervisaoService);
  private readonly toast = inject(ToastService);
  private readonly token = inject(TokenService);
  private readonly gps = inject(LocalizacaoService);
  private readonly rascunhos = inject(RascunhoService);
  private readonly loja = inject(RascunhoStore);
  private readonly injector = inject(Injector);
  readonly rede = inject(ConnectivityService);

  readonly temOpcoes = temOpcoes;
  readonly opcoesDe = opcoesDe;

  readonly id = this.rota.snapshot.paramMap.get('id') ?? '';
  readonly numero = this.rota.snapshot.queryParamMap.get('numero') ?? '';
  /** Nome e município da obra (vêm da busca): o supervisor confere que está na obra certa. */
  readonly subtitulo = [this.rota.snapshot.queryParamMap.get('titulo'), this.rota.snapshot.queryParamMap.get('municipio')]
    .filter(Boolean).join(' · ') || 'Documentação técnica';
  readonly doc = signal<DocumentacaoObra | null>(null);
  readonly erro = signal(false);
  readonly modelos = signal<ModeloChecklist[]>([]);
  readonly modelo = signal<ModeloChecklist | null>(null);
  readonly passo = signal(0);
  readonly respostas = signal<RespostasVisita>({});
  readonly observacoes = signal('');
  /** Colaborador responsável pela visita (o servidor exige): o do próprio usuário, se houver, ou um escolhido. */
  readonly responsavel = signal<string | null>(null);
  readonly fotos = signal<FotoVisita[]>([]);
  /** Pergunta em que o supervisor tocou "Adicionar foto" (as não conformes já mostram a câmera). */
  readonly fotoAberta = signal<string | null>(null);
  readonly tentou = signal(false);
  readonly salvando = signal(false);
  /** Modelo do rascunho guardado no aparelho, para o "Continuar". */
  readonly rascunhoDe = signal<string | null>(null);
  /** Visitas registradas neste aparelho desde que a tela abriu (já contam antes de a fila sair). */
  readonly visitasNaFila = signal(0);
  readonly colaboradores = signal<ColaboradorLocal[]>([]);
  private vinculo: VinculoRascunho | null = null;
  private posicao: { latitude: number; longitude: number; precisao: number | null } | null = null;

  readonly totalPassos = computed(() => (this.modelo()?.estrutura.grupos.length ?? 0) + 1);
  readonly passosVisuais = computed(() => Array.from({ length: this.totalPassos() }));
  readonly grupoAtual = computed(() => this.modelo()?.estrutura.grupos[this.passo()] ?? null);
  readonly tituloPasso = computed(() => this.grupoAtual()?.titulo ?? 'Resumo e envio');
  readonly respondidasNoGrupo = computed(() => (this.grupoAtual()?.perguntas ?? []).filter(p => situacao(p, this.respostas()[p.id]) !== null).length);
  readonly naoConformesNoGrupo = computed(() => (this.grupoAtual()?.perguntas ?? []).filter(p => situacao(p, this.respostas()[p.id]) === 'NAO_CONFORME').length);
  readonly restantesNoGrupo = computed(() => restantesConformes(this.grupoAtual()?.perguntas ?? [], this.respostas()));
  readonly ncs = computed(() => (this.modelo() ? naoConformidades(this.modelo()!, this.respostas()) : []));
  readonly faltas = computed(() => {
    const m = this.modelo();
    if (!m) return [];
    return m.estrutura.grupos.flatMap((g, passo) => faltando(g.perguntas, this.respostas()).map(pergunta => ({ grupo: g.titulo, pergunta, passo })));
  });

  async ngOnInit(): Promise<void> {
    try {
      const [doc, modelos] = await Promise.all([this.servico.documentacao(this.id), this.servico.modelos('VISITA_PREVIA')]);
      this.doc.set(doc);
      this.modelos.set(modelos);
    } catch {
      this.erro.set(true);
    }
    await this.vincularRascunho();
  }

  rotuloDoc = (d: { tipo: string; numeroVersao: number; status: string }): string =>
    `${d.tipo === 'BOOK' ? 'Book' : 'As Built'} v${d.numeroVersao}${d.status === 'CONCLUIDO' ? '' : ' (' + d.status.toLowerCase() + ')'}`;

  resumoVisitas(d: DocumentacaoObra): string {
    const total = d.visitas.length + this.visitasNaFila();
    if (!total) return 'Ainda não feita';
    const ultima = d.visitas[0];
    const nc = ultima ? (ultima.naoConformidades ? ` · ${ultima.naoConformidades} não ${ultima.naoConformidades === 1 ? 'conformidade' : 'conformidades'}` : ' · sem não conformidade') : '';
    return `${total} ${total === 1 ? 'registrada' : 'registradas'}${nc}${this.visitasNaFila() && !this.rede.isOnline() ? ' · sai quando houver sinal' : ''}`;
  }

  segmentos(p: PerguntaChecklist): { valor: string; rotulo: string }[] {
    return opcoesDe(p).map(o => ({ valor: o, rotulo: o === NAO_SE_APLICA ? 'N/A' : o }));
  }

  situacaoDe(p: PerguntaChecklist) {
    return situacao(p, this.respostas()[p.id]);
  }

  async iniciar(m: ModeloChecklist): Promise<void> {
    await this.carregarColaboradores();
    if (this.rascunhoDe() !== m.id) {
      this.limparFotos();
      this.respostas.set({});
      this.observacoes.set('');
      this.passo.set(0);
      this.responsavel.set(this.colaboradores().find(c => c.idUsuario === this.token.usuarioId())?.id ?? null);
    }
    this.tentou.set(false);
    this.modelo.set(m);
    void this.gps.agora(6000).then(p => (this.posicao = p));
    window.scrollTo({ top: 0 });
  }

  marcada(p: PerguntaChecklist, o: string): boolean {
    return !!this.respostas()[p.id]?.selecionadas?.includes(o);
  }

  marcar(p: PerguntaChecklist, o: string): void {
    this.respostas.update(rs => ({ ...rs, [p.id]: alternar(p, rs[p.id], o) }));
  }

  texto(p: PerguntaChecklist, valor: string): void {
    this.respostas.update(rs => ({ ...rs, [p.id]: { valor } as RespostaVisita }));
  }

  marcarRestantes(): void {
    const g = this.grupoAtual();
    if (g) this.respostas.update(rs => marcarRestantesComoConforme(g.perguntas, rs));
  }

  fotosDa(idPergunta: string | null): FotoExibida[] {
    return this.fotos().filter(f => f.idPergunta === idPergunta).map(f => ({ id: f.id, url: f.url }));
  }

  carimbo(detalhe: string): () => Promise<Carimbo> {
    return async () => {
      if (!this.posicao) this.posicao = await this.gps.agora(3000);
      return montarCarimbo({
        titulo: `Obra ${this.numero} · Visita prévia`, detalhe, data: new Date(),
        latitude: this.posicao?.latitude, longitude: this.posicao?.longitude, precisao: this.posicao?.precisao,
        autoria: this.token.nomeUsuario() ?? null, id: crypto.randomUUID(),
      });
    };
  }

  async adicionarFoto(idPergunta: string | null, ev: EvidenciaPreparada): Promise<void> {
    const id = ev.idLocal ?? crypto.randomUUID();
    // O arquivo vai para o rascunho na hora: abrir a câmera pode matar o app logo em seguida.
    const idAnexo = (await this.vinculo?.anexar(ev.arquivo, ev.nomeArquivo)) ?? null;
    this.fotos.update(fs => [...fs, { id, idPergunta, idAnexo, nome: ev.nomeArquivo, tipo: ev.contentType, blob: ev.arquivo, url: URL.createObjectURL(ev.arquivo) }]);
    await this.vinculo?.gravarEstadoAtual();
  }

  async removerFoto(id: string): Promise<void> {
    const foto = this.fotos().find(f => f.id === id);
    if (!foto) return;
    URL.revokeObjectURL(foto.url);
    this.fotos.update(fs => fs.filter(f => f.id !== id));
    if (foto.idAnexo) await this.loja.removerAnexo(foto.idAnexo);
  }

  continuar(): void {
    this.irPara(this.passo() + 1);
  }

  irPara(passo: number): void {
    this.passo.set(Math.max(0, Math.min(this.totalPassos() - 1, passo)));
    this.fotoAberta.set(null);
    window.scrollTo({ top: 0 });
  }

  async salvarVisita(): Promise<void> {
    const m = this.modelo();
    this.tentou.set(true);
    if (!m || this.salvando()) return;
    if (this.faltas().length) {
      this.toast.error(this.faltas().length === 1 ? 'Falta 1 resposta obrigatória. Toque nela na lista.' : `Faltam ${this.faltas().length} respostas obrigatórias. Toque nelas na lista.`);
      return;
    }
    if (!this.responsavel()) {
      this.toast.error('Escolha quem fez a visita.');
      return;
    }
    this.salvando.set(true);
    try {
      const hoje = new Date();
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      // A pergunta já vai pelo id (o relatório mostra o enunciado): a legenda fica livre.
      const fotos: FotoVisitaFila[] = await Promise.all(this.fotos().map(async f => ({
        id: f.id, idPergunta: f.idPergunta, legenda: null,
        nome: f.nome, tipo: f.tipo, bytes: await f.blob.arrayBuffer(), enviada: false,
      })));
      await this.servico.registrarVisita(this.id, {
        idModelo: m.id, dataVisita: data, idColaborador: this.responsavel(), observacoes: this.observacoes().trim() || null,
        respostas: montarRespostas(m, this.respostas()),
      }, fotos);
      await this.vinculo?.concluir();
      const nc = this.ncs().length;
      this.limparFotos();
      this.modelo.set(null);
      this.rascunhoDe.set(null);
      this.visitasNaFila.update(n => n + 1);
      const quando = this.rede.isOnline() ? 'Visita prévia registrada' : 'Visita guardada: sai quando houver sinal';
      this.toast.success(nc ? `${quando} com ${nc} não ${nc === 1 ? 'conformidade' : 'conformidades'}` : quando);
      await this.vincularRascunho();
    } finally {
      this.salvando.set(false);
    }
  }

  async gerar(tipo: 'as-built' | 'book'): Promise<void> {
    await this.servico.gerar(this.id, tipo);
    this.toast.success(tipo === 'book' ? 'Book pedido: fica pronto no web' : 'As Built pedido: fica pronto no web');
  }

  /** Sair da visita mantém o rascunho no aparelho: "Continuar visita prévia" volta no mesmo passo. */
  sair(): void {
    if (this.modelo()) this.rascunhoDe.set(this.modelo()!.id);
    this.modelo.set(null);
  }

  voltar(): void {
    if (this.modelo()) {
      if (this.passo() > 0) this.irPara(this.passo() - 1);
      else this.sair();
      return;
    }
    void this.router.navigate(['/supervisao']);
  }

  private async carregarColaboradores(): Promise<void> {
    if (this.colaboradores().length) return;
    const lista = (await db.colaboradores.toArray()).filter(c => c.ativo).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));
    this.colaboradores.set(lista);
  }

  private limparFotos(): void {
    this.fotos().forEach(f => URL.revokeObjectURL(f.url));
    this.fotos.set([]);
  }

  /** Rascunho por obra: respostas, passo, responsável e as fotos (no armazenamento de anexos do rascunho). */
  private async vincularRascunho(): Promise<void> {
    this.vinculo = this.rascunhos.vincular<RascunhoVisita>({
      chave: `visita-previa:${this.id}`,
      ler: () => ({
        idModelo: this.modelo()?.id ?? this.rascunhoDe(), passo: this.passo(), respostas: this.respostas(), observacoes: this.observacoes(),
        responsavel: this.responsavel(), fotos: this.fotos().map(({ blob: _b, url: _u, ...f }) => f),
      }),
      aplicar: async (v) => {
        if (!v.idModelo || !this.modelos().some(m => m.id === v.idModelo)) return;
        await this.carregarColaboradores();
        this.respostas.set(v.respostas ?? {});
        this.observacoes.set(v.observacoes ?? '');
        this.responsavel.set(v.responsavel ?? null);
        this.passo.set(v.passo ?? 0);
        const fotos: FotoVisita[] = [];
        for (const f of v.fotos ?? []) {
          const anexo = f.idAnexo ? await this.loja.lerAnexo(f.idAnexo) : undefined;
          if (anexo?.blob) fotos.push({ ...f, blob: anexo.blob, url: URL.createObjectURL(anexo.blob) });
        }
        this.fotos.set(fotos);
        this.rascunhoDe.set(v.idModelo);
      },
      titulo: () => `Visita prévia · Obra ${this.numero}`,
      rota: () => this.router.url,
      anexos: () => this.fotos().map(f => f.idAnexo).filter((id): id is string => !!id),
      vazio: (v) => !v.idModelo || (!Object.keys(v.respostas).length && !v.fotos.length && !v.observacoes.trim()),
      injector: this.injector,
    });
    await this.vinculo.restaurado;
  }
}
