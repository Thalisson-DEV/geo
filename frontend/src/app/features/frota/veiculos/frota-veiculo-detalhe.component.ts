import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesBreadcrumbItem,
  CesButtonComponent,
  CesCellDirective,
  CesRowActionsDirective,
  CesColumnFilter,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesPageHeaderComponent,
  CesStatusComponent,
  CesSurfaceComponent,
  CesTabItem,
  CesTabPanelDirective,
  CesTabsComponent,
  NotificationService,
  CesTone,
  cesUrlParam
} from '@ces/ui';
import { forkJoin, map, of } from 'rxjs';
import {
  AcoplamentoImplemento,
  DocumentoFrota,
  OrdemServico,
  OrdemServicoDetalhe,
  ROTULO_CRITICIDADE,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  TOM_CRITICIDADE,
  TOM_SITUACAO_OS,
  rotuloOs,
  LeituraOdometro,
  OpcoesFrota,
  ROTULO_LEITURA,
  ROTULO_ORIGEM_LEITURA,
  ROTULO_REGIME,
  ROTULO_SITUACAO,
  ROTULO_UNIDADE,
  TOM_LEITURA,
  TOM_SITUACAO,
  TipoVeiculo,
  VeiculoFrotaDetalhe,
  VinculoCondutor,
  contar,
  formatarMedicao,
  formatarMedida,
  formatarPlaca,
  rotuloOrigemLeitura,
  rotuloValorAtual
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { NavigationHistoryService } from '../../../core/navigation';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { FrotaDocumentoFormComponent } from '../documentos/frota-documento-form.component';
import { FrotaDocumentosTabelaComponent } from '../documentos/frota-documentos-tabela.component';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';
import { FrotaLancarKmComponent } from './frota-lancar-km.component';
import { FrotaTrocarPainelComponent } from './frota-trocar-painel.component';
import { FrotaVeiculoFormComponent } from './frota-veiculo-form.component';
import { FrotaVincularCondutorComponent } from './frota-vincular-condutor.component';
import { FrotaOrdemServicoFormComponent } from '../ordens-servico/frota-ordem-servico-form.component';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import { FrotaVeiculoDespesasComponent } from '../despesas/frota-veiculo-despesas.component';
import { FrotaVeiculoSeguroComponent } from '../seguros/frota-veiculo-seguro.component';
import { FrotaVeiculoPneusComponent } from '../pneus/frota-veiculo-pneus.component';
import { FrotaVeiculoSinistrosComponent } from '../seguros/frota-veiculo-sinistros.component';
import { FrotaVeiculoPreventivaComponent } from '../preventiva/frota-veiculo-preventiva.component';
import { FrotaVeiculoTelemetriaComponent } from '../telemetria/frota-veiculo-telemetria.component';
import { PreventivaVeiculo } from '../../../core/models/frota-preventiva.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';

const ABAS = ['ficha', 'manutencoes', 'preventiva', 'pneus', 'despesas', 'seguro', 'sinistros', 'condutores', 'implementos', 'documentos', 'odometro', 'telemetria'] as const;
type Aba = (typeof ABAS)[number];

@Component({
  selector: 'app-frota-veiculo-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCellDirective,
    CesRowActionsDirective,
    CesDataTableComponent,
    CesIconButtonComponent,
    CesPageHeaderComponent,
    CesStatusComponent,
    CesSurfaceComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    FrotaDocumentoFormComponent,
    FrotaDocumentosTabelaComponent,
    FrotaJustificativaDrawerComponent,
    FrotaLancarKmComponent,
    FrotaTrocarPainelComponent,
    FrotaVeiculoFormComponent,
    FrotaVincularCondutorComponent,
    FrotaOrdemServicoFormComponent,
    FrotaVeiculoDespesasComponent,
    FrotaVeiculoSeguroComponent,
    FrotaVeiculoPneusComponent,
    FrotaVeiculoSinistrosComponent,
    FrotaVeiculoPreventivaComponent,
    FrotaVeiculoTelemetriaComponent
  ],
  template: `
    <div class="ces-page">
      @if (carregando() && !veiculo()) {
        <ces-async-state state="loading" title="Carregando a ficha do veículo"></ces-async-state>
      } @else if (erro()) {
        <ces-async-state state="error" title="Não foi possível carregar o veículo" [description]="erro()!"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></ces-async-state>
      } @else if (veiculo(); as v) {
        <ces-page-header
          [title]="placa(v.placa) + ' · ' + modeloCompleto(v)"
          icon="pi pi-car"
          [breadcrumb]="trilha(v)"
          [description]="(v.baseOperacional ?? 'Sem base') + ' · ' + (v.tipoVeiculo?.nome ?? 'Tipo não informado') + ' · ' + rotuloRegime[v.regime]"
        >
          <ng-container status>
            <ces-status [tone]="tomSituacao[v.situacao]">{{ rotuloSituacao[v.situacao] }}</ces-status>
            @if (!v.ativo) {
              <ces-status tone="neutral" emphasis="outline" icon="pi-ban">Desativado no cadastro</ces-status>
            }
          </ng-container>
          <ng-container actions>
            @if (acesso.editarOs() && v.ativo && v.situacao !== 'BAIXADO') {
              <ces-button variant="outline" icon="pi pi-wrench" label="Abrir OS" (pressed)="osAberta.set(true)"></ces-button>
            }
            @if (acesso.lancarKm() && v.ativo) {
              <ces-button variant="outline" icon="pi pi-gauge" [label]="rotuloLancar(v)" (pressed)="lancarKmAberto.set(true)"></ces-button>
            }
            @if (acesso.editarCondutor() && v.ativo && v.situacao !== 'BAIXADO') {
              <ces-button variant="outline" icon="pi pi-user-edit" label="Trocar condutor" (pressed)="vincularAberto.set(true)"></ces-button>
            }
            @if (acesso.editarVeiculo() && v.ativo) {
              <ces-button icon="pi pi-pencil" label="Editar ficha" (pressed)="formularioAberto.set(true)"></ces-button>
            }
          </ng-container>
        </ces-page-header>

        <!-- Indicadores são atalhos: cada um abre a aba (e o recorte) correspondente. -->
        <div class="ces-kpis">
          <button type="button" class="ces-kpi" data-tone="info" (click)="irPara('odometro')">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-gauge"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">{{ rotuloValorAtual(v.unidadeMedicao) }}</span>
              <span class="ces-kpi__value">{{ v.kmAtual != null ? medicao(v.kmAtual, v.unidadeMedicao) : 'Sem leitura' }}</span>
              <span class="ces-kpi__detail">
                @if (v.acumulado != null && v.acumulado !== v.kmAtual) {
                  Acumulado {{ medicao(v.acumulado, v.unidadeMedicao) }} ·
                }
                {{ v.kmAtualEm ? 'Leitura de ' + (v.kmAtualEm | date: 'dd/MM/yyyy HH:mm') : 'Lance a primeira leitura do ' + (v.unidadeMedicao === 'HORAS' ? 'horímetro' : 'odômetro') }}
              </span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
          <button type="button" class="ces-kpi" [attr.data-tone]="v.condutorAtual ? 'info' : 'warning'" (click)="irPara('condutores')">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-user"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Condutor atual</span>
              <span class="ces-kpi__value">{{ v.condutorAtual?.condutor ?? 'Sem condutor' }}</span>
              <span class="ces-kpi__detail">
                {{ v.condutorAtual ? 'Desde ' + (v.condutorAtual.inicio | date: 'dd/MM/yyyy HH:mm') : 'Nenhum responsável vinculado' }}
              </span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
          <button type="button" class="ces-kpi" [attr.data-tone]="v.documentosVencidos ? 'danger' : v.documentosAVencer ? 'warning' : 'success'"
            (click)="irPara('documentos')">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-file"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Documentos</span>
              <span class="ces-kpi__value">{{ contar(v.documentosVencidos, 'vencido', 'vencidos', 'Em dia') }}</span>
              <span class="ces-kpi__detail">{{ contar(v.documentosAVencer, 'a vencer', 'a vencer', 'Nada a vencer') }} na janela de aviso</span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
          <button type="button" class="ces-kpi" [attr.data-tone]="v.leiturasInconsistentes ? 'warning' : 'success'"
            (click)="irPara('odometro', v.leiturasInconsistentes > 0)">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-exclamation-triangle"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Leituras a conferir</span>
              <span class="ces-kpi__value">{{ contar(v.leiturasInconsistentes, 'leitura', 'leituras', 'Nenhuma') }}</span>
              <span class="ces-kpi__detail">Leituras incoerentes com o histórico</span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
        </div>

        <ces-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções da ficha do veículo">
          <ng-template cesTabPanel="ficha">
            <ces-surface>
              <section class="ces-sheet-section" aria-labelledby="ficha-dados">
                <h2 id="ficha-dados"><i class="pi pi-id-card" aria-hidden="true"></i> Dados do veículo</h2>
                <dl class="ces-sheet">
                  <div><dt>Ano fabricação / modelo</dt><dd>{{ v.anoFabricacao || v.anoModelo ? (v.anoFabricacao ?? '—') + ' / ' + (v.anoModelo ?? '—') : '—' }}</dd></div>
                  <div><dt>Chassi</dt><dd>{{ v.chassi || '—' }}</dd></div>
                  <div><dt>Renavam</dt><dd>{{ v.renavam || '—' }}</dd></div>
                  <div><dt>Cor</dt><dd>{{ v.cor || '—' }}</dd></div>
                  <div><dt>Combustível</dt><dd>{{ rotuloCombustivel(v.combustivel) }}</dd></div>
                  <div><dt>Tanque</dt><dd>{{ medida(v.capacidadeTanqueLitros, 'L', 2) }}</dd></div>
                  <div><dt>Consumo de referência</dt><dd>{{ medida(v.consumoReferenciaKmL, 'km/l', 2) }}</dd></div>
                  <div><dt>Controle de uso</dt><dd>{{ rotuloUnidade[v.unidadeMedicao] }}</dd></div>
                  <div><dt>CNH mínima do tipo</dt><dd>{{ v.tipoVeiculo?.categoriaCnhMinima ?? '—' }}</dd></div>
                </dl>
              </section>

              <section class="ces-sheet-section" aria-labelledby="ficha-propriedade">
                <h2 id="ficha-propriedade"><i class="pi pi-briefcase" aria-hidden="true"></i> Propriedade</h2>
                <dl class="ces-sheet">
                  <div><dt>Regime</dt><dd>{{ rotuloRegime[v.regime] }}</dd></div>
                  @if (v.regime === 'LOCADO') {
                    <div><dt>Locadora</dt><dd>{{ v.locadora || '—' }}</dd></div>
                    <div><dt>Custo mensal</dt><dd>{{ v.custoMensalLocacao != null ? (v.custoMensalLocacao | currency: 'BRL') : '—' }}</dd></div>
                    <div><dt>Vigência da locação</dt><dd>{{ (v.inicioLocacao | date: 'dd/MM/yyyy') ?? '—' }} a {{ (v.fimLocacao | date: 'dd/MM/yyyy') ?? '—' }}</dd></div>
                  }
                </dl>
              </section>

              <section class="ces-sheet-section" aria-labelledby="ficha-observacao">
                <h2 id="ficha-observacao"><i class="pi pi-comment" aria-hidden="true"></i> Observação</h2>
                <dl class="ces-sheet">
                  <div class="ces-sheet__wide"><dt>Observação</dt><dd>{{ v.observacao || '—' }}</dd></div>
                </dl>
              </section>
            </ces-surface>
          </ng-template>

          <ng-template cesTabPanel="manutencoes">
            <ces-data-table
              title="Ordens de serviço"
              description="Manutenções do veículo, da mais recente para a mais antiga. Clique numa linha para abrir a OS."
              storageKey="frota-veiculo-manutencoes"
              exportFileName="manutencoes"
              searchPlaceholder="Filtrar nesta lista"
              rowActionLabel="Abrir OS"
              [columns]="colunasManutencoes"
              [rows]="manutencoes()"
              [rowKey]="chaveOs"
              [state]="estadoAba(manutencoes())"
              stateTitle="Nenhuma ordem de serviço"
              [stateDescription]="acesso.editarOs() ? 'Para registrar uma manutenção, use Abrir OS.' : 'As manutenções do veículo aparecem aqui.'"
              (rowActivate)="abrirOs($event)"
            >
              <ng-container table-actions>
                @if (acesso.editarOs() && v.ativo && v.situacao !== 'BAIXADO') {
                  <ces-button size="sm" icon="pi pi-plus" label="Abrir OS" (pressed)="osAberta.set(true)"></ces-button>
                }
              </ng-container>
              <ng-template cesCell="numero" let-row>
                <span class="ces-cell-strong">{{ rotuloOs(row.numero) }}</span>
                <span class="ces-cell-muted">{{ row.itens.join(', ') }}</span>
              </ng-template>
              <ng-template cesCell="abertaEm" let-row>{{ row.abertaEm | date: 'dd/MM/yyyy' }}</ng-template>
              <ng-template cesCell="situacao" let-row>
                <ces-status [tone]="tomSituacaoOs[row.situacao]">{{ rotuloSituacaoOs[row.situacao] }}</ces-status>
                @if (row.temRepeticao) {
                  <ces-status tone="warning" icon="pi-replay">Repetição</ces-status>
                }
              </ng-template>
              <ng-template cesCell="criticidade" let-row>
                <ces-status [tone]="tomCriticidade[row.criticidade]" emphasis="outline">{{ rotuloCriticidade[row.criticidade] }}</ces-status>
              </ng-template>
            </ces-data-table>
          </ng-template>

          <ng-template cesTabPanel="preventiva">
            <app-frota-veiculo-preventiva [dados]="preventiva()" [carregando]="carregandoPreventiva()" (alterou)="carregar()"></app-frota-veiculo-preventiva>
          </ng-template>

          <ng-template cesTabPanel="telemetria">
            <app-frota-veiculo-telemetria [idVeiculo]="v.idVeiculo" [placa]="v.placa"></app-frota-veiculo-telemetria>
          </ng-template>

          <ng-template cesTabPanel="despesas">
            <app-frota-veiculo-despesas [veiculo]="{ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo, idBaseOperacional: v.idBaseOperacional }"
              [podeLancar]="acesso.editarDespesa() && v.ativo"></app-frota-veiculo-despesas>
          </ng-template>

          <ng-template cesTabPanel="seguro">
            <app-frota-veiculo-seguro [veiculo]="{ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }"
              [podeEditar]="acesso.editarSeguro() && v.ativo"></app-frota-veiculo-seguro>
          </ng-template>

          <ng-template cesTabPanel="pneus">
            <app-frota-veiculo-pneus [idVeiculo]="v.idVeiculo"></app-frota-veiculo-pneus>
          </ng-template>

          <ng-template cesTabPanel="sinistros">
            <app-frota-veiculo-sinistros [veiculo]="{ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }"
              [podeRegistrar]="acesso.editarSinistro() && v.ativo"></app-frota-veiculo-sinistros>
          </ng-template>

          <ng-template cesTabPanel="condutores">
            <ces-data-table
              title="Histórico de condutores"
              description="Quem foi responsável pelo veículo em cada período."
              storageKey="frota-veiculo-condutores"
              searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasCondutores"
              [rows]="condutores()"
              [rowKey]="chaveVinculo"
              [state]="estadoAba(condutores())"
              stateTitle="Nenhum condutor vinculado"
              stateDescription="Use Trocar condutor para definir o responsável pelo veículo."
            >
              <ng-container table-actions>
                @if (acesso.editarCondutor() && v.ativo && v.situacao !== 'BAIXADO') {
                  <ces-button size="sm" variant="outline" icon="pi pi-user-edit" label="Trocar condutor" (pressed)="vincularAberto.set(true)"></ces-button>
                }
              </ng-container>
              <ng-template cesCell="inicio" let-row>{{ row.inicio | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
              <ng-template cesCell="fim" let-row>
                @if (row.fim) {
                  {{ row.fim | date: 'dd/MM/yyyy HH:mm' }}
                } @else {
                  <ces-status tone="success">Atual</ces-status>
                }
              </ng-template>
            </ces-data-table>
          </ng-template>

          <ng-template cesTabPanel="implementos">
            <ces-data-table
              title="Implementos"
              description="Implementos acoplados agora e no passado. Para acoplar ou desacoplar, use a tela Implementos."
              storageKey="frota-veiculo-implementos"
              searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasImplementos"
              [rows]="implementos()"
              [rowKey]="chaveAcoplamento"
              [state]="estadoAba(implementos())"
              stateTitle="Nenhum implemento acoplado"
              stateDescription="Os acoplamentos feitos na tela Implementos aparecem aqui."
            >
              <ng-container table-actions>
                <ces-button size="sm" variant="ghost" icon="pi pi-arrow-right" label="Ir para Implementos" (pressed)="irParaImplementos()"></ces-button>
              </ng-container>
              <ng-template cesCell="inicio" let-row>{{ row.inicio | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
              <ng-template cesCell="fim" let-row>
                @if (row.fim) {
                  {{ row.fim | date: 'dd/MM/yyyy HH:mm' }}
                } @else {
                  <ces-status tone="success">Acoplado</ces-status>
                }
              </ng-template>
            </ces-data-table>
          </ng-template>

          <ng-template cesTabPanel="documentos">
            <app-frota-documentos-tabela
              descricao="Documentos com vencimento geram aviso automático para quem mantém a documentação."
              storageKey="frota-veiculo-documentos"
              [documentos]="documentos()"
              [estado]="estadoAba(documentos())"
              [podeEditar]="acesso.editarDocumento()"
              (editar)="editarDocumento($event)"
              (alterado)="carregar()"
            >
              @if (acesso.editarDocumento() && v.ativo) {
                <ces-button acoes size="sm" icon="pi pi-plus" label="Novo documento" (pressed)="novoDocumento()"></ces-button>
              }
            </app-frota-documentos-tabela>
          </ng-template>

          <ng-template cesTabPanel="odometro">
            <ces-data-table
              [title]="v.unidadeMedicao === 'HORAS' ? 'Leituras de horímetro' : 'Leituras de odômetro'"
              description="Toda fonte grava aqui. Leitura incoerente fica marcada para conferência e não conta para o valor atual. A troca de painel começa um trecho novo."
              storageKey="frota-veiculo-odometro"
              exportFileName="odometro"
              searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasLeituras"
              [filters]="filtrosLeituras()"
              (filtersChange)="leiturasFiltro.set($event.length ? 'inconsistentes' : 'todas')"
              [rows]="leituras()"
              [rowKey]="chaveLeitura"
              [state]="estadoAba(leituras())"
              stateTitle="Nenhuma leitura registrada"
              [stateDescription]="'Use ' + rotuloLancar(v) + ' para registrar o valor do painel.'"
            >
              <ng-container table-actions>
                @if (acesso.lancarKm() && v.ativo) {
                  <ces-button size="sm" variant="outline" icon="pi pi-sync" label="Trocar painel" (pressed)="trocaPainelAberta.set(true)"></ces-button>
                  <ces-button size="sm" icon="pi pi-plus" [label]="rotuloLancar(v)" (pressed)="lancarKmAberto.set(true)"></ces-button>
                }
              </ng-container>
              <ng-template cesCell="lidoEm" let-row>{{ row.lidoEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
              <ng-template cesCell="km" let-row>
                <span class="ces-cell-num">{{ medicao(row.km, row.unidade) }}</span>
                @if (row.tipo === 'TROCA_PAINEL') {
                  <span class="ces-cell-muted">Painel antigo: {{ medicao(row.kmAnterior, row.unidade) }}</span>
                }
              </ng-template>
              <ng-template cesCell="situacao" let-row>
                <ces-status [tone]="tomLeitura[row.situacao]">{{ rotuloLeitura[row.situacao] }}</ces-status>
                @if (row.motivoSituacao || row.justificativaAnulacao) {
                  <span class="ces-cell-muted">{{ row.justificativaAnulacao ?? row.motivoSituacao }}</span>
                }
              </ng-template>
              <ng-template cesRowActions let-row>
                @if (acesso.anularKm() && row.situacao !== 'ANULADA') {
                  <span class="ces-table-actions">
                    @if (row.situacao === 'INCONSISTENTE') {
                      <ces-icon-button icon="pi pi-check" [label]="'Confirmar leitura de ' + medicao(row.km, row.unidade)" tooltip="Confirmar leitura" size="icon-sm"
                        (pressed)="pedirJustificativa(row, 'confirmar')"></ces-icon-button>
                    }
                    <ces-icon-button icon="pi pi-ban" [label]="'Anular leitura de ' + medicao(row.km, row.unidade)" tooltip="Anular leitura" size="icon-sm"
                      (pressed)="pedirJustificativa(row, 'anular')"></ces-icon-button>
                  </span>
                }
              </ng-template>
            </ces-data-table>
          </ng-template>
        </ces-tabs>

        <app-frota-veiculo-form [(visivel)]="formularioAberto" [veiculo]="v" [opcoes]="opcoes()" [tiposVeiculo]="tiposVeiculo()"
          (salvo)="veiculo.set($event)"></app-frota-veiculo-form>
        <app-frota-ordem-servico-form [(visivel)]="osAberta" [idVeiculoFixo]="v.idVeiculo" [opcoes]="opcoes()"
          (salvo)="aoAbrirOs($event)"></app-frota-ordem-servico-form>
        <app-frota-lancar-km [(visivel)]="lancarKmAberto" [idVeiculo]="v.idVeiculo" [placa]="placa(v.placa)" [kmAtual]="v.kmAtual" [unidade]="v.unidadeMedicao"
          (registrado)="carregar()"></app-frota-lancar-km>
        <app-frota-trocar-painel [(visivel)]="trocaPainelAberta" [idVeiculo]="v.idVeiculo" [placa]="placa(v.placa)"
          [unidadeAtual]="v.unidadeMedicao" [valorAtual]="v.kmAtual" [acumuladoAtual]="v.acumulado"
          (registrado)="carregar()"></app-frota-trocar-painel>
        <app-frota-vincular-condutor [(visivel)]="vincularAberto" [idVeiculo]="v.idVeiculo" [placa]="placa(v.placa)"
          [condutorAtual]="v.condutorAtual?.condutor ?? null" (vinculado)="carregar()"></app-frota-vincular-condutor>
        <app-frota-documento-form [(visivel)]="documentoAberto" [documento]="documentoEmEdicao()" [idVeiculo]="v.idVeiculo"
          [opcoes]="opcoes()" (salvo)="carregar()"></app-frota-documento-form>
        <app-frota-justificativa-drawer
          [(visivel)]="justificativaAberta"
          [titulo]="acaoLeitura() === 'anular' ? 'Anular leitura' : 'Confirmar leitura'"
          [descricao]="descricaoAcaoLeitura()"
          [rotuloConfirmar]="acaoLeitura() === 'anular' ? 'Anular leitura' : 'Confirmar leitura'"
          [destrutivo]="acaoLeitura() === 'anular'"
          [processando]="processandoLeitura()"
          (confirmado)="executarAcaoLeitura($event)"
        ></app-frota-justificativa-drawer>
      }
    </div>
  `
})
export class FrotaVeiculoDetalheComponent {
  private readonly frota = inject(FrotaService);
  private readonly preventivas = inject(FrotaPreventivaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  private readonly historico = inject(NavigationHistoryService);
  /**
   * Recorte da lista de onde a pessoa veio, para a trilha "Veículos" voltar a ele. A entrada só é
   * registrada no fim da navegação: na criação, a lista ainda é a atual; depois de F5, a anterior.
   */
  private readonly origem =
    this.recorteDaLista(this.historico.currentEntry()?.url) ?? this.recorteDaLista(this.historico.previousEntry()?.url);

  private readonly route = inject(ActivatedRoute);
  /** Id do veículo na rota `/frota/veiculos/:id`. */
  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly tomSituacao: Record<string, CesTone> = TOM_SITUACAO;
  protected readonly rotuloSituacao: Record<string, string> = ROTULO_SITUACAO;
  protected readonly rotuloRegime = ROTULO_REGIME;
  protected readonly rotuloUnidade = ROTULO_UNIDADE;
  protected readonly tomLeitura: Record<string, CesTone> = TOM_LEITURA;
  protected readonly rotuloLeitura: Record<string, string> = ROTULO_LEITURA;
  protected readonly placa = formatarPlaca;
  protected readonly medida = formatarMedida;
  protected readonly contar = contar;
  protected readonly medicao = formatarMedicao;
  protected readonly rotuloValorAtual = rotuloValorAtual;

  protected readonly veiculo = signal<VeiculoFrotaDetalhe | null>(null);
  protected readonly carregando = signal(false);
  protected readonly carregandoAbas = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly condutores = signal<VinculoCondutor[]>([]);
  protected readonly implementos = signal<AcoplamentoImplemento[]>([]);
  protected readonly documentos = signal<DocumentoFrota[]>([]);
  protected readonly leituras = signal<LeituraOdometro[]>([]);
  protected readonly manutencoes = signal<OrdemServico[]>([]);
  protected readonly preventiva = signal<PreventivaVeiculo | null>(null);
  protected readonly carregandoPreventiva = signal(false);
  /** Planos vencidos ou próximos sem OS aberta: o número na aba. */
  protected readonly preventivaPendentes = computed(() =>
    (this.preventiva()?.controles ?? []).filter((c) => !c.idOrdemServico && c.situacao !== 'EM_DIA').length);
  protected readonly osAberta = signal(false);
  protected readonly rotuloOs = rotuloOs;
  protected readonly tomSituacaoOs: Record<string, CesTone> = TOM_SITUACAO_OS;
  protected readonly rotuloSituacaoOs: Record<string, string> = ROTULO_SITUACAO_OS;
  protected readonly tomCriticidade: Record<string, CesTone> = TOM_CRITICIDADE;
  protected readonly rotuloCriticidade: Record<string, string> = ROTULO_CRITICIDADE;
  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly tiposVeiculo = signal<TipoVeiculo[]>([]);

  /** Aba na URL (`?aba=`): links e notificações abrem a seção certa. */
  protected readonly aba = cesUrlParam<Aba>({ values: ABAS, default: 'ficha' });
  /** `?leituras=inconsistentes` filtra a aba Odômetro (atalho do indicador "KM a conferir"). */
  protected readonly leiturasFiltro = cesUrlParam<'todas' | 'inconsistentes'>({
    param: 'leituras',
    values: ['todas', 'inconsistentes'],
    default: 'todas'
  });
  protected readonly filtrosLeituras = computed<CesColumnFilter[]>(() =>
    this.leiturasFiltro() === 'inconsistentes'
      ? [{ key: 'situacao', operator: 'eq', value: 'INCONSISTENTE', label: `Situação: ${ROTULO_LEITURA.INCONSISTENTE}` }]
      : []
  );
  protected readonly formularioAberto = signal(false);
  protected readonly lancarKmAberto = signal(false);
  protected readonly trocaPainelAberta = signal(false);
  protected readonly vincularAberto = signal(false);
  protected readonly documentoAberto = signal(false);
  protected readonly documentoEmEdicao = signal<DocumentoFrota | null>(null);
  protected readonly justificativaAberta = signal(false);
  protected readonly leituraSelecionada = signal<LeituraOdometro | null>(null);
  protected readonly acaoLeitura = signal<'anular' | 'confirmar'>('anular');
  protected readonly processandoLeitura = signal(false);

  protected readonly abas = computed<CesTabItem[]>(() => {
    const v = this.veiculo();
    return [
      { value: 'ficha', label: 'Ficha', icon: 'pi pi-id-card' },
      ...(this.acesso.verOs()
        ? [{ value: 'manutencoes', label: 'Manutenções', icon: 'pi pi-wrench', badge: this.manutencoes().filter((o) => o.situacao === 'PENDENTE' || o.situacao === 'AGENDADA' || o.situacao === 'EM_ANDAMENTO').length || undefined }]
        : []),
      ...(this.acesso.verPreventiva()
        ? [{ value: 'preventiva', label: 'Preventiva', icon: 'pi pi-calendar-clock', badge: this.preventivaPendentes() || undefined }]
        : []),
      ...(this.acesso.verPneu() ? [{ value: 'pneus', label: 'Pneus', icon: 'ces-icon-pneu' }] : []),
      ...(this.acesso.verDespesa() ? [{ value: 'despesas', label: 'Despesas', icon: 'pi pi-receipt' }] : []),
      ...(this.acesso.verSeguro() ? [{ value: 'seguro', label: 'Seguro', icon: 'pi pi-shield' }] : []),
      ...(this.acesso.verSinistro() ? [{ value: 'sinistros', label: 'Sinistros', icon: 'pi pi-exclamation-circle' }] : []),
      { value: 'condutores', label: 'Condutores', icon: 'pi pi-users', badge: this.condutores().length || undefined },
      { value: 'implementos', label: 'Implementos', icon: 'pi pi-link', badge: v?.implementosAcoplados.length || undefined },
      { value: 'documentos', label: 'Documentos', icon: 'pi pi-file', badge: (v?.documentosVencidos ?? 0) + (v?.documentosAVencer ?? 0) || undefined },
      { value: 'odometro', label: 'Odômetro', icon: 'pi pi-gauge', badge: v?.leiturasInconsistentes || undefined },
      // O valor continua 'telemetria' para os links já enviados (?aba=telemetria) seguirem abrindo a aba.
      ...(this.acesso.verTelemetria() ? [{ value: 'telemetria', label: 'Uso', icon: 'pi pi-chart-line' }] : [])
    ];
  });

  protected readonly descricaoAcaoLeitura = computed(() => {
    const l = this.leituraSelecionada();
    if (!l) return undefined;
    return this.acaoLeitura() === 'anular'
      ? `A leitura de ${formatarMedicao(l.km, l.unidade)} deixa de contar para o valor atual.`
      : `A leitura de ${formatarMedicao(l.km, l.unidade)} passa a contar como válida.`;
  });

  protected readonly colunasCondutores: CesDataTableColumn<VinculoCondutor>[] = [
    { key: 'condutor', header: 'Condutor', priority: 1, display: (r) => r.condutor ?? '—' },
    { key: 'inicio', header: 'Início', type: 'custom', priority: 1, value: (r) => r.inicio, display: (r) => r.inicio },
    { key: 'fim', header: 'Fim', type: 'custom', value: (r) => r.fim ?? '9999', display: (r) => r.fim ?? 'Atual' },
    { key: 'origem', header: 'Origem' },
    { key: 'observacao', header: 'Observação', display: (r) => r.observacao ?? '' }
  ];

  protected readonly colunasImplementos: CesDataTableColumn<AcoplamentoImplemento>[] = [
    { key: 'identificacao', header: 'Implemento', priority: 1 },
    { key: 'tipoImplemento', header: 'Tipo' },
    { key: 'inicio', header: 'Acoplado em', type: 'custom', value: (r) => r.inicio, display: (r) => r.inicio },
    { key: 'fim', header: 'Desacoplado em', type: 'custom', value: (r) => r.fim ?? '9999', display: (r) => r.fim ?? 'Acoplado' }
  ];

  protected readonly colunasLeituras: CesDataTableColumn<LeituraOdometro>[] = [
    { key: 'lidoEm', header: 'Data', type: 'custom', priority: 1, value: (r) => r.lidoEm, display: (r) => r.lidoEm },
    { key: 'km', header: 'KM / horas', type: 'custom', priority: 1, value: (r) => r.km, display: (r) => formatarMedicao(r.km, r.unidade) },
    { key: 'origem', header: 'Origem', display: (r) => rotuloOrigemLeitura(r) },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (r) => r.situacao, display: (r) => ROTULO_LEITURA[r.situacao] },
    { key: 'registradoPor', header: 'Registrado por', display: (r) => r.registradoPor ?? '—' }
  ];

