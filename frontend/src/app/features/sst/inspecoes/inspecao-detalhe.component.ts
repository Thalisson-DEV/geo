import { ICONE_GRAVIDADE_DESVIO } from '../../../core/models/sst.models';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextareaComponent,
  GeoTone
} from '@geo/ui';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AccordionModule } from 'primeng/accordion';
import { DesvioAnexosComponent } from './desvio-anexos.component';
import { AnexoDesvioGaleria, EvidenciasInspecaoComponent } from './evidencias-inspecao.component';
import { InspecaoSegurancaHistoricoComponent } from './inspecao-seguranca-historico/inspecao-seguranca-historico.component';

import { SstService } from '../../../core/services/sst.service';
import { RhService } from '../../../core/services/rh.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  AnexoDesvioResponse,
  AtualizarCabecalhoInspecaoRequest,
  DesvioSegurancaResponse,
  EvidenciaInspecaoResponse,
  FormularioInspecaoResponse,
  GRAVIDADE_BADGE,
  GRAVIDADE_LABELS,
  GravidadeDesvio,
  InspecaoSegurancaResponse,
  OpcaoRespostaResponse,
  PerguntaResponse,
  STATUS_DESVIO_BADGE,
  STATUS_DESVIO_LABELS,
  STATUS_INSPECAO_BADGE,
  STATUS_INSPECAO_LABELS,
  StatusDesvio,
  StatusInspecao,
  TipoInspecaoResponse,
  TratarDesvioRequest,
  isTipoObjetivo
} from '../../../core/models/sst.models';
import {
  BaseOperacionalResponse,
  ColaboradorResponse,
  EquipeResponse,
  ProcessoNegocioResponse,
  VeiculoResponse
} from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';

declare var L: any;

@Component({
  selector: 'app-sst-inspecao-detalhe',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    GeoAsyncStateComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
    AnalisarComCopilotoComponent,
    ButtonModule,
    TooltipModule,
    AccordionModule,
    DesvioAnexosComponent,
    EvidenciasInspecaoComponent,
    InspecaoSegurancaHistoricoComponent
  ],
  templateUrl: './inspecao-detalhe.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../../execucao/relatorios/relatorio.css', './inspecao-detalhe.component.css']
})
export class InspecaoDetalheComponent implements OnInit, OnDestroy {
  private sst = inject(SstService);
  private rh = inject(RhService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);

  @ViewChild('historicoComp') protected historicoComp?: InspecaoSegurancaHistoricoComponent;

  protected readonly timelineValue = signal<string | number | (string | number)[] | null | undefined>(undefined);
  protected readonly isTimelineOpen = computed(() => {
    const val = this.timelineValue();
    if (!val) return false;
    return val === 'timeline' || (Array.isArray(val) && (val as any[]).includes('timeline'));
  });

  protected loading = signal(true);
  protected inspecao = signal<InspecaoSegurancaResponse | null>(null);
  protected formulario = signal<FormularioInspecaoResponse | null>(null);

  /** Apenas o criador da inspeção pode editar o cabeçalho */
  protected podeEditarCabecalho = computed(() => {
    const insp = this.inspecao();
    const user = this.auth.currentUser();
    return Boolean(insp && user && insp.idInspetor === user.id);
  });

  // Lookups para edição do cabeçalho
  protected lookupsCarregados = false;
  protected tiposInspecao = signal<TipoInspecaoResponse[]>([]);
  protected processos = signal<ProcessoNegocioResponse[]>([]);
  protected basesOperacionais = signal<BaseOperacionalResponse[]>([]);
  protected veiculos = signal<VeiculoResponse[]>([]);
  protected equipes = signal<EquipeResponse[]>([]);
  protected colaboradoresDisponiveis = signal<{ id: string; nome: string }[]>([]);
  protected colaboradorSelecionadoParaAdicionar: { id: string; nome: string } | null = null;

