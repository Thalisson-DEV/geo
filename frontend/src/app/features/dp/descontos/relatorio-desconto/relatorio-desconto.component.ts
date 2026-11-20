import { Component, DestroyRef, OnInit, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  GeoTone
} from '@geo/ui';
import { GeoAutocompleteComponent } from '@geo/ui/forms';

import { RhDescontosService } from '../../../../core/services/rh-descontos.service';
import { RhService } from '../../../../core/services/rh.service';
import { NavigationHistoryService } from '../../../../core/navigation/navigation-history.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  DescontoAnexoCategoria,
  DescontoAnexoResponse,
  DescontoItemResponse,
  DescontoRequest,
  DescontoResponse,
  DescontoStatus,
  EventoDesconto,
  DESCONTO_ANEXO_ACCEPT,
  MAX_DESCONTO_ANEXO_SIZE_BYTES,
  MotivoDescontoResponse,
  TipoEquipamentoResponse,
  getAnexoIcon,
  getAnexoLabel,
  getDescontoAnexoCategoria,
  getEtapaValorEfetivo,
  getValorEfetivo,
  inferMimeType
} from '../../../../core/models/desconto.models';
import { ColaboradorResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { AnalisarComCopilotoComponent } from '../../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { AcaoDesconto, AcaoDescontoConfirmada, DescontoAcaoDrawerComponent } from './desconto-acao-drawer.component';
import { DescontoHistoricoComponent } from './desconto-historico.component';

interface Destaque {
  tom: GeoTone;
  icone: string;
  titulo: string;
  texto: string;
  motivo?: string | null;
}

/** Uma linha da trilha do termo: quem fez cada etapa, quando e com que valor. */
interface EtapaTermo {
  etapa: string;
  icone: string;
  responsavel: string | null;
  data: string | null | undefined;
  valor: number | null | undefined;
  pendente: string | null;
  tom: GeoTone;
}

const ROTULO_STATUS: Record<DescontoStatus, string> = {
  SOLICITADO: 'Aguardando validação',
  VALIDADO: 'Validado',
  BAIXADO: 'Baixado em folha',
  FINALIZADO: 'Finalizado',
  REJEITADO: 'Rejeitado'
};

const TOM_STATUS: Record<DescontoStatus, GeoTone> = {
  SOLICITADO: 'warning',
  VALIDADO: 'info',
  BAIXADO: 'success',
  FINALIZADO: 'success',
  REJEITADO: 'danger'
};

const ICONE_STATUS: Record<DescontoStatus, string> = {
  SOLICITADO: 'pi-hourglass',
  VALIDADO: 'pi-check-square',
  BAIXADO: 'pi-wallet',
  FINALIZADO: 'pi-verified',
  REJEITADO: 'pi-times-circle'
};

/**
 * Termo de autorização de desconto em folha, no padrão dos relatórios (solicitação de
 * material, financeira, turno): cabeçalho institucional, faixa da situação, dados em
 * três colunas, cartões, itens, trilha das etapas, termo com assinaturas e barra
 * flutuante de ações. Na impressão sai só o documento formal; faixa, cartões, pontos
 * de atenção e anexos ficam na tela.
 */
@Component({
  selector: 'app-relatorio-desconto',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    DialogModule,
    ProgressSpinnerModule,
    GeoAsyncStateComponent,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    AnalisarComCopilotoComponent,
    DescontoAcaoDrawerComponent,
    DescontoHistoricoComponent
  ],
  templateUrl: './relatorio-desconto.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../../../execucao/relatorios/relatorio.css', './relatorio-desconto.component.css']
})
export class RelatorioDescontoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly descontosService = inject(RhDescontosService);
  private readonly rhService = inject(RhService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lookupStore = inject(LookupStore);
  private readonly auth = inject(AuthService);

  protected readonly rotuloStatus = ROTULO_STATUS;
  protected readonly tomStatus = TOM_STATUS;
  protected readonly iconeStatus = ICONE_STATUS;
  protected readonly anexoAccept = DESCONTO_ANEXO_ACCEPT;
  protected readonly emitidoEm = new Date();
  protected readonly abs = Math.abs;

  protected readonly desconto = signal<DescontoResponse | null>(null);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  private readonly modoImpressao = signal(false);

  protected readonly categorias = signal<TipoEquipamentoResponse[]>([]);
  protected readonly motivos = signal<MotivoDescontoResponse[]>([]);
  private readonly colaboradores = signal<ColaboradorResponse[]>([]);

  protected readonly opcoesMotivo = computed<GeoSelectOption<string>[]>(() =>
    this.motivos().map(m => ({ label: m.descricao, value: m.id }))
  );
  protected readonly opcoesCategoria = computed<GeoSelectOption<string>[]>(() =>
    this.categorias().map(c => ({ label: c.descricao, value: c.id }))
  );

  // ---------------------------------------------------------------
  // Derivados do desconto
  // ---------------------------------------------------------------

  protected readonly editavel = computed(() => this.desconto()?.status === 'SOLICITADO');
  protected readonly aceitaAnexo = computed(() => {
    const status = this.desconto()?.status;
    return status === 'SOLICITADO' || status === 'VALIDADO';
  });

  protected readonly colaborador = computed(() => {
    const id = this.desconto()?.colaboradorId;
    return id ? this.colaboradores().find(c => c.id === id) ?? null : null;
  });

  protected readonly nomeColaborador = computed(() => this.colaborador()?.nomeCompleto ?? null);

  protected readonly motivoAtual = computed(() => {
    const d = this.desconto();
    if (!d) return null;
    return this.motivos().find(m => m.id === d.motivo?.id) ?? d.motivo ?? null;
  });

  protected readonly valorEfetivo = computed(() => {
    const d = this.desconto();
    return d ? getValorEfetivo(d) : 0;
  });

  protected readonly etapaValorEfetivo = computed(() => {
    const d = this.desconto();
    return d ? getEtapaValorEfetivo(d).toLowerCase() : '';
  });

  protected readonly parcelas = computed(() => this.desconto()?.quantidadeParcelas || 1);
  protected readonly valorParcela = computed(() => this.valorEfetivo() / this.parcelas());

  protected readonly somaItens = computed(() =>
    (this.desconto()?.itens ?? []).reduce((acc, item) => acc + (item.valor || 0), 0)
  );

  protected readonly nomesAnexos = computed(() =>
    (this.desconto()?.anexos ?? []).filter(a => !a.termoAssinado).map(a => a.nomeArquivo).join('; ') + '.'
  );

  protected readonly codigo = computed(() => this.desconto()?.id?.substring(0, 8).toUpperCase() ?? '');

  /** Diferença entre o validado e o sugerido (null quando não validado ou igual). */
  protected readonly divergenciaValidacao = computed(() => {
    const d = this.desconto();
    if (!d || d.valorValidado == null) return null;
    const diff = d.valorValidado - (d.valorSugerido ?? 0);
    return Math.abs(diff) < 0.005 ? null : diff;
  });

  /** Diferença entre o baixado e o validado (null quando não baixado ou igual). */
  protected readonly divergenciaBaixa = computed(() => {
    const d = this.desconto();
    if (!d || d.valorBaixado == null) return null;
    const diff = d.valorBaixado - (d.valorValidado ?? d.valorSugerido ?? 0);
    return Math.abs(diff) < 0.005 ? null : diff;
  });

  /** O que está acontecendo agora e o que se espera de quem lê. */
  protected readonly faixa = computed<Destaque | null>(() => {
    const d = this.desconto();
    if (!d) return null;
    switch (d.status) {
      case 'SOLICITADO':
        return {
          tom: 'warning', icone: 'pi pi-hourglass', titulo: 'Aguardando validação',
          texto: 'Confira os itens e o valor antes de validar. Até a validação, os dados e os itens podem ser alterados.'
        };
      case 'VALIDADO':
        return {
          tom: 'info', icone: 'pi pi-check-square', titulo: 'Validado, aguardando a baixa em folha',
          texto: 'Os itens estão congelados. O Departamento Pessoal registra a baixa quando o desconto entrar na folha.'
        };
      case 'BAIXADO':
        return {
          tom: 'info', icone: 'pi pi-wallet', titulo: 'Baixado em folha, falta o termo assinado',
          texto: 'Imprima este termo, colete a assinatura do colaborador e anexe o documento assinado para finalizar.'
        };
      case 'FINALIZADO':
        return {
          tom: 'success', icone: 'pi pi-verified', titulo: 'Finalizado',
          texto: d.anexos.some(a => a.termoAssinado)
            ? 'Desconto baixado em folha e termo assinado pelo colaborador anexado. Ciclo concluído.'
            : 'Baixado em folha antes da exigência do termo assinado; finalizado automaticamente pelo sistema.'
        };
      case 'REJEITADO':
        return {
          tom: 'danger', icone: 'pi pi-times-circle', titulo: 'Desconto rejeitado',
          texto: 'O desconto não segue para a folha. O termo fica registrado como rejeitado.',
          motivo: d.motivoRejeicao
        };
    }
  });

  /** Pontos que quem decide precisa ver antes de validar ou baixar. Só na tela. */
  protected readonly atencao = computed<Destaque[]>(() => {
    const d = this.desconto();
    if (!d) return [];
    const pontos: Destaque[] = [];
    if (d.status === 'SOLICITADO' && !d.itens.length) {
      pontos.push({
        tom: 'danger', icone: 'pi pi-list', titulo: 'Sem itens',
        texto: 'Inclua ao menos um item: o valor sugerido é a soma deles e a validação depende disso.'
      });
    }
    const validacao = this.divergenciaValidacao();
    if (validacao !== null) {
      pontos.push({
        tom: 'warning', icone: 'pi pi-arrows-v', titulo: 'Validado diferente do sugerido',
        texto: `${this.moeda(Math.abs(validacao))} ${validacao > 0 ? 'acima' : 'abaixo'} da soma dos itens.`
      });
    }
    const baixa = this.divergenciaBaixa();
    if (baixa !== null) {
      pontos.push({
        tom: 'warning', icone: 'pi pi-arrows-v', titulo: 'Baixado diferente do validado',
        texto: `${this.moeda(Math.abs(baixa))} ${baixa > 0 ? 'acima' : 'abaixo'} do valor validado.`
      });
    }
    if (d.status === 'BAIXADO') {
      pontos.push({
        tom: 'warning', icone: 'pi pi-verified', titulo: 'Termo assinado pendente',
        texto: 'O desconto já entrou na folha, mas a autorização assinada pelo colaborador ainda não foi anexada.'
      });
    }
    if (!d.anexos.some(a => !a.termoAssinado) && d.status !== 'REJEITADO' && d.status !== 'FINALIZADO') {
      pontos.push({
        tom: 'info', icone: 'pi pi-paperclip', titulo: 'Sem comprovantes',
        texto: 'Nenhuma foto ou documento anexado. Evidências ajudam se o colaborador contestar o desconto.'
      });
    }
    return pontos;
  });

  /** Solicitação → validação → baixa (ou rejeição), com o nome de quem fez cada uma. */
  protected readonly etapas = computed<EtapaTermo[]>(() => {
    const d = this.desconto();
    if (!d) return [];
    const nomes = d.responsaveis ?? {};
    const etapas: EtapaTermo[] = [{
      etapa: 'Solicitação', icone: 'pi pi-file-edit', responsavel: nomes.solicitante ?? null,
      data: d.dataCriacao, valor: d.valorSugerido, pendente: null, tom: 'neutral'
    }];
    if (d.status === 'REJEITADO') {
      etapas.push({
        etapa: 'Rejeição', icone: 'pi pi-times-circle', responsavel: nomes.rejeicao ?? null,
        data: d.dataRejeicao ?? d.dataUltimaAlteracao, valor: null, pendente: null, tom: 'danger'
      });
      return etapas;
    }
    const validado = d.status === 'VALIDADO' || d.status === 'BAIXADO' || d.status === 'FINALIZADO';
    etapas.push({
      etapa: 'Validação', icone: 'pi pi-check-square', responsavel: nomes.validador ?? null,
      data: d.dataValidacao, valor: d.valorValidado, pendente: validado ? null : 'Aguardando validação',
      tom: validado ? 'info' : 'neutral'
    });
    const baixado = d.status === 'BAIXADO' || d.status === 'FINALIZADO';
    etapas.push({
      etapa: 'Baixa em folha', icone: 'pi pi-wallet', responsavel: nomes.baixa ?? null,
      data: d.dataBaixa, valor: d.valorBaixado, pendente: baixado ? null : 'Aguardando baixa',
      tom: baixado ? 'success' : 'neutral'
    });
    const finalizado = d.status === 'FINALIZADO';
    // Baixados antes da exigência do termo foram finalizados pelo sistema, sem arquivo.
    const automatico = finalizado && !d.usuarioFinalizacaoId && !d.anexos.some(a => a.termoAssinado);
    etapas.push({
      etapa: 'Termo assinado', icone: 'pi pi-verified',
      responsavel: automatico ? 'Sistema (automático)' : nomes.finalizacao ?? null,
      data: d.dataFinalizacao, valor: null, pendente: finalizado ? null : 'Aguardando termo assinado',
      tom: finalizado ? 'success' : 'neutral'
    });
    return etapas;
  });

  /** O termo assinado vigente, em destaque entre os anexos. */
  protected readonly termo = computed(() => this.desconto()?.anexos.find(a => a.termoAssinado) ?? null);
  protected readonly comprovantes = computed(() => this.desconto()?.anexos.filter(a => !a.termoAssinado) ?? []);

  // ---------------------------------------------------------------
  // Linha do tempo
  // ---------------------------------------------------------------

  protected readonly historico = signal<EventoDesconto[]>([]);
  protected readonly historicoCarregando = signal(false);
  protected readonly historicoErro = signal<string | null>(null);
  protected readonly historicoAberto = signal<string | undefined>(undefined);
  protected readonly decisoesDesfeitas = computed(() => this.historico().filter(e => e.tipo === 'DECISAO_DESFEITA').length);
  protected readonly resumoHistorico = computed(() => {
    const total = this.historico().length;
    const desfeitas = this.decisoesDesfeitas();
    const registros = total + (total === 1 ? ' registro' : ' registros');
    if (!desfeitas) return registros;
    return registros + ' · ' + desfeitas + (desfeitas === 1 ? ' decisão desfeita' : ' decisões desfeitas');
  });

  protected carregarHistorico(): void {
    const id = this.desconto()?.id;
    if (!id) return;
    this.historicoCarregando.set(true);
    this.historicoErro.set(null);
    this.descontosService.historico(id).subscribe({
      next: (eventos) => {
        this.historico.set(eventos);
        this.historicoCarregando.set(false);
      },
      error: (err) => {
        this.historicoErro.set(getErrorMessage(err));
        this.historicoCarregando.set(false);
      }
    });
  }

  // ---------------------------------------------------------------
  // Permissões
  // ---------------------------------------------------------------

  protected pode(permissao: string): boolean {
    return this.auth.currentUser()?.permissoes?.includes(permissao) ?? false;
  }

  /** Validação e rejeição são desfeitas por quem valida; baixa e finalização, por quem baixa. */
  protected readonly podeDesfazer = computed(() => {
    switch (this.desconto()?.status) {
      case 'VALIDADO':
      case 'REJEITADO': return this.pode('desconto:validar');
      case 'BAIXADO':
      case 'FINALIZADO': return this.pode('desconto:baixar');
      default: return false;
    }
  });

  protected readonly rotuloDesfazer = computed(() => {
    switch (this.desconto()?.status) {
      case 'VALIDADO': return 'Desfazer validação';
      case 'REJEITADO': return 'Desfazer rejeição';
      case 'BAIXADO': return 'Desfazer baixa';
      case 'FINALIZADO': return 'Desfazer finalização';
      default: return '';
    }
  });

  // ---------------------------------------------------------------
  // Drawers
  // ---------------------------------------------------------------

  protected readonly acaoAberta = signal(false);
  protected readonly acao = signal<AcaoDesconto | null>(null);

  // Dados do termo (colaborador, motivo, ocorrência, parcelas, observações)
  protected readonly dadosAberto = signal(false);
  protected readonly dColaborador = signal<string | null>(null);
  protected readonly dMotivo = signal<string | null>(null);
  protected readonly dData = signal<Date | null>(null);
  protected readonly dParcelas = signal<number | null>(1);
  protected readonly dObservacoes = signal('');
  protected readonly dTentou = signal(false);
  private dadosIniciais = '';

  private readonly colaboradorLookup = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor, limit: 50 }),
    selectedValues: () => {
      const id = this.dColaborador();
      return id ? [id] : [];
    },
    destroyRef: this.destroyRef
  });
  protected readonly opcoesColaborador = this.colaboradorLookup.items;
  protected readonly colaboradoresCarregando = this.colaboradorLookup.loading;
  protected readonly colaboradoresStatus = this.colaboradorLookup.status;

  protected readonly tetoParcelas = computed(() => {
    const id = this.dMotivo();
    return this.motivos().find(m => m.id === id)?.tetoParcelas ?? null;
  });

  protected readonly dadosSujos = computed(() => this.dadosAberto() && this.snapshotDados() !== this.dadosIniciais);

  protected readonly erroParcelas = computed(() => {
    if (!this.dTentou()) return undefined;
    const p = this.dParcelas();
    const teto = this.tetoParcelas();
    if (p == null || p < 1) return 'Informe ao menos 1 parcela.';
    if (teto != null && p > teto) return `Este motivo permite até ${teto} parcelas.`;
    return undefined;
  });

  // Item
  protected readonly itemAberto = signal(false);
  protected readonly itemEditando = signal<string | null>(null);
  protected readonly iDescricao = signal('');
  protected readonly iCategoria = signal<string | null>(null);
  protected readonly iValor = signal<number | null>(null);
  protected readonly iTentou = signal(false);
  protected readonly itemSujo = computed(() =>
    this.itemAberto() && (!!this.iDescricao().trim() || !!this.iCategoria() || this.iValor() != null) && !this.itemEditando()
  );

  // Pré-visualização de anexos
  protected readonly previewAberto = signal(false);
  protected readonly previewUrl = signal<SafeResourceUrl | null>(null);
  private readonly previewRawUrl = signal<string | null>(null);
  protected readonly previewNome = signal('');
  protected readonly previewTipo = signal<DescontoAnexoCategoria>('other');
  protected readonly previewCarregando = signal(false);

  constructor() {
    // Ficha do colaborador (CPF, função, base) para os dados gerais e a assinatura.
    effect(() => {
      const id = this.desconto()?.colaboradorId;
      if (!id || this.colaboradores().some(c => c.id === id)) return;
      this.rhService.buscarColaboradorPorId(id).subscribe({
        next: (colaborador) => {
          this.colaboradores.update(lista => [...lista.filter(c => c.id !== colaborador.id), colaborador]);
          this.colaboradorLookup.seedSelected({ value: colaborador.id, label: colaborador.nomeCompleto });
        },
        error: () => {}
      });
    });
  }

  ngOnInit(): void {
    this.modoImpressao.set(this.route.snapshot?.queryParamMap?.get('mode') === 'print');
    this.carregarListas();
    this.route.paramMap?.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.carregar(id);
      } else {
        this.erro.set('Desconto não informado no endereço.');
        this.carregando.set(false);
      }
    });
  }

  private carregarListas(): void {
    this.descontosService.listarTiposEquipamento({ page: 0, size: 200, ativo: true }).subscribe({
      next: (res) => this.categorias.set(res.content)
    });
    this.descontosService.listarMotivos({ page: 0, size: 200, ativo: true }).subscribe({
      next: (res) => this.motivos.set(res.content)
    });
  }

  protected recarregar(): void {
    const id = this.desconto()?.id ?? this.route.snapshot?.paramMap?.get('id');
    if (id) this.carregar(id);
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.descontosService.obterDescontoPorId(id).subscribe({
      next: (res) => {
        this.desconto.set(res);
        this.carregarHistorico();
        this.carregando.set(false);
        this.salvando.set(false);
        if (this.modoImpressao()) {
          this.modoImpressao.set(false);
          setTimeout(() => window.print(), 600);
        }
        this.atenderAcaoDoEmail(res);
      },
      error: (err) => {
        this.erro.set(getErrorMessage(err));
        this.carregando.set(false);
        this.salvando.set(false);
      }
    });
  }

  // ---------------------------------------------------------------
  // Validar, baixar, rejeitar
  // ---------------------------------------------------------------

  protected abrirAcao(acao: AcaoDesconto): void {
    const d = this.desconto();
    if (!d) return;
    if (acao === 'VALIDAR' && !d.itens.length) {
      this.messageService.add({ severity: 'warn', summary: 'Sem itens', detail: 'Inclua ao menos um item antes de validar.' });
      return;
    }
    this.acao.set(acao);
    this.acaoAberta.set(true);
  }

  protected confirmarAcao(evento: AcaoDescontoConfirmada): void {
    const d = this.desconto();
    if (!d) return;
    this.salvando.set(true);
    const requisicoes: Record<AcaoDesconto, () => Observable<unknown>> = {
      VALIDAR: () => this.descontosService.validarDesconto(d.id, { valorValidado: evento.valor! }),
      BAIXAR: () => this.descontosService.baixarDesconto(d.id, { valorBaixado: evento.valor! }),
      REJEITAR: () => this.descontosService.rejeitarDesconto(d.id, { motivoRejeicao: evento.motivo }),
      DESFAZER: () => this.descontosService.desfazerDecisao(d.id, { motivo: evento.motivo }),
      FINALIZAR: () => this.descontosService.finalizarComTermo(d.id, evento.arquivo!)
    };
    const requisicao = requisicoes[evento.acao]();
    const sucesso: Record<AcaoDesconto, string> = {
      VALIDAR: 'Desconto validado. Os itens ficam congelados.',
      BAIXAR: 'Baixa registrada. Falta anexar o termo assinado.',
      REJEITAR: 'Desconto rejeitado.',
      DESFAZER: 'Decisão desfeita. O motivo ficou na linha do tempo.',
      FINALIZAR: 'Termo assinado anexado. Desconto finalizado.'
    };
    requisicao.subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Pronto', detail: sucesso[evento.acao] });
        this.acaoAberta.set(false);
        this.carregar(d.id);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Não foi possível concluir', detail: getErrorMessage(err) });
        this.salvando.set(false);
      }
    });
  }

  /**
   * Os botões do e-mail abrem o termo com `?acao=validar|rejeitar|baixar`: o drawer
   * da etapa já vem aberto para confirmar. Se a etapa já passou, a pessoa fica sabendo
   * em vez de procurar um botão que não existe mais. O parâmetro sai da URL em
   * seguida, para que recarregar a página não reabra o drawer.
   */
  private atenderAcaoDoEmail(desconto: DescontoResponse): void {
    const acao = this.route.snapshot?.queryParamMap?.get('acao');
    if (!acao) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { acao: null }, queryParamsHandling: 'merge', replaceUrl: true });

    const etapa: Record<string, { status: DescontoStatus; acao: AcaoDesconto }> = {
      validar: { status: 'SOLICITADO', acao: 'VALIDAR' },
      rejeitar: { status: 'SOLICITADO', acao: 'REJEITAR' },
      baixar: { status: 'VALIDADO', acao: 'BAIXAR' }
    };
    const pedida = etapa[acao];
    if (!pedida) return;
    if (desconto.status !== pedida.status) {
      this.messageService.add({
        severity: 'info',
        summary: 'Nada a fazer nesta etapa',
        detail: `Este desconto já está ${ROTULO_STATUS[desconto.status].toLowerCase()}.`
      });
      return;
    }
    this.abrirAcao(pedida.acao);
  }

  // ---------------------------------------------------------------
  // Dados do termo
  // ---------------------------------------------------------------

  protected abrirDados(): void {
    const d = this.desconto();
    if (!d) return;
    this.dColaborador.set(d.colaboradorId ?? null);
    this.dMotivo.set(d.motivo?.id ?? null);
    this.dData.set(d.dataOcorrencia ? new Date(d.dataOcorrencia) : null);
    this.dParcelas.set(d.quantidadeParcelas || 1);
    this.dObservacoes.set(d.observacoes ?? '');
    this.dTentou.set(false);
    this.dadosIniciais = this.snapshotDados();
    this.dadosAberto.set(true);
  }

  private snapshotDados(): string {
    const data = this.dData();
    return JSON.stringify([
      this.dColaborador(), this.dMotivo(), data ? this.dataLocal(data) : null,
      this.dParcelas(), this.dObservacoes().trim()
    ]);
  }

  protected erroDados(campo: 'colaborador' | 'motivo' | 'data'): string | undefined {
    if (!this.dTentou()) return undefined;
    if (campo === 'colaborador' && !this.dColaborador()) return 'Selecione o colaborador.';
    if (campo === 'motivo' && !this.dMotivo()) return 'Selecione o motivo.';
    if (campo === 'data' && !this.dData()) return 'Informe a data da ocorrência.';
    return undefined;
  }

  protected salvarDados(): void {
    const d = this.desconto();
    if (!d) return;
    this.dTentou.set(true);
    if (this.erroDados('colaborador') || this.erroDados('motivo') || this.erroDados('data') || this.erroParcelas()) return;

    const payload: DescontoRequest = {
      colaboradorId: this.dColaborador()!,
      motivoId: this.dMotivo()!,
      quantidadeParcelas: this.dParcelas()!,
      dataOcorrencia: this.dData()!.toISOString()
    };
    const observacoes = this.dObservacoes().trim();
    if (observacoes) payload.observacoes = observacoes;

    this.salvando.set(true);
    this.descontosService.atualizarDesconto(d.id, payload).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Alterações salvas', detail: 'Os dados do termo foram atualizados.' });
        this.dadosAberto.set(false);
        this.carregar(d.id);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Não foi possível salvar', detail: getErrorMessage(err) });
        this.salvando.set(false);
      }
    });
  }

  protected pesquisarColaboradores(termo: string): void { this.colaboradorLookup.search(termo); }
  protected carregarMaisColaboradores(): void { this.colaboradorLookup.loadNext(); }
  protected tentarColaboradoresDeNovo(): void { this.colaboradorLookup.retry(); }

  /** Data local em yyyy-MM-dd, sem o deslocamento de fuso do toISOString(). */
  private dataLocal(data: Date): string {
    const offset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - offset).toISOString().substring(0, 10);
  }

  // ---------------------------------------------------------------
  // Itens
  // ---------------------------------------------------------------

  protected abrirItem(item?: DescontoItemResponse): void {
    this.itemEditando.set(item?.id ?? null);
    this.iDescricao.set(item?.descricaoMaterial ?? '');
    this.iCategoria.set(item?.tipoEquipamento?.id ?? null);
    this.iValor.set(item?.valor ?? null);
    this.iTentou.set(false);
    this.itemAberto.set(true);
  }

  protected erroItem(campo: 'descricao' | 'categoria' | 'valor'): string | undefined {
    if (!this.iTentou()) return undefined;
    if (campo === 'descricao' && !this.iDescricao().trim()) return 'Descreva o material.';
    if (campo === 'categoria' && !this.iCategoria()) return 'Selecione a categoria.';
    if (campo === 'valor' && !(this.iValor()! > 0)) return 'Informe o valor.';
    return undefined;
  }

  protected salvarItem(): void {
    const d = this.desconto();
    if (!d) return;
    this.iTentou.set(true);
    if (this.erroItem('descricao') || this.erroItem('categoria') || this.erroItem('valor')) return;

    const payload = {
      descricaoMaterial: this.iDescricao().trim(),
      tipoEquipamentoId: this.iCategoria()!,
      valor: this.iValor()!
    };
    const id = this.itemEditando();
    this.salvando.set(true);
    (id ? this.descontosService.atualizarItem(d.id, id, payload) : this.descontosService.adicionarItem(d.id, payload)).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: id ? 'Item atualizado' : 'Item incluído',
          detail: 'O valor sugerido foi recalculado.'
        });
        this.itemAberto.set(false);
        this.carregar(d.id);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Não foi possível salvar', detail: getErrorMessage(err) });
        this.salvando.set(false);
      }
    });
  }

  protected removerItem(item: DescontoItemResponse): void {
    const d = this.desconto();
    if (!d) return;
    this.confirmationService.confirm({
      header: 'Remover item',
      message: `Remover "${item.descricaoMaterial}"? O valor sugerido será recalculado.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remover',
      rejectLabel: 'Voltar',
      accept: () => {
        this.salvando.set(true);
        this.descontosService.removerItem(d.id, item.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Item removido', detail: 'O valor sugerido foi recalculado.' });
            this.carregar(d.id);
          },
          error: (err) => {
            this.messageService.add({ severity: 'error', summary: 'Não foi possível remover', detail: getErrorMessage(err) });
            this.salvando.set(false);
          }
        });
      }
    });
  }

  // ---------------------------------------------------------------
  // Anexos
  // ---------------------------------------------------------------

  protected enviarAnexo(event: Event): void {
    const d = this.desconto();
    const campo = event.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    if (!d || !arquivo) return;
    if (arquivo.size > MAX_DESCONTO_ANEXO_SIZE_BYTES) {
      this.messageService.add({ severity: 'warn', summary: 'Arquivo grande demais', detail: 'O limite é de 15 MB por arquivo.' });
      campo.value = '';
      return;
    }
    this.salvando.set(true);
    this.descontosService.enviarAnexo(d.id, arquivo).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Anexo enviado', detail: arquivo.name });
        campo.value = '';
        this.carregar(d.id);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Não foi possível enviar', detail: getErrorMessage(err) });
        campo.value = '';
        this.salvando.set(false);
      }
    });
  }

  protected removerAnexo(anexo: DescontoAnexoResponse): void {
    const d = this.desconto();
    if (!d) return;
    this.confirmationService.confirm({
      header: 'Remover anexo',
      message: `Remover "${anexo.nomeArquivo}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remover',
      rejectLabel: 'Voltar',
      accept: () => {
        this.salvando.set(true);
        this.descontosService.removerAnexo(d.id, anexo.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Anexo removido', detail: anexo.nomeArquivo });
            this.carregar(d.id);
          },
          error: (err) => {
            this.messageService.add({ severity: 'error', summary: 'Não foi possível remover', detail: getErrorMessage(err) });
            this.salvando.set(false);
          }
        });
      }
    });
  }

  protected baixarAnexo(anexo: DescontoAnexoResponse): void {
    const id = this.desconto()?.id;
    if (!id) return;
    this.descontosService.baixarAnexoArquivo(id, anexo.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = anexo.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Não foi possível baixar', detail: anexo.nomeArquivo })
    });
  }

  protected visualizarAnexo(anexo: DescontoAnexoResponse): void {
    const id = this.desconto()?.id;
    if (!id) return;
    this.previewNome.set(anexo.nomeArquivo);
    this.previewTipo.set(getDescontoAnexoCategoria(anexo.nomeArquivo, anexo.contentType));
    this.previewCarregando.set(true);
    this.previewAberto.set(true);
    this.descontosService.baixarAnexoArquivo(id, anexo.id).subscribe({
      next: (blob) => {
        const tipo = inferMimeType(anexo.nomeArquivo, anexo.contentType || blob.type);
        const url = window.URL.createObjectURL(new Blob([blob], { type: tipo }));
        this.previewRawUrl.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.previewCarregando.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Não foi possível abrir', detail: anexo.nomeArquivo });
        this.previewCarregando.set(false);
        this.previewAberto.set(false);
      }
    });
  }

  protected fecharPreview(): void {
    this.previewAberto.set(false);
    const raw = this.previewRawUrl();
    if (raw) {
      window.URL.revokeObjectURL(raw);
      this.previewRawUrl.set(null);
    }
    this.previewUrl.set(null);
  }

  protected abrirPreviewNovaAba(): void {
    const raw = this.previewRawUrl();
    if (raw) window.open(raw, '_blank');
  }

  protected categoriaAnexo(anexo: DescontoAnexoResponse): DescontoAnexoCategoria {
    return getDescontoAnexoCategoria(anexo.nomeArquivo, anexo.contentType);
  }

  protected iconeAnexo(anexo: DescontoAnexoResponse): string {
    return getAnexoIcon(this.categoriaAnexo(anexo));
  }

  protected rotuloAnexo(anexo: DescontoAnexoResponse): string {
    const tamanho = anexo.tamanhoBytes ? ` · ${this.tamanho(anexo.tamanhoBytes)}` : '';
    return getAnexoLabel(this.categoriaAnexo(anexo)) + tamanho;
  }

  private tamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  // ---------------------------------------------------------------
  // Utilidades do template
  // ---------------------------------------------------------------

  protected formatarCpf(cpf?: string | null): string {
    const limpo = (cpf ?? '').replace(/\D/g, '');
    if (limpo.length !== 11) return cpf || '—';
    return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
  }

  private moeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected irPara(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Aberto em nova aba pela lista: fecha a aba; senão volta pelo histórico. */
  protected voltar(): void {
    this.navegacao.back(['/dp/descontos/lancamento']);
  }

  protected imprimir(): void {
    window.print();
  }
}
