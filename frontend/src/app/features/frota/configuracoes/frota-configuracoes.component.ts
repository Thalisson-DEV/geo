import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoRowActionsDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoSurfaceComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable } from 'rxjs';
import { CategoriaCnh, OpcoesFrota, TipoImplemento, TipoVeiculo } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaConfigAbastecimentoComponent } from './frota-config-abastecimento.component';
import { FrotaTiposDespesaComponent } from './frota-tipos-despesa.component';
import { FrotaItensManutencaoComponent } from './frota-itens-manutencao.component';
import { FrotaModelosChecklistComponent } from './frota-modelos-checklist.component';
import { FrotaPlanosPreventivaComponent } from '../preventiva/frota-planos-preventiva.component';

type Catalogo = 'veiculo' | 'implemento';
/** Cada cadastro da frota tem a sua rota, como os cadastros do almoxarifado. */
export type SecaoCadastroFrota =
  | 'veiculo'
  | 'implemento'
  | 'itens'
  | 'checklists'
  | 'planos'
  | 'aprovadores'
  | 'postos'
  | 'produtos'
  | 'despesas'
  | 'parametros';

const SECOES: Record<SecaoCadastroFrota, { titulo: string; icone: string; descricao: string }> = {
  veiculo: { titulo: 'Tipos de veículo', icone: 'pi pi-car', descricao: 'Classificam a frota e definem a CNH mínima para conduzir.' },
  implemento: { titulo: 'Tipos de implemento', icone: 'pi pi-link', descricao: 'Cestos, guindautos, carretas e outros equipamentos acoplados aos veículos.' },
  itens: { titulo: 'Itens de manutenção', icone: 'pi pi-wrench', descricao: 'Catálogo dos itens das OS, com a natureza do financeiro e a janela de repetição.' },
  checklists: { titulo: 'Modelos de checklist', icone: 'pi pi-list-check', descricao: 'Perguntas do checklist por tipo de veículo e os modelos adicionais por implemento.' },
  planos: { titulo: 'Planos de preventiva', icone: 'pi pi-calendar-clock', descricao: 'Revisões por placa (ou por tipo de veículo), de quanto em quanto (km, horas ou dias) e o que a OS preventiva leva.' },
  aprovadores: { titulo: 'Aprovadores do abastecimento', icone: 'pi pi-user-edit', descricao: 'Quem aprova os pedidos de cada placa. Placa sem aprovador fica parada na fila.' },
  postos: { titulo: 'Postos', icone: 'pi pi-map-marker', descricao: 'Postos externos credenciados: WhatsApp do aviso e fornecedor da fatura.' },
  produtos: { titulo: 'Produtos do abastecimento', icone: 'pi pi-box', descricao: 'Combustíveis, ARLA, óleos e fluidos que a equipe pode pedir.' },
  despesas: { titulo: 'Tipos de despesa', icone: 'pi pi-receipt', descricao: 'Lavagem, pedágio, estacionamento e as demais despesas por veículo, com subtipos.' },
  parametros: { titulo: 'Parâmetros da frota', icone: 'pi pi-sliders-h', descricao: 'Avisos de vencimento, limites da conferência de KM e horímetro, a janela de repetição e o expediente da frota.' }
};
type ItemCatalogo = { id: string; nome: string; descricao: string | null; categoriaCnhMinima?: CategoriaCnh | null; ativo: boolean };