  protected readonly colunasManutencoes: CesDataTableColumn<OrdemServico>[] = [
    { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (r) => r.numero, display: (r) => `${rotuloOs(r.numero)} ${r.itens.join(', ')}` },
    { key: 'abertaEm', header: 'Aberta em', type: 'custom', priority: 1, value: (r) => r.abertaEm, display: (r) => r.abertaEm },
    { key: 'tipoManutencao', header: 'Tipo', display: (r) => ROTULO_TIPO_MANUTENCAO[r.tipoManutencao] },
    { key: 'criticidade', header: 'Criticidade', type: 'custom', value: (r) => r.criticidade, display: (r) => ROTULO_CRITICIDADE[r.criticidade] },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.situacao, display: (r) => ROTULO_SITUACAO_OS[r.situacao] },
    { key: 'oficina', header: 'Oficina' },
    { key: 'valorTotal', header: 'Valor', display: (r) => (r.valorTotal != null ? r.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—') }
  ];

  protected readonly chaveOs = (r: OrdemServico) => r.id;
  protected readonly chaveVinculo = (r: VinculoCondutor) => r.id;
  protected readonly chaveAcoplamento = (r: AcoplamentoImplemento) => r.id;
  protected readonly chaveLeitura = (r: LeituraOdometro) => r.id;

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    this.frota.tiposVeiculo().subscribe({ next: (p) => this.tiposVeiculo.set(p.content), error: () => undefined });
    effect(() => {
      if (this.id()) this.carregar();
    });
  }

