import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, computed, signal, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../../../core/db/db.service';
import { OutboxService } from '../../../core/sync/outbox.service';
import { ToastService } from '../../../core/ui/toast.service';
import { InspecaoLocal, OutboxItem, FormularioLocal } from '../../../core/db/models';
import { InspecaoService } from '../../../core/sst/inspecao.service';
import {
  EvidenciaInspecaoResponse,
  EvidenciaLocal,
} from '../../../core/sst/inspecao.models';
import { environment } from '../../../../environments/environment';
import { SessaoService } from '../../../core/sessao/sessao.service';
import { BarraTopoComponent, EstadoEnvio, FolhaComponent, IconeComponent, StatusEnvioComponent, VazioComponent, dataCurta, hora } from '../../../ui';

/** Detalhe de uma inspeção: estado de envio, onde e quem, fotos, respostas e desvios com a ação tomada. */
@Component({
  selector: 'app-inspecao-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, StatusEnvioComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="nomeTipoInspecao() || 'Inspeção'" [subtitulo]="quando()" (voltar)="goBack()" />

    @if (isLoading()) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 160px"></div><div class="geo-esqueleto" style="height: 200px"></div>
      </div>
    } @else if (inspecao(); as ins) {
      <section class="geo-faixa-estado" [class.geo-faixa-estado--atencao]="estado() === 'conflict'" [class.geo-faixa-estado--erro]="estado() === 'error'" aria-live="polite">
        @if (estado(); as e) { <geo-status-envio [estado]="e" [rotulo]="rotuloEstado()" /> } @else { <span class="geo-etiqueta">{{ rotuloEstado() }}</span> }
        <p>{{ explicacao() }}</p>
      </section>
      @if (outboxItem()?.serverOperationId) { <p class="protocolo geo-num">Protocolo #{{ outboxItem()?.serverOperationId }}</p> }

      <div class="resumo">
        <div><strong class="geo-num">{{ respostas().length }}</strong><span>{{ respostas().length === 1 ? 'resposta' : 'respostas' }}</span></div>
        <div [class.alerta]="desvios().length > 0"><strong class="geo-num">{{ desvios().length }}</strong><span>{{ desvios().length === 1 ? 'desvio' : 'desvios' }}</span></div>
        <div><strong class="geo-num">{{ totalEvidencias() }}</strong><span>{{ totalEvidencias() === 1 ? 'foto' : 'fotos' }}</span></div>
      </div>

      <dl class="geo-dados">
        @if (nomeProcesso()) { <div><dt>Processo</dt><dd>{{ nomeProcesso() }}</dd></div> }
        @if (nomeEquipe()) { <div><dt>Equipe</dt><dd>{{ nomeEquipe() }}</dd></div> }
        @if (nomeBaseOperacional()) { <div><dt>Base</dt><dd>{{ nomeBaseOperacional() }}</dd></div> }
        @if (nomeVeiculo()) { <div><dt>Veículo</dt><dd class="geo-num">{{ nomeVeiculo() }}</dd></div> }
        @if (ins.latitude && ins.longitude) { <div><dt>Local</dt><dd class="geo-num">{{ coord(ins.latitude) }}, {{ coord(ins.longitude) }}</dd></div> }
        @if (ins.observacoes) { <div><dt>Observações</dt><dd class="texto">{{ ins.observacoes }}</dd></div> }
      </dl>

      @if (totalEvidencias()) {
        <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--servico" aria-hidden="true"><geo-icone nome="camera" [tamanho]="14" /></span>
          <span>Fotos</span><span class="geo-contagem">{{ totalEvidencias() }}</span></h2>
        <ul class="fotos" aria-label="Fotos da inspeção">
          @for (ev of evidenciasLocais(); track ev.idLocal) {
            <li>
              @if (previewLocal(ev.idLocal); as url) { <img [src]="url" [alt]="ev.nomeArquivo"> } @else { <span class="sem-foto"><geo-icone nome="camera" />{{ ev.nomeArquivo }}</span> }
              <span class="geo-etiqueta" [class]="'geo-etiqueta geo-etiqueta--' + tomEvidencia(ev.estado)">{{ rotuloEstadoEvidencia(ev) }}</span>
            </li>
          }
          @if (!evidenciasLocais().length) {
            @for (ev of evidenciasRemotas(); track ev.id) {
              <li>
                @if (evidenciasCarregadas()[ev.id]; as url) { <img [src]="url" [alt]="ev.nomeArquivo"> }
                @else if (evidenciasCarregando()[ev.id]) { <span class="geo-esqueleto sem-foto"></span> }
                @else { <span class="sem-foto"><geo-icone nome="camera" />{{ ev.nomeArquivo }}</span> }
              </li>
            }
          }
        </ul>
      }

      @if (desvios().length) {
        <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--retirado" aria-hidden="true"><geo-icone nome="desvio" [tamanho]="14" /></span>
          <span>Desvios</span><span class="geo-contagem">{{ desvios().length }}</span></h2>
        <ul class="desvios" aria-label="Desvios">
          @for (d of desvios(); track d.idPergunta) {
            <li>
              <strong>{{ getPergunta(d.idPergunta)?.enunciado || 'Pergunta' }}</strong>
              @if (getPergunta(d.idPergunta)?.desvioPorColaborador === false && !d.colaboradores?.length) { <p class="equipe">Item da equipe ou do veículo</p> }
              @if (d.descricao) { <p><span class="rot">Problema</span>{{ d.descricao }}</p> }
              @if (d.acaoCorretiva) { <p><span class="rot">O que foi feito</span>{{ d.acaoCorretiva }}</p> }
              @if (d.status === 'RESOLVIDO' && d.dataResolucao) { <p class="resolvido"><geo-icone nome="check" [tamanho]="16" />Resolvido em {{ data(d.dataResolucao) }}</p> }
              @if (d.fotoBase64) { <img [src]="d.fotoBase64" alt="Foto do desvio"> }
              @else if (d.id && loadedAnexos()[d.id]) { <img [src]="loadedAnexos()[d.id]" alt="Foto do desvio"> }
              @else if (d.id && anexosLoading()[d.id]) { <span class="geo-esqueleto foto-desvio"></span> }
            </li>
          }
        </ul>
      }

      @if (respostas().length && gruposRespostas().length) {
        @let tot = totaisChecklist();
        <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--aplicado" aria-hidden="true"><geo-icone nome="check" [tamanho]="14" /></span>
          <span>Checklist</span><span class="geo-contagem">{{ respostas().length }}</span></h2>
        @if (tot.c + tot.nc + tot.na) {
          <div class="filtro" role="group" aria-label="Mostrar respostas">
            <button type="button" class="filtro__op" [attr.aria-pressed]="!soNaoConformes()" (click)="soNaoConformes.set(false)">Todas</button>
            <button type="button" class="filtro__op" [attr.aria-pressed]="soNaoConformes()" (click)="soNaoConformes.set(true)" [disabled]="!tot.nc">Não conformes <span class="geo-num">{{ tot.nc }}</span></button>
            <span class="filtro__resumo geo-num">{{ tot.c }} C · {{ tot.na }} NA</span>
          </div>
        }
        @for (g of gruposRespostas(); track g.id) {
          @if (!soNaoConformes() || g.nc) {
            <h3 class="grupo-resp"><span>{{ g.titulo }}</span>@if (g.nc) { <span class="nc geo-num">{{ g.nc }} NC</span> }</h3>
            <ul class="geo-grupo" [attr.aria-label]="g.titulo">
              @for (it of g.itens; track it.id) {
                @if (!soNaoConformes() || it.tipo === 'nc') {
                  <li><div class="geo-linha resposta">
                    <span class="geo-linha__texto">
                      <span class="enunciado">{{ it.enunciado }}</span>
                      @if (it.orientacao) { <span class="pergunta">{{ it.orientacao }}</span> }
                      @if (it.tipo === 'livre') { <span class="valor">{{ it.valor }}</span> }
                    </span>
                    @if (it.tipo !== 'livre') {
                      <span class="tag" [class.tag--nc]="it.tipo === 'nc'" [class.tag--na]="it.tipo === 'na'">
                        <geo-icone [nome]="it.tipo === 'nc' ? 'desvio' : it.tipo === 'na' ? 'menos' : 'check'" [tamanho]="14" />{{ it.valor }}</span>
                    }
                  </div></li>
                }
              }
            </ul>
          }
        }
      } @else if (respostas().length) {
        <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--aplicado" aria-hidden="true"><geo-icone nome="check" [tamanho]="14" /></span>
          <span>Respostas</span><span class="geo-contagem">{{ respostas().length }}</span></h2>
        <ul class="geo-grupo" aria-label="Respostas">
          @for (r of respostas(); track r.idPergunta) {
            <li><div class="geo-linha resposta">
              <span class="geo-linha__texto">
                <span class="pergunta">{{ getPergunta(r.idPergunta)?.enunciado || 'Pergunta' }}</span>
                <span class="valor">{{ valorResposta(r) }}</span>
              </span>
            </div></li>
          }
        </ul>
      }
      <div class="geo-respiro"></div>

      @if (showActionsFooter()) {
        <footer class="geo-rodape-acoes">
          @if (canDiscard()) { <button type="button" class="geo-btn geo-btn--perigo" (click)="abrirFolha('descartar')">Descartar</button> }
          @if (isResultadoIncerto()) {
            <button type="button" class="geo-btn geo-btn--principal" (click)="abrirFolha('reenviar')" [disabled]="isRetrying()">
              <geo-icone nome="atualizar" [tamanho]="18" />{{ isRetrying() ? 'Reenviando…' : 'Reenviar' }}</button>
          }
        </footer>
      }
    } @else {
      <geo-vazio icone="inspecao" titulo="Inspeção não encontrada" texto="Ela não está mais neste aparelho.">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="goBack()">Ver inspeções</button>
      </geo-vazio>
    }

    <geo-folha [aberta]="folha() === 'descartar'" (fechar)="abrirFolha(null)" titulo="Descartar esta inspeção?"
      descricao="Ela sai da fila de envio e fica marcada como cancelada neste aparelho.">
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="abrirFolha(null)">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="discard()">Descartar</button>
      </div>
    </geo-folha>
    <geo-folha [aberta]="folha() === 'reenviar'" (fechar)="abrirFolha(null)" titulo="Reenviar mesmo assim?"
      descricao="O sinal caiu no envio: a inspeção pode já estar no servidor. Reenviar agora pode criar uma cópia.">
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="abrirFolha(null)">Voltar</button>
        <button type="button" class="geo-btn geo-btn--principal" (click)="retry()">Reenviar</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    /* Nada encolhe: com conteúdo maior que a tela, a página rola (grupos com overflow:hidden eram cortados). */
    :host > * { flex-shrink: 0; }
    .protocolo { margin: var(--geo-e2) var(--geo-e5) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--geo-e2); margin: var(--geo-e3) var(--geo-e3) 0; }
    .resumo div { display: grid; justify-items: center; padding: var(--geo-e3) var(--geo-e2); border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .resumo strong { font: 600 1.625rem/1.1 var(--geo-fonte); }
    .resumo span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .resumo .alerta { background: var(--geo-atencao-suave); }
    .resumo .alerta strong { color: var(--geo-atencao); }
    dd.texto { font: var(--geo-t-corpo); white-space: pre-line; }
    .fotos { list-style: none; margin: 0; padding: 0 var(--geo-e3); display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--geo-e2); }
    .fotos li { position: relative; border-radius: var(--geo-r-grupo); overflow: hidden; background: var(--geo-superficie); aspect-ratio: 4 / 3; }
    .fotos img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .fotos .geo-etiqueta { position: absolute; left: 6px; bottom: 6px; }
    .sem-foto { width: 100%; height: 100%; display: grid; place-items: center; align-content: center; gap: 4px; padding: var(--geo-e2);
      font: var(--geo-t-apoio); color: var(--geo-texto-2); text-align: center; overflow-wrap: anywhere; }
    .desvios { list-style: none; margin: 0; padding: 0 var(--geo-e3); display: grid; gap: var(--geo-e2); }
    .desvios li { display: grid; gap: var(--geo-e2); padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie);
      border-left: 4px solid var(--geo-atencao); }
    .desvios strong { font: var(--geo-t-corpo-forte); }
    .desvios p { margin: 0; font: var(--geo-t-corpo); overflow-wrap: anywhere; }
    .desvios .rot { display: block; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .desvios .resolvido { display: flex; align-items: center; gap: 4px; color: var(--geo-ok); font-weight: 600; }
    .desvios img, .foto-desvio { width: 100%; height: 160px; object-fit: cover; border-radius: 8px; display: block; }
    .resposta { align-items: flex-start; }
    .pergunta { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .valor { font: var(--geo-t-corpo-forte); overflow-wrap: anywhere; }
    .enunciado { font: var(--geo-t-corpo); overflow-wrap: anywhere; }
    .desvios .equipe { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .filtro { display: flex; align-items: center; gap: var(--geo-e2); flex-wrap: wrap; padding: 0 var(--geo-e3) var(--geo-e2); }
    .filtro__op { min-height: 40px; padding: 0 var(--geo-e3); border-radius: var(--geo-r-pilula); border: 1.5px solid var(--geo-linha); background: var(--geo-superficie);
      color: var(--geo-texto); font: 500 .875rem/1 var(--geo-fonte); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .filtro__op[aria-pressed='true'] { border-color: var(--geo-destaque); background: var(--geo-destaque-suave); }
    .filtro__op:disabled { opacity: .5; cursor: default; }
    .filtro__resumo { margin-left: auto; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .grupo-resp { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); margin: 0; padding: var(--geo-e4) var(--geo-e5) var(--geo-e2);
      font: var(--geo-t-secao); color: var(--geo-texto-2); }
    .grupo-resp .nc { padding: 2px 8px; border-radius: var(--geo-r-pilula); background: var(--geo-atencao-suave); color: var(--geo-texto); font: 600 .75rem/1.4 var(--geo-fonte); }
    .tag { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--geo-r-pilula); font: 600 .8125rem/1.2 var(--geo-fonte);
      background: var(--geo-ok-suave); color: var(--geo-texto); }
    .tag geo-icone { color: var(--geo-ok); }
    .tag--nc { background: var(--geo-atencao-suave); }
    .tag--nc geo-icone { color: var(--geo-atencao); }
    .tag--na { background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .tag--na geo-icone { color: var(--geo-texto-2); }
  `],
})
export class InspecaoDetalheComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dbService = inject(DbService);
  private outboxService = inject(OutboxService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);
  private inspecaoService = inject(InspecaoService);
  private readonly sessao = inject(SessaoService);
  readonly folha = signal<'descartar' | 'reenviar' | null>((this.sessao.estadoTela<{ folha?: 'descartar' | 'reenviar' | null }>().folha) ?? null);

  id = '';
  readonly isLoading = signal(true);
  readonly isRetrying = signal(false);
  
  readonly inspecao = signal<any | null>(null);
  readonly outboxItem = signal<OutboxItem | null>(null);

  readonly canDiscard = computed(() => !!this.outboxItem() && this.outboxService.canDiscard(this.outboxItem()));
  readonly isEmTratamentoBackoffice = computed(() => this.outboxService.isEmTratamentoBackoffice(this.outboxItem()));
  readonly isResultadoIncerto = computed(() => this.outboxService.isResultadoIncerto(this.outboxItem()));
  readonly showActionsFooter = computed(() => (this.canDiscard() || this.isResultadoIncerto()) && !this.isEmTratamentoBackoffice());
  
  readonly formulario = signal<FormularioLocal | null>(null);
  readonly nomeTipoInspecao = signal<string>('');
  readonly nomeProcesso = signal<string>('');
  readonly nomeEquipe = signal<string>('');
  readonly nomeBaseOperacional = signal<string>('');
  readonly nomeVeiculo = signal<string>('');


  readonly respostas = signal<any[]>([]);
  readonly desvios = signal<any[]>([]);
  readonly loadedAnexos = signal<Record<string, string>>({});
  readonly anexosLoading = signal<Record<string, boolean>>({});
  readonly anexosError = signal<Record<string, boolean>>({});

  // Evidências fotográficas da inspeção.
  readonly evidenciasLocais = signal<EvidenciaLocal[]>([]);
  readonly evidenciasRemotas = signal<EvidenciaInspecaoResponse[]>([]);
  readonly evidenciasCarregadas = signal<Record<string, string>>({});
  readonly evidenciasCarregando = signal<Record<string, boolean>>({});
  private readonly previewsLocais = signal<Record<string, string>>({});

  readonly totalEvidencias = computed(() =>
    this.evidenciasLocais().length || this.evidenciasRemotas().length
  );

  ngOnDestroy() {
    const urls = this.loadedAnexos();
    Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    Object.values(this.evidenciasCarregadas()).forEach(url => URL.revokeObjectURL(url));
    Object.values(this.previewsLocais()).forEach(url => URL.revokeObjectURL(url));
  }

  previewLocal(idLocal: string): string | undefined {
    return this.previewsLocais()[idLocal];
  }

  rotuloEstadoEvidencia(evidencia: EvidenciaLocal): string {
    switch (evidencia.estado) {
      case 'ENVIADA': return 'Enviada';
      case 'ENVIANDO': return 'Enviando';
      case 'ERRO': return 'Falha no envio';
      default: return 'Aguardando envio';
    }
  }

  /**
   * A imagem é servida pelo backend sob o mesmo JWT — não existe URL pública,
   * então cada foto é buscada pelo interceptor de autenticação e exibida via
   * `ObjectURL`, revogado ao destruir o componente.
   */
  private async carregarEvidencias(inspecao: InspecaoLocal): Promise<void> {
    const locais = inspecao.evidencias ?? [];
    this.evidenciasLocais.set(locais);
    for (const evidencia of locais) {
      try {
        const url = URL.createObjectURL(evidencia.arquivo);
        this.previewsLocais.update(previews => ({ ...previews, [evidencia.idLocal]: url }));
      } catch {
        // HEIC sem suporte de renderização cai no cartão com ícone e nome.
      }
    }

    const remotas = inspecao.evidenciasRemotas ?? [];
    this.evidenciasRemotas.set(remotas);
    if (locais.length > 0 || remotas.length === 0) return;

    for (const evidencia of remotas) {
      try {
        this.evidenciasCarregando.update(prev => ({ ...prev, [evidencia.id]: true }));
        const blob = await firstValueFrom(
          this.inspecaoService.baixarEvidencia(this.id, evidencia.id)
        );
        const objectUrl = URL.createObjectURL(blob);
        this.evidenciasCarregadas.update(prev => ({ ...prev, [evidencia.id]: objectUrl }));
      } catch {
        // Offline ou falha de download: o cartão com o nome do arquivo permanece.
      } finally {
        this.evidenciasCarregando.update(prev => ({ ...prev, [evidencia.id]: false }));
      }
    }
  }

  async fetchAnexos(desviosArray: any[]) {
    for (const d of desviosArray) {
      if (d.anexos && d.anexos.length > 0) {
        for (const a of d.anexos) {
          if (a.tipo === 'FOTO') {
            try {
              this.anexosLoading.update(prev => ({ ...prev, [d.id]: true }));
              const url = `${environment.apiBaseUrl}/v1/sst/inspecoes/${this.id}/desvios/${d.id}/anexos/${a.id}`;
              const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
              const objectUrl = URL.createObjectURL(blob);
              this.loadedAnexos.update(prev => ({ ...prev, [d.id]: objectUrl }));
            } catch (e) {
              console.error('Failed to load anexo', e);
              this.anexosError.update(prev => ({ ...prev, [d.id]: true }));
            } finally {
              this.anexosLoading.update(prev => ({ ...prev, [d.id]: false }));
            }
          }
        }
      }
    }
  }

  getPergunta(id: string) {
    const f = this.formulario();
    if (!f) return null;
    for (const g of f.grupos) {
      const p = g.perguntas.find(x => x.id === id);
      if (p) return p;
    }
    return null;
  }

  readonly soNaoConformes = signal(false);

  /** Respostas na ordem do formulário, por grupo, com o resultado do checklist (C, NC, NA) ou o valor livre. */
  readonly gruposRespostas = computed(() => {
    const f = this.formulario();
    if (!f) return [];
    const porPergunta = new Map(this.respostas().map(r => [r.idPergunta, r]));
    return f.grupos.map(g => {
      const itens = g.perguntas.filter(p => porPergunta.has(p.id)).map(p => {
        const r = porPergunta.get(p.id);
        const opcoes = (r.opcoesSelecionadas ?? []).map((id: string) => p.opcoes.find(o => o.id === id)).filter(Boolean);
        const checklist = p.tipoResposta === 'MULTIPLA_ESCOLHA' && p.opcoes.some(o => o.geraDesvio)
          && p.opcoes.some(o => o.texto.trim().toLowerCase() === 'conforme');
        let tipo: 'c' | 'nc' | 'na' | 'livre' = 'livre';
        if (opcoes.some((o: { geraDesvio: boolean }) => o.geraDesvio)) tipo = 'nc';
        else if (checklist) tipo = opcoes.some((o: { texto: string }) => o.texto.trim().toLowerCase() === 'não se aplica') ? 'na' : 'c';
        return { id: p.id, enunciado: p.enunciado, orientacao: p.orientacao ?? null, valor: this.valorResposta(r), tipo };
      });
      return {
        id: g.id, titulo: g.titulo, itens,
        nc: itens.filter(i => i.tipo === 'nc').length,
      };
    }).filter(g => g.itens.length);
  });

  readonly totaisChecklist = computed(() => {
    const t = { c: 0, nc: 0, na: 0 };
    for (const g of this.gruposRespostas()) {
      for (const i of g.itens) if (i.tipo !== 'livre') t[i.tipo]++;
    }
    return t;
  });

  getOpcao(idPergunta: string, idOpcao: string) {
    const p = this.getPergunta(idPergunta);
    if (!p) return null;
    return p.opcoes.find(x => x.id === idOpcao);
  }

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.id) {
      this.goBack();
      return;
    }
    await this.loadData();
  }

  async loadData() {
    try {
      this.isLoading.set(true);
      const ins = await this.dbService.getInspecao(this.id);
      
      if (!ins) {
        this.isLoading.set(false);
        return;
      }

      this.inspecao.set(ins);
      this.carregarEvidencias(ins);

      // Carregar Formulario
      if (ins.idFormulario) {
        const forms = await this.dbService.getFormularios();
        const f = forms.find(x => x.id === ins.idFormulario);
        if (f) this.formulario.set(f);
      }

      // Carregar Tipo de Inspeção
      if (ins.nomeTipoInspecao) {
        this.nomeTipoInspecao.set(ins.nomeTipoInspecao);
      } else if (ins.tipoInspecao?.nome) {
        this.nomeTipoInspecao.set(ins.tipoInspecao.nome);
      } else if (ins.idTipoInspecao) {
        const tipos = await this.dbService.getTiposInspecao();
        const t = tipos.find(x => x.id === ins.idTipoInspecao);
        if (t) this.nomeTipoInspecao.set(t.nome);
      }

      // Carregar Processo
      const anyIns = ins as any;
      if (anyIns.idProcesso) {
        const procs = await this.dbService.getProcessos();
        const p = procs.find(x => x.id === anyIns.idProcesso);
        if (p) this.nomeProcesso.set(p.nome);
      }

      // Carregar Equipe
      if (anyIns.idEquipe) {
        const eqs = await this.dbService.getEquipes();
        const e = eqs.find(x => x.id === anyIns.idEquipe);
        if (e) this.nomeEquipe.set(e.codigo);
      }

      if (ins.nomeBaseOperacional) {
        this.nomeBaseOperacional.set(ins.nomeBaseOperacional);
      } else if (ins.idBaseOperacional) {
        const bases = await this.dbService.getBasesOperacionaisAtivas();
        const base = bases.find(item => item.id === ins.idBaseOperacional);
        if (base) this.nomeBaseOperacional.set(base.nome);
      }

      // Carregar Veiculo
      if (anyIns.idVeiculo) {
        const veiculos = await this.dbService.getVeiculos();
        const v = veiculos.find(x => x.id === anyIns.idVeiculo);
        if (v) this.nomeVeiculo.set(`${v.placa} - ${v.modelo}`);
      }

      // Buscar se existe outbox
      let item: any = null;
      if (ins.statusSync === 'PENDENTE' || ins.statusSync === 'ERRO' || ins.statusSync === 'RESULTADO_INCERTO') {
        const pendentes = await this.outboxService.getPendingItems();
        const erros = await this.outboxService.getErrorItems();
        const porId = await this.outboxService.getById(this.id);
        const allOutbox = [...pendentes, ...erros, ...(porId ? [porId] : [])];
        
        item = allOutbox.find(o => 
          o.endpoint === '/_orchestrator/inspecao/lancar' &&
          (o.id === this.id || o.payload?.id === this.id || o.payload?.tempId === this.id)
        );
        
        if (item) {
          this.outboxItem.set(item);
        }
      }

      // Carregar report de draftData ou outbox
      if (item && item.payload) {
        const request = item.payload.request ?? item.payload;
        this.respostas.set(request.respostas || []);
        this.desvios.set(request.desvios || []);
      } else if (ins.draftData) {
        try {
          const parsed = JSON.parse(ins.draftData);
          this.respostas.set(parsed.respostas || []);
          this.desvios.set(parsed.desvios || []);
          this.fetchAnexos(parsed.desvios || []);
        } catch (e) {}
      }
    } catch (e) {
      console.error(e);
      this.toast.error('Não foi possível abrir esta inspeção.');
    } finally {
      this.isLoading.set(false);
    }
  }

  readonly estado = computed<EstadoEnvio | null>(() => {
    const ins = this.inspecao();
    const fila = this.outboxItem()?.status;
    if (this.isEmTratamentoBackoffice() || this.isResultadoIncerto() || fila === 'RESULTADO_INCERTO' || ins?.statusSync === 'RESULTADO_INCERTO') return 'conflict';
    if (fila === 'ERRO' || ins?.statusSync === 'ERRO') return ins?.status === 'CANCELADA' ? null : 'error';
    if (ins?.statusSync === 'PENDENTE') return 'queued';
    if (ins?.status === 'CANCELADA' || ins?.status === 'EM_ANDAMENTO') return null;
    return 'synced';
  });
  readonly rotuloEstado = computed(() => {
    if (this.isEmTratamentoBackoffice()) return 'Com o escritório';
    if (this.estado() === 'conflict') return 'A confirmar';
    const st = this.inspecao()?.status;
    if (!this.estado()) return st === 'CANCELADA' ? 'Cancelada' : st === 'EM_ANDAMENTO' ? 'Não terminada' : '';
    return undefined;
  });
  readonly explicacao = computed(() => {
    if (this.isEmTratamentoBackoffice()) {
      const det = this.outboxItem()?.erroDetalhes;
      return 'Recebida e guardada para o escritório analisar.' + (det ? ' ' + det : '');
    }
    switch (this.estado()) {
      case 'conflict': return 'O sinal caiu durante o envio. Ela pode já estar no servidor.';
      case 'error': return this.outboxItem()?.erroDetalhes || this.inspecao()?.erroDetalhes || 'O servidor não aceitou esta inspeção.';
      case 'queued': return 'Guardada no aparelho com as fotos. Sai sozinha quando houver internet.';
      case 'synced': return 'Registrada no sistema.';
      default: return this.inspecao()?.status === 'CANCELADA' ? 'Esta inspeção foi descartada.' : 'Ainda não foi finalizada.';
    }
  });
  readonly quando = computed(() => {
    const d = this.inspecao()?.dataRealizacao;
    return d ? dataCurta(d) + ' às ' + hora(d) : '';
  });

  data(v: string): string {
    return dataCurta(v) + ' às ' + hora(v);
  }

  coord(n: number): string {
    return n.toFixed(5).replace('.', ',');
  }

  tomEvidencia(estado: EvidenciaLocal['estado']): string {
    return estado === 'ENVIADA' ? 'ok' : estado === 'ERRO' ? 'erro' : estado === 'ENVIANDO' ? 'destaque' : 'atencao';
  }

  valorResposta(r: { idPergunta: string; opcoesSelecionadas?: string[]; valorTexto?: string; valorNumero?: number; valorData?: string }): string {
    const partes: string[] = [];
    for (const op of r.opcoesSelecionadas ?? []) partes.push(this.getOpcao(r.idPergunta, op)?.texto ?? '—');
    if (r.valorTexto) partes.push(r.valorTexto);
    if (r.valorNumero !== undefined && r.valorNumero !== null) partes.push(String(r.valorNumero).replace('.', ','));
    if (r.valorData) partes.push(dataCurta(r.valorData));
    return partes.join(' · ') || '—';
  }

  abrirFolha(f: 'descartar' | 'reenviar' | null): void {
    this.folha.set(f);
    this.sessao.definirEstadoTela({ folha: f });
  }

  async retry() {
    const item = this.outboxItem();
    if (!item) return;

    try {
      this.isRetrying.set(true);
      await this.outboxService.updateStatus(item.id, 'PENDENTE');
      const ins = this.inspecao();
      if (ins) {
        ins.statusSync = 'PENDENTE';
        ins.erroDetalhes = undefined;
        await this.dbService.saveInspecao(ins);
      }
      this.abrirFolha(null);
      this.toast.success('Reenvio na fila.');
      this.goBack();
    } catch (e) {
      this.toast.error('Não foi possível reenviar agora.');
    } finally {
      this.isRetrying.set(false);
    }
  }

  async discard() {
    const item = this.outboxItem();
    if (!item) return;

    try {
      const removed = await this.outboxService.discard(item.id);
      if (!removed) {
        this.toast.error('Esta inspeção foi preservada e aguarda tratamento administrativo.');
        return;
      }
      const ins = this.inspecao();
      if (ins) {
        ins.status = 'CANCELADA';
        ins.statusSync = 'ERRO';
        await this.dbService.saveInspecao(ins);
      }
      this.toast.success('Inspeção descartada.');
      this.goBack();
    } catch (e) {
      this.toast.error('Não foi possível descartar agora.');
    } finally {
      this.abrirFolha(null);
    }
  }

  goBack() {
    this.router.navigate(['/inspecoes']);
  }
}
