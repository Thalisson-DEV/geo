import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DragDropModule } from 'primeng/dragdrop';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesConfirmationService,
  CesDatepickerComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import {
  AlmoxarifadoFrota,
  DestinoPneu,
  MODELOS_DIAGRAMA,
  Pneu,
  TipoDestinoPneu,
  VeiculoPneus,
  erroKmMovimentacao,
  formatarKm,
  formatarSulco,
  rotuloPosicao,
  tomSulco
} from '../../../core/models/frota-pneu.models';
import { FornecedorFrota, formatarPlaca, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { ESCOPO_PNEU, FrotaPneuDiagramaComponent, PosicaoDiagrama } from './frota-pneu-diagrama.component';

/** Onde o pneu termina na movimentação. */
type Local =
  | { tipo: 'POSICAO'; posicao: string }
  | { tipo: 'ESTOQUE'; idEstoque: string | null }
  | { tipo: 'REPARO' | 'REFORMA'; idFornecedor: string | null }
  | { tipo: 'DESCARTE'; motivo: string };

type Destino = Exclude<TipoDestinoPneu, 'POSICAO'>;

interface Alteracao {
  pneu: Pneu;
  de: Local;
  para: Local;
}

const ZONAS: { tipo: Destino; rotulo: string; icone: string; dica: string }[] = [
  { tipo: 'ESTOQUE', rotulo: 'Almoxarifado', icone: 'pi pi-box', dica: 'Volta para o estoque, disponível' },
  { tipo: 'REPARO', rotulo: 'Reparo', icone: 'pi pi-wrench', dica: 'Conserto: furo, corte' },
  { tipo: 'REFORMA', rotulo: 'Reforma', icone: 'pi pi-refresh', dica: 'Recapagem: volta numa vida nova' },
  { tipo: 'DESCARTE', rotulo: 'Descarte', icone: 'pi pi-trash', dica: 'Sai da frota de vez' }
];

/**
 * Montagem dos pneus de um veículo: arrastar o pneu do estoque para a posição, entre posições
 * (rodízio, com troca automática) e para almoxarifado, reparo, reforma ou descarte. Também
 * funciona por toque, clique e teclado: escolha o pneu e depois o destino. Tudo fica num
 * rascunho com a lista de mudanças e só grava ao salvar, de uma vez, com o km do veículo.
 */
@Component({
  selector: 'app-frota-pneu-montagem',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DragDropModule,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    FrotaPneuDiagramaComponent
  ],
  styles: `
    :host { display: block; }
    .topo { display: grid; grid-template-columns: minmax(14rem, 22rem) repeat(2, minmax(10rem, 14rem)) 1fr; gap: 0.75rem; align-items: start; }
    .topo__acoes { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; padding-top: 1.35rem; }
    .area { display: grid; grid-template-columns: minmax(15rem, 1fr) minmax(19rem, 1.35fr) minmax(16rem, 1fr); gap: 1rem; margin-top: 1rem; align-items: start; }
    .painel { display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg); background: var(--ces-surface);
      box-shadow: var(--ces-shadow-sm); min-width: 0; }
    .painel__titulo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0; font-size: var(--ces-font-body); font-weight: 700; }
    .painel__sub { margin: 0; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .estoque { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.5rem; max-height: 30rem; overflow: auto; padding: 0.25rem;
      border-radius: var(--ces-radius-md); transition: background var(--ces-duration-fast) var(--ces-ease-standard); }
    .estoque--alvo { background: var(--ces-brand-soft); outline: 2px dashed var(--ces-brand); }
    .ficha { position: relative; display: grid; gap: 0.15rem; justify-items: start; padding: 0.55rem 0.55rem 0.55rem 0.9rem; text-align: left; cursor: grab;
      border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md); background: var(--ces-surface); color: var(--ces-foreground); font: inherit; }
    .ficha:hover { border-color: var(--ces-brand); box-shadow: var(--ces-shadow-sm); }
    .ficha:focus-visible { outline: none; box-shadow: var(--ces-focus-ring); }
    .ficha:active { cursor: grabbing; }
    .ficha[aria-pressed='true'] { border-color: var(--ces-brand); box-shadow: 0 0 0 2px var(--ces-brand); }
    .ficha__faixa { position: absolute; left: 0.3rem; top: 0.45rem; bottom: 0.45rem; width: 0.25rem; border-radius: 999px; }
    .ficha__faixa[data-tom='danger'] { background: var(--ces-danger); }
    .ficha__faixa[data-tom='warning'] { background: var(--ces-warning); }
    .ficha__faixa[data-tom='success'] { background: var(--ces-success); }
    .ficha__faixa[data-tom='neutral'] { background: var(--ces-foreground-subtle); }
    .ficha__fogo { font-weight: 800; letter-spacing: 0.03em; }
    .ficha__info { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); line-height: 1.25; }
    .ficha__saindo { font-size: 0.7rem; font-weight: 700; color: var(--ces-brand); }
    .ficha__aviso { font-size: 0.7rem; font-weight: 700; color: var(--ces-warning-text); }
    .estoque--escolhendo .ficha { border-color: var(--ces-brand); background: var(--ces-brand-soft); }
    .guia { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0; min-height: 2rem; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .guia--ativa { padding: 0.35rem 0.35rem 0.35rem 0.7rem; border-radius: var(--ces-radius-md); background: var(--ces-brand-soft); color: var(--ces-foreground); font-weight: 600; }
    /* Telas estreitas empilham os painéis: a gravação fica sempre à mão enquanto há mudança. */
    .barra-salvar { display: none; }
    @media (max-width: 1200px) {
      .barra-salvar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 1rem; padding: 0.6rem 0.75rem;
        border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg); background: var(--ces-surface); box-shadow: var(--ces-shadow-md); }
      .barra-salvar span { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    }
    .estado { margin-top: 1rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg); background: var(--ces-surface); box-shadow: var(--ces-shadow-sm); }
    .avisos { margin: 0; padding-left: 1rem; }
    .zonas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .zona { display: grid; gap: 0.15rem; justify-items: start; padding: 0.7rem; text-align: left; border: 2px dashed var(--ces-border-strong);
      border-radius: var(--ces-radius-md); background: var(--ces-surface-subtle); color: var(--ces-foreground); font: inherit; cursor: pointer;
      transition: border-color var(--ces-duration-fast) var(--ces-ease-standard), background var(--ces-duration-fast) var(--ces-ease-standard); }
    .zona:hover, .zona--alvo { border-color: var(--ces-brand); background: var(--ces-brand-soft); }
    .zona:focus-visible { outline: none; box-shadow: var(--ces-focus-ring); }
    .zona:disabled { cursor: default; opacity: 0.6; }
    .zona--destino { border-color: var(--ces-brand); border-style: solid; }
    .zona--indisponivel { opacity: 0.55; }
    .zona[data-tipo='DESCARTE']:hover, .zona[data-tipo='DESCARTE'].zona--alvo { border-color: var(--ces-danger); background: var(--ces-danger-soft); }
    .zona__titulo { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; }
    .zona__dica { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .zona__qtd { font-size: var(--ces-font-caption); font-weight: 700; color: var(--ces-brand); }
    .selecionado dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem 0.75rem; margin: 0; }
    .selecionado dt { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .selecionado dd { margin: 0; font-weight: 600; }
    .mudancas { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .mudanca { display: grid; gap: 0.45rem; padding: 0.6rem 0.7rem; border: 1px solid var(--ces-border); border-left: 3px solid var(--ces-brand);
      border-radius: var(--ces-radius-md); background: var(--ces-surface-subtle); }
    .mudanca__linha { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
    .mudanca__texto { min-width: 0; font-size: var(--ces-font-caption); }
    .mudanca__texto strong { font-size: var(--ces-font-body); }
    .rodape { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .diagrama-config { display: grid; gap: 1rem; }
    .modelos { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.5rem; }
    .modelo { display: grid; gap: 0.15rem; padding: 0.7rem; text-align: left; font: inherit; color: var(--ces-foreground); cursor: pointer;
      border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md); background: var(--ces-surface); }
    .modelo:hover, .modelo[aria-pressed='true'] { border-color: var(--ces-brand); background: var(--ces-brand-soft); }
    .modelo:focus-visible { outline: none; box-shadow: var(--ces-focus-ring); }
    .modelo span { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .construtor { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .eixo-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.35rem 0.25rem 0.6rem; border: 1px solid var(--ces-border);
      border-radius: 999px; font-size: var(--ces-font-caption); font-weight: 600; }
    .config-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem); gap: 1rem; align-items: start; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 1200px) { .area { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .area__diagrama { grid-column: 1 / -1; order: -1; } }
    @media (max-width: 900px) { .topo { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .topo__acoes { grid-column: 1 / -1; padding-top: 0; } .config-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 640px) { .area { grid-template-columns: minmax(0, 1fr); } .topo { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <div class="topo">
      <ces-select label="Veículo" [options]="veiculos()" [value]="idVeiculo()" (valueChange)="trocarVeiculo($event)" [filter]="true"
        placeholder="Escolha a placa" [loading]="carregandoVeiculos()"></ces-select>
      @if (veiculo()?.eixos && !configurando()) {
        <ces-number-input [label]="veiculo()!.unidade === 'HORAS' ? 'Horímetro' : 'Km do veículo'" [(value)]="km" [min]="0" [error]="erroKm() ? 'Menor que o último registrado.' : undefined"
          [description]="veiculo()!.kmAtual != null ? 'Último registrado: ' + formatarKm(veiculo()!.kmAtual, veiculo()!.unidade) : 'Sem leitura registrada'"></ces-number-input>
        <ces-datepicker label="Quando" [(value)]="quando" [showTime]="true" [maxDate]="agora" description="Vazio: agora."></ces-datepicker>
        <div class="topo__acoes">
          @if (podeEditar()) {
            <ces-button variant="ghost" size="sm" icon="pi pi-sitemap" label="Alterar diagrama" (pressed)="configurar()"></ces-button>
          }
        </div>
      }
    </div>

    <p class="sr" aria-live="polite">{{ anuncio() }}</p>

    @if (!idVeiculo()) {
      <ces-async-state class="estado" state="empty" icon="pi-car" title="Escolha um veículo"
        description="O diagrama mostra os pneus de cada posição. Arraste do estoque para montar, ou toque no pneu e depois na posição."></ces-async-state>
    } @else if (carregando() && !veiculo()) {
      <ces-async-state class="estado" state="loading" title="Carregando os pneus do veículo" description="Só um instante."></ces-async-state>
    } @else if (erro()) {
      <ces-async-state class="estado" state="error" title="Não foi possível carregar os pneus do veículo" [description]="erro()!"
        actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></ces-async-state>
    } @else if (veiculo(); as v) {
      @if (!v.eixos || configurando()) {
        <section class="painel diagrama-config" style="margin-top: 1rem" aria-label="Diagrama de pneus do veículo">
          <div>
            <h3 class="painel__titulo">{{ v.eixos ? 'Alterar o diagrama do ' : 'Defina o diagrama do ' }}{{ placa(v.placa) }}</h3>
            <p class="painel__sub">Escolha um modelo pronto ou monte eixo a eixo (simples: 2 rodas; duplo: 4 rodas). Os pneus montados precisam continuar com posição no diagrama novo.</p>
          </div>
          <div class="config-grid">
            <div class="diagrama-config">
              <div class="modelos" role="group" aria-label="Modelos prontos">
                @for (m of modelos; track m.rotulo) {
                  <button type="button" class="modelo" [attr.aria-pressed]="eixosConfig().join(',') === m.eixos && estepesConfig() === m.estepes"
                    (click)="usarModelo(m.eixos, m.estepes)" [disabled]="!podeEditar()">
                    <strong>{{ m.rotulo }}</strong><span>{{ m.descricao }}{{ m.estepes ? ', ' + m.estepes + ' estepe' : ', sem estepe' }}</span>
                  </button>
                }
              </div>
              <div class="construtor" role="group" aria-label="Eixos da frente para trás">
                @for (e of eixosConfig(); track $index) {
                  <span class="eixo-chip">Eixo {{ $index + 1 }}
                    <ces-button size="sm" variant="ghost" [label]="e === 'S' ? 'Simples' : 'Duplo'" [ariaLabel]="'Eixo ' + ($index + 1) + ' ' + (e === 'S' ? 'simples' : 'duplo') + '. Trocar'"
                      (pressed)="alternarEixo($index)" [disabled]="!podeEditar()"></ces-button>
                    @if (eixosConfig().length > 1) {
                      <ces-button size="sm" variant="ghost" icon="pi pi-times" [ariaLabel]="'Remover eixo ' + ($index + 1)" (pressed)="removerEixo($index)" [disabled]="!podeEditar()"></ces-button>
                    }
                  </span>
                }
                @if (eixosConfig().length < 9) {
                  <ces-button size="sm" variant="outline" icon="pi pi-plus" label="Eixo" (pressed)="adicionarEixo()" [disabled]="!podeEditar()"></ces-button>
                }
              </div>
              <div style="max-width: 12rem">
                <ces-number-input label="Estepes" [(value)]="estepesConfigValor" [min]="0" [max]="4" [showButtons]="true" [disabled]="!podeEditar()"></ces-number-input>
              </div>
              @if (semPosicao().length) {
                <ces-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true" title="Pneus sem posição neste diagrama">
                  {{ semPosicao().join(', ') }}. Tire esses pneus do veículo na montagem antes de mudar o diagrama.
                </ces-callout>
              }
              <div class="rodape" style="justify-content: flex-start">
                @if (podeEditar()) {
                  <ces-button icon="pi pi-check" label="Salvar diagrama" [disabled]="semPosicao().length > 0" [loading]="salvando()" (pressed)="salvarDiagrama()"></ces-button>
                }
                @if (v.eixos) { <ces-button variant="ghost" label="Cancelar" (pressed)="configurando.set(false)"></ces-button> }
              </div>
            </div>
            <app-frota-pneu-diagrama [eixos]="eixosConfig().join(',')" [posicoes]="previa()" [interativo]="false" [legenda]="false" [titulo]="placa(v.placa)"></app-frota-pneu-diagrama>
          </div>
        </section>
      } @else {
        <div class="area">
          <section class="painel" aria-label="Pneus disponíveis">
            <h3 class="painel__titulo">Pneus disponíveis <ces-status tone="neutral">{{ noEstoque().length }}</ces-status></h3>
            <ces-text-input label="Buscar" [labelVisible]="false" placeholder="Marca de fogo, marca ou medida" [(value)]="busca"></ces-text-input>
            <div class="estoque" [class.estoque--alvo]="alvoEstoque()" [class.estoque--escolhendo]="!!posicaoAlvo()" [pDroppable]="escopo" (onDragEnter)="alvoEstoque.set(true)"
              (onDragLeave)="alvoEstoque.set(false)" (onDrop)="soltarEm('ESTOQUE'); alvoEstoque.set(false)">
              @for (p of estoqueFiltrado(); track p.id) {
                <button type="button" class="ficha" [pDraggable]="escopo" [pDraggableDisabled]="!podeEditar()" (onDragStart)="arrastando.set(p.id)"
                  (onDragEnd)="arrastando.set(null)" (click)="selecionar(p.id)" [attr.aria-pressed]="selecionado() === p.id"
                  [attr.aria-label]="'Pneu ' + p.marcaFogo + ', ' + p.marca + (p.medida ? ' ' + p.medida : '') + ', sulco ' + sulco(p.sulcoAtualMm) + (selecionado() === p.id ? '. Selecionado: escolha a posição ou o destino.' : '. Selecionar')">
                  <span class="ficha__faixa" [attr.data-tom]="tom(p.sulcoAtualMm)" aria-hidden="true"></span>
                  <span class="ficha__fogo">{{ p.marcaFogo }}</span>
                  <span class="ficha__info">{{ p.marca }}{{ p.medida ? ' · ' + p.medida : '' }}</span>
                  <span class="ficha__info">{{ sulco(p.sulcoAtualMm) }} · vida {{ p.vida + 1 }}</span>
                  @if (variosAlmoxarifados() && p.estoque) { <span class="ficha__info">{{ p.estoque }}</span> }
                  @if (medidaDiferente(p)) { <span class="ficha__aviso">Medida diferente</span> }
                  @if (p.idVeiculo === idVeiculo()) { <span class="ficha__saindo">Saindo do veículo</span> }
                </button>
              } @empty {
                <p class="painel__sub" style="grid-column: 1 / -1">{{ busca() ? 'Nenhum pneu disponível com essa busca.' : 'Nenhum pneu disponível no estoque. Cadastre na aba Pneus.' }}</p>
              }
            </div>
          </section>

          <section class="painel area__diagrama" aria-label="Diagrama do veículo">
            <h3 class="painel__titulo">{{ placa(v.placa) }}{{ v.tipoVeiculo ? ' · ' + v.tipoVeiculo : '' }}
              <ces-status tone="neutral">{{ montados() }} de {{ rodas() }} rodas</ces-status></h3>
            <app-frota-pneu-diagrama [eixos]="v.eixos" [posicoes]="posicoesView()" [sulcoMinimo]="v.sulcoMinimoMm" [titulo]="placa(v.placa)"
              [arrastavel]="podeEditar()" [interativo]="podeEditar()" [selecionado]="selecionado()" [posicaoSelecionada]="posicaoAlvo()"
              [destacarDestinos]="!!selecionado() || !!arrastando()"
              (posicaoAcionada)="acionarPosicao($event)" (soltoNaPosicao)="soltarNaPosicao($event)"
              (arrasteIniciado)="arrastando.set($event)" (arrasteTerminado)="arrastando.set(null)"></app-frota-pneu-diagrama>
            <div class="guia" [class.guia--ativa]="!!selecionado() || !!posicaoAlvo()">
              <span>{{ guia() }}</span>
              @if (selecionado() || posicaoAlvo()) {
                <ces-button size="sm" variant="ghost" label="Cancelar" ariaLabel="Cancelar a escolha (Esc)" (pressed)="cancelarEscolha()"></ces-button>
              }
            </div>
          </section>

          <section class="painel" aria-label="Destinos e alterações">
            <h3 class="painel__titulo">Tirar do veículo</h3>
            <div class="zonas">
              @for (z of zonas; track z.tipo) {
                <button type="button" class="zona" [attr.data-tipo]="z.tipo" [class.zona--alvo]="alvoZona() === z.tipo" [class.zona--destino]="zonaDisponivel(z.tipo)" [class.zona--indisponivel]="zonaIndisponivel(z.tipo)" [disabled]="!podeEditar()"
                  [pDroppable]="escopo" (onDragEnter)="alvoZona.set(z.tipo)" (onDragLeave)="alvoZona.set(null)" (onDrop)="soltarEm(z.tipo); alvoZona.set(null)"
                  (click)="enviarSelecionado(z.tipo)"
                  [attr.aria-label]="z.rotulo + ': ' + z.dica + (selecionado() ? '. Enviar o pneu selecionado' : '')">
                  <span class="zona__titulo"><i [class]="z.icone" aria-hidden="true"></i>{{ z.rotulo }}</span>
                  <span class="zona__dica">{{ z.dica }}</span>
                  @if (contarDestino(z.tipo)) { <span class="zona__qtd">{{ contarDestino(z.tipo) }} nesta movimentação</span> }
                </button>
              }
            </div>

            @if (pneuSelecionado(); as p) {
              <div class="selecionado">
                <h3 class="painel__titulo">Pneu {{ p.marcaFogo }}
                  <ces-button size="sm" variant="ghost" icon="pi pi-times" ariaLabel="Tirar a seleção" (pressed)="selecionado.set(null)"></ces-button></h3>
                <dl>
                  <div><dt>Marca e modelo</dt><dd>{{ p.marca }}{{ p.modelo ? ' ' + p.modelo : '' }}</dd></div>
                  <div><dt>Medida</dt><dd>{{ p.medida ?? '—' }}</dd></div>
                  <div><dt>Sulco</dt><dd>{{ sulco(p.sulcoAtualMm) }}</dd></div>
                  <div><dt>Vida</dt><dd>{{ p.vida === 0 ? 'Novo (1ª vida)' : (p.vida + 1) + 'ª vida' }}</dd></div>
                  <div><dt>Km na vida</dt><dd>{{ formatarKm(p.kmVida) }}</dd></div>
                  <div><dt>Onde está</dt><dd>{{ ondeEsta(p) }}</dd></div>
                </dl>
                <ces-button size="sm" variant="outline" icon="pi pi-external-link" label="Abrir pneu" (pressed)="abrirPneu.emit(p)"></ces-button>
              </div>
            }

            <h3 class="painel__titulo">Alterações <ces-status [tone]="alteracoes().length ? 'info' : 'neutral'">{{ alteracoes().length }}</ces-status></h3>
            @if (alteracoes().length) {
              <ul class="mudancas">
                @for (a of alteracoes(); track a.pneu.id) {
                  <li class="mudanca">
                    <div class="mudanca__linha">
                      <span class="mudanca__texto"><strong>{{ a.pneu.marcaFogo }}</strong><br>{{ descreverLocal(a.de) }} → {{ descreverLocal(a.para) }}</span>
                      <ces-button size="sm" variant="ghost" icon="pi pi-undo" [ariaLabel]="'Desfazer a mudança do pneu ' + a.pneu.marcaFogo" (pressed)="desfazer(a.pneu.id)"></ces-button>
                    </div>
                    @switch (a.para.tipo) {
                      @case ('ESTOQUE') {
                        <ces-select label="Almoxarifado" [options]="opcoesAlmoxarifado()" [value]="$any(a.para).idEstoque" (valueChange)="definir(a.pneu.id, { tipo: 'ESTOQUE', idEstoque: $event })"
                          [error]="$any(a.para).idEstoque ? undefined : 'Escolha o almoxarifado.'"></ces-select>
                      }
                      @case ('REPARO') {
                        <ces-select label="Fornecedor do reparo" [options]="opcoesFornecedor()" [value]="$any(a.para).idFornecedor" [filter]="true" [clearable]="true" [showOptional]="true"
                          (valueChange)="definir(a.pneu.id, { tipo: 'REPARO', idFornecedor: $event })"></ces-select>
                      }
                      @case ('REFORMA') {
                        <ces-select label="Reformadora" [options]="opcoesFornecedor()" [value]="$any(a.para).idFornecedor" [filter]="true" [clearable]="true" [showOptional]="true"
                          (valueChange)="definir(a.pneu.id, { tipo: 'REFORMA', idFornecedor: $event })"></ces-select>
                      }
                      @case ('DESCARTE') {
                        <ces-text-input label="Motivo do descarte" [required]="true" [value]="$any(a.para).motivo" [maxlength]="300"
                          placeholder="Ex.: carcaça cortada, sulco no fim" (valueChange)="definir(a.pneu.id, { tipo: 'DESCARTE', motivo: $event })"
                          [error]="$any(a.para).motivo?.trim() ? undefined : 'Informe o motivo.'"></ces-text-input>
                      }
                    }
                  </li>
                }
              </ul>
              @if (avisos().length) {
                <ces-callout tone="warning" icon="pi pi-exclamation-circle" [dense]="true" title="Confira antes de salvar">
                  <ul class="avisos">@for (a of avisos(); track a) { <li>{{ a }}</li> }</ul>
                </ces-callout>
              }
              @if (erroKm()) {
                <ces-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true" title="Confira o km do veículo">{{ erroKm() }}</ces-callout>
              }
              @if (conflitos().length) {
                <ces-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true" title="Dois pneus na mesma posição">
                  {{ conflitos().join(', ') }}. Mova um deles antes de salvar.
                </ces-callout>
              }
              <div class="rodape">
                <ces-button variant="ghost" icon="pi pi-times" label="Descartar alterações" (pressed)="limpar()"></ces-button>
                <ces-button icon="pi pi-check" [label]="'Salvar ' + (alteracoes().length === 1 ? '1 alteração' : alteracoes().length + ' alterações')"
                  [disabled]="!podeSalvar()" [loading]="salvando()" (pressed)="salvar()"></ces-button>
              </div>
            } @else {
              <p class="painel__sub">Nada mudou ainda. As mudanças aparecem aqui antes de gravar.</p>
            }
          </section>
        </div>
        @if (alteracoes().length) {
          <div class="barra-salvar">
            <span>{{ podeSalvar() ? 'Mudanças ainda não salvas' : 'Complete as alterações antes de salvar' }}</span>
            @if (podeSalvar()) {
              <ces-button size="sm" icon="pi pi-check" [label]="'Salvar ' + alteracoes().length" [ariaLabel]="'Salvar ' + alteracoes().length + ' alterações'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
            } @else {
              <ces-button size="sm" variant="outline" icon="pi pi-arrow-down" label="Ver alterações" (pressed)="rolarPara('.mudancas', true)"></ces-button>
            }
          </div>
        }
      }
    }
  `
})
export class FrotaPneuMontagemComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly veiculos = input<CesSelectOption<string>[]>([]);
  readonly carregandoVeiculos = input(false);
  readonly almoxarifados = input<AlmoxarifadoFrota[]>([]);
  readonly fornecedores = input<FornecedorFrota[]>([]);
  readonly podeEditar = input(false);
  /** Veículo aberto ao entrar (ex.: vindo da ficha do veículo). */
  readonly idVeiculoInicial = input<string | null>(null);
  /** Avisa a tela que a frota mudou (para recarregar lista e totais). */
  readonly alterado = output<void>();
  readonly veiculoTrocado = output<string | null>();
  readonly abrirPneu = output<Pneu>();
  /** A outra aba (rodízio) tem trocas não salvas deste veículo. */
  readonly rascunhoEmOutraAba = input(false);

  protected readonly escopo = ESCOPO_PNEU;
  protected readonly zonas = ZONAS;
  protected readonly modelos = MODELOS_DIAGRAMA;
  protected readonly placa = formatarPlaca;
  protected readonly formatarKm = formatarKm;
  protected readonly sulco = formatarSulco;
  protected readonly agora = new Date();

  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly veiculo = signal<VeiculoPneus | null>(null);
  private readonly disponiveis = signal<Pneu[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly km = signal<number | null>(null);
  protected readonly quando = signal<Date | null>(null);
  protected readonly busca = signal('');
  protected readonly selecionado = signal<string | null>(null);
  /** Posição vazia tocada antes do pneu: o próximo pneu escolhido vai para ela. */
  protected readonly posicaoAlvo = signal<string | null>(null);
  protected readonly arrastando = signal<string | null>(null);
  protected readonly alvoZona = signal<Destino | null>(null);
  protected readonly alvoEstoque = signal(false);
  protected readonly anuncio = signal('');
  private readonly rascunho = signal<Map<string, Local>>(new Map());

  // ── Configuração do diagrama ─────────────────────────────────────────────
  protected readonly configurando = signal(false);
  protected readonly eixosConfig = signal<('S' | 'D')[]>(['S', 'D']);
  protected readonly estepesConfigValor = signal<number | null>(1);
  protected readonly estepesConfig = computed(() => Math.max(0, Math.min(4, this.estepesConfigValor() ?? 0)));
  private readonly codigosConfig = computed(() => [
    ...this.eixosConfig().flatMap((e, i) => (e === 'D' ? ['EE', 'EI', 'DI', 'DE'] : ['E', 'D']).map((lado) => `${i + 1}${lado}`)),
    ...Array.from({ length: this.estepesConfig() }, (_, i) => `S${i + 1}`)
  ]);
  protected readonly previa = computed<PosicaoDiagrama[]>(() => {
    const atuais = new Map((this.veiculo()?.posicoes ?? []).map((p) => [p.codigo, p.pneu]));
    return this.codigosConfig().map((codigo) => ({
      codigo, eixo: codigo.startsWith('S') ? 0 : parseInt(codigo, 10), rotulo: rotuloPosicao(codigo), estepe: codigo.startsWith('S'), pneu: atuais.get(codigo) ?? null
    }));
  });
  /** Pneus montados que perderiam a posição com o diagrama em edição. */
  protected readonly semPosicao = computed(() => {
    const codigos = new Set(this.codigosConfig());
    return (this.veiculo()?.posicoes ?? []).filter((p) => p.pneu && !codigos.has(p.codigo)).map((p) => `${p.pneu!.marcaFogo} (${rotuloPosicao(p.codigo)})`);
  });

  /** Todos os pneus em jogo: os montados no veículo e os disponíveis. */
  private readonly pneus = computed(() => {
    const mapa = new Map<string, Pneu>();
    for (const p of this.disponiveis()) mapa.set(p.id, p);
    for (const pos of this.veiculo()?.posicoes ?? []) if (pos.pneu) mapa.set(pos.pneu.id, pos.pneu);
    return mapa;
  });

  protected readonly alteracoes = computed<Alteracao[]>(() => {
    const lista: Alteracao[] = [];
    for (const [id, para] of this.rascunho()) {
      const pneu = this.pneus().get(id);
      if (pneu) lista.push({ pneu, de: this.original(pneu), para });
    }
    return lista;
  });

  private readonly local = (p: Pneu): Local => this.rascunho().get(p.id) ?? this.original(p);

  protected readonly posicoesView = computed<PosicaoDiagrama[]>(() => {
    const v = this.veiculo();
    if (!v) return [];
    const ocupacao = new Map<string, Pneu>();
    for (const p of this.pneus().values()) {
      const l = this.local(p);
      if (l.tipo === 'POSICAO' && !ocupacao.has(l.posicao)) ocupacao.set(l.posicao, p);
    }
    return v.posicoes.map((pos) => {
      const pneu = ocupacao.get(pos.codigo) ?? null;
      const alterada = (pneu && this.rascunho().has(pneu.id)) || (!!pos.pneu && this.rascunho().has(pos.pneu.id) && pneu?.id !== pos.pneu.id);
      return { ...pos, pneu, alterada: !!alterada };
    });
  });

  protected readonly conflitos = computed(() => {
    const contagem = new Map<string, number>();
    for (const p of this.pneus().values()) {
      const l = this.local(p);
      if (l.tipo === 'POSICAO') contagem.set(l.posicao, (contagem.get(l.posicao) ?? 0) + 1);
    }
    return [...contagem.entries()].filter(([, n]) => n > 1).map(([c]) => rotuloPosicao(c));
  });

  protected readonly noEstoque = computed(() => [...this.pneus().values()].filter((p) => this.local(p).tipo === 'ESTOQUE'));
  protected readonly estoqueFiltrado = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const lista = this.noEstoque();
    return termo ? lista.filter((p) => `${p.marcaFogo} ${p.marca} ${p.modelo ?? ''} ${p.medida ?? ''}`.toLowerCase().includes(termo)) : lista;
  });
  protected readonly pneuSelecionado = computed(() => (this.selecionado() ? this.pneus().get(this.selecionado()!) ?? null : null));
  protected readonly montados = computed(() => this.posicoesView().filter((p) => p.pneu && !p.estepe).length);
  protected readonly rodas = computed(() => this.posicoesView().filter((p) => !p.estepe).length);
  protected readonly opcoesAlmoxarifado = computed<CesSelectOption<string>[]>(() =>
    this.almoxarifados().filter((a) => a.ativo).map((a) => ({ label: a.baseOperacional ? `${a.nome} · ${a.baseOperacional}` : a.nome, value: a.id })));
  protected readonly opcoesFornecedor = computed<CesSelectOption<string>[]>(() => this.fornecedores().map((f) => ({ label: f.nome, value: f.id })));
  protected readonly erroKm = computed(() => {
    const v = this.veiculo();
    return v ? erroKmMovimentacao(this.km(), v.kmAtual, !!this.quando(), v.unidade) : undefined;
  });
  protected readonly variosAlmoxarifados = computed(() => this.almoxarifados().filter((a) => a.ativo).length > 1);
  /** Medidas já montadas no veículo: o pneu de outra medida ganha um aviso. */
  private readonly medidasNoVeiculo = computed(() => new Set((this.veiculo()?.posicoes ?? []).flatMap((p) => (p.pneu?.medida ? [p.pneu.medida] : []))));
  /** O que vale conferir antes de gravar, sem impedir: a decisão é da oficina. */
  protected readonly avisos = computed(() => {
    const lista: string[] = [];
    const porEixo = new Map<number, PosicaoDiagrama[]>();
    for (const p of this.posicoesView()) {
      if (!p.estepe && p.pneu) porEixo.set(p.eixo, [...(porEixo.get(p.eixo) ?? []), p]);
    }
    for (const [eixo, posicoes] of porEixo) {
      const medidas = [...new Set(posicoes.flatMap((p) => (p.pneu?.medida ? [p.pneu.medida] : [])))];
      if (medidas.length > 1 && posicoes.some((p) => p.alterada)) lista.push(`Eixo ${eixo} com medidas diferentes: ${medidas.join(' e ')}.`);
    }
    for (const a of this.alteracoes()) {
      if (a.para.tipo === 'POSICAO' && this.tom(a.pneu.sulcoAtualMm) === 'danger') {
        lista.push(`${a.pneu.marcaFogo} vai para ${rotuloPosicao(a.para.posicao).toLowerCase()} com o sulco no limite (${formatarSulco(a.pneu.sulcoAtualMm)}).`);
      }
    }
    return lista;
  });
  protected readonly guia = computed(() => {
    const p = this.pneuSelecionado();
    if (p) return `Pneu ${p.marcaFogo} escolhido. Toque na posição${this.original(p).tipo === 'POSICAO' ? ' ou no destino' : ''}.`;
    const alvo = this.posicaoAlvo();
    if (alvo) return `${rotuloPosicao(alvo)} escolhida. Toque no pneu disponível que vai nela.`;
    return 'Arraste ou toque no pneu e depois na posição. Soltar sobre uma posição ocupada troca os dois de lugar.';
  });
  protected readonly podeSalvar = computed(() =>
    this.podeEditar() && !this.erroKm() && !this.conflitos().length && this.alteracoes().every((a) =>
      (a.para.tipo !== 'DESCARTE' || a.para.motivo.trim().length > 0) && (a.para.tipo !== 'ESTOQUE' || !!a.para.idEstoque)));

  constructor() {
    effect(() => {
      const inicial = this.idVeiculoInicial();
      if (inicial && inicial !== untracked(this.idVeiculo)) untracked(() => this.trocarVeiculo(inicial, true));
    });
  }

  /** Há mudanças não salvas (a tela pergunta antes de sair ou trocar de aba). */
  temAlteracoes(): boolean {
    return this.alteracoes().length > 0;
  }

  quantasAlteracoes(): number {
    return this.alteracoes().length;
  }

  @HostListener('document:keydown.escape')
  protected cancelarEscolha(): void {
    if (!this.selecionado() && !this.posicaoAlvo()) return;
    this.selecionado.set(null);
    this.posicaoAlvo.set(null);
    this.anuncio.set('Escolha cancelada.');
  }

  protected async trocarVeiculo(id: string | null, silencioso = false): Promise<void> {
    if (id === this.idVeiculo()) return;
    if (!silencioso && (this.alteracoes().length || this.rascunhoEmOutraAba())) {
      const ok = await this.confirmacao.confirm({
        title: 'Descartar alterações?',
        message: 'As mudanças deste veículo ainda não foram salvas. Trocar de veículo descarta essas mudanças.',
        confirmLabel: 'Descartar e trocar',
        cancelLabel: 'Continuar neste veículo',
        variant: 'destructive'
      });
      if (!ok) {
        // O seletor já mostra o veículo escolhido: devolve ao atual.
        const atual = this.idVeiculo();
        this.idVeiculo.set(id);
        setTimeout(() => this.idVeiculo.set(atual), 50);
        return;
      }
    }
    this.idVeiculo.set(id);
    this.veiculo.set(null);
    this.limparRascunho();
    this.configurando.set(false);
    this.veiculoTrocado.emit(id);
    this.carregar();
  }

  carregar(): void {
    const id = this.idVeiculo();
    if (!id) return;
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.veiculo(id).subscribe({
      next: (v) => {
        this.veiculo.set(v);
        this.km.set(v.kmAtual ?? null);
        this.carregando.set(false);
        if (!v.eixos) this.prepararConfiguracao(v);
      },
      error: (e) => (this.erro.set(getErrorMessage(e)), this.carregando.set(false))
    });
    this.servico.listar({ situacoes: ['DISPONIVEL'] }, { size: 500, sort: ['marcaFogo'] }).subscribe({
      next: (p) => this.disponiveis.set(p.content),
      error: () => this.disponiveis.set([])
    });
  }

  // ── Interação ────────────────────────────────────────────────────────────

  protected selecionar(id: string): void {
    if (!this.podeEditar()) return;
    const alvo = this.posicaoAlvo();
    if (alvo) {
      this.posicaoAlvo.set(null);
      this.selecionado.set(null);
      this.mover(id, { tipo: 'POSICAO', posicao: alvo });
      this.rolarPara('.area__diagrama');
      return;
    }
    const novo = this.selecionado() === id ? null : id;
    this.selecionado.set(novo);
    if (novo) this.rolarPara('.area__diagrama');
    const p = novo ? this.pneus().get(novo) : null;
    this.anuncio.set(p ? `Pneu ${p.marcaFogo} selecionado. Escolha a posição no diagrama ou um destino.` : 'Seleção desfeita.');
  }

  protected acionarPosicao(codigo: string): void {
    const sel = this.selecionado();
    const ocupante = this.posicoesView().find((p) => p.codigo === codigo)?.pneu;
    if (sel && ocupante?.id !== sel) {
      this.mover(sel, { tipo: 'POSICAO', posicao: codigo });
      this.selecionado.set(null);
    } else if (ocupante) {
      this.selecionar(ocupante.id);
    } else if (!sel) {
      const novo = this.posicaoAlvo() === codigo ? null : codigo;
      this.posicaoAlvo.set(novo);
      this.anuncio.set(novo ? `${rotuloPosicao(novo)} escolhida. Escolha o pneu disponível que vai nela.` : 'Escolha cancelada.');
      if (novo) this.rolarPara('.estoque');
    }
  }

  protected soltarNaPosicao(codigo: string): void {
    const id = this.arrastando();
    if (id) this.mover(id, { tipo: 'POSICAO', posicao: codigo });
    this.arrastando.set(null);
    this.posicaoAlvo.set(null);
  }

  protected soltarEm(tipo: Destino): void {
    const id = this.arrastando();
    this.arrastando.set(null);
    if (id) this.enviar(id, tipo);
  }

  protected enviarSelecionado(tipo: Destino): void {
    const id = this.selecionado();
    if (!id) {
      this.anuncio.set('Selecione um pneu do diagrama antes de escolher o destino.');
      this.notificacoes.info('Toque num pneu do diagrama e depois no destino. Ou arraste o pneu até aqui.');
      return;
    }
    this.enviar(id, tipo);
    this.selecionado.set(null);
  }

  private enviar(id: string, tipo: Destino): void {
    const pneu = this.pneus().get(id);
    if (!pneu) return;
    const atual = this.local(pneu);
    if (tipo !== 'ESTOQUE' && atual.tipo === 'ESTOQUE' && this.original(pneu).tipo === 'ESTOQUE') {
      this.notificacoes.info(`O pneu ${pneu.marcaFogo} não está no veículo. Para enviar ao ${tipo === 'DESCARTE' ? 'descarte' : tipo.toLowerCase()}, abra o pneu.`);
      return;
    }
    const para: Local = tipo === 'ESTOQUE' ? { tipo, idEstoque: this.almoxarifadoPadrao(pneu) }
      : tipo === 'DESCARTE' ? { tipo, motivo: '' } : { tipo, idFornecedor: null };
    this.mover(id, para);
  }

  /** Leva o pneu ao destino; numa posição ocupada, o pneu que estava lá vai para o lugar de origem (troca). */
  private mover(id: string, para: Local): void {
    const pneu = this.pneus().get(id);
    if (!pneu) return;
    const de = this.local(pneu);
    const mapa = new Map(this.rascunho());
    mapa.set(id, para);
    let texto = `Pneu ${pneu.marcaFogo}: ${this.descreverLocal(para).toLowerCase()}.`;
    if (para.tipo === 'POSICAO') {
      const ocupante = [...this.pneus().values()].find((p) => p.id !== id && this.mesmoLocal(mapa.get(p.id) ?? this.original(p), para));
      if (ocupante) {
        const destinoOcupante: Local = de.tipo === 'POSICAO' ? { tipo: 'POSICAO', posicao: de.posicao }
          : { tipo: 'ESTOQUE', idEstoque: this.almoxarifadoPadrao(ocupante) };
        mapa.set(ocupante.id, destinoOcupante);
        texto += ` O ${ocupante.marcaFogo} foi para ${this.descreverLocal(destinoOcupante).toLowerCase()}.`;
      }
    }
    // Quem voltou ao lugar de origem sai do rascunho.
    for (const [chave, local] of [...mapa]) {
      const p = this.pneus().get(chave);
      if (p && this.mesmoLocal(local, this.original(p)) && (local.tipo !== 'ESTOQUE' || local.idEstoque === (this.original(p) as { idEstoque: string | null }).idEstoque)) {
        mapa.delete(chave);
      }
    }
    this.rascunho.set(mapa);
    this.anuncio.set(texto);
  }

  protected definir(id: string, para: Local): void {
    const mapa = new Map(this.rascunho());
    mapa.set(id, para);
    this.rascunho.set(mapa);
  }

  /** Desfaz a mudança do pneu e a de quem ocupou o lugar dele, para não sobrar dois na mesma posição. */
  protected desfazer(id: string): void {
    const mapa = new Map(this.rascunho());
    const fila = [id];
    while (fila.length) {
      const atual = fila.pop()!;
      mapa.delete(atual);
      const pneu = this.pneus().get(atual);
      const origem = pneu ? this.original(pneu) : null;
      if (origem?.tipo !== 'POSICAO') continue;
      for (const [outro, para] of mapa) {
        if (para.tipo === 'POSICAO' && para.posicao === origem.posicao) fila.push(outro);
      }
    }
    this.rascunho.set(mapa);
    this.anuncio.set('Mudança desfeita.');
  }

  protected async limpar(): Promise<void> {
    const ok = await this.confirmacao.confirm({ title: 'Descartar alterações?', message: 'Todas as mudanças ainda não salvas deste veículo serão desfeitas.', variant: 'destructive' });
    if (ok) this.limparRascunho();
  }

  private limparRascunho(): void {
    this.rascunho.set(new Map());
    this.selecionado.set(null);
    this.posicaoAlvo.set(null);
  }

  protected async salvar(): Promise<void> {
    const v = this.veiculo();
    if (!v || !this.podeSalvar()) return;
    const descartes = this.alteracoes().filter((a) => a.para.tipo === 'DESCARTE');
    if (descartes.length) {
      const ok = await this.confirmacao.confirm({
        title: descartes.length === 1 ? `Descartar o pneu ${descartes[0].pneu.marcaFogo}?` : `Descartar ${descartes.length} pneus?`,
        message: 'O descarte tira o pneu da frota de vez e não pode ser desfeito.',
        confirmLabel: 'Salvar e descartar',
        cancelLabel: 'Voltar',
        variant: 'destructive'
      });
      if (!ok) return;
    }
    const destinos: DestinoPneu[] = this.alteracoes().map(({ pneu, para }) => ({
      idPneu: pneu.id,
      destino: para.tipo,
      posicao: para.tipo === 'POSICAO' ? para.posicao : null,
      idEstoque: para.tipo === 'ESTOQUE' ? para.idEstoque : null,
      idFornecedor: para.tipo === 'REPARO' || para.tipo === 'REFORMA' ? para.idFornecedor : null,
      motivo: para.tipo === 'DESCARTE' ? para.motivo.trim() : null
    }));
    this.salvando.set(true);
    this.servico.movimentar({ idVeiculo: v.idVeiculo, km: this.km(), realizadaEm: this.quando() ? paraInstanteIso(this.quando()!) : null, observacao: null, destinos })
      .subscribe({
        next: (atualizado) => {
          this.salvando.set(false);
          this.veiculo.set(atualizado);
          this.km.set(atualizado.kmAtual ?? null);
          this.limparRascunho();
          this.quando.set(null);
          this.notificacoes.success(destinos.length === 1 ? 'Movimentação salva.' : `Movimentação de ${destinos.length} pneus salva.`);
          this.anuncio.set('Movimentação salva.');
          this.servico.listar({ situacoes: ['DISPONIVEL'] }, { size: 500, sort: ['marcaFogo'] }).subscribe({ next: (p) => this.disponiveis.set(p.content) });
          this.alterado.emit();
        },
        error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
      });
  }

  // ── Diagrama ─────────────────────────────────────────────────────────────

  protected configurar(): void {
    if (this.alteracoes().length) {
      this.notificacoes.info('Salve ou descarte as alterações antes de mudar o diagrama.');
      return;
    }
    const v = this.veiculo();
    if (v) this.prepararConfiguracao(v);
    this.configurando.set(true);
  }

  private prepararConfiguracao(v: VeiculoPneus): void {
    const sugestao = this.modeloSugerido(v.tipoVeiculo);
    const eixos = (v.eixos ?? sugestao.eixos).split(',') as ('S' | 'D')[];
    this.eixosConfig.set(eixos);
    this.estepesConfigValor.set(v.eixos ? v.estepes : sugestao.estepes);
  }

  protected usarModelo(eixos: string, estepes: number): void {
    this.eixosConfig.set(eixos.split(',') as ('S' | 'D')[]);
    this.estepesConfigValor.set(estepes);
  }

  protected alternarEixo(i: number): void {
    this.eixosConfig.update((lista) => lista.map((e, j) => (j === i ? (e === 'S' ? 'D' : 'S') : e)));
  }

  protected adicionarEixo(): void {
    this.eixosConfig.update((lista) => [...lista, 'D']);
  }

  protected removerEixo(i: number): void {
    this.eixosConfig.update((lista) => lista.filter((_, j) => j !== i));
  }

  protected salvarDiagrama(): void {
    const v = this.veiculo();
    if (!v) return;
    this.salvando.set(true);
    this.servico.definirDiagrama(v.idVeiculo, this.eixosConfig().join(','), this.estepesConfig()).subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.veiculo.set(atualizado);
        this.configurando.set(false);
        this.notificacoes.success(`Diagrama do ${formatarPlaca(v.placa)} salvo.`);
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  // ── Apoio ────────────────────────────────────────────────────────────────

  /** Com os painéis empilhados, o próximo passo pode estar fora da tela: leva até ele. */
  protected rolarPara(seletor: string, sempre = false): void {
    if (!sempre && !globalThis.matchMedia?.('(max-width: 1200px)').matches) return;
    const reduzido = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.elemento.nativeElement.querySelector(seletor)?.scrollIntoView?.({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' });
  }

  /** Primeiro modelo que combina com o tipo do veículo; sem pista, o de carro. */
  private modeloSugerido(tipo: string | null | undefined): (typeof MODELOS_DIAGRAMA)[number] {
    const t = (tipo ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const rotulo = /cavalo/.test(t) ? 'Cavalo mecânico'
      : /carreta|reboque|semi/.test(t) ? 'Carreta 3 eixos'
      : /truck/.test(t) ? 'Caminhão truck'
      : /caminh(?!onete)/.test(t) ? 'Caminhão toco'
      : /retro|maquina|compressor|trator|escavadeira/.test(t) ? 'Máquina (2 eixos)'
      : 'Carro ou picape';
    return MODELOS_DIAGRAMA.find((m) => m.rotulo === rotulo) ?? MODELOS_DIAGRAMA[0];
  }

  protected medidaDiferente(p: Pneu): boolean {
    return !!p.medida && this.medidasNoVeiculo().size > 0 && !this.medidasNoVeiculo().has(p.medida);
  }

  /** O pneu escolhido ou arrastado não pode ir a esse destino daqui (ainda não saiu do almoxarifado). */
  protected zonaIndisponivel(tipo: Destino): boolean {
    const id = this.selecionado() ?? this.arrastando();
    const pneu = id ? this.pneus().get(id) : null;
    return !!pneu && this.local(pneu).tipo === 'ESTOQUE' && (tipo === 'ESTOQUE' || this.original(pneu).tipo === 'ESTOQUE');
  }

  protected zonaDisponivel(tipo: Destino): boolean {
    return !!(this.selecionado() ?? this.arrastando()) && !this.zonaIndisponivel(tipo);
  }

  private original(p: Pneu): Local {
    return p.situacao === 'EM_USO' && p.posicao ? { tipo: 'POSICAO', posicao: p.posicao } : { tipo: 'ESTOQUE', idEstoque: p.idEstoque };
  }

  private mesmoLocal(a: Local, b: Local): boolean {
    if (a.tipo !== b.tipo) return false;
    return a.tipo === 'POSICAO' ? a.posicao === (b as { posicao: string }).posicao : true;
  }

  /** Almoxarifado de onde o pneu veio, senão o da base do veículo, senão o primeiro. */
  private almoxarifadoPadrao(p: Pneu): string | null {
    const ativos = this.almoxarifados().filter((a) => a.ativo);
    return p.idEstoque ?? ativos[0]?.id ?? null;
  }

  protected descreverLocal(l: Local): string {
    switch (l.tipo) {
      case 'POSICAO': return rotuloPosicao(l.posicao);
      case 'ESTOQUE': return 'Almoxarifado' + (l.idEstoque ? ' ' + (this.almoxarifados().find((a) => a.id === l.idEstoque)?.nome ?? '') : '');
      case 'REPARO': return 'Reparo';
      case 'REFORMA': return 'Reforma';
      case 'DESCARTE': return 'Descarte';
    }
  }

  protected ondeEsta(p: Pneu): string {
    return this.descreverLocal(this.local(p)) + (this.rascunho().has(p.id) ? ' (falta salvar)' : '');
  }

  protected contarDestino(tipo: Destino): number {
    return this.alteracoes().filter((a) => a.para.tipo === tipo && a.de.tipo === 'POSICAO').length;
  }

  protected tom(mm: number | null): string {
    return tomSulco(mm, this.veiculo()?.sulcoMinimoMm ?? 3);
  }
}