  protected carregar(): void {
    const id = this.id();
    this.carregando.set(true);
    this.carregandoAbas.set(true);
    this.erro.set(null);
    this.frota.detalharVeiculo(id).subscribe({
      next: (v) => {
        this.veiculo.set(v);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
    this.carregarPreventiva();
    forkJoin({
      condutores: this.frota.historicoCondutoresVeiculo(id),
      implementos: this.frota.historicoImplementosVeiculo(id),
      documentos: this.frota.listarDocumentos({ idVeiculo: id }, PAGINA_OPCOES),
      leituras: this.frota.leiturasVeiculo(id),
      manutencoes: this.acesso.verOs()
        ? this.frota.listarOrdensServico({ idVeiculo: id }, { size: 200, sort: ['abertaEm,desc'] })
        : of({ content: [] as OrdemServico[] })
    }).subscribe({
      next: (r) => {
        this.condutores.set(r.condutores.content);
        this.implementos.set(r.implementos);
        this.documentos.set(r.documentos.content);
        this.leituras.set(r.leituras.content);
        this.manutencoes.set(r.manutencoes.content);
        this.carregandoAbas.set(false);
      },
      error: (e) => {
        this.carregandoAbas.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected carregarPreventiva(): void {
    if (!this.acesso.verPreventiva()) return;
    this.carregandoPreventiva.set(true);
    this.preventivas.doVeiculo(this.id()).subscribe({
      next: (p) => {
        this.preventiva.set(p);
        this.carregandoPreventiva.set(false);
      },
      error: () => this.carregandoPreventiva.set(false)
    });
  }

  protected estadoAba(linhas: unknown[]): 'loading' | 'ready' | 'empty' {
    return this.carregandoAbas() ? 'loading' : linhas.length ? 'ready' : 'empty';
  }

  protected rotuloCombustivel(valor: string | null): string {
    if (!valor) return '—';
    return this.opcoes()?.combustiveis.find((c) => c.valor === valor)?.rotulo ?? valor;
  }

  protected novoDocumento(): void {
    this.documentoEmEdicao.set(null);
    this.documentoAberto.set(true);
  }

  protected editarDocumento(documento: DocumentoFrota): void {
    this.documentoEmEdicao.set(documento);
    this.documentoAberto.set(true);
  }

  protected pedirJustificativa(leitura: LeituraOdometro, acao: 'anular' | 'confirmar'): void {
    this.leituraSelecionada.set(leitura);
    this.acaoLeitura.set(acao);
    this.justificativaAberta.set(true);
  }

  protected executarAcaoLeitura(justificativa: string): void {
    const leitura = this.leituraSelecionada();
    if (!leitura) return;
    const operacao =
      this.acaoLeitura() === 'anular'
        ? this.frota.anularLeitura(leitura.id, justificativa)
        : this.frota.confirmarLeitura(leitura.id, justificativa);
    this.processandoLeitura.set(true);
    operacao.subscribe({
      next: () => {
        this.processandoLeitura.set(false);
        this.justificativaAberta.set(false);
        this.notificacoes.success(this.acaoLeitura() === 'anular' ? 'Leitura anulada.' : 'Leitura confirmada.');
        this.carregar();
      },
      error: (e) => {
        this.processandoLeitura.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected rotuloLancar(v: VeiculoFrotaDetalhe): string {
    return v.unidadeMedicao === 'HORAS' ? 'Lançar horas' : 'Lançar KM';
  }

  protected modeloCompleto(v: VeiculoFrotaDetalhe): string {
    return [v.fabricante, v.modelo].filter(Boolean).join(' ') || 'Modelo não informado';
  }

  protected irPara(aba: Aba, somenteInconsistentes = false): void {
    this.aba.set(aba);
    if (aba === 'odometro') this.leiturasFiltro.set(somenteInconsistentes ? 'inconsistentes' : 'todas');
  }

  protected trilha(v: VeiculoFrotaDetalhe): CesBreadcrumbItem[] {
    return [
      { label: 'Frota' },
      { label: 'Veículos', route: '/frota/veiculos', queryParams: this.origem },
      { label: formatarPlaca(v.placa) }
    ];
  }

  private recorteDaLista(url: string | undefined): Params | null {
    if (!url) return null;
    const arvore = this.router.parseUrl(url);
    const caminho = arvore.root.children['primary']?.segments.map((s) => s.path).join('/');
    return caminho === 'frota/veiculos' ? arvore.queryParams : null;
  }

  protected abrirOs(os: OrdemServico): void {
    void this.router.navigate(['/frota/ordens-servico', os.id]);
  }

  protected aoAbrirOs(os: OrdemServicoDetalhe): void {
    navegarAposFecharDrawer(this.router, ['/frota/ordens-servico', os.ordem.id]);
  }

  protected irParaImplementos(): void {
    void this.router.navigate(['/frota/implementos']);
  }
}
