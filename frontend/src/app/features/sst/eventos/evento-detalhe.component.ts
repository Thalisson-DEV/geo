import { ICONE_PAPEL_ENVOLVIDO } from '../../../core/models/sst-evento.models';
import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent,
  GeoTextareaComponent,
  GeoTone,
  NotificationService
} from '@geo/ui';

import { getErrorMessage } from '../../../core/models/shared.models';
import {
  AnexoEventoResponse,
  EnvolvidoEventoResponse,
  EventoSstResponse,
  PAPEL_ENVOLVIDO_LABELS,
  PRAZO_COMUNICACAO_HORAS,
  PapelEnvolvido,
  REGISTRO_EVIDENCIA_LABELS,
  RegistroEvidencia,
  STATUS_EVENTO_LABELS,
  StatusEventoSst,
  TIPO_CAT_LABELS,
  TIPO_ENVOLVIDO_LABELS,
  TIPO_EVENTO_LABELS,
  TipoEventoSst,
  eventoEditavel
} from '../../../core/models/sst-evento.models';
import { AuthService } from '../../../core/services/auth.service';
import { SstService } from '../../../core/services/sst.service';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { EventoAnexosComponent } from './evento-anexos.component';
import { EventoCorpoComponent } from './evento-corpo.component';
import {
  DEGRAUS_GRAVIDADE,
  GrauEvento,
  grauDoEvento,
  regioesDaLesao,
  tempoDesdeOFato,
  tituloDoRelatorio
} from './evento-relatorio.util';

declare var L: any;

type AcaoCicloVida = 'tratativa' | 'conclusao' | 'cancelamento' | 'reabertura';

interface MarcoEvento {
  titulo: string;
  data: string | null;
  texto: string;
  icone: string;
  tom: GeoTone;
  /** Distância do fato ("+ 6 h"), como se lê numa investigação. */
  relativo: string;
  /** Marco sem hora (emissão da CAT): mostra só a data. */
  soData?: boolean;
}

/**
 * Relatório do evento de segurança (acidente, incidente, dano material, doença ocupacional).
 * Segue o padrão dos relatórios do GEO (inspeção, desconto, solicitação financeira):
 * cabeçalho institucional, título com a situação, faixa de destaque, dados em três colunas,
 * cartões de resumo, seções em tabela, declaração com assinaturas e barra de ações flutuante.
 */