  // Estado do modal de edição
  protected dialogEdicaoCabecalho = false;
  protected salvandoCabecalho = signal(false);
  protected edicaoIdTipoInspecao = '';
  protected edicaoIdProcesso = '';
  protected edicaoIdBaseOperacional = '';
  protected edicaoIdVeiculo: string | null = null;
  protected edicaoIdEquipe: string | null = null;
  protected edicaoDataRealizacao: Date | null = null;
  protected edicaoObservacoes = '';
  protected edicaoLatitude: number | null = null;
  protected edicaoLongitude: number | null = null;
  protected edicaoColaboradores = signal<{ id: string; nome: string }[]>([]);
  protected justificativaEdicao = '';

  private perguntasById = new Map<string, PerguntaResponse>();
  private opcoesById = new Map<string, OpcaoRespostaResponse>();
  /** Opções marcadas como geradoras de desvio, para realçar respostas no relatório. */
  private opcoesDesvio = new Set<string>();
  private map: any;

  protected dialogTratamento = false;
  protected salvandoTratamento = signal(false);
  protected tratamento: TratarDesvioRequest = { status: 'EM_TRATAMENTO' };
  protected tratamentoPrazo: Date | null = null;
  private desvioEmTratamento: DesvioSegurancaResponse | null = null;
  protected desvioInicialmenteResolvido = false;

  /** Só o inspetor que registrou a inspeção trata os desvios e mexe nas evidências (o servidor também recusa os demais). */
  protected podeTratar = computed(() => this.podeEditarCabecalho() && (this.auth.currentUser()?.permissoes?.includes('sst:inspecao:write') ?? false));

  protected isObjetivo = isTipoObjetivo;

  protected statusDesvioOptions = (Object.keys(STATUS_DESVIO_LABELS) as StatusDesvio[]).map((value) => ({
    label: STATUS_DESVIO_LABELS[value],
    value,
    icon: value === 'RESOLVIDO' ? 'pi pi-check' : value === 'EM_TRATAMENTO' ? 'pi pi-clock' : 'pi pi-times'
  }));

  /**
   * Anexos dos desvios achatados e resolvidos contra o formulário (enunciado da
   * pergunta e opção marcada) — vão para a galeria única junto das evidências da
   * inspeção. Esta tela é quem tem o formulário carregado, por isso a resolução
   * do contexto acontece aqui.
   */
  protected anexosDesviosGaleria = computed<AnexoDesvioGaleria[]>(() => {
    const insp = this.inspecao();
    this.formulario(); // Reage a atualizações no formulário
    if (!insp?.desvios) return [];
    const itens: AnexoDesvioGaleria[] = [];
    for (const d of insp.desvios) {
      if (!d.anexos?.length) continue;
      const perguntaEnunciado = this.perguntaEnunciado(d.idPergunta);
      const opcaoTexto = this.opcaoTexto(d.idOpcaoResposta);
      for (const a of d.anexos) {
        // Itens ainda na fila offline não existem no servidor: sem binário para baixar.
        if (a.id.startsWith('local')) continue;
        itens.push({
          idDesvio: d.id,
          idAnexo: a.id,
          tipo: a.tipo,
          contexto: a.contexto,
          nomeArquivo: a.nomeArquivo,
          contentType: a.contentType,
          tamanhoBytes: a.tamanhoBytes,
          dataCriacao: a.dataCriacao,
          perguntaEnunciado,
          opcaoTexto
        });
      }
    }
    return itens;
  });

  protected readonly emitidoEm = new Date();
  /** Desvio cujas evidências estão abertas no drawer. */
  protected readonly desvioAberto = signal<DesvioSegurancaResponse | null>(null);

  protected readonly codigo = computed(() => (this.inspecao()?.id ?? '').substring(0, 8).toUpperCase());

  protected readonly desviosVencidos = computed(() => (this.inspecao()?.desvios ?? []).filter((d) => this.prazoVencido(d)).length);

