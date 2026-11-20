import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GeoAsyncStateComponent, GeoStatusComponent, GeoTone, GeoButtonComponent } from '@geo/ui';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  CausaManutencao,
  DocumentoFiscalOrdemServico,
  HistoricoOrdemServico,
  MotivoServico,
  OrdemServicoDetalhe,
  ROTULO_APROVACAO,
  ROTULO_CRITICIDADE,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  ROTULO_STATUS_FINANCEIRO,
  ROTULO_TIPO_MANUTENCAO,
  ROTULO_TIPO_OFICINA,
  TOM_APROVACAO,
  TOM_CRITICIDADE,
  TOM_SITUACAO_OS,
  TOM_STATUS_FINANCEIRO,
  formatarMedicao,
  identificacaoOs,
  rotuloOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { moeda } from '../abastecimentos/frota-abastecimento.util';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { FrotaRelatorioAnaliseIaComponent } from './frota-relatorio-analise-ia.component';
import { FrotaRelatorioCabecalhoComponent } from './frota-relatorio-cabecalho.component';
import { FotoRelatorio, FrotaRelatorioFotosComponent } from './frota-relatorio-fotos.component';
import { EventoRelatorio, FrotaRelatorioLinhaTempoComponent } from './frota-relatorio-linha-tempo.component';
import { duracaoEntre } from './frota-relatorio.util';

import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
const ROTULO_MOTIVO: Record<MotivoServico, string> = {
  DESGASTE_NATURAL: 'Desgaste natural',
  ADEQUACAO_DE_MELHORIA: 'Adequação de melhoria',
  PROBLEMA_MECANICO: 'Problema mecânico',
  MAU_USO_DESCONTO: 'Mau uso (desconto)',
  OUTRA: 'Outro'
};

const ROTULO_CAUSA: Record<CausaManutencao, string> = {
  AVARIA: 'Avaria',
  DESGASTE_NATURAL: 'Desgaste natural',
  USO_INDEVIDO: 'Uso indevido',
  SERVICO_CORRETIVO: 'Serviço corretivo',
  SERVICO_PREVENTIVO: 'Serviço preventivo',
  ESTOQUE: 'Estoque',
  SUBSTITUICAO_PNEUS: 'Substituição de pneus'
};

const EVENTO: Record<string, { icone: string; tom: GeoTone }> = {
  ABERTA: { icone: 'pi-plus', tom: 'brand' },
  EDITADA: { icone: 'pi-pencil', tom: 'neutral' },
  AGENDADA: { icone: 'pi-calendar', tom: 'info' },
  INICIADA: { icone: 'pi-play', tom: 'info' },
  PREVISAO_ALTERADA: { icone: 'pi-history', tom: 'warning' },
  CONCLUIDA: { icone: 'pi-check', tom: 'success' },
  CANCELADA: { icone: 'pi-ban', tom: 'danger' },
  VEICULO_PARADO: { icone: 'pi-pause', tom: 'warning' },
  VEICULO_LIBERADO: { icone: 'pi-car', tom: 'success' },
  ORCAMENTO_VINCULADO: { icone: 'pi-link', tom: 'info' },
  ORCAMENTO_APROVADO: { icone: 'pi-check-circle', tom: 'success' },
  ORCAMENTO_REPROVADO: { icone: 'pi-times-circle', tom: 'danger' },
  EXECUCAO_ALTERADA: { icone: 'pi-wrench', tom: 'neutral' },
  DOCUMENTO_FISCAL_INCLUIDO: { icone: 'pi-file', tom: 'info' },
  DOCUMENTO_FISCAL_EXCLUIDO: { icone: 'pi-file-excel', tom: 'neutral' }
};

/**
 * Relatório da OS (corretiva ou preventiva), no padrão do relatório da solicitação de material:
 * identificação, cronograma e envolvidos em três colunas; problema, execução, orçamentos e notas;
 * análise da IA sobre as fotos; histórico de movimentações e assinaturas para imprimir.
 */