@Component({
  selector: 'app-sst-evento-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DatePipe,
    ButtonModule,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoFormDrawerComponent,
    GeoPageHeaderComponent,
    GeoFormSectionComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
    AnalisarComCopilotoComponent,
    EventoAnexosComponent,
    EventoCorpoComponent
  ],
  templateUrl: './evento-detalhe.component.html',
  styleUrls: ['../../execucao/relatorios/relatorio.css', './evento-detalhe.component.css']
})
export class EventoDetalheComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sst = inject(SstService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  protected readonly evento = signal<EventoSstResponse | null>(null);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly canWrite = signal(false);

  protected readonly dialogAberto = signal(false);
  protected readonly acao = signal<AcaoCicloVida>('tratativa');
  protected readonly textoAcao = signal('');

  protected readonly emitidoEm = new Date();

  private idEvento!: string;
  private map: any = null;

  protected readonly podeEditar = computed(() => {
    const e = this.evento();
    return !!e && this.canWrite() && eventoEditavel(e.status);
  });


  protected readonly titulo = computed(() => tituloDoRelatorio(this.evento()?.tipo ?? 'ACIDENTE_TIPICO'));

  protected readonly grau = computed<GrauEvento>(() => {
    const e = this.evento();
    return e ? grauDoEvento(e) : 'INCIDENTE';
  });

  /** Degrau do evento na pirâmide de Bird, para o cartão de gravidade. */
  protected readonly gravidade = computed(() => {
    const degrau = DEGRAUS_GRAVIDADE.find((d) => d.chave === this.grau())!;
    const classe = { FATALIDADE: 'resumo--perigo', COM_AFASTAMENTO: 'resumo--perigo', SEM_AFASTAMENTO: 'resumo--alerta', INCIDENTE: 'resumo--destaque' }[degrau.chave];
    return { ...degrau, classe };
  });

  protected readonly regioesLesao = computed(() => regioesDaLesao(this.evento()?.localLesaoNome));

  protected readonly vitimas = computed(() => this.evento()?.envolvidos.filter((env) => env.papel === 'ACIDENTADO') ?? []);
  /** Acidentados primeiro, depois testemunhas e demais envolvidos. */
  protected readonly envolvidosOrdenados = computed(() => {
    const ordem: Record<PapelEnvolvido, number> = { ACIDENTADO: 0, TESTEMUNHA: 1, ENVOLVIDO: 2 };
    return [...(this.evento()?.envolvidos ?? [])].sort((a, b) => ordem[a.papel] - ordem[b.papel]);
  });
  protected readonly acidentados = computed(() => this.vitimas().length);

  /** Barra do prazo legal: quanto do prazo de comunicação foi consumido (100% = no limite). */
  protected readonly consumoPrazo = computed(() => {
    const e = this.evento();
    const prazo = this.prazoHoras();
    if (!e || !prazo) return { percentual: 0, tom: 'success' as GeoTone };
    const percentual = Math.round((e.horasAteComunicacao / prazo) * 100);
    return { percentual, tom: (e.comunicacaoAtrasada ? 'danger' : percentual >= 75 ? 'warning' : 'success') as GeoTone };
  });

  protected readonly prazoHoras = computed(() => {
    const e = this.evento();
    return e ? PRAZO_COMUNICACAO_HORAS[e.tipo] : 0;
  });

  /** Situação do documento no título: o andamento da tratativa. */
  protected readonly situacao = computed<{ rotulo: string; tom: GeoTone; icone: string }>(() => {
    const status = this.evento()?.status ?? 'REGISTRADO';
    return {
      rotulo: STATUS_EVENTO_LABELS[status],
      tom: this.statusTone(status),
      icone: this.statusIcone(status)
    };
  });

  /** Faixa de destaque: o que falta fazer, ou como o evento terminou. */
  protected readonly faixa = computed<{ tom: GeoTone; icone: string; titulo: string; texto: string } | null>(() => {
    const e = this.evento();
    if (!e) return null;
    switch (e.status) {
      case 'REGISTRADO':
        return {
          tom: 'warning',
          icone: 'pi pi-flag',
          titulo: 'Aguardando tratativa',
          texto: 'O evento foi registrado e ainda ninguém assumiu a investigação. Assuma a tratativa para registrar o que está sendo feito.'
        };
      case 'EM_TRATATIVA':
        return {
          tom: 'info',
          icone: 'pi pi-cog',
          titulo: 'Investigação em andamento',
          texto: 'Registre as causas e as ações corretivas na tratativa e conclua o evento quando tudo estiver resolvido.'
        };
      case 'CONCLUIDO':
        return {
          tom: 'success',
          icone: 'pi pi-check-circle',
          titulo: 'Evento concluído',
          texto: e.dataConclusao
            ? `Tratativa encerrada em ${new DatePipe('pt-BR').transform(e.dataConclusao, 'dd/MM/yyyy HH:mm')}. O registro fica somente para leitura até ser reaberto.`
            : 'Tratativa encerrada. O registro fica somente para leitura até ser reaberto.'
        };
      case 'CANCELADO':
        return {
          tom: 'danger',
          icone: 'pi pi-times-circle',
          titulo: 'Registro cancelado',
          texto: e.motivoCancelamento ? `Motivo: ${e.motivoCancelamento}` : 'O evento saiu dos indicadores e continua disponível para consulta.'
        };
    }
  });

  /** Marcos do evento, do fato ao desfecho, montados a partir das datas do registro. */
  protected readonly marcos = computed<MarcoEvento[]>(() => {
    const e = this.evento();
    if (!e) return [];
    const marcos: Omit<MarcoEvento, 'relativo'>[] = [
      { titulo: 'Ocorrência', data: e.dataOcorrencia, texto: e.localOcorrencia || e.baseNome, icone: 'pi-exclamation-triangle', tom: 'danger' },
      {
        titulo: 'Comunicação',
        data: e.dataComunicacao,
        texto: e.comunicacaoAtrasada
          ? `${e.horasAteComunicacao} h depois do fato, fora do prazo de ${this.prazoHoras()} h`
          : `${e.horasAteComunicacao} h depois do fato, dentro do prazo de ${this.prazoHoras()} h`,
        icone: 'pi-megaphone',
        tom: e.comunicacaoAtrasada ? 'danger' : 'success'
      },
      { titulo: 'Registro no GEO', data: e.dataCriacao, texto: e.usuarioCriacao ? `Lançado por ${e.usuarioCriacao}` : 'Lançado no sistema', icone: 'pi-file-edit', tom: 'neutral' }
    ];
    if (e.possuiCat && e.dataEmissaoCat) {
      marcos.push({ titulo: 'Emissão da CAT', data: e.dataEmissaoCat, texto: e.numeroCat ? `CAT nº ${e.numeroCat}` : 'CAT emitida', icone: 'pi-file-check', tom: 'info', soData: true });
    }
    if (e.status === 'CONCLUIDO') {
      marcos.push({ titulo: 'Conclusão', data: e.dataConclusao, texto: 'Tratativa encerrada', icone: 'pi-check-circle', tom: 'success' });
    } else if (e.status === 'CANCELADO') {
      marcos.push({ titulo: 'Cancelamento', data: e.dataCancelamento, texto: e.motivoCancelamento || 'Registro cancelado', icone: 'pi-times-circle', tom: 'danger' });
    } else {
      marcos.push({
        titulo: e.status === 'EM_TRATATIVA' ? 'Em tratativa' : 'Aguardando tratativa',
        data: null,
        texto: e.motivoReabertura ? `Reaberto: ${e.motivoReabertura}` : 'Conclusão pendente',
        icone: 'pi-clock',
        tom: 'warning'
      });
    }
    return marcos
      .map((m) => ({ ...m, relativo: m.titulo === 'Ocorrência' ? 'o fato' : tempoDesdeOFato(e.dataOcorrencia, m.data, m.soData) }))
      .sort((a, b) => (a.data && b.data ? this.instante(a) - this.instante(b) : a.data ? -1 : 1));
  });

  /** Data só com dia (CAT) entra na ordem ao meio-dia local, para não passar à frente do fato. */
  private instante(m: { data: string | null; soData?: boolean }): number {
    return new Date(m.soData ? `${m.data!.slice(0, 10)}T12:00:00` : m.data!).getTime();
  }

  ngOnInit(): void {
    this.idEvento = this.route.snapshot.paramMap.get('id')!;
    this.canWrite.set((this.auth.currentUser()?.permissoes ?? []).includes('sst:evento:write'));
    this.carregar();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  protected voltar(): void {
    this.router.navigate(['/sst/eventos']);
  }

  protected imprimir(): void {
    window.print();
  }

  protected editar(): void {
    this.router.navigate(['/sst/eventos', this.idEvento, 'editar']);
  }

  // ---------- Ciclo de vida ----------

  protected abrir(acao: AcaoCicloVida): void {
    this.acao.set(acao);
    this.textoAcao.set(acao === 'conclusao' || acao === 'tratativa' ? this.evento()?.tratativa ?? '' : '');
    this.dialogAberto.set(true);
  }

  protected campoObrigatorio(): boolean {
    return this.acao() !== 'tratativa';
  }

  protected tituloAcao(): string {
    return {
      tratativa: 'Assumir a tratativa',
      conclusao: 'Concluir o evento',
      cancelamento: 'Cancelar o registro',
      reabertura: 'Reabrir o evento'
    }[this.acao()];
  }

  protected descricaoAcao(): string {
    return {
      tratativa: 'O evento passa para Em tratativa. Você já pode registrar o que está sendo feito.',
      conclusao: 'Descreva o que foi feito antes de concluir. O evento ficará somente para leitura até ser reaberto.',
      cancelamento: 'Use para um registro indevido ou duplicado. O evento continua legível e sai dos indicadores.',
      reabertura: 'O evento volta para Em tratativa e poderá ser editado novamente.'
    }[this.acao()];
  }

  protected rotuloCampo(): string {
    return this.acao() === 'tratativa' || this.acao() === 'conclusao' ? 'Tratativa' : 'Motivo';
  }

  protected placeholderCampo(): string {
    const acao = this.acao();
    return acao === 'cancelamento'
      ? 'Ex.: registro duplicado do EVT-2026-000012'
      : acao === 'reabertura'
        ? 'Ex.: a classificação informada precisa ser corrigida'
        : 'Causas apuradas e ações corretivas adotadas';
  }

  protected rotuloConfirmar(): string {
    return {
      tratativa: 'Assumir tratativa',
      conclusao: 'Concluir evento',
      cancelamento: 'Cancelar registro',
      reabertura: 'Reabrir evento'
    }[this.acao()];
  }

  protected iconeConfirmar(): string {
    return {
      tratativa: 'pi pi-play',
      conclusao: 'pi pi-check-circle',
      cancelamento: 'pi pi-times-circle',
      reabertura: 'pi pi-refresh'
    }[this.acao()];
  }

  protected confirmar(): void {
    if (this.salvando()) return;
    const texto = this.textoAcao().trim();
    if (this.campoObrigatorio() && !texto) return;
    this.salvando.set(true);
    const operacao = {
      tratativa: () => this.sst.iniciarTratativaEvento(this.idEvento, { tratativa: texto || null }),
      conclusao: () => this.sst.concluirEvento(this.idEvento, { tratativa: texto || null }),
      cancelamento: () => this.sst.cancelarEvento(this.idEvento, { motivo: texto }),
      reabertura: () => this.sst.reabrirEvento(this.idEvento, { motivo: texto })
    }[this.acao()]();

    operacao.subscribe({
      next: (evento) => {
        this.salvando.set(false);
        this.dialogAberto.set(false);
        this.evento.set(evento);
        this.notifications.success(
          `${evento.numeroRegistro} agora está ${STATUS_EVENTO_LABELS[evento.status].toLowerCase()}.`,
          { title: 'Evento atualizado' }
        );
      },
      error: (error) => {
        this.salvando.set(false);
        this.notifications.error(getErrorMessage(error), { title: 'Não foi possível concluir a ação' });
      }
    });
  }

  protected onAnexosAlterados(anexos: AnexoEventoResponse[]): void {
    this.evento.update((atual) => (atual ? { ...atual, anexos } : atual));
  }

  // ---------- Rótulos e tons ----------

  protected tipoLabel(tipo: TipoEventoSst): string {
    return TIPO_EVENTO_LABELS[tipo];
  }

  protected tipoTone(tipo: TipoEventoSst): GeoTone {
    switch (tipo) {
      case 'ACIDENTE_TIPICO':
      case 'DOENCA_OCUPACIONAL':
        return 'danger';
      case 'ACIDENTE_TRAJETO':
        return 'warning';
      case 'DANO_MATERIAL':
        return 'info';
      default:
        return 'neutral';
    }
  }

  protected statusTone(status: StatusEventoSst): GeoTone {
    switch (status) {
      case 'REGISTRADO':
        return 'warning';
      case 'EM_TRATATIVA':
        return 'info';
      case 'CONCLUIDO':
        return 'success';
      default:
        return 'neutral';
    }
  }

  private statusIcone(status: StatusEventoSst): string {
    switch (status) {
      case 'REGISTRADO':
        return 'pi-flag';
      case 'EM_TRATATIVA':
        return 'pi-cog';
      case 'CONCLUIDO':
        return 'pi-check-circle';
      default:
        return 'pi-times-circle';
    }
  }

  protected readonly iconePapel: Record<string, string> = ICONE_PAPEL_ENVOLVIDO;

  protected papelLabel(papel: PapelEnvolvido): string {
    return PAPEL_ENVOLVIDO_LABELS[papel];
  }

  protected papelTone(papel: PapelEnvolvido): GeoTone {
    switch (papel) {
      case 'ACIDENTADO':
        return 'danger';
      case 'TESTEMUNHA':
        return 'info';
      default:
        return 'neutral';
    }
  }

  protected tipoEnvolvidoLabel(env: EnvolvidoEventoResponse): string {
    return TIPO_ENVOLVIDO_LABELS[env.tipo];
  }

  protected vinculoEnvolvido(env: EnvolvidoEventoResponse): string {
    return [env.funcao, env.empresa, env.baseOperacional].filter(Boolean).join(' · ') || '—';
  }

  protected evidenciaLabel(valor: RegistroEvidencia): string {
    return REGISTRO_EVIDENCIA_LABELS[valor];
  }

  protected evidenciaTone(valor: RegistroEvidencia): GeoTone {
    return valor === 'SIM' ? 'success' : valor === 'NAO' ? 'warning' : 'neutral';
  }

  protected catLabel(evento: EventoSstResponse): string {
    return evento.tipoCat ? TIPO_CAT_LABELS[evento.tipoCat] : '—';
  }

  // ---------- Carga ----------

  private carregar(): void {
    this.carregando.set(true);
    this.sst.buscarEventoPorId(this.idEvento).subscribe({
      next: (evento) => {
        this.evento.set(evento);
        this.carregando.set(false);
        if (evento.latitude != null && evento.longitude != null) {
          setTimeout(() => this.initMap(evento.latitude!, evento.longitude!), 200);
        }
      },
      error: (error) => {
        this.carregando.set(false);
        this.notifications.error(getErrorMessage(error), { title: 'Não foi possível abrir' });
      }
    });
  }

  private initMap(lat: number, lng: number): void {
    const el = document.getElementById('map-evento');
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
      fillColor: '#dc2626',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    })
      .addTo(this.map)
      .bindPopup('Local da ocorrência');
    this.map.setView([lat, lng], 16);
    setTimeout(() => this.map?.invalidateSize(), 250);
  }
}