  /** Situação do documento, do ponto de vista dos desvios: é o que interessa a quem lê o relatório. */
  protected readonly situacao = computed<{ rotulo: string; tom: GeoTone; icone: string }>(() => {
    const r = this.resumo();
    if (!r.desvios) return { rotulo: 'Sem desvios', tom: 'success', icone: 'pi-check-circle' };
    if (this.desviosVencidos()) return { rotulo: 'Desvio vencido', tom: 'danger', icone: 'pi-exclamation-circle' };
    if (r.pendentes) return { rotulo: 'Desvios em aberto', tom: 'warning', icone: 'pi-clock' };
    return { rotulo: 'Desvios tratados', tom: 'success', icone: 'pi-check-circle' };
  });

  protected readonly faixa = computed<{ tom: GeoTone; icone: string; titulo: string; texto: string }>(() => {
    const r = this.resumo();
    const vencidos = this.desviosVencidos();
    if (!r.desvios) {
      return { tom: 'success', icone: 'pi pi-check-circle', titulo: 'Inspeção sem desvios', texto: 'Todos os itens avaliados estavam conformes ou não se aplicavam.' };
    }
    if (vencidos) {
      return {
        tom: 'danger', icone: 'pi pi-exclamation-circle', titulo: vencidos === 1 ? '1 desvio com prazo vencido' : `${vencidos} desvios com prazo vencido`,
        texto: 'O prazo de correção passou e o desvio ainda não foi resolvido. Trate ou ajuste o prazo.'
      };
    }
    if (r.pendentes) {
      return {
        tom: 'warning', icone: 'pi pi-clock', titulo: r.pendentes === 1 ? '1 desvio em aberto' : `${r.pendentes} desvios em aberto`,
        texto: 'Acompanhe a ação corretiva de cada um e registre a resolução quando a equipe corrigir.'
      };
    }
    return { tom: 'success', icone: 'pi pi-check-circle', titulo: 'Desvios resolvidos', texto: r.desvios === 1 ? 'O desvio apontado nesta inspeção já foi resolvido.' : `Os ${r.desvios} desvios apontados nesta inspeção já foram resolvidos.` };
  });

  /** Números do checklist C/NC/NA; sem checklist, cai no cálculo por respostas. */
  protected readonly indicadores = computed(() => {
    const form = this.formulario();
    this.inspecao();
    const r = form ? this.resumoChecklist(form.grupos) : { conformes: 0, naoConformes: 0, naoAplica: 0 };
    const aplicaveis = r.conformes + r.naoConformes;
    const conformidade = aplicaveis ? Math.round((r.conformes * 100) / aplicaveis) : this.resumo().conformidade;
    const tom: GeoTone = conformidade >= 90 ? 'success' : conformidade >= 70 ? 'warning' : 'danger';
    const temChecklist = aplicaveis + r.naoAplica > 0;
    const res = this.resumo();
    const legenda = temChecklist
      ? `${r.conformes} de ${aplicaveis} ${aplicaveis === 1 ? 'item conforme' : 'itens conformes'}`
      : `${res.respostas - res.desvios} de ${res.respostas} respostas sem desvio`;
    return { ...r, avaliados: temChecklist ? aplicaveis + r.naoAplica : res.respostas, conformidade, tom, temChecklist, legenda };
  });

  protected desviosDoColaborador(idColaborador: string): number {
    return (this.inspecao()?.desvios ?? []).filter((d) => d.colaboradores.some((c) => c.id === idColaborador)).length;
  }

  protected totalAnexos(d: DesvioSegurancaResponse): number {
    return (d.anexos as AnexoDesvioResponse[] | undefined)?.length ?? 0;
  }

  /** A função pode não vir no resumo do colaborador. */
  protected funcaoDe(c: ColaboradorResponse): string {
    return (c.funcao as ColaboradorResponse['funcao'] | undefined)?.nome || '—';
  }