@Component({
  selector: 'app-relatorio-ordem-servico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoButtonComponent, 
    DatePipe,
    GeoAsyncStateComponent,
    GeoStatusComponent,
    AnalisarComCopilotoComponent,
    FrotaRelatorioAnaliseIaComponent,
    FrotaRelatorioCabecalhoComponent,
    FrotaRelatorioFotosComponent,
    FrotaRelatorioLinhaTempoComponent
  ],
  styleUrls: ['./frota-relatorio.css'],
  template: `
    @if (carregando()) {
      <div class="rel-estado">
        <geo-async-state state="loading" title="Carregando a ordem de serviço..." description="Consultando execução, orçamentos e notas."></geo-async-state>
      </div>
    } @else if (erro()) {
      <div class="rel-estado">
        <geo-async-state state="error" title="Relatório indisponível" [description]="erro()!" actionLabel="Tentar novamente" (action)="carregar(id())"></geo-async-state>
      </div>
    } @else if (detalhe(); as d) {
      <!-- Ações do relatório (padrão: topo, fora da folha) -->
      <div class="geo-relatorio-acoes print:hidden">
          <geo-button variant="ghost" icon="pi pi-arrow-left" label="Voltar" (pressed)="voltar()"></geo-button>
        <app-analisar-com-copiloto origem="Ordem de serviço da frota" tipo="frota_ordem_servico" [entidade]="d.ordem.id"
            [rotulo]="'OS ' + d.ordem.numero" size="sm"
            pergunta="Analise esta ordem de serviço para apoiar a decisão: custo, tempo parado, repetição do item, oficina e histórico do veículo, comparando com OS semelhantes." />
          <geo-button variant="outline" icon="pi pi-print" label="Imprimir" (pressed)="imprimir()"></geo-button>
          <geo-button icon="pi pi-external-link" label="Abrir a OS" (pressed)="abrirFicha(d.ordem.id)"></geo-button>
        
      </div>
      <article class="rel geo-relatorio-folha">
        <app-frota-relatorio-cabecalho area="Manutenção" [titulo]="'Ordem de Serviço Nº ' + d.ordem.numero">
          <geo-status [tone]="tomSituacao[d.ordem.situacao]">{{ rotuloSituacao[d.ordem.situacao] }}</geo-status>
          <span>·</span>
          <span><strong>{{ rotuloTipo[d.ordem.tipoManutencao] }}</strong></span>
          <span>·</span>
          <span>Abertura: <strong>{{ d.ordem.abertaEm | date: 'dd/MM/yyyy HH:mm' }}</strong></span>
        </app-frota-relatorio-cabecalho>

        <section class="rel-dados" aria-label="Dados gerais da OS">
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-tag" aria-hidden="true"></i>Identificação</div>
            <div class="kv"><span class="kv-l">{{ d.ordem.veicular ? 'Veículo' : 'Equipamento' }}</span><span class="kv-v">{{ identificacao() }}</span></div>
            <div class="kv"><span class="kv-l">Base</span><span class="kv-v">{{ d.ordem.base ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Origem</span><span class="kv-v">{{ rotuloOrigem[d.ordem.origem] }}</span></div>
            <div class="kv"><span class="kv-l">Criticidade</span>
              <geo-status [tone]="tomCriticidade[d.ordem.criticidade]" emphasis="outline">{{ rotuloCriticidade[d.ordem.criticidade] }}</geo-status></div>
            <div class="kv"><span class="kv-l">Motivo</span><span class="kv-v">{{ d.ordem.motivo ? rotuloMotivo[d.ordem.motivo] : '—' }}</span></div>
            <div class="kv"><span class="kv-l">Orçamento</span>
              <geo-status [tone]="tomAprovacao[d.ordem.situacaoAprovacao]">{{ rotuloAprovacao[d.ordem.situacaoAprovacao] }}</geo-status></div>
          </div>

          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-calendar" aria-hidden="true"></i>Cronograma</div>
            <div class="kv"><span class="kv-l">Abertura</span><span class="kv-v">{{ d.ordem.abertaEm | date: 'dd/MM/yyyy HH:mm' }}</span></div>
            <div class="kv"><span class="kv-l">Agendada para</span><span class="kv-v">{{ (d.ordem.agendadaPara | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Início</span><span class="kv-v">{{ (d.ordem.inicioReal | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Previsão</span>
              <span class="kv-v" [class.kv-v--perigo]="d.ordem.atrasada">{{ (d.ordem.previsaoTermino | date: 'dd/MM/yyyy HH:mm') || '—' }}{{ d.ordem.atrasada ? ' · atrasada' : '' }}</span></div>
            <div class="kv"><span class="kv-l">Conclusão</span>
              <span class="kv-v" [class.kv-v--sucesso]="!!d.ordem.fimReal">{{ (d.ordem.fimReal | date: 'dd/MM/yyyy HH:mm') || 'Pendente' }}</span></div>
            <div class="kv"><span class="kv-l">Veículo parado</span>
              <span class="kv-v" [class.kv-v--alerta]="d.ordem.paradaEmCurso">{{ tempoParado() }}</span></div>
          </div>

          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-users" aria-hidden="true"></i>Envolvidos</div>
            <div class="kv"><span class="kv-l">Aberta por</span><span class="kv-v">{{ d.ordem.usuarioAbertura ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Condutor</span><span class="kv-v">{{ d.ordem.condutor ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Oficina</span><span class="kv-v" [title]="d.ordem.oficina">{{ d.ordem.oficinaNome ? rotuloOficina[d.ordem.tipoOficina] + ' · ' + d.ordem.oficinaNome : d.ordem.oficina }}</span></div>
            <div class="kv"><span class="kv-l">Local</span><span class="kv-v">{{ d.ordem.localAgendamento ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} abertura</span>
              <span class="kv-v">{{ formatarMedicao(d.ordem.kmAbertura, d.ordem.unidadeMedicao) }}</span></div>
            <div class="kv"><span class="kv-l">{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} encerramento</span>
              <span class="kv-v">{{ formatarMedicao(d.ordem.kmEncerramento, d.ordem.unidadeMedicao) }}</span></div>
          </div>
        </section>

        @if (d.ordem.situacao === 'CANCELADA') {
          <div class="rel-destaque" data-tom="danger">
            <span class="rel-destaque__icone"><i class="pi pi-ban" aria-hidden="true"></i></span>
            <div class="rel-destaque__corpo">
              <span class="rel-destaque__titulo">OS cancelada em {{ d.ordem.canceladaEm | date: 'dd/MM/yyyy HH:mm' }}</span>
              <p class="rel-texto">{{ d.ordem.motivoCancelamento || 'Sem motivo informado.' }}</p>
            </div>
          </div>
        }
        @if (d.avisos.length) {
          <div class="rel-destaque" data-tom="warning">
            <span class="rel-destaque__icone"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i></span>
            <div class="rel-destaque__corpo">
              <span class="rel-destaque__titulo">Pontos de atenção</span>
              <ul>
                @for (a of d.avisos; track a) {
                  <li>{{ a }}</li>
                }
              </ul>
            </div>
          </div>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Problema relatado</h2></div>
          <div class="rel-caixa"><p class="rel-texto">{{ d.ordem.descricao }}</p></div>
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Itens de manutenção</h2><span>{{ d.itens.length }} {{ d.itens.length === 1 ? 'item' : 'itens' }}</span></div>
          @if (d.itens.length) {
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela">
                <thead><tr><th>Item</th><th>Natureza</th><th>Repetição</th></tr></thead>
                <tbody>
                  @for (i of d.itens; track i.idItem) {
                    <tr>
                      <td><strong>{{ i.nome }}</strong></td>
                      <td>{{ i.naturezaRotulo }}</td>
                      <td>
                        @if (i.repeticao; as r) {
                          <geo-status tone="warning" icon="pi pi-replay">Repetida</geo-status>
                          <span class="rel-tabela__sub">OS {{ r.numeroOsAnterior }} há {{ r.diasDesdeAnterior }} dias (janela de {{ r.janelaDias }})</span>
                        } @else {
                          —
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="rel-vazio">Nenhum item de manutenção informado.</p>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Execução</h2><span>{{ d.servicos.length }} serviços · {{ d.pecas.length }} peças</span></div>
          @if (d.servicos.length) {
            <div class="rel-tabela-rolagem" style="margin-bottom: 0.75rem">
              <table class="rel-tabela">
                <thead><tr><th>Serviço</th><th>Mecânico</th><th class="num">Qtd.</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead>
                <tbody>
                  @for (s of d.servicos; track s.id) {
                    <tr>
                      <td><strong>{{ s.descricao }}</strong>@if (s.itemManutencao) {<span class="rel-tabela__sub">{{ s.itemManutencao }}</span>}</td>
                      <td>{{ s.mecanico ?? '—' }}</td>
                      <td class="num">{{ s.quantidade }}</td>
                      <td class="num">{{ moeda(s.valorUnitario) }}</td>
                      <td class="num">{{ moeda(s.subtotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @if (d.pecas.length) {
            <div class="rel-tabela-rolagem" style="margin-bottom: 0.75rem">
              <table class="rel-tabela">
                <thead><tr><th>Peça</th><th>Origem</th><th class="num">Qtd.</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead>
                <tbody>
                  @for (p of d.pecas; track p.id) {
                    <tr>
                      <td><strong>{{ p.descricao }}</strong>@if (p.codigo) {<span class="rel-tabela__sub">Código {{ p.codigo }}</span>}</td>
                      <td>{{ p.origemRotulo }}</td>
                      <td class="num">{{ p.quantidade }} {{ p.unidade }}</td>
                      <td class="num">{{ moeda(p.valorUnitario) }}</td>
                      <td class="num">{{ moeda(p.subtotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <div class="rel-tabela-rolagem">
            <table class="rel-tabela">
              <tbody>
                <tr><td>Serviços</td><td class="num">{{ moeda(d.totais.servicos) }}</td></tr>
                <tr><td>Peças</td><td class="num">{{ moeda(d.totais.pecas) }}</td></tr>
                @if (d.totais.desconto) {
                  <tr><td>Desconto</td><td class="num">− {{ moeda(d.totais.desconto) }}</td></tr>
                }
                @if (d.totais.acrescimo) {
                  <tr><td>Acréscimo</td><td class="num">+ {{ moeda(d.totais.acrescimo) }}</td></tr>
                }
              </tbody>
              <tfoot>
                <tr><td>Total da OS{{ d.totais.calculado ? '' : ' (valor informado)' }}</td><td class="num">{{ moeda(d.totais.total) }}</td></tr>
              </tfoot>
            </table>
          </div>
          @if (d.ordem.descricaoServico || d.ordem.itensSubstituidos || d.ordem.causa) {
            <div class="rel-caixa" style="margin-top: 0.75rem; display: grid; gap: 0.5rem">
              @if (d.ordem.causa) {
                <div class="kv"><span class="kv-l">Causa</span><span class="kv-v">{{ rotuloCausa[d.ordem.causa] }}</span></div>
              }
              @if (d.ordem.descricaoServico) {
                <div class="kv kv--topo"><span class="kv-l">Serviço feito</span><span class="kv-v kv-v--quebra">{{ d.ordem.descricaoServico }}</span></div>
              }
              @if (d.ordem.itensSubstituidos) {
                <div class="kv kv--topo"><span class="kv-l">Itens trocados</span><span class="kv-v kv-v--quebra">{{ d.ordem.itensSubstituidos }}</span></div>
              }
            </div>
          }
        </section>

        @if (d.orcamentos.length) {
          <section class="rel-secao">
            <div class="rel-secao__titulo"><h2>Orçamentos e financeiro</h2><span>{{ d.orcamentos.length }}</span></div>
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela">
                <thead><tr><th>Solicitação</th><th>Fornecedor</th><th>Situação</th><th class="num">Valor</th><th class="num">Aprovado</th></tr></thead>
                <tbody>
                  @for (o of d.orcamentos; track o.idSolicitacao) {
                    <tr>
                      <td><strong>{{ o.tipo === 'COMPRA' ? 'Compra' : 'Pagamento' }} Nº {{ o.numero }}</strong>
                        <span class="rel-tabela__sub">{{ (o.dataSubmissao | date: 'dd/MM/yyyy') || 'Rascunho' }}</span></td>
                      <td>{{ o.fornecedor ?? '—' }}</td>
                      <td><geo-status [tone]="tomFinanceiro[o.status]">{{ rotuloFinanceiro[o.status] }}</geo-status>
                        @if (o.motivoRejeicao) {<span class="rel-tabela__sub">{{ o.motivoRejeicao }}</span>}</td>
                      <td class="num">{{ moeda(o.valor) }}</td>
                      <td class="num">{{ moeda(o.valorAprovado) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Documentos fiscais</h2><span>{{ documentos().length }}</span></div>
          @if (documentos().length) {
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela">
                <thead><tr><th>Documento</th><th>Fornecedor</th><th>Emissão</th><th class="num">Valor</th><th>Arquivo</th></tr></thead>
                <tbody>
                  @for (doc of documentos(); track doc.id) {
                    <tr>
                      <td><strong>{{ doc.tipoRotulo }} {{ doc.numero }}</strong>@if (doc.serie) {<span class="rel-tabela__sub">Série {{ doc.serie }}</span>}</td>
                      <td>{{ doc.fornecedor ?? '—' }}</td>
                      <td>{{ doc.emitidoEm | date: 'dd/MM/yyyy' : 'UTC' }}</td>
                      <td class="num">{{ moeda(doc.valor) }}</td>
                      <td>{{ doc.possuiArquivo ? doc.arquivoNome : 'Sem anexo' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (fotosNotas().length) {
              <div style="margin-top: 0.75rem"><app-frota-relatorio-fotos [fotos]="fotosNotas()" /></div>
            }
          } @else {
            <p class="rel-vazio">Nenhum documento fiscal lançado.</p>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Análise da Bússola</h2></div>
          <app-frota-relatorio-analise-ia alvo="ORDEM_SERVICO" [idAlvo]="d.ordem.id" [fotosEsperadas]="fotosNotas().length" />
        </section>

        <section class="rel-secao">
          <app-frota-relatorio-linha-tempo [eventos]="eventos()" />
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Termo de execução e assinaturas</h2></div>
          <div class="rel-caixa" style="display: grid; gap: 1rem">
            <p class="rel-texto">
              Declaramos que os serviços e peças discriminados nesta ordem foram executados e conferidos, e que o
              {{ d.ordem.veicular ? 'veículo' : 'equipamento' }} foi devolvido à operação nas condições descritas.
            </p>
            <div class="rel-assinaturas">
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Gestão de Frota</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ d.ordem.usuarioAbertura ?? 'Responsável pela frota' }}</span>
                <span class="rel-assinatura__data">{{ d.ordem.fimReal ? (d.ordem.fimReal | date: 'dd/MM/yyyy HH:mm') : 'Data: ____/____/________' }}</span>
              </div>
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Oficina {{ rotuloOficina[d.ordem.tipoOficina].toLowerCase() }}</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ d.ordem.oficina }}</span>
                <span class="rel-assinatura__data">Responsável pela execução</span>
              </div>
            </div>
          </div>
        </section>

        <footer class="rel-rodape">
          <span>
            Aberta em <strong>{{ d.ordem.abertaEm | date: 'dd/MM/yyyy HH:mm' }}</strong>
            @if (d.ordem.fimReal) { · Concluída em <strong>{{ d.ordem.fimReal | date: 'dd/MM/yyyy HH:mm' }}</strong> }
          </span>
          <span class="rel-rodape__marca">Documento emitido eletronicamente via Sistema GEO · Frota</span>
        </footer>
      </article>

    }
  `
})
export class RelatorioOrdemServicoComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  private readonly service = inject(FrotaService);
  private readonly router = inject(Router);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detalhe = signal<OrdemServicoDetalhe | null>(null);
  protected readonly documentos = signal<DocumentoFiscalOrdemServico[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly tomSituacao = TOM_SITUACAO_OS;
  protected readonly rotuloSituacao = ROTULO_SITUACAO_OS;
  protected readonly tomCriticidade = TOM_CRITICIDADE;
  protected readonly rotuloCriticidade = ROTULO_CRITICIDADE;
  protected readonly rotuloTipo = ROTULO_TIPO_MANUTENCAO;
  protected readonly rotuloOrigem = ROTULO_ORIGEM_OS;
  protected readonly rotuloOficina = ROTULO_TIPO_OFICINA;
  protected readonly tomAprovacao = TOM_APROVACAO;
  protected readonly rotuloAprovacao = ROTULO_APROVACAO;
  protected readonly tomFinanceiro = TOM_STATUS_FINANCEIRO;
  protected readonly rotuloFinanceiro = ROTULO_STATUS_FINANCEIRO;
  protected readonly rotuloMotivo = ROTULO_MOTIVO;
  protected readonly rotuloCausa = ROTULO_CAUSA;
  protected readonly moeda = moeda;
  protected readonly formatarMedicao = formatarMedicao;

  protected readonly identificacao = computed(() => {
    const d = this.detalhe();
    return d ? identificacaoOs(d.ordem) : '';
  });

  protected readonly tempoParado = computed(() => {
    const o = this.detalhe()?.ordem;
    if (!o?.paradoDesde) return o?.veiculoParado ? 'Sim' : 'Não';
    const duracao = duracaoEntre(o.paradoDesde, o.liberadoEm);
    return o.paradaEmCurso ? `Parado há ${duracao}` : `${duracao} parado`;
  });

  protected readonly fotosNotas = computed<FotoRelatorio[]>(() => {
    const d = this.detalhe();
    if (!d) return [];
    return this.documentos()
      .filter((doc) => doc.possuiArquivo && (doc.arquivoContentType ?? '').startsWith('image/'))
      .map((doc) => ({
        id: doc.id,
        rotulo: `${doc.tipoRotulo} ${doc.numero}`,
        detalhe: doc.fornecedor,
        recebida: true,
        carregar: () => this.service.baixarArquivoDocumentoFiscalOs(d.ordem.id, doc.id)
      }));
  });

  protected readonly eventos = computed<EventoRelatorio[]>(() =>
    (this.detalhe()?.historico ?? []).map((h: HistoricoOrdemServico) => ({
      titulo: h.tipoRotulo,
      descricao: h.descricao,
      usuario: h.usuario,
      quando: h.ocorridoEm,
      icone: EVENTO[h.tipo]?.icone ?? 'pi-circle',
      tom: EVENTO[h.tipo]?.tom ?? 'neutral'
    }))
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => this.carregar(id));
    });
  }

  protected carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    forkJoin({
      detalhe: this.service.detalharOrdemServico(id),
      documentos: this.service.documentosFiscaisOs(id).pipe(catchError(() => of([] as DocumentoFiscalOrdemServico[])))
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ detalhe, documentos }) => {
          this.detalhe.set(detalhe);
          this.documentos.set(documentos);
          this.carregando.set(false);
          document.title = `${rotuloOs(detalhe.ordem.numero)} · Relatório · GEO`;
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }

  protected voltar(): void {
    this.navegacao.back(['/frota', 'ordens-servico']);
  }

  protected abrirFicha(id: string): void {
    void this.router.navigate(['/frota', 'ordens-servico', id]);
  }

  protected imprimir(): void {
    window.print();
  }
}
