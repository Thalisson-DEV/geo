import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CesAsyncStateComponent, CesStatusComponent } from '@ces/ui';
import { map } from 'rxjs/operators';
import { AbastecimentoDetalhe } from '../../../core/models/frota-abastecimento.models';
import { formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { ICONE_SITUACAO, TOM_SITUACAO, formatarWhatsapp, moeda, precoUnitario, produtoTrocado, quantidade } from '../abastecimentos/frota-abastecimento.util';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { FrotaRelatorioAnaliseIaComponent } from './frota-relatorio-analise-ia.component';
import { FrotaRelatorioCabecalhoComponent } from './frota-relatorio-cabecalho.component';
import { FotoRelatorio, FrotaRelatorioFotosComponent } from './frota-relatorio-fotos.component';
import { EventoRelatorio, FrotaRelatorioLinhaTempoComponent } from './frota-relatorio-linha-tempo.component';

/**
 * Relatório do abastecimento no padrão do relatório da solicitação de material: pedido, aprovação,
 * liberação ao posto e realizado; itens pedidos e entregues; alertas de aderência; fotos do painel e do
 * cupom com a leitura da IA; e o histórico de movimentações montado com as datas de cada etapa.
 */
@Component({
  selector: 'app-relatorio-abastecimento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesAsyncStateComponent,
    CesStatusComponent,
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
        <ces-async-state state="loading" title="Carregando o abastecimento..." description="Consultando pedido, liberação e realizado."></ces-async-state>
      </div>
    } @else if (erro()) {
      <div class="rel-estado">
        <ces-async-state state="error" title="Relatório indisponível" [description]="erro()!" actionLabel="Tentar novamente" (action)="carregar(id())"></ces-async-state>
      </div>
    } @else if (detalhe(); as a) {
      <article class="rel">
        <app-frota-relatorio-cabecalho area="Abastecimento" [titulo]="'Abastecimento · ' + placa()">
          <ces-status [tone]="tomSituacao[a.situacao]" [icon]="'pi ' + iconeSituacao[a.situacao]">{{ a.situacaoRotulo }}</ces-status>
          <span>·</span>
          <span><strong>{{ a.posto }}</strong></span>
          <span>·</span>
          <span>Pedido em <strong>{{ a.solicitadoEm | date: 'dd/MM/yyyy HH:mm' }}</strong></span>
          <app-analisar-com-copiloto acoes-titulo origem="Abastecimento da frota" tipo="frota_abastecimento" [entidade]="a.id"
            [rotulo]="'Abastecimento ' + placa()" size="sm"
            pergunta="Analise este abastecimento para apoiar a decisão: consumo, preço por litro, frequência e alertas, comparando com o histórico do veículo e da base." />
        </app-frota-relatorio-cabecalho>

        <section class="rel-dados" aria-label="Dados gerais do abastecimento">
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-car" aria-hidden="true"></i>Veículo e posto</div>
            <div class="kv"><span class="kv-l">Placa</span><span class="kv-v">{{ placa() }}</span></div>
            <div class="kv"><span class="kv-l">Veículo</span><span class="kv-v" [title]="a.veiculoDescricao ?? ''">{{ a.veiculoDescricao ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Base</span><span class="kv-v">{{ a.baseNome ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Posto</span><span class="kv-v" [title]="a.posto">{{ a.posto }}</span></div>
            <div class="kv"><span class="kv-l">WhatsApp</span><span class="kv-v">{{ a.postoWhatsapp ? formatarWhatsapp(a.postoWhatsapp) : '—' }}</span></div>
            <div class="kv"><span class="kv-l">Tanque</span><span class="kv-v">{{ a.capacidadeTanque ? quantidade(a.capacidadeTanque, 'l') : '—' }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-calendar" aria-hidden="true"></i>Etapas</div>
            <div class="kv"><span class="kv-l">Pedido</span><span class="kv-v">{{ a.solicitadoEm | date: 'dd/MM/yyyy HH:mm' }}</span></div>
            <div class="kv"><span class="kv-l">{{ a.situacao === 'REPROVADA' ? 'Reprovado' : 'Aprovado' }}</span>
              <span class="kv-v" [class.kv-v--perigo]="a.situacao === 'REPROVADA'">{{ (a.aprovadoEm | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Liberado</span><span class="kv-v">{{ (a.liberadoEm | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Vale até</span><span class="kv-v">{{ (a.venceEm | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Realizado</span>
              <span class="kv-v" [class.kv-v--sucesso]="!!a.realizadoEm">{{ (a.realizadoEm | date: 'dd/MM/yyyy HH:mm') || 'Pendente' }}</span></div>
            <div class="kv"><span class="kv-l">Valor total</span><span class="kv-v">{{ moeda(a.valorTotal) }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-users" aria-hidden="true"></i>Envolvidos</div>
            <div class="kv"><span class="kv-l">{{ a.origem === 'AVULSA' ? 'Lançado (avulso) por' : 'Solicitante' }}</span><span class="kv-v">{{ a.solicitante ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Destino</span><span class="kv-v">{{ a.destino ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Condutor</span><span class="kv-v">{{ a.condutor ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Aprovador</span><span class="kv-v">{{ a.aprovador ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Liberador</span><span class="kv-v">{{ a.liberador ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">{{ unidade() === 'h' ? 'Horímetro' : 'KM' }} no pedido</span>
              <span class="kv-v">{{ formatarMedicao(a.medicaoSolicitacao, a.unidadeMedicao) }}</span></div>
            <div class="kv"><span class="kv-l">{{ unidade() === 'h' ? 'Horímetro' : 'KM' }} no realizado</span>
              <span class="kv-v">{{ formatarMedicao(a.medicaoRealizado, a.unidadeMedicao) }}</span></div>
          </div>
        </section>

        @if (a.situacao === 'REPROVADA' || a.situacao === 'CANCELADA') {
          <div class="rel-destaque" data-tom="danger">
            <span class="rel-destaque__icone"><i class="pi {{ a.situacao === 'REPROVADA' ? 'pi-times-circle' : 'pi-ban' }}" aria-hidden="true"></i></span>
            <div class="rel-destaque__corpo">
              <span class="rel-destaque__titulo">
                {{ a.situacao === 'REPROVADA' ? 'Reprovado por ' + (a.aprovador ?? '—') : 'Cancelado por ' + (a.cancelador ?? '—') }}
              </span>
              <p class="rel-texto">{{ (a.situacao === 'REPROVADA' ? a.motivoReprovacao : a.motivoCancelamento) || 'Sem motivo informado.' }}</p>
            </div>
          </div>
        }

        @if (a.alertas.length) {
          <div class="rel-destaque" data-tom="warning">
            <span class="rel-destaque__icone"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i></span>
            <div class="rel-destaque__corpo">
              <span class="rel-destaque__titulo">Alertas de aderência</span>
              <ul>
                @for (al of a.alertas; track $index) {
                  <li><strong>{{ al.tipoRotulo }}</strong> ({{ al.etapa === 'SOLICITACAO' ? 'no pedido' : al.etapa === 'APROVACAO' ? 'na aprovação' : 'no realizado' }}): {{ al.mensagem }}</li>
                }
              </ul>
            </div>
          </div>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Itens autorizados e entregues</h2><span>{{ a.itens.length }}</span></div>
          <div class="rel-tabela-rolagem">
            <table class="rel-tabela">
              <thead><tr><th>Produto</th><th class="num">Aprovado</th><th class="num">Liberado</th><th class="num">Entregue</th><th class="num">Preço</th><th class="num">Valor</th></tr></thead>
              <tbody>
                @for (i of a.itens; track i.id) {
                  <tr>
                    <td>
                      <strong>{{ i.produto ?? i.produtoPedido }}</strong>
                      @if (produtoTrocado(i)) {
                        <span class="rel-tabela__sub">Pedido: {{ i.produtoPedido }} (trocado no posto)</span>
                      }
                      @if (i.tanqueCheio) {
                        <span class="rel-tabela__sub">Tanque cheio</span>
                      }
                    </td>
                    <td class="num">{{ quantidade(i.quantidadeAprovada ?? i.quantidadePedida, i.unidade) }}</td>
                    <td class="num">{{ quantidade(i.quantidadeLiberada, i.unidade) }}</td>
                    <td class="num">{{ quantidade(i.quantidade, i.unidade) }}</td>
                    <td class="num">{{ precoUnitario(i.valorUnitario, i.unidade) }}</td>
                    <td class="num">{{ moeda(i.valorTotal) }}</td>
                  </tr>
                }
              </tbody>
              @if (a.valorTotal !== null) {
                <tfoot><tr><td colspan="5">Total pago</td><td class="num">{{ moeda(a.valorTotal) }}</td></tr></tfoot>
              }
            </table>
          </div>
          @if (a.observacao) {
            <div class="rel-caixa" style="margin-top: 0.75rem"><p class="rel-texto"><strong>Observação:</strong> {{ a.observacao }}</p></div>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Fotos do painel e do cupom</h2><span>{{ fotos().length }}</span></div>
          @if (fotos().length) {
            <app-frota-relatorio-fotos [fotos]="fotos()" />
          } @else {
            <p class="rel-vazio">Nenhuma foto enviada.</p>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Análise da Bússola</h2></div>
          <app-frota-relatorio-analise-ia alvo="ABASTECIMENTO" [idAlvo]="a.id" [fotosEsperadas]="fotos().length" />
        </section>

        <section class="rel-secao">
          <app-frota-relatorio-linha-tempo [eventos]="eventos()" />
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Termo de abastecimento e assinaturas</h2></div>
          <div class="rel-caixa" style="display: grid; gap: 1rem">
            <p class="rel-texto">
              Declaramos que o combustível e os produtos discriminados acima foram entregues ao veículo {{ placa() }} no posto
              {{ a.posto }}, conforme o cupom anexado.
            </p>
            <div class="rel-assinaturas">
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Condutor</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ a.condutor ?? a.solicitante ?? 'Condutor' }}</span>
                <span class="rel-assinatura__data">{{ a.realizadoEm ? (a.realizadoEm | date: 'dd/MM/yyyy HH:mm') : 'Data: ____/____/________' }}</span>
              </div>
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Gestão de Frota</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ a.aprovador ?? 'Gestor da frota' }}</span>
                <span class="rel-assinatura__data">Aprovação</span>
              </div>
            </div>
          </div>
        </section>

        <footer class="rel-rodape">
          <span>Pedido em <strong>{{ a.solicitadoEm | date: 'dd/MM/yyyy HH:mm' }}</strong> por <strong>{{ a.solicitante ?? '—' }}</strong></span>
          <span class="rel-rodape__marca">Documento emitido eletronicamente via Sistema GEO · Frota</span>
        </footer>
      </article>

      <div class="rel-acoes" role="toolbar" aria-label="Ações do relatório">
        <div class="rel-acoes__linha">
          <button type="button" class="rel-acao rel-acao--so-desktop" (click)="voltar()"><i class="pi pi-arrow-left" aria-hidden="true"></i>Voltar</button>
          <button type="button" class="rel-acao rel-acao--forte rel-acao--so-desktop" (click)="imprimir()"><i class="pi pi-print" aria-hidden="true"></i>Imprimir</button>
          @if (a.podeAprovar || a.podeLiberar) {
            <button type="button" class="rel-acao rel-acao--primaria" (click)="abrirNaFila()"><i class="pi {{ a.podeAprovar ? 'pi-check-circle' : 'pi-send' }}" aria-hidden="true"></i>{{ a.podeAprovar ? 'Aprovar ou reprovar' : 'Liberar ao posto' }}</button>
          }
        </div>
      </div>
    }
  `
})
export class RelatorioAbastecimentoComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  private readonly service = inject(FrotaAbastecimentoService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detalhe = signal<AbastecimentoDetalhe | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly tomSituacao = TOM_SITUACAO;
  protected readonly iconeSituacao = ICONE_SITUACAO;
  protected readonly moeda = moeda;
  protected readonly quantidade = quantidade;
  protected readonly precoUnitario = precoUnitario;
  protected readonly produtoTrocado = produtoTrocado;
  protected readonly formatarWhatsapp = formatarWhatsapp;
  protected readonly formatarMedicao = formatarMedicao;

  protected readonly placa = computed(() => formatarPlaca(this.detalhe()?.placa));
  protected readonly unidade = computed(() => (this.detalhe()?.unidadeMedicao === 'HORAS' ? 'h' : 'km'));

  protected readonly fotos = computed<FotoRelatorio[]>(() => {
    const a = this.detalhe();
    if (!a) return [];
    return a.fotos.map((f) => ({ id: f.id, rotulo: f.tipoRotulo, recebida: f.recebida, carregar: () => this.service.foto(a.id, f.id) }));
  });

  protected readonly eventos = computed<EventoRelatorio[]>(() => {
    const a = this.detalhe();
    if (!a) return [];
    const itens = a.itens.map((i) => i.quantidadePedida == null ? i.produtoPedido : `${i.produtoPedido} ${quantidade(i.quantidadePedida, i.unidade)}`).join(', ');
    const eventos: EventoRelatorio[] = [
      { titulo: a.origem === 'AVULSA' ? 'Abastecimento avulso lançado' : 'Abastecimento pedido',
        descricao: `${itens} no posto ${a.posto}${a.destino ? `, destino ${a.destino}` : ''}.`, usuario: a.solicitante, quando: a.solicitadoEm, icone: 'pi-plus', tom: 'brand' }
    ];
    if (a.aprovadoEm) {
      const reprovado = a.situacao === 'REPROVADA';
      eventos.push({
        titulo: reprovado ? 'Pedido reprovado' : 'Pedido aprovado',
        descricao: reprovado ? a.motivoReprovacao : null,
        usuario: a.aprovador,
        quando: a.aprovadoEm,
        icone: reprovado ? 'pi-times' : 'pi-check',
        tom: reprovado ? 'danger' : 'info'
      });
    }
    if (a.liberadoEm) {
      eventos.push({
        titulo: 'Liberado ao posto',
        descricao: a.venceEm ? `Vale até ${new Date(a.venceEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : null,
        usuario: a.liberador,
        quando: a.liberadoEm,
        icone: 'pi-send',
        tom: 'brand'
      });
    }
    for (const aviso of a.avisos) {
      eventos.push({
        titulo: aviso.motivo === 'LIBERACAO' ? 'Aviso de liberação ao posto' : 'Aviso de cancelamento ao posto',
        descricao: aviso.situacao === 'FALHOU' ? 'O aviso não foi entregue.' : aviso.abertoEm ? 'Enviado pelo WhatsApp.' : 'Aguardando envio.',
        usuario: aviso.abertoPor,
        quando: aviso.abertoEm ?? aviso.criadoEm,
        icone: 'pi-whatsapp',
        tom: aviso.situacao === 'FALHOU' ? 'danger' : 'neutral'
      });
    }
    if (a.realizadoEm) {
      eventos.push({
        titulo: 'Abastecimento realizado',
        descricao: a.valorTotal !== null ? `Total de ${moeda(a.valorTotal)}.` : null,
        usuario: a.condutor,
        quando: a.realizadoEm,
        icone: 'pi-check-circle',
        tom: 'success'
      });
    }
    if (a.canceladoEm) {
      eventos.push({ titulo: 'Cancelado', descricao: a.motivoCancelamento, usuario: a.cancelador, quando: a.canceladoEm, icone: 'pi-ban', tom: 'danger' });
    }
    if (a.situacao === 'VENCIDA' && a.venceEm) {
      eventos.push({ titulo: 'Liberação vencida sem abastecer', quando: a.venceEm, icone: 'pi-hourglass', tom: 'neutral' });
    }
    return eventos;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => this.carregar(id));
    });
  }

  protected carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service
      .detalhar(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.detalhe.set(a);
          this.carregando.set(false);
          document.title = `Abastecimento ${formatarPlaca(a.placa)} · Relatório · GEO`;
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }

  protected voltar(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/frota', 'abastecimentos']);
  }

  /** Aprovar e liberar acontecem no detalhe da fila, com os mesmos formulários de sempre. */
  protected abrirNaFila(): void {
    void this.router.navigate(['/frota', 'abastecimentos'], { queryParams: { abastecimento: this.id() } });
  }

  protected imprimir(): void {
    window.print();
  }
}
