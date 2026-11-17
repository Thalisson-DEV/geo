import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChildren } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CesButtonComponent, CesPageHeaderComponent, CesTabItem, CesTabPanelDirective, CesTabsComponent, cesUrlParam } from '@ces/ui';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPainelService,
  metricaPainel
} from '../../copiloto/painel';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaAbastecimentoAvulsoDrawerComponent } from './frota-abastecimento-avulso-drawer.component';
import { FrotaAbastecimentoDetalheDrawerComponent } from './frota-abastecimento-detalhe-drawer.component';
import { filtrosAbastecimento } from './frota-abastecimentos-filtros';
import { FrotaAbastecimentosListaComponent } from './frota-abastecimentos-lista.component';
import { FrotaFaturasPostoComponent } from './frota-faturas-posto.component';

const ABAS = ['aprovar', 'liberar', 'liberados', 'todos', 'faturas'] as const;
type Aba = (typeof ABAS)[number];

/**
 * Abastecimento da frota: pedidos para aprovar (placas da carteira), para liberar, liberados
 * com o aviso ao posto e todos. A Bússola enxerga o recorte e analisa um pedido.
 */
@Component({
  selector: 'app-frota-abastecimentos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesPageHeaderComponent,
    FrotaAbastecimentoAvulsoDrawerComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    FrotaAbastecimentoDetalheDrawerComponent,
    FrotaAbastecimentosListaComponent,
    FrotaFaturasPostoComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent
  ],
  template: `
    <app-copiloto-area [contexto]="contextoAssistente()">
      <div class="ces-page">
        <ces-page-header title="Abastecimentos" icon="pi pi-gauge" [breadcrumb]="[{ label: 'Frota' }, { label: 'Abastecimentos' }]"
          description="Pedidos feitos pelo app: o gestor da placa aprova com a quantidade, o administrativo libera e avisa o posto, a equipe registra o abastecimento.">
          @if (acesso.aprovarAbastecimento()) {
            <ces-button actions variant="outline" icon="pi pi-bolt" label="Lançar avulso" (pressed)="avulsoAberto.set(true)"></ces-button>
          }
          @if (assistenteDisponivel) {
            <app-copiloto-gatilho actions></app-copiloto-gatilho>
          }
        </ces-page-header>

        <ces-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções do abastecimento">
          @for (a of abasVisiveis(); track a) {
            <ng-template [cesTabPanel]="a">
              @if (a === 'faturas') {
                <app-frota-faturas-posto [filtros]="filtros" [assistente]="assistenteDisponivel" (analisar)="analisarFatura($event)"></app-frota-faturas-posto>
              } @else {
                <app-frota-abastecimentos-lista [modo]="a" [filtros]="filtros" (abrir)="abrir($event)" (alterou)="contar()"></app-frota-abastecimentos-lista>
              }
            </ng-template>
          }
        </ces-tabs>
      </div>
    </app-copiloto-area>

    <app-frota-abastecimento-detalhe-drawer [(visible)]="detalheAberto" [idAbastecimento]="selecionado()"
      [assistente]="assistenteDisponivel" (alterado)="aoAlterar()" (analisar)="analisar($event)"></app-frota-abastecimento-detalhe-drawer>
    <app-frota-abastecimento-avulso-drawer [(visible)]="avulsoAberto" (lancado)="aoLancarAvulso($event.id)"></app-frota-abastecimento-avulso-drawer>
  `
})
export class FrotaAbastecimentosComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly assistente = inject(CopilotoPainelService);
  private readonly route = inject(ActivatedRoute);
  private readonly listas = viewChildren(FrotaAbastecimentosListaComponent);
  protected readonly acesso = acessoFrota();
  protected readonly filtros = filtrosAbastecimento();
  protected readonly assistenteDisponivel = this.assistente.disponivelParaUsuario();

  private readonly paraAprovar = signal<number | undefined>(undefined);
  private readonly paraLiberar = signal<number | undefined>(undefined);
  private readonly liberados = signal<number | undefined>(undefined);
  protected readonly detalheAberto = signal(false);
  protected readonly avulsoAberto = signal(false);
  protected readonly selecionado = signal<string | null>(null);

  protected readonly abasVisiveis = computed<Aba[]>(() => [
    ...(this.acesso.aprovarAbastecimento() ? (['aprovar'] as Aba[]) : []),
    ...(this.acesso.liberarAbastecimento() ? (['liberar', 'liberados'] as Aba[]) : []),
    'todos',
    ...(this.acesso.liberarAbastecimento() ? (['faturas'] as Aba[]) : [])
  ]);
  protected readonly aba = cesUrlParam<Aba>({ values: ABAS, default: this.abaPadrao() });
  protected readonly abas = computed<CesTabItem[]>(() => {
    const todas: Record<Aba, CesTabItem> = {
      aprovar: { value: 'aprovar', label: 'Para aprovar', icon: 'pi pi-check-square', badge: this.paraAprovar() || undefined },
      liberar: { value: 'liberar', label: 'Para liberar', icon: 'pi pi-send', badge: this.paraLiberar() || undefined },
      liberados: { value: 'liberados', label: 'Liberados', icon: 'pi pi-whatsapp', badge: this.liberados() || undefined },
      todos: { value: 'todos', label: 'Todos', icon: 'pi pi-list' },
      faturas: { value: 'faturas', label: 'Faturas do posto', icon: 'pi pi-receipt' }
    };
    return this.abasVisiveis().map((a) => todas[a]);
  });

  /** A Bússola recebe as filas e consulta os abastecimentos e os itens entregues. */
  protected readonly contextoAssistente = computed<CopilotoDashboardContext>(() => ({
    id: 'frota.abastecimentos',
    nome: 'Abastecimentos da frota',
    modulo: 'Frota',
    descricao: 'Pedidos de abastecimento feitos pelo app: aprovação pelo gestor da placa, liberação pelo administrativo com aviso ao posto, realizado com litros, valor, cupom e alertas de aderência.',
    rota: '/frota/abastecimentos',
    filtros: [],
    metricas: [
      metricaPainel('paraAprovar', 'Pedidos aguardando a minha aprovação', this.paraAprovar() ?? null, 'inteiro'),
      metricaPainel('paraLiberar', 'Aprovados aguardando liberação', this.paraLiberar() ?? null, 'inteiro'),
      metricaPainel('liberados', 'Liberados aguardando o abastecimento', this.liberados() ?? null, 'inteiro')
    ],
    graficos: [],
    datasets: ['abastecimentos', 'abastecimento_itens', 'veiculos'],
    sugestoes: [
      { rotulo: 'Gasto por posto', icone: 'pi pi-chart-bar', requer: ['dados'], pergunta: 'Quanto foi gasto em abastecimento por posto e por base neste mês, e como se compara ao mês anterior?' },
      { rotulo: 'Consumo fora do padrão', icone: 'pi pi-exclamation-triangle', requer: ['dados'], pergunta: 'Quais placas tiveram alerta de consumo fora do padrão ou volume acima do tanque nos últimos 30 dias, e quantas vezes?' },
      { rotulo: 'Preço do diesel', icone: 'pi pi-dollar', requer: ['dados'], pergunta: 'Qual o preço médio do litro de cada combustível por posto nos últimos 30 dias? Algum posto está acima da média?' }
    ]
  }));

  constructor() {
    this.contar();
    const id = this.route.snapshot.queryParamMap.get('abastecimento');
    if (id) this.abrir(id);
  }

  protected abrir(id: string): void {
    // Abaixo de 1280px a Bússola sobrepõe a tela: não deixa os dois painéis empilhados.
    if (typeof matchMedia === 'function' && !matchMedia('(min-width: 1280px)').matches) this.assistente.fechar();
    this.selecionado.set(id);
    this.detalheAberto.set(true);
  }

  protected aoLancarAvulso(id: string): void {
    this.aoAlterar();
    this.abrir(id);
  }

  protected aoAlterar(): void {
    this.contar();
    this.listas().forEach((l) => l.recarregar());
  }

  protected analisar(pedido: { id: string; rotulo: string; pergunta: string }): void {
    this.detalheAberto.set(false);
    this.assistente.perguntarSobre({ tipo: 'secao', id: `abastecimento.${pedido.id}`, rotulo: pedido.rotulo }, pedido.pergunta);
  }

  protected analisarFatura(fatura: { id: string; rotulo: string; pergunta: string }): void {
    this.assistente.perguntarSobre({ tipo: 'secao', id: `fatura-posto.${fatura.id}`, rotulo: fatura.rotulo }, fatura.pergunta);
  }

  protected contar(): void {
    const pagina = { page: 0, size: 1 };
    if (this.acesso.aprovarAbastecimento()) {
      this.servico.listar({ fila: 'APROVAR' }, pagina).subscribe({ next: (p) => this.paraAprovar.set(p.page.totalElements), error: () => undefined });
    }
    if (this.acesso.liberarAbastecimento()) {
      this.servico.listar({ fila: 'LIBERAR' }, pagina).subscribe({ next: (p) => this.paraLiberar.set(p.page.totalElements), error: () => undefined });
      this.servico.listar({ situacoes: ['LIBERADA'] }, pagina).subscribe({ next: (p) => this.liberados.set(p.page.totalElements), error: () => undefined });
    }
  }

  private abaPadrao(): Aba {
    if (this.acesso.aprovarAbastecimento()) return 'aprovar';
    if (this.acesso.liberarAbastecimento()) return 'liberar';
    return 'todos';
  }
}