  protected proximoDesvioPendente(): DesvioSegurancaResponse | null {
    const desvios = this.inspecao()?.desvios ?? [];
    return desvios.find((d) => this.prazoVencido(d)) ?? desvios.find((d) => d.status !== 'RESOLVIDO') ?? null;
  }

  protected abrirDesvio(desvio: DesvioSegurancaResponse): void {
    this.desvioAberto.set(desvio);
  }

  protected desvioTratadoEnunciado(): string | undefined {
    return this.desvioEmTratamento ? this.perguntaEnunciado(this.desvioEmTratamento.idPergunta) : undefined;
  }

  protected tomResposta(p: PerguntaResponse): GeoTone {
    if (this.respostaDesvio(p)) return 'danger';
    if (this.respostaNaoAplica(p)) return 'neutral';
    return this.respostaTexto(p) === '—' ? 'neutral' : 'success';
  }

  protected iconeResposta(p: PerguntaResponse): string {
    if (this.respostaDesvio(p)) return 'pi-times-circle';
    if (this.respostaNaoAplica(p)) return 'pi-minus-circle';
    return 'pi-check-circle';
  }

  protected readonly iconeGravidade: Record<string, string> = ICONE_GRAVIDADE_DESVIO;

  protected tomGravidade(g: GravidadeDesvio): GeoTone {
    return g === 'BAIXA' ? 'neutral' : g === 'MEDIA' ? 'warning' : 'danger';
  }

  protected tomStatusDesvio(s: StatusDesvio): GeoTone {
    return s === 'RESOLVIDO' ? 'success' : s === 'EM_TRATAMENTO' ? 'warning' : 'danger';
  }

  protected iconeStatusDesvio(s: StatusDesvio): string {
    return s === 'RESOLVIDO' ? 'pi-check' : s === 'EM_TRATAMENTO' ? 'pi-clock' : 'pi-exclamation-circle';
  }

  /** Resumo executivo (números grandes e legíveis para leigos no topo do relatório). */
  protected resumo = computed(() => {
    const insp = this.inspecao();
    if (!insp) {
      return { colaboradores: 0, respostas: 0, desvios: 0, resolvidos: 0, pendentes: 0, conformidade: 100 };
    }
    const desvios = insp.desvios ?? [];
    const resolvidos = desvios.filter((d) => d.status === 'RESOLVIDO').length;
    const pendentes = desvios.length - resolvidos;
    const respostas = insp.respostas?.length ?? 0;
    const conformidade =
      respostas > 0 ? Math.max(0, Math.min(100, Math.round((1 - desvios.length / respostas) * 100))) : 100;
    return {
      colaboradores: insp.colaboradoresInspecionados?.length ?? 0,
      respostas,
      desvios: desvios.length,
      resolvidos,
      pendentes,
      conformidade
    };
  });

  /** Classe de cor do medidor de conformidade conforme a faixa. */
  protected conformidadeTom = computed(() => {
    const c = this.resumo().conformidade;
    if (c >= 90) return { texto: 'text-emerald-700 dark:text-emerald-400', barra: 'bg-emerald-500', fundo: 'bg-emerald-50 dark:bg-emerald-950/50', borda: 'border-emerald-200 dark:border-emerald-800', anel: 'text-emerald-500' };
    if (c >= 70) return { texto: 'text-amber-700 dark:text-amber-400', barra: 'bg-amber-500', fundo: 'bg-amber-50 dark:bg-amber-950/50', borda: 'border-amber-200 dark:border-amber-800', anel: 'text-amber-500' };
    return { texto: 'text-red-700 dark:text-red-400', barra: 'bg-red-500', fundo: 'bg-red-50 dark:bg-red-950/50', borda: 'border-red-200 dark:border-red-800', anel: 'text-red-500' };
  });

