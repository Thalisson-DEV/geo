import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BarraTopoComponent, IconeComponent, VazioComponent } from '../../ui';
import { ToastService } from '../../core/ui/toast.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { DocumentacaoObra, ModeloChecklist, PerguntaChecklist, SupervisaoService } from '../../core/obras/supervisao.service';
import { db } from '../../core/db/app-db';
import { ColaboradorLocal } from '../../core/db/models';
import { TokenService } from '../../core/auth/token.service';

/**
 * Documentação técnica da obra pelo supervisor no app: resumo (visitas, fichas As Built, documentos), visita prévia
 * pelo modelo de checklist e geração do As Built e do book. Os lançamentos entram na fila: sem sinal, saem depois.
 */
@Component({
  selector: 'app-documentacao-obra',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="'Obra ' + numero" [subtitulo]="subtitulo" (voltar)="voltar()" />
    @if (doc(); as d) {
      @if (!modelo()) {
        <h2 class="geo-secao">Situação</h2>
        <ul class="geo-grupo">
          <li class="geo-linha"><span class="geo-selo" [class.geo-selo--ok]="d.visitaRealizada || visitasNaFila() > 0"><geo-icone nome="inspecao" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Visita prévia</span>
              <span class="geo-linha__apoio">{{ totalVisitas() ? totalVisitas() + (totalVisitas() === 1 ? ' registrada' : ' registradas') + (rede.isOnline() ? '' : ' · sai quando houver sinal') : 'Ainda não feita' }}</span></span></li>
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
              <span class="geo-linha__texto"><span class="geo-linha__titulo">Visita prévia</span><span class="geo-linha__apoio">{{ m.titulo }}</span></span>
              <geo-icone nome="avancar" [tamanho]="18" /></button></li>
          }
          <li><button type="button" class="geo-linha geo-linha--acao" (click)="gerar('as-built')">
            <span class="geo-selo"><geo-icone nome="documento" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Gerar As Built</span><span class="geo-linha__apoio">Sai quando houver sinal</span></span></button></li>
          <li><button type="button" class="geo-linha geo-linha--acao" (click)="gerar('book')">
            <span class="geo-selo"><geo-icone nome="imagem" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Gerar book de fotos</span><span class="geo-linha__apoio">Sai quando houver sinal</span></span></button></li>
        </ul>
      } @else {
        <h2 class="geo-secao">{{ modelo()!.titulo }}</h2>
        @for (g of modelo()!.estrutura.grupos; track g.titulo) {
          <h3 class="grupo">{{ g.titulo }}</h3>
          @for (p of g.perguntas; track p.id) {
            <div class="pergunta">
              <span class="enunciado">{{ p.enunciado }}{{ p.obrigatoria ? '' : ' (opcional)' }}</span>
              @if (p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'MULTIPLA_ESCOLHA') {
                <div class="opcoes" role="group" [attr.aria-label]="p.enunciado">
                  @for (o of opcoesDe(p); track o) {
                    <button type="button" class="opcao" [attr.aria-pressed]="marcada(p, o)" (click)="marcar(p, o)">{{ o }}</button>
                  }
                </div>
              } @else {
                <input class="geo-input" [type]="p.tipo === 'NUMERO' ? 'number' : p.tipo === 'DATA' ? 'date' : 'text'" [value]="respostas()[p.id]?.valor ?? ''"
                  [attr.aria-label]="p.enunciado" (input)="texto(p, $any($event.target).value)">
              }
            </div>
          }
        }
        <label class="geo-campo"><span>Responsável pela visita</span>
          <select class="geo-input" [value]="responsavel() ?? ''" (change)="responsavel.set($any($event.target).value || null)" data-testid="responsavel-visita">
            <option value="">Escolha quem fez a visita</option>
            @for (c of colaboradores(); track c.id) { <option [value]="c.id" [selected]="c.id === responsavel()">{{ c.nomeCompleto }}</option> }
          </select></label>
        <label class="geo-campo"><span>Observações gerais (opcional)</span>
          <textarea class="geo-input" rows="3" maxlength="2000" [value]="observacoes()" (input)="observacoes.set($any($event.target).value)"></textarea></label>
        @if (faltando().length) { <p class="falta" role="status">{{ faltando().length === 1 ? 'Falta 1 resposta obrigatória.' : 'Faltam ' + faltando().length + ' respostas obrigatórias.' }}</p> }
        <div class="geo-respiro"></div>
        <div class="geo-rodape-acoes" data-acao-fixa>
          <button type="button" class="geo-btn geo-btn--neutro" (click)="modelo.set(null)">Cancelar</button>
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="faltando().length > 0 || !responsavel()" (click)="salvarVisita()">Registrar visita</button>
        </div>
      }
    } @else if (erro()) {
      <geo-vazio icone="sem_rede" titulo="Precisa de internet" texto="A documentação da obra é consultada no servidor. Conecte e tente de novo." />
    }
  `,
  styles: [`
    .grupo { margin: var(--geo-e4) var(--geo-margem) var(--geo-e2); font: var(--geo-t-corpo-forte); }
    .pergunta { display: grid; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-margem); }
    .enunciado { font: var(--geo-t-corpo); }
    .opcoes { display: flex; flex-wrap: wrap; gap: var(--geo-e2); }
    .opcao { min-height: var(--geo-alvo); padding: 0 var(--geo-e4); border-radius: var(--geo-r-pilula); border: 1px solid var(--geo-borda-campo);
      background: var(--geo-superficie); color: var(--geo-texto); font: 500 .9375rem/1 var(--geo-fonte); }
    .opcao[aria-pressed='true'] { background: var(--geo-destaque-suave); color: var(--geo-destaque); border: 2px solid var(--geo-destaque); padding: 0 calc(var(--geo-e4) - 1px); font-weight: 600; }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem) 0; }
    .falta { margin: var(--geo-e2) var(--geo-margem); font: var(--geo-t-apoio); color: var(--geo-erro); }
  `],
})
export class DocumentacaoObraComponent implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly servico = inject(SupervisaoService);
  private readonly toast = inject(ToastService);
  readonly rede = inject(ConnectivityService);

  readonly id = this.rota.snapshot.paramMap.get('id') ?? '';
  readonly numero = this.rota.snapshot.queryParamMap.get('numero') ?? '';
  /** Nome e município da obra (vêm da busca): o supervisor confere que está na obra certa. */
  readonly subtitulo = [this.rota.snapshot.queryParamMap.get('titulo'), this.rota.snapshot.queryParamMap.get('municipio')]
    .filter(Boolean).join(' · ') || 'Documentação técnica';
  readonly doc = signal<DocumentacaoObra | null>(null);
  readonly erro = signal(false);
  readonly modelos = signal<ModeloChecklist[]>([]);
  readonly modelo = signal<ModeloChecklist | null>(null);
  readonly respostas = signal<Record<string, { valor?: string; selecionadas?: string[] }>>({});
  readonly observacoes = signal('');
  /** Colaborador responsável pela visita (o servidor exige): o do próprio usuário, se houver, ou um escolhido. */
  readonly responsavel = signal<string | null>(null);
  /** Visitas registradas neste aparelho desde que a tela abriu (já contam antes de a fila sair). */
  readonly visitasNaFila = signal(0);
  readonly totalVisitas = computed(() => (this.doc()?.visitas.length ?? 0) + this.visitasNaFila());
  readonly colaboradores = signal<ColaboradorLocal[]>([]);
  private readonly token = inject(TokenService);
  readonly faltando = computed(() => (this.modelo()?.estrutura.grupos ?? []).flatMap(g => g.perguntas)
    .filter(p => p.obrigatoria && !this.respondida(p)));

  async ngOnInit(): Promise<void> {
    try {
      const [doc, modelos] = await Promise.all([this.servico.documentacao(this.id), this.servico.modelos('VISITA_PREVIA')]);
      this.doc.set(doc);
      this.modelos.set(modelos);
    } catch {
      this.erro.set(true);
    }
  }

  rotuloDoc = (d: { tipo: string; numeroVersao: number; status: string }): string =>
    `${d.tipo === 'BOOK' ? 'Book' : 'As Built'} v${d.numeroVersao}${d.status === 'CONCLUIDO' ? '' : ' (' + d.status.toLowerCase() + ')'}`;

  opcoesDe(p: PerguntaChecklist): string[] {
    return p.aceitaNaoSeAplica ? [...p.opcoes, 'Não se aplica'] : p.opcoes;
  }

  async iniciar(m: ModeloChecklist): Promise<void> {
    this.respostas.set({});
    this.observacoes.set('');
    const lista = (await db.colaboradores.toArray()).filter(c => c.ativo)
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));
    this.colaboradores.set(lista);
    this.responsavel.set(lista.find(c => c.idUsuario === this.token.usuarioId())?.id ?? null);
    this.modelo.set(m);
  }

  marcada(p: PerguntaChecklist, o: string): boolean {
    const r = this.respostas()[p.id];
    return p.tipo === 'MULTIPLA_ESCOLHA' ? !!r?.selecionadas?.includes(o) : r?.valor === o;
  }

  marcar(p: PerguntaChecklist, o: string): void {
    this.respostas.update(rs => {
      const atual = rs[p.id] ?? {};
      if (p.tipo === 'MULTIPLA_ESCOLHA') {
        const sel = atual.selecionadas ?? [];
        return { ...rs, [p.id]: { selecionadas: sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o] } };
      }
      return { ...rs, [p.id]: { valor: o } };
    });
  }

  texto(p: PerguntaChecklist, valor: string): void {
    this.respostas.update(rs => ({ ...rs, [p.id]: { valor } }));
  }

  async salvarVisita(): Promise<void> {
    const m = this.modelo();
    if (!m || this.faltando().length || !this.responsavel()) return;
    // Pergunta com opções (escolha única ou múltipla) vai em `selecionadas`; texto, número e data, em `valor`.
    const respostas = m.estrutura.grupos.flatMap(g => g.perguntas).map(p => {
      const r = this.respostas()[p.id] ?? {};
      const naoSeAplica = r.valor === 'Não se aplica';
      const comOpcoes = p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'MULTIPLA_ESCOLHA';
      const selecionadas = naoSeAplica ? [] : p.tipo === 'MULTIPLA_ESCOLHA' ? r.selecionadas ?? [] : r.valor ? [r.valor] : [];
      return { idPergunta: p.id, valor: naoSeAplica || comOpcoes ? null : r.valor ?? null, selecionadas: comOpcoes ? selecionadas : [], naoSeAplica };
    });
    const hoje = new Date();
    const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    await this.servico.registrarVisita(this.id, { idModelo: m.id, dataVisita: data, idColaborador: this.responsavel(), observacoes: this.observacoes().trim() || null, respostas });
    this.modelo.set(null);
    this.visitasNaFila.update(n => n + 1);
    this.toast.success(this.rede.isOnline() ? 'Visita prévia registrada' : 'Visita guardada: sai quando houver sinal');
  }

  async gerar(tipo: 'as-built' | 'book'): Promise<void> {
    await this.servico.gerar(this.id, tipo);
    this.toast.success(tipo === 'book' ? 'Book pedido: fica pronto no web' : 'As Built pedido: fica pronto no web');
  }

  voltar(): void {
    if (this.modelo()) {
      this.modelo.set(null);
      return;
    }
    void this.router.navigate(['/supervisao']);
  }

  private respondida(p: PerguntaChecklist): boolean {
    const r = this.respostas()[p.id];
    return !!(r?.valor?.toString().trim() || r?.selecionadas?.length);
  }
}