@Component({
  selector: 'app-frota-configuracoes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoRowActionsDirective,
    GeoDataTableComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoSurfaceComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    FrotaConfigAbastecimentoComponent,
    FrotaTiposDespesaComponent,
    FrotaItensManutencaoComponent,
    FrotaModelosChecklistComponent,
    FrotaPlanosPreventivaComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header
        [title]="info.titulo"
        [icon]="info.icone"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Cadastros' }, { label: info.titulo }]"
        [description]="info.descricao"
      ></geo-page-header>

      @switch (secao) {
        @case ('veiculo') {
          <geo-data-table title="Tipos de veículo" description="Definem a CNH mínima e agrupam planos de manutenção e checklists."
            storageKey="frota-tipos-veiculo" searchPlaceholder="Filtrar nesta lista" [columns]="colunasVeiculo" [rows]="tiposVeiculo()"
            [rowKey]="chave" [state]="estado(tiposVeiculo())" stateTitle="Nenhum tipo de veículo cadastrado"
            stateDescription="Cadastre tipos como Picape, Caminhão cesto ou Moto para classificar os veículos."
            [rowClickable]="acesso.configurar()" (rowActivate)="abrir('veiculo', $event)">
            <ng-container table-actions>
              @if (acesso.configurar()) {
                <geo-button size="sm" icon="pi pi-plus" label="Novo tipo" (pressed)="abrir('veiculo', null)"></geo-button>
              }
            </ng-container>
            <ng-template geoCell="ativo" let-row>
              <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
            </ng-template>
            <ng-template geoRowActions let-row>
              @if (acesso.configurar()) {
                <span class="geo-table-actions">
                  <geo-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar tipo" size="icon-sm" (pressed)="abrir('veiculo', row)"></geo-icon-button>
                  <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                    [tooltip]="row.ativo ? 'Desativar tipo' : 'Reativar tipo'" size="icon-sm" (pressed)="alternar('veiculo', row)"></geo-icon-button>
                </span>
              }
            </ng-template>
          </geo-data-table>
        }

        @case ('implemento') {
          <geo-data-table title="Tipos de implemento" description="Classificam os equipamentos acopláveis, como cesto aéreo e guindauto."
            storageKey="frota-tipos-implemento" searchPlaceholder="Filtrar nesta lista" [columns]="colunasImplemento" [rows]="tiposImplemento()"
            [rowKey]="chave" [state]="estado(tiposImplemento())" stateTitle="Nenhum tipo de implemento cadastrado"
            stateDescription="Cadastre os tipos antes de incluir os implementos."
            [rowClickable]="acesso.configurar()" (rowActivate)="abrir('implemento', $event)">
            <ng-container table-actions>
              @if (acesso.configurar()) {
                <geo-button size="sm" icon="pi pi-plus" label="Novo tipo" (pressed)="abrir('implemento', null)"></geo-button>
              }
            </ng-container>
            <ng-template geoCell="ativo" let-row>
              <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
            </ng-template>
            <ng-template geoRowActions let-row>
              @if (acesso.configurar()) {
                <span class="geo-table-actions">
                  <geo-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar tipo" size="icon-sm" (pressed)="abrir('implemento', row)"></geo-icon-button>
                  <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                    [tooltip]="row.ativo ? 'Desativar tipo' : 'Reativar tipo'" size="icon-sm" (pressed)="alternar('implemento', row)"></geo-icon-button>
                </span>
              }
            </ng-template>
          </geo-data-table>
        }

        @case ('itens') {
          <app-frota-itens-manutencao [opcoes]="opcoes()" [janelaPadrao]="janelaRepeticao() ?? 90"></app-frota-itens-manutencao>
        }

        @case ('checklists') {
          <app-frota-modelos-checklist></app-frota-modelos-checklist>
        }

        @case ('planos') {
          <app-frota-planos-preventiva></app-frota-planos-preventiva>
        }

        @case ('aprovadores') {
          <app-frota-config-abastecimento parte="aprovadores"></app-frota-config-abastecimento>
        }

        @case ('postos') {
          <app-frota-config-abastecimento parte="postos"></app-frota-config-abastecimento>
        }

        @case ('produtos') {
          <app-frota-config-abastecimento parte="produtos"></app-frota-config-abastecimento>
        }

        @case ('despesas') {
          <app-frota-tipos-despesa></app-frota-tipos-despesa>
        }

        @case ('parametros') {
          <geo-surface>
            <section class="geo-sheet-section" aria-labelledby="parametros-titulo">
            <h2 id="parametros-titulo"><i class="pi pi-sliders-h" aria-hidden="true"></i> Avisos, KM, horímetro e repetição</h2>
            <div class="geo-form-grid">
              <geo-text-input label="Faixas de aviso de vencimento (dias)" [(value)]="faixas" [disabled]="!acesso.configurar()"
                description="Separadas por vírgula. Ex.: 30, 15, 7, 0 — 0 avisa no dia do vencimento." [error]="erroFaixas()"></geo-text-input>
              <geo-number-input label="Limite de km por dia" [(value)]="limiteKmDia" [min]="1" [max]="5000" suffix=" km"
                [disabled]="!acesso.configurar()" description="Acima disso, a média diária entre duas leituras marca a leitura para conferência."></geo-number-input>
              <geo-number-input label="Limite de horas por dia" [(value)]="limiteHorasDia" [min]="1" [max]="24" suffix=" h"
                [disabled]="!acesso.configurar()" description="Para veículos com horímetro (compressores, retroescavadeiras). Acima disso, a leitura vai para conferência."></geo-number-input>
              <geo-number-input label="Trava de KM no campo" [(value)]="limiteSaltoKm" [min]="1" [max]="100000" suffix=" km"
                [disabled]="!acesso.configurar()" description="No checklist e no abastecimento, o KM nunca é menor que o último nem passa dele mais que isto. Evita a casa decimal do painel virar milhões de km."></geo-number-input>
              <geo-number-input label="Trava de horas no campo" [(value)]="limiteSaltoHoras" [min]="0" [max]="10000" suffix=" h" [showOptional]="true"
                [disabled]="!acesso.configurar()" description="Mesma trava para o horímetro. Vazio ou zero: só recusa valor menor que o último."></geo-number-input>
              <geo-number-input label="Janela de repetição de manutenção" [(value)]="janelaRepeticao" [min]="1" [max]="730" suffix=" dias"
                [disabled]="!acesso.configurar()" description="O mesmo item na mesma placa dentro desse prazo conta como manutenção repetida. Cada item pode ter a sua."></geo-number-input>
            </div>
            </section>
            <section class="geo-sheet-section" aria-labelledby="parametros-expediente-titulo">
            <h2 id="parametros-expediente-titulo"><i class="pi pi-clock" aria-hidden="true"></i> Expediente da frota</h2>
            <div class="geo-form-grid">
              <geo-select label="Início" [options]="horarios" [(value)]="expedienteInicio" [disabled]="!acesso.configurar()"
                description="Andar fora do horário (e no domingo) aparece como uso fora do expediente."></geo-select>
              <geo-select label="Fim" [options]="horarios" [(value)]="expedienteFim" [disabled]="!acesso.configurar()" [error]="erroExpediente()"></geo-select>
              <geo-boolean-control kind="toggle" label="Sábado é dia de expediente" [(value)]="sabadoExpediente" [disabled]="!acesso.configurar()"
                description="Feriados não são descontados."></geo-boolean-control>
            </div>
            @if (acesso.configurar()) {
              <div class="geo-actions-row geo-actions-row--separated">
                <geo-button icon="pi pi-check" label="Salvar parâmetros" [loading]="salvandoParametros()" (pressed)="salvarParametros()"></geo-button>
              </div>
            }
            </section>
          </geo-surface>
        }
      }
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="(emEdicao() ? 'Editar ' : 'Novo ') + (catalogo() === 'veiculo' ? 'tipo de veículo' : 'tipo de implemento')"
      [description]="emEdicao() ? emEdicao()!.nome : undefined" [dirty]="!!nome().trim() && nome() !== (emEdicao()?.nome ?? '')"
      [loading]="salvando()" size="sm">
      <div class="geo-form-stack">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="80" [error]="tentouSalvar() && !nome().trim() ? 'Informe o nome.' : undefined"></geo-text-input>
        <geo-textarea label="Descrição" [(value)]="descricao" [rows]="2" [maxlength]="255" [showOptional]="true"></geo-textarea>
        @if (catalogo() === 'veiculo') {
          <geo-select label="CNH mínima para conduzir" [options]="categorias()" [(value)]="categoria" [clearable]="true" [showOptional]="true"
            description="Impede vincular condutor com categoria insuficiente."></geo-select>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaConfiguracoesComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  protected readonly acesso = acessoFrota();

  /** Qual cadastro esta rota mostra (`data.secao`). */
  protected readonly secao: SecaoCadastroFrota = (inject(ActivatedRoute).snapshot.data['secao'] as SecaoCadastroFrota) ?? 'veiculo';
  protected readonly info = SECOES[this.secao];

  protected readonly tiposVeiculo = signal<TipoVeiculo[]>([]);
  protected readonly tiposImplemento = signal<TipoImplemento[]>([]);
  protected readonly carregando = signal(false);
  protected readonly opcoes = signal<OpcoesFrota | null>(null);

  protected readonly formularioAberto = signal(false);
  protected readonly catalogo = signal<Catalogo>('veiculo');
  protected readonly emEdicao = signal<ItemCatalogo | null>(null);
  protected readonly nome = signal('');
  protected readonly descricao = signal('');
  protected readonly categoria = signal<CategoriaCnh | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);

  protected readonly faixas = signal('');
  protected readonly limiteKmDia = signal<number | null>(null);
  protected readonly janelaRepeticao = signal<number | null>(null);
  protected readonly limiteHorasDia = signal<number | null>(null);
  protected readonly limiteSaltoKm = signal<number | null>(null);
  protected readonly limiteSaltoHoras = signal<number | null>(null);
  protected readonly salvandoParametros = signal(false);
  protected readonly expedienteInicio = signal<string | null>('06:00');
  protected readonly expedienteFim = signal<string | null>('19:00');
  protected readonly sabadoExpediente = signal(false);
  /** De meia em meia hora; o expediente não precisa de minuto quebrado. */
  protected readonly horarios: GeoSelectOption<string>[] = Array.from({ length: 48 }, (_, i) => {
    const hora = String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00');
    return { label: hora, value: hora };
  });
  protected readonly erroExpediente = computed(() => {
    const inicio = this.expedienteInicio();
    const fim = this.expedienteFim();
    return inicio && fim && fim <= inicio ? 'O fim deve ser depois do início.' : undefined;
  });

  protected readonly categorias = computed<GeoSelectOption<CategoriaCnh>[]>(() =>
    (this.opcoes()?.categoriasCnh ?? []).map((c) => ({ label: c.rotulo, value: c.valor }))
  );
  protected readonly faixasConvertidas = computed(() =>
    this.faixas()
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f !== '')
      .map(Number)
  );
  protected readonly erroFaixas = computed(() => {
    const lista = this.faixasConvertidas();
    if (!lista.length) return 'Informe ao menos uma faixa.';
    if (lista.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) return 'Use números inteiros de 0 a 365.';
    return undefined;
  });

  protected readonly colunasVeiculo: GeoDataTableColumn<TipoVeiculo>[] = [
    { key: 'nome', header: 'Nome', priority: 1 },
    { key: 'descricao', header: 'Descrição', display: (t) => t.descricao ?? '' },
    { key: 'categoriaCnhMinima', header: 'CNH mínima', display: (t) => t.categoriaCnhMinima ?? '—' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly colunasImplemento: GeoDataTableColumn<TipoImplemento>[] = [
    { key: 'nome', header: 'Nome', priority: 1 },
    { key: 'descricao', header: 'Descrição', display: (t) => t.descricao ?? '' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (t: { id: string }) => t.id;

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    this.frota.parametros().subscribe({
      next: (p) => {
        this.faixas.set(p.faixasAlertaDias.join(', '));
        this.limiteKmDia.set(p.limiteKmDia);
        this.janelaRepeticao.set(p.janelaRepeticaoDias ?? null);
        this.limiteHorasDia.set(p.limiteHorasDia ?? null);
        this.limiteSaltoKm.set(p.limiteSaltoKm ?? null);
        this.limiteSaltoHoras.set(p.limiteSaltoHoras ?? null);
        if (p.expediente) {
          this.expedienteInicio.set(p.expediente.inicio.slice(0, 5));
          this.expedienteFim.set(p.expediente.fim.slice(0, 5));
          this.sabadoExpediente.set(p.expediente.sabado);
        }
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
    this.carregar();
  }

  protected estado(lista: unknown[]): 'loading' | 'ready' | 'empty' {
    return this.carregando() ? 'loading' : lista.length ? 'ready' : 'empty';
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.frota.tiposVeiculo().subscribe({
      next: (p) => this.tiposVeiculo.set(p.content),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
    this.frota.tiposImplemento().subscribe({
      next: (p) => {
        this.tiposImplemento.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrir(catalogo: Catalogo, item: ItemCatalogo | null): void {
    this.catalogo.set(catalogo);
    this.emEdicao.set(item);
    this.nome.set(item?.nome ?? '');
    this.descricao.set(item?.descricao ?? '');
    this.categoria.set(item?.categoriaCnhMinima ?? null);
    this.tentouSalvar.set(false);
    this.formularioAberto.set(true);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (!this.nome().trim()) return;
    const descricao = this.descricao().trim() || null;
    const id = this.emEdicao()?.id;
    const operacao: Observable<unknown> =
      this.catalogo() === 'veiculo'
        ? this.frota.salvarTipoVeiculo({ nome: this.nome().trim(), descricao, categoriaCnhMinima: this.categoria() }, id)
        : this.frota.salvarTipoImplemento({ nome: this.nome().trim(), descricao }, id);
    this.salvando.set(true);
    operacao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(`Tipo ${this.nome().trim()} salvo.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(catalogo: Catalogo, item: ItemCatalogo): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: item.ativo ? 'Desativar tipo' : 'Reativar tipo',
      message: item.ativo
        ? `${item.nome} deixa de aparecer para novos cadastros. Os registros que já usam o tipo continuam com ele.`
        : `${item.nome} volta a aparecer para novos cadastros.`,
      confirmLabel: item.ativo ? 'Desativar' : 'Reativar',
      variant: item.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    const operacao: Observable<void> =
      catalogo === 'veiculo' ? this.frota.alternarTipoVeiculo(item as TipoVeiculo) : this.frota.alternarTipoImplemento(item as TipoImplemento);
    operacao.subscribe({
      next: () => {
        this.notificacoes.success(item.ativo ? `${item.nome} desativado.` : `${item.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected salvarParametros(): void {
    const limite = this.limiteKmDia();
    if (this.erroFaixas() || !limite) {
      this.notificacoes.warning('Revise as faixas de aviso e o limite de km por dia.');
      return;
    }
    const inicio = this.expedienteInicio();
    const fim = this.expedienteFim();
    if (!inicio || !fim || this.erroExpediente()) {
      this.notificacoes.warning('Revise o horário do expediente.');
      return;
    }
    this.salvandoParametros.set(true);
    this.frota.atualizarParametros({
      faixasAlertaDias: this.faixasConvertidas(),
      limiteKmDia: limite,
      janelaRepeticaoDias: this.janelaRepeticao(),
      limiteHorasDia: this.limiteHorasDia(),
      limiteSaltoKm: this.limiteSaltoKm(),
      limiteSaltoHoras: this.limiteSaltoHoras() ?? 0,
      expediente: { inicio, fim, sabado: this.sabadoExpediente() }
    }).subscribe({
      next: (p) => {
        this.salvandoParametros.set(false);
        this.faixas.set(p.faixasAlertaDias.join(', '));
        this.janelaRepeticao.set(p.janelaRepeticaoDias ?? null);
        this.notificacoes.success('Parâmetros salvos.');
      },
      error: (e) => {
        this.salvandoParametros.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