  ngOnInit() {
    const id = this.route.snapshot?.paramMap?.get('id');
    if (id) {
      this.carregar(id);
    } else {
      this.loading.set(false);
    }
    this.route.paramMap?.subscribe(params => {
      const pId = params.get('id');
      if (pId && pId !== id) {
        this.carregar(pId);
      }
    });
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private carregar(id: string) {
    this.loading.set(true);
    this.sst.buscarInspecaoPorId(id).subscribe({
      next: (insp) => {
        this.inspecao.set(insp);
        this.loading.set(false);
        if (insp.formulario?.id) this.carregarFormulario(insp.formulario.id);
        if (insp.latitude != null && insp.longitude != null) {
          setTimeout(() => this.initMap(insp.latitude!, insp.longitude!), 200);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro ao carregar', detail: getErrorMessage(err) });
      }
    });
  }

  private carregarFormulario(idFormulario: string) {
    this.sst.buscarFormularioPorId(idFormulario).subscribe({
      next: (form) => {
        this.formulario.set(form);
        this.perguntasById.clear();
        this.opcoesById.clear();
        this.opcoesDesvio.clear();
        (form.grupos ?? [])
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .forEach((g) => {
            g.perguntas = (g.perguntas ?? []).slice().sort((a, b) => a.ordem - b.ordem);
            g.perguntas.forEach((p) => {
              this.perguntasById.set(p.id, p);
              (p.opcoes ?? []).forEach((o) => {
                this.opcoesById.set(o.id, o);
                if (o.geraDesvio) this.opcoesDesvio.add(o.id);
              });
            });
          });
      },
      error: () => this.formulario.set(null)
    });
  }

  private initMap(lat: number, lng: number) {
    const el = document.getElementById('map-inspecao');
    if (!el || typeof L === 'undefined') return;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.map = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
    L.circleMarker([lat, lng], {
      radius: 9,
      fillColor: '#2563eb',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    })
      .addTo(this.map)
      .bindPopup('Local da inspeção');
    this.map.setView([lat, lng], 16);
    setTimeout(() => this.map.invalidateSize(), 250);
  }

  protected respostaTexto(pergunta: PerguntaResponse): string {
    const resposta = this.inspecao()?.respostas.find((r) => r.idPergunta === pergunta.id);
    if (!resposta) return '—';
    if (isTipoObjetivo(pergunta.tipoResposta)) {
      const textos = (resposta.opcoesSelecionadas ?? []).map((id) => this.opcoesById.get(id)?.texto ?? id);
      return textos.length ? textos.join(', ') : '—';
    }
    if (pergunta.tipoResposta === 'TEXTO') return resposta.valorTexto || '—';
    if (pergunta.tipoResposta === 'NUMERO') return resposta.valorNumero != null ? String(resposta.valorNumero) : '—';
    if (pergunta.tipoResposta === 'DATA') {
      return resposta.valorData ? new Date(resposta.valorData + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    }
    return '—';
  }

  /** True se a resposta marcada gera desvio (para realçar em vermelho). */
  protected respostaDesvio(pergunta: PerguntaResponse): boolean {
    const resposta = this.inspecao()?.respostas.find((r) => r.idPergunta === pergunta.id);
    if (!resposta) return false;
    return (resposta.opcoesSelecionadas ?? []).some((id) => this.opcoesDesvio.has(id));
  }

  protected readonly soNaoConformes = signal(false);

  /** Checklist C/NC/NA: até três opções, uma "Conforme" e outra gerando desvio. */
  protected ehChecklist(p: PerguntaResponse): boolean {
    return p.tipoResposta === 'MULTIPLA_ESCOLHA' && p.opcoes.length <= 3 && p.opcoes.some((o) => o.geraDesvio)
      && p.opcoes.some((o) => o.texto.trim().toLowerCase() === 'conforme');
  }

  protected respostaNaoAplica(p: PerguntaResponse): boolean {
    const resposta = this.inspecao()?.respostas.find((r) => r.idPergunta === p.id);
    return (resposta?.opcoesSelecionadas ?? []).some((id) => this.opcoesById.get(id)?.texto.trim().toLowerCase() === 'não se aplica');
  }

  /** Contagem de respostas do checklist (perguntas C/NC/NA) dos grupos informados. */
  protected resumoChecklist(grupos: { perguntas: PerguntaResponse[] }[]): { conformes: number; naoConformes: number; naoAplica: number } {
    const r = { conformes: 0, naoConformes: 0, naoAplica: 0 };
    for (const g of grupos) {
      for (const p of g.perguntas) {
        if (!this.ehChecklist(p) || this.respostaTexto(p) === '—') continue;
        if (this.respostaDesvio(p)) r.naoConformes++;
        else if (this.respostaNaoAplica(p)) r.naoAplica++;
        else r.conformes++;
      }
    }
    return r;
  }

  protected isOpcaoSelecionada(idPergunta: string, idOpcao: string): boolean {
    const resposta = this.inspecao()?.respostas.find((r) => r.idPergunta === idPergunta);
    return resposta?.opcoesSelecionadas?.includes(idOpcao) ?? false;
  }

  protected perguntaEnunciado(idPergunta: string): string {
    return this.perguntasById.get(idPergunta)?.enunciado ?? 'Pergunta';
  }
  protected opcaoTexto(idOpcao: string): string {
    return this.opcoesById.get(idOpcao)?.texto ?? '';
  }

  protected prazoVencido(desvio: DesvioSegurancaResponse): boolean {
    if (!desvio.prazo || desvio.status === 'RESOLVIDO') return false;
    const prazo = new Date(desvio.prazo + 'T23:59:59');
    return prazo.getTime() < Date.now();
  }

  protected  abrirTratamento(desvio: DesvioSegurancaResponse) {
    if (!desvio) return;
    this.desvioEmTratamento = desvio;
    this.desvioInicialmenteResolvido = desvio.status === 'RESOLVIDO';
    this.tratamento = {
      status: desvio.status || 'EM_TRATAMENTO',
      acaoCorretiva: desvio.acaoCorretiva || ''
    };
    this.tratamentoPrazo = desvio.prazo ? new Date(desvio.prazo + 'T00:00:00') : null;
    this.dialogTratamento = true;
  }

  protected salvarTratamento() {
    const insp = this.inspecao();
    const desvio = this.desvioEmTratamento;
    if (!insp || !desvio || !this.tratamento?.status) return;

    const request: TratarDesvioRequest = {
      status: this.tratamento.status,
      acaoCorretiva: this.tratamento.acaoCorretiva?.trim() || undefined,
      prazo: this.formatDateOnly(this.tratamentoPrazo)
    };

    this.salvandoTratamento.set(true);
    this.sst.tratarDesvio(insp.id, desvio.id, request).subscribe({
      next: (res) => {
        this.salvandoTratamento.set(false);
        this.dialogTratamento = false;
        if (res) this.inspecao.set(res);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Desvio atualizado.' });
      },
      error: (err) => {
        this.salvandoTratamento.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: getErrorMessage(err) });
      }
    });
  }

  private formatDateOnly(date: Date | null): string | null {
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  protected gravidadeLabel(g: GravidadeDesvio) {
    return GRAVIDADE_LABELS[g] ?? g;
  }
  protected gravidadeBadge(g: GravidadeDesvio) {
    return GRAVIDADE_BADGE[g] ?? 'bg-slate-50 text-slate-600';
  }
  /** Cor sólida por gravidade — usada no filete lateral do card de desvio. */
  protected gravidadeCor(g: GravidadeDesvio): string {
    const cores: Record<GravidadeDesvio, string> = {
      BAIXA: '#94a3b8',
      MEDIA: '#f59e0b',
      ALTA: '#f97316',
      CRITICA: '#ef4444'
    };
    return cores[g] ?? '#94a3b8';
  }
  protected statusDesvioLabel(s: StatusDesvio) {
    return STATUS_DESVIO_LABELS[s] ?? s;
  }
  protected statusDesvioBadge(s: StatusDesvio) {
    return STATUS_DESVIO_BADGE[s] ?? 'bg-slate-50 text-slate-600';
  }
  protected statusInspLabel(s: StatusInspecao) {
    return STATUS_INSPECAO_LABELS[s] ?? s;
  }
  protected statusInspBadge(s: StatusInspecao) {
    return STATUS_INSPECAO_BADGE[s] ?? 'bg-slate-50 text-slate-600';
  }

  protected onEvidenciasMudadas(evidencias: EvidenciaInspecaoResponse[]) {
    this.inspecao.update((insp) => (insp ? { ...insp, evidencias } : null));
  }

  protected onAnexoMudado(desvio: DesvioSegurancaResponse, novosAnexos: AnexoDesvioResponse[]) {
    desvio.anexos = novosAnexos;
    this.inspecao.update((insp) => (insp ? { ...insp, desvios: [...insp.desvios] } : null));
  }

  protected printReport() {
    window.print();
  }

  protected voltar() {
    this.router.navigate(['/sst/inspecoes']);
  }

  protected rolarParaHistorico() {
    this.timelineValue.set('timeline');
    setTimeout(() => {
      const el = document.getElementById('secao-historico');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  }

  protected carregarLookupsEdicao() {
    if (this.lookupsCarregados) return;
    this.lookupsCarregados = true;

    this.sst.listarOpcoesTiposInspecao().subscribe({
      next: (res) => this.tiposInspecao.set(res),
      error: () => {}
    });

    this.rh.listarProcessosAtivos().subscribe({
      next: (res) => this.processos.set(res.content ?? []),
      error: () => {}
    });

    this.rh.listarBasesOperacionais({ ativo: true, page: 0, size: 100, sort: 'nome,asc' }).subscribe({
      next: (res) => this.basesOperacionais.set(res.content ?? []),
      error: () => {}
    });

    this.rh.listarVeiculos({ ativo: true, size: 500 }).subscribe({
      next: (res) => this.veiculos.set(res.content ?? []),
      error: () => {}
    });

    this.rh.listarEquipes({ ativo: true, size: 500 }).subscribe({
      next: (res) => this.equipes.set(res.content ?? []),
      error: () => {}
    });

    this.rh.listarColaboradores({ ativo: true, size: 1000 }).subscribe({
      next: (res) => {
        const list = (res.content ?? []).map((c) => ({
          id: c.id,
          nome: c.nomeCompleto || c.id
        }));
        this.colaboradoresDisponiveis.set(list);
      },
      error: () => {}
    });
  }

  protected navegarParaEdicao() {
    const insp = this.inspecao();
    if (!insp) return;
    this.router.navigate(['/sst/inspecoes', insp.id, 'editar']);
  }

  protected abrirEdicaoCabecalho() {
    const insp = this.inspecao();
    if (!insp) return;

    this.carregarLookupsEdicao();

    this.edicaoIdTipoInspecao = insp.tipoInspecao?.id || '';
    this.edicaoIdProcesso = insp.processo?.id || '';
    this.edicaoIdBaseOperacional = insp.baseOperacional?.id || '';
    this.edicaoIdVeiculo = insp.veiculo?.id || null;
    this.edicaoIdEquipe = insp.equipe?.id || null;
    this.edicaoDataRealizacao = insp.dataRealizacao ? new Date(insp.dataRealizacao) : new Date();
    this.edicaoObservacoes = insp.observacoes || '';
    this.edicaoLatitude = insp.latitude ?? null;
    this.edicaoLongitude = insp.longitude ?? null;
    this.edicaoColaboradores.set(
      (insp.colaboradoresInspecionados ?? []).map((c) => ({ id: c.id, nome: c.nomeCompleto }))
    );
    this.colaboradorSelecionadoParaAdicionar = null;
    this.justificativaEdicao = '';

    this.dialogEdicaoCabecalho = true;
  }

  protected onSelecionarEquipeEdicao() {
    if (!this.edicaoIdEquipe) return;
    this.rh.buscarEquipePorId(this.edicaoIdEquipe).subscribe({
      next: (equipe) => {
        if (!equipe?.membros?.length) return;
        const atuais = [...this.edicaoColaboradores()];
        equipe.membros.forEach((m) => {
          if (!atuais.some((c) => c.id === m.idColaborador)) {
            atuais.push({
              id: m.idColaborador,
              nome: m.nomeColaborador || 'Colaborador'
            });
          }
        });
        this.edicaoColaboradores.set(atuais);
      },
      error: () => {}
    });
  }

  protected colaboradorPossuiDesvio(idColaborador: string): boolean {
    const insp = this.inspecao();
    if (!insp?.desvios) return false;
    return insp.desvios.some((d) => d.colaboradores?.some((c) => c.id === idColaborador));
  }

  protected removerColaboradorEdicao(idColaborador: string) {
    if (this.colaboradorPossuiDesvio(idColaborador)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Não permitido',
        detail: 'Este colaborador possui desvios atribuídos nesta inspeção e não pode ser removido.'
      });
      return;
    }
    this.edicaoColaboradores.update((lista) => lista.filter((c) => c.id !== idColaborador));
  }

  protected adicionarColaboradorEdicao() {
    const selecionado = this.colaboradorSelecionadoParaAdicionar;
    if (!selecionado) return;
    const atuais = this.edicaoColaboradores();
    if (atuais.some((c) => c.id === selecionado.id)) {
      this.messageService.add({
        severity: 'info',
        summary: 'Já incluído',
        detail: 'Este colaborador já está na lista de inspecionados.'
      });
      return;
    }
    this.edicaoColaboradores.update((lista) => [...lista, selecionado]);
    this.colaboradorSelecionadoParaAdicionar = null;
  }

  protected formularioEdicaoValido(): boolean {
    return Boolean(
      this.edicaoIdTipoInspecao &&
      this.edicaoIdProcesso &&
      this.edicaoIdBaseOperacional &&
      this.edicaoDataRealizacao &&
      this.edicaoColaboradores().length > 0 &&
      this.justificativaEdicao?.trim().length >= 5
    );
  }

  protected salvarEdicaoCabecalho() {
    const insp = this.inspecao();
    if (!insp || !this.formularioEdicaoValido()) return;

    const request: AtualizarCabecalhoInspecaoRequest = {
      idTipoInspecao: this.edicaoIdTipoInspecao,
      idProcesso: this.edicaoIdProcesso,
      idBaseOperacional: this.edicaoIdBaseOperacional,
      idVeiculo: this.edicaoIdVeiculo || null,
      idEquipe: this.edicaoIdEquipe || null,
      dataRealizacao: this.edicaoDataRealizacao?.toISOString() || new Date().toISOString(),
      observacoes: this.edicaoObservacoes?.trim() || null,
      latitude: this.edicaoLatitude,
      longitude: this.edicaoLongitude,
      colaboradoresInspecionados: this.edicaoColaboradores().map((c) => c.id),
      justificativa: this.justificativaEdicao.trim()
    };

    this.salvandoCabecalho.set(true);
    this.sst.atualizarCabecalhoInspecao(insp.id, request).subscribe({
      next: (res) => {
        this.salvandoCabecalho.set(false);
        this.dialogEdicaoCabecalho = false;
        if (res) this.inspecao.set(res);
        this.timelineValue.set('timeline');
        this.historicoComp?.recarregar();
        this.messageService.add({
          severity: 'success',
          summary: 'Cabeçalho Atualizado',
          detail: 'As alterações foram salvas e registradas no histórico auditado.'
        });
      },
      error: (err) => {
        this.salvandoCabecalho.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Erro ao atualizar',
          detail: getErrorMessage(err)
        });
      }
    });
  }
}

