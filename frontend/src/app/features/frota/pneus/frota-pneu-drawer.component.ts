import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormActionsComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import {
  ALERTA_PNEU,
  AlmoxarifadoFrota,
  EVENTO_PNEU,
  EventoPneu,
  Pneu,
  PneuRequest,
  SITUACAO_PNEU,
  formatarCustoKm,
  formatarKm,
  formatarSulco
} from '../../../core/models/frota-pneu.models';
import { FornecedorFrota, formatarPlaca, paraDataIso, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';

type Etapa = 'envio' | 'retorno' | 'descarte' | 'transferir' | null;
const OUTRA = '__OUTRA__';
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const VIDAS: GeoSelectOption<number>[] = [
  { label: 'Novo (1ª vida)', value: 0 },
  ...[1, 2, 3, 4, 5].map((n) => ({ label: n === 1 ? 'Reformado 1 vez' : `Reformado ${n} vezes`, value: n }))
];
const VELOCIDADES = ['F', 'G', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'H', 'V', 'W', 'Y'].map((v) => ({ label: v, value: v }));

/**
 * Pneu num painel só: cadastro e correção, onde ele está e o que dá para fazer agora (enviar ao
 * reparo ou à reforma, registrar o retorno, guardar em outro almoxarifado, descartar), custo por
 * km e a linha do tempo de tudo o que aconteceu com ele.
 */
@Component({
  selector: 'app-frota-pneu-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormActionsComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  styles: `
    .resumo { display: grid; gap: 0.6rem; }
    .resumo dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .resumo dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .resumo dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
    .alertas { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .botoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .etapa { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .etapa__botoes { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .linha { position: relative; display: grid; gap: 0; margin: 0; padding: 0 0 0 1.4rem; list-style: none; }
    .linha::before { content: ''; position: absolute; left: 0.45rem; top: 0.4rem; bottom: 0.4rem; width: 2px; background: var(--geo-border); }
    .evento { position: relative; display: grid; gap: 0.15rem; padding: 0.35rem 0 0.75rem; }
    .evento__marca { position: absolute; left: -1.4rem; top: 0.35rem; display: grid; place-items: center; width: 1.1rem; height: 1.1rem; border-radius: 50%;
      font-size: 0.6rem; background: var(--geo-surface); border: 2px solid var(--geo-border-strong); color: var(--geo-foreground-muted); }
    .evento__marca[data-tom='info'] { border-color: var(--geo-info); color: var(--geo-info-text); }
    .evento__marca[data-tom='success'] { border-color: var(--geo-success); color: var(--geo-success-text); }
    .evento__marca[data-tom='warning'] { border-color: var(--geo-warning); color: var(--geo-warning-text); }
    .evento__marca[data-tom='danger'] { border-color: var(--geo-danger); color: var(--geo-danger-text); }
    .evento__topo { display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; align-items: baseline; }
    .evento__titulo { font-weight: 700; }
    .evento__quando { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .evento__detalhe { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
  `,
  template: `
    <geo-form-drawer #drawer [(visible)]="visivel" [title]="pneu() ? 'Pneu ' + pneu()!.marcaFogo : 'Cadastrar pneu'"
      [description]="pneu() ? (pneu()!.marca + (pneu()!.modelo ? ' ' + pneu()!.modelo : '') + (pneu()!.medida ? ' · ' + pneu()!.medida : '')) : 'Entra disponível no almoxarifado. Monte no veículo pela aba Montagem.'"
      [dirty]="alterado()" [loading]="salvando()" size="lg">

      @if (pneu(); as p) {
        @let st = situacao(p);
        <geo-callout [tone]="st.tom === 'neutral' ? 'info' : st.tom" [icon]="st.icone" [dense]="true" [title]="st.rotulo + onde(p) + tempoServico(p)">
          <div class="resumo">
            <dl>
              <div><dt>Sulco</dt><dd>{{ sulco(p.sulcoAtualMm) }}</dd></div>
              <div><dt>Vida</dt><dd>{{ p.vida === 0 ? 'Novo (1ª)' : (p.vida + 1) + 'ª vida' }}</dd></div>
              <div><dt>Km nesta vida</dt><dd>{{ km(p.kmVida) }}</dd></div>
              <div><dt>Km total</dt><dd>{{ km(p.kmTotal) }}</dd></div>
              <div><dt>Custo total</dt><dd>{{ moeda(p.custoTotal) }}</dd></div>
              <div><dt>Custo por km</dt><dd>{{ custoKm(p.custoPorKm) }}</dd></div>
            </dl>
            @if (p.alertas.length) {
              <div class="alertas">
                @for (a of p.alertas; track a) { <geo-status [tone]="alerta(a).tom" [icon]="alerta(a).icone">{{ alerta(a).rotulo }}</geo-status> }
              </div>
            }
            @if (podeEditar() && p.situacao !== 'DESCARTADO') {
              <div class="botoes">
                @if (p.situacao === 'EM_USO') {
                  <geo-button size="sm" variant="outline" icon="pi pi-sitemap" label="Abrir na montagem" (pressed)="abrirMontagem.emit(p.idVeiculo!)"></geo-button>
                }
                @if (p.situacao === 'DISPONIVEL') {
                  <geo-button size="sm" variant="outline" icon="pi pi-wrench" label="Enviar ao reparo ou reforma" (pressed)="abrirEtapa('envio')"></geo-button>
                  <geo-button size="sm" variant="outline" icon="pi pi-arrow-right-arrow-left" label="Guardar em outro almoxarifado" (pressed)="abrirEtapa('transferir')"></geo-button>
                }
                @if (p.situacao === 'EM_REPARO' || p.situacao === 'EM_REFORMA') {
                  <geo-button size="sm" icon="pi pi-check-circle" [label]="p.situacao === 'EM_REFORMA' ? 'Registrar volta da reforma' : 'Registrar volta do reparo'" (pressed)="abrirEtapa('retorno')"></geo-button>
                }
                @if (p.situacao !== 'EM_USO') {
                  <geo-button size="sm" variant="ghost" icon="pi pi-trash" label="Descartar" (pressed)="abrirEtapa('descarte')"></geo-button>
                }
              </div>
            }
          </div>
        </geo-callout>

        @switch (etapa()) {
          @case ('envio') {
            <div class="etapa" role="group" aria-label="Enviar ao reparo ou à reforma">
              <geo-select label="Para onde" [required]="true" [options]="destinosEnvio" [(value)]="destinoEnvio"></geo-select>
              <geo-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="fornecedorEtapa" [filter]="true" [clearable]="true" [showOptional]="true"></geo-select>
              <geo-textarea label="Observação" [(value)]="observacaoEtapa" [rows]="2" [maxlength]="1000" [showOptional]="true" placeholder="Ex.: furo na banda, corte no ombro"></geo-textarea>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button icon="pi pi-send" label="Enviar" [loading]="gravando()" (pressed)="enviar()"></geo-button>
              </div>
            </div>
          }
          @case ('retorno') {
            <div class="etapa" role="group" aria-label="Registrar retorno">
              <div class="geo-form-grid">
                <geo-select label="Almoxarifado que recebe" [required]="true" [options]="opcoesAlmoxarifado()" [(value)]="almoxarifadoEtapa"></geo-select>
                <geo-number-input label="Valor do serviço" mode="currency" [(value)]="valorEtapa" [min]="0" [showOptional]="true"></geo-number-input>
                <geo-number-input [label]="p.situacao === 'EM_REFORMA' ? 'Sulco do pneu reformado (mm)' : 'Sulco medido (mm)'" [(value)]="sulcoEtapa" [min]="0" [max]="40"
                  [minFractionDigits]="1" [maxFractionDigits]="1" [required]="p.situacao === 'EM_REFORMA'" [showOptional]="p.situacao !== 'EM_REFORMA'"
                  [description]="p.situacao === 'EM_REFORMA' ? 'A reforma começa uma vida nova e zera o km da vida.' : undefined"></geo-number-input>
                <geo-text-input label="Nota fiscal ou recibo" [(value)]="documentoEtapa" [maxlength]="60" [showOptional]="true"></geo-text-input>
                <geo-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="fornecedorEtapa" [filter]="true" [clearable]="true" [showOptional]="true"
                  [description]="p.fornecedorServico ? 'Enviado para ' + p.fornecedorServico + '.' : undefined"></geo-select>
                <geo-datepicker label="Voltou em" [(value)]="quandoEtapa" [maxDate]="agora" [showTime]="true" description="Vazio: agora."></geo-datepicker>
              </div>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button icon="pi pi-check" label="Registrar retorno" [disabled]="!almoxarifadoEtapa() || (p.situacao === 'EM_REFORMA' && sulcoEtapa() == null)"
                  [loading]="gravando()" (pressed)="retornar()"></geo-button>
              </div>
            </div>
          }
          @case ('transferir') {
            <div class="etapa" role="group" aria-label="Guardar em outro almoxarifado">
              <geo-select label="Almoxarifado" [required]="true" [options]="opcoesAlmoxarifado()" [(value)]="almoxarifadoEtapa"></geo-select>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button icon="pi pi-check" label="Guardar" [disabled]="!almoxarifadoEtapa()" [loading]="gravando()" (pressed)="transferir()"></geo-button>
              </div>
            </div>
          }
          @case ('descarte') {
            <div class="etapa" role="group" aria-label="Descartar pneu">
              <geo-textarea label="Motivo do descarte" [required]="true" [(value)]="observacaoEtapa" [rows]="2" [maxlength]="300"
                placeholder="Ex.: carcaça sem condição de reforma" description="O descarte tira o pneu da frota de vez e não pode ser desfeito."></geo-textarea>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button variant="destructive" icon="pi pi-trash" label="Descartar pneu" [disabled]="observacaoEtapa().trim().length < 3" [loading]="gravando()" (pressed)="descartar()"></geo-button>
              </div>
            </div>
          }
        }

        <geo-form-section title="Linha do tempo" icon="pi pi-history">
          @if (carregandoHistorico()) {
            <span class="evento__detalhe" aria-busy="true"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Carregando…</span>
          } @else {
            <ol class="linha">
              @for (e of historicoVisivel(); track e.id) {
                @let t = evento(e);
                <li class="evento">
                  <span class="evento__marca" [attr.data-tom]="t.tom" aria-hidden="true"><i [class]="t.icone"></i></span>
                  <span class="evento__topo">
                    <span class="evento__titulo">{{ t.rotulo }}</span>
                    <span class="evento__quando">{{ e.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}{{ e.usuario ? ' · ' + e.usuario : '' }}</span>
                  </span>
                  <span>{{ e.descricao }}</span>
                  @if (detalhes(e); as d) { <span class="evento__detalhe">{{ d }}</span> }
                  @if (e.observacao) { <span class="evento__detalhe">{{ e.observacao }}</span> }
                </li>
              } @empty {
                <li class="evento__detalhe">Nenhum registro.</li>
              }
            </ol>
            @if (historico().length > limiteHistorico) {
              <div>
                <geo-button size="sm" variant="ghost" [icon]="historicoCompleto() ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                  [label]="historicoCompleto() ? 'Ver menos' : 'Ver os ' + historico().length + ' registros'" (pressed)="historicoCompleto.set(!historicoCompleto())"></geo-button>
              </div>
            }
          }
        </geo-form-section>
      }

      <geo-form-section title="Identificação" icon="pi pi-tag">
        <div class="geo-form-grid">
          <geo-text-input label="Marca de fogo" [required]="true" [(value)]="marcaFogo" [maxlength]="30" [disabled]="!editavel()" [error]="erro('marcaFogo')"
            description="Número gravado no pneu pela empresa."></geo-text-input>
          <geo-text-input label="Número de série" [(value)]="numeroSerie" [maxlength]="60" [showOptional]="true" [disabled]="!editavel()"></geo-text-input>
          <geo-select label="Marca" [required]="true" [options]="opcoesMarca()" [(value)]="marca" [filter]="true" [disabled]="!editavel()"
            [error]="marca() === outra ? undefined : erro('marca')" placeholder="Ex.: Goodyear"></geo-select>
          @if (marca() === outra) {
            <geo-text-input label="Nome da marca" [required]="true" [(value)]="marcaOutra" [maxlength]="60" [disabled]="!editavel()" [error]="erro('marca')"></geo-text-input>
          }
          <geo-text-input label="Modelo" [(value)]="modelo" [maxlength]="80" [showOptional]="true" [disabled]="!editavel()" placeholder="Ex.: G686 MSS"></geo-text-input>
        </div>
      </geo-form-section>

      <geo-form-section title="Medida e características" icon="pi pi-cog">
        <div class="geo-form-grid">
          <geo-number-input label="Largura (mm)" [(value)]="largura" [min]="100" [max]="500" [useGrouping]="false" [showOptional]="true" [disabled]="!editavel()" placeholder="295"></geo-number-input>
          <geo-number-input label="Perfil (%)" [(value)]="perfil" [min]="10" [max]="120" [showOptional]="true" [disabled]="!editavel()" placeholder="80"></geo-number-input>
          <geo-text-input label="Aro" [(value)]="aro" [maxlength]="10" [showOptional]="true" [disabled]="!editavel()" placeholder="22.5"></geo-text-input>
          <geo-text-input label="Índice de carga" [(value)]="indiceCarga" [maxlength]="10" [showOptional]="true" [disabled]="!editavel()" placeholder="152/148"></geo-text-input>
          <geo-select label="Índice de velocidade" [options]="velocidades" [(value)]="indiceVelocidade" [clearable]="true" [showOptional]="true" [disabled]="!editavel()"></geo-select>
          <geo-number-input label="Lonas" [(value)]="lonas" [min]="1" [max]="40" [showOptional]="true" [disabled]="!editavel()"></geo-number-input>
          <geo-text-input label="DOT (semana e ano)" [(value)]="dot" [maxlength]="4" [showOptional]="true" [disabled]="!editavel()" placeholder="2324"
            [error]="erro('dot')"></geo-text-input>
          <geo-number-input label="Pressão (psi)" [(value)]="pressao" [min]="1" [max]="200" [showOptional]="true" [disabled]="!editavel()"
            description="A recomendada. Base do alerta de calibragem (±10%)."></geo-number-input>
        </div>
        <div class="geo-form-grid">
          <geo-boolean-control label="Radial" [(value)]="radial" [disabled]="!editavel()"></geo-boolean-control>
          <geo-boolean-control label="Com câmara" [(value)]="comCamara" [disabled]="!editavel()"></geo-boolean-control>
        </div>
      </geo-form-section>

      <geo-form-section title="Compra" icon="pi pi-shopping-cart">
        <div class="geo-form-grid">
          <geo-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="fornecedor" [filter]="true" [clearable]="true" [showOptional]="true" [disabled]="!editavel()"></geo-select>
          <geo-text-input label="Nota fiscal" [(value)]="notaFiscal" [maxlength]="60" [showOptional]="true" [disabled]="!editavel()"></geo-text-input>
          <geo-datepicker label="Data da compra" [(value)]="dataCompra" [maxDate]="agora" [showOptional]="true" [disabled]="!editavel()"></geo-datepicker>
          <geo-number-input label="Valor de compra" mode="currency" [(value)]="valorCompra" [min]="0" [showOptional]="true" [disabled]="!editavel()"
            description="Entra no custo por km."></geo-number-input>
        </div>
      </geo-form-section>

      @if (!pneu()) {
        <geo-form-section title="Situação na entrada" icon="pi pi-box">
          <div class="geo-form-grid">
            <geo-select label="Almoxarifado" [required]="true" [options]="opcoesAlmoxarifado()" [(value)]="idEstoque" [error]="erro('idEstoque')"
              [description]="opcoesAlmoxarifado().length ? undefined : 'Cadastre um almoxarifado em Frota › Estoque da oficina.'"></geo-select>
            <geo-number-input label="Sulco inicial (mm)" [(value)]="sulcoInicial" [min]="0" [max]="40" [minFractionDigits]="1" [maxFractionDigits]="1" [showOptional]="true"></geo-number-input>
            <geo-select label="Vida do pneu" [options]="vidas" [(value)]="vida"></geo-select>
            <geo-number-input label="Km já rodado nesta vida" [(value)]="kmVida" [min]="0" [showOptional]="true" description="Para pneu usado ou vindo de outro sistema."></geo-number-input>
          </div>
        </geo-form-section>
      }

      <geo-form-section title="Observação" icon="pi pi-comment">
        <geo-textarea label="Observação" [labelVisible]="false" [(value)]="observacao" [rows]="2" [maxlength]="1000" [showOptional]="true" [disabled]="!editavel()"></geo-textarea>
      </geo-form-section>

      @if (editavel()) {
        <geo-form-actions drawer-footer [submitLabel]="pneu() ? 'Salvar' : 'Cadastrar pneu'" savingLabel="Salvando…" [saving]="salvando()" [saveAndNew]="!pneu()"
          [cancelLabel]="alterado() ? 'Cancelar' : 'Fechar'" (save)="salvar()" (saveAndNewClick)="salvar(true)" (cancel)="drawer.requestClose()"></geo-form-actions>
      } @else {
        <geo-form-actions drawer-footer [shortcut]="false" [showCancel]="false" submitLabel="Fechar" submitIcon="" (save)="drawer.requestClose()"></geo-form-actions>
      }
    </geo-form-drawer>
  `
})
export class FrotaPneuDrawerComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);
  private readonly drawer = viewChild(GeoFormDrawerComponent);

  readonly visivel = model(false);
  readonly pneu = input<Pneu | null>(null);
  readonly almoxarifados = input<AlmoxarifadoFrota[]>([]);
  readonly fornecedores = input<FornecedorFrota[]>([]);
  readonly marcas = input<string[]>([]);
  readonly podeEditar = input(false);
  readonly sulcoMinimo = input(3);
  readonly salvo = output<Pneu>();
  readonly abrirMontagem = output<string>();

  protected readonly moeda = moeda;
  protected readonly sulco = formatarSulco;
  protected readonly km = (v: number) => formatarKm(v);
  protected readonly custoKm = formatarCustoKm;
  protected readonly velocidades = VELOCIDADES;
  protected readonly vidas = VIDAS;
  protected readonly limiteHistorico = 6;
  protected readonly destinosEnvio: GeoSelectOption<'REPARO' | 'REFORMA'>[] = [
    { label: 'Reparo (conserto)', value: 'REPARO' },
    { label: 'Reforma (recapagem)', value: 'REFORMA' }
  ];
  protected readonly agora = new Date();

  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);
  /** Marca de fogo que o servidor recusou por já existir: o erro fica no campo. */
  private readonly marcaRepetida = signal<string | null>(null);
  protected readonly historico = signal<EventoPneu[]>([]);
  protected readonly carregandoHistorico = signal(false);
  protected readonly historicoCompleto = signal(false);
  protected readonly historicoVisivel = computed(() => (this.historicoCompleto() ? this.historico() : this.historico().slice(0, this.limiteHistorico)));

  protected readonly marcaFogo = signal('');
  protected readonly numeroSerie = signal('');
  protected readonly marca = signal<string | null>(null);
  protected readonly marcaOutra = signal('');
  protected readonly outra = OUTRA;
  protected readonly modelo = signal('');
  protected readonly largura = signal<number | null>(null);
  protected readonly perfil = signal<number | null>(null);
  protected readonly aro = signal('');
  protected readonly radial = signal(true);
  protected readonly comCamara = signal(false);
  protected readonly indiceCarga = signal('');
  protected readonly indiceVelocidade = signal<string | null>(null);
  protected readonly lonas = signal<number | null>(null);
  protected readonly dot = signal('');
  protected readonly pressao = signal<number | null>(null);
  protected readonly fornecedor = signal<string | null>(null);
  protected readonly notaFiscal = signal('');
  protected readonly dataCompra = signal<Date | null>(null);
  protected readonly valorCompra = signal<number | null>(null);
  protected readonly idEstoque = signal<string | null>(null);
  protected readonly sulcoInicial = signal<number | null>(null);
  protected readonly vida = signal<number | null>(0);
  protected readonly kmVida = signal<number | null>(null);
  protected readonly observacao = signal('');
  private readonly inicial = signal('');

  protected readonly etapa = signal<Etapa>(null);
  protected readonly gravando = signal(false);
  protected readonly destinoEnvio = signal<'REPARO' | 'REFORMA'>('REPARO');
  protected readonly fornecedorEtapa = signal<string | null>(null);
  protected readonly almoxarifadoEtapa = signal<string | null>(null);
  protected readonly valorEtapa = signal<number | null>(null);
  protected readonly sulcoEtapa = signal<number | null>(null);
  protected readonly documentoEtapa = signal('');
  protected readonly quandoEtapa = signal<Date | null>(null);
  protected readonly observacaoEtapa = signal('');

  protected readonly editavel = computed(() => this.podeEditar() && this.pneu()?.situacao !== 'DESCARTADO');
  protected readonly opcoesFornecedor = computed<GeoSelectOption<string>[]>(() => this.fornecedores().map((f) => ({ label: f.nome, value: f.id })));
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() =>
    this.almoxarifados().filter((a) => a.ativo).map((a) => ({ label: a.baseOperacional ? `${a.nome} · ${a.baseOperacional}` : a.nome, value: a.id })));
  protected readonly opcoesMarca = computed<GeoSelectOption<string>[]>(() => {
    const lista = new Set([...this.marcas(), 'Bridgestone', 'Continental', 'Firestone', 'Goodyear', 'Michelin', 'Pirelli', 'XBRI']);
    return [...[...lista].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((m) => ({ label: m, value: m })), { label: 'Outra marca…', value: OUTRA }];
  });
  protected readonly alterado = computed(() => this.editavel() && JSON.stringify(this.request()) !== this.inicial());

  constructor() {
    effect(() => {
      const aberto = this.visivel();
      const p = this.pneu();
      if (!aberto) return;
      untracked(() => {
        this.preencher(p);
        this.etapa.set(null);
        this.historicoCompleto.set(false);
        if (p) this.carregarHistorico(p.id);
      });
    });
  }

  protected situacao(p: Pneu) {
    return SITUACAO_PNEU[p.situacao];
  }

  protected alerta(a: string) {
    return ALERTA_PNEU[a as keyof typeof ALERTA_PNEU];
  }

  protected evento(e: EventoPneu) {
    return EVENTO_PNEU[e.tipo];
  }

  protected onde(p: Pneu): string {
    switch (p.situacao) {
      case 'EM_USO': return ` no ${formatarPlaca(p.placa)} · ${p.posicaoRotulo}`;
      case 'DISPONIVEL': return p.estoque ? ` · ${p.estoque}` : '';
      case 'EM_REPARO':
      case 'EM_REFORMA': return p.fornecedorServico ? ` · ${p.fornecedorServico}` : '';
      default: return p.motivoDescarte ? ` · ${p.motivoDescarte}` : '';
    }
  }

  /** Há quanto tempo o pneu está no reparo ou na reforma. */
  protected tempoServico(p: Pneu): string {
    if ((p.situacao !== 'EM_REPARO' && p.situacao !== 'EM_REFORMA') || !p.enviadoEm) return '';
    const dias = Math.floor((Date.now() - new Date(p.enviadoEm).getTime()) / 86_400_000);
    return dias < 1 ? ' · enviado hoje' : dias === 1 ? ' · há 1 dia' : ` · há ${dias} dias`;
  }

  protected detalhes(e: EventoPneu): string | null {
    const partes: string[] = [];
    if (e.kmRodado) partes.push(`rodou ${formatarKm(e.kmRodado)}`);
    if (e.kmVeiculo != null && e.tipo !== 'INSPECAO') partes.push(`veículo com ${formatarKm(e.kmVeiculo)}`);
    if (e.valor) partes.push(moeda(e.valor));
    if (e.fornecedor) partes.push(e.fornecedor);
    if (e.documento) partes.push(e.documento);
    if (e.tipo !== 'INSPECAO' && e.sulcoMm != null && (e.tipo === 'RETORNO_REFORMA' || e.tipo === 'CADASTRO')) partes.push(`sulco ${formatarSulco(e.sulcoMm)}`);
    return partes.length ? partes.join(' · ') : null;
  }

  protected erro(campo: string): string | undefined {
    if (!this.tentouSalvar()) return undefined;
    switch (campo) {
      case 'marcaFogo':
        if (!this.marcaFogo().trim()) return 'Informe a marca de fogo.';
        return this.marcaFogo().trim() === this.marcaRepetida() ? `Já existe um pneu com a marca de fogo ${this.marcaRepetida()}.` : undefined;
      case 'marca': return this.marcaEfetiva() ? undefined : 'Informe a marca.';
      case 'dot': return !this.dot().trim() || /^\d{4}$/.test(this.dot().trim()) ? undefined : 'Use 4 números: semana e ano (ex.: 2324).';
      case 'idEstoque': return this.pneu() || this.idEstoque() ? undefined : 'Escolha o almoxarifado.';
      default: return undefined;
    }
  }

  protected abrirEtapa(etapa: Etapa): void {
    const p = this.pneu();
    this.fornecedorEtapa.set(p?.idFornecedorServico ?? null);
    this.almoxarifadoEtapa.set(p?.idEstoque ?? this.almoxarifados().find((a) => a.ativo)?.id ?? null);
    this.valorEtapa.set(null);
    this.sulcoEtapa.set(null);
    this.documentoEtapa.set('');
    this.quandoEtapa.set(null);
    this.observacaoEtapa.set('');
    this.destinoEnvio.set('REPARO');
    this.etapa.set(etapa);
  }

  protected salvar(novoEmSeguida = false): void {
    this.tentouSalvar.set(true);
    if (['marcaFogo', 'marca', 'dot', 'idEstoque'].some((c) => this.erro(c))) {
      this.drawer()?.focusFirstError();
      return;
    }
    this.salvando.set(true);
    const p = this.pneu();
    this.servico.salvar(this.request(), p?.id).subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.notificacoes.success(p ? `Pneu ${salvo.marcaFogo} atualizado.` : `Pneu ${salvo.marcaFogo} cadastrado.`);
        this.inicial.set(JSON.stringify(this.request()));
        this.salvo.emit(salvo);
        if (novoEmSeguida) this.prepararProximo();
        else if (!p) this.visivel.set(false);
      },
      error: (e) => {
        this.salvando.set(false);
        const mensagem = getErrorMessage(e);
        if (/marca de fogo/i.test(mensagem)) {
          this.marcaRepetida.set(this.marcaFogo().trim());
          this.drawer()?.focusFirstError();
        } else {
          this.notificacoes.error(mensagem);
        }
      }
    });
  }

  protected enviar(): void {
    const p = this.pneu()!;
    this.executar(this.servico.enviar(p.id, this.destinoEnvio(), this.fornecedorEtapa(), this.observacaoEtapa().trim() || null),
      this.destinoEnvio() === 'REPARO' ? 'Pneu enviado ao reparo.' : 'Pneu enviado à reforma.');
  }

  protected retornar(): void {
    const p = this.pneu()!;
    this.executar(this.servico.retornar(p.id, {
      idEstoque: this.almoxarifadoEtapa()!, valor: this.valorEtapa(), idFornecedor: this.fornecedorEtapa(), documento: this.documentoEtapa().trim() || null,
      sulcoMm: this.sulcoEtapa(), ocorridoEm: this.quandoEtapa() ? paraInstanteIso(this.quandoEtapa()!) : null, observacao: null
    }), p.situacao === 'EM_REFORMA' ? 'Pneu de volta da reforma, numa vida nova.' : 'Pneu de volta do reparo.');
  }

  protected transferir(): void {
    this.executar(this.servico.transferir(this.pneu()!.id, this.almoxarifadoEtapa()!), 'Pneu guardado no almoxarifado.');
  }

  protected descartar(): void {
    this.executar(this.servico.descartar(this.pneu()!.id, this.observacaoEtapa().trim()), 'Pneu descartado.');
  }

  private executar(acao: ReturnType<FrotaPneuService['buscar']>, mensagem: string): void {
    this.gravando.set(true);
    acao.subscribe({
      next: (p) => {
        this.gravando.set(false);
        this.etapa.set(null);
        this.notificacoes.success(mensagem);
        this.salvo.emit(p);
        this.carregarHistorico(p.id);
      },
      error: (e) => (this.gravando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  private carregarHistorico(id: string): void {
    this.carregandoHistorico.set(true);
    this.servico.historico(id).subscribe({
      next: (h) => (this.historico.set(h), this.carregandoHistorico.set(false)),
      error: () => (this.historico.set([]), this.carregandoHistorico.set(false))
    });
  }

  private preencher(p: Pneu | null): void {
    this.tentouSalvar.set(false);
    this.marcaFogo.set(p?.marcaFogo ?? '');
    this.numeroSerie.set(p?.numeroSerie ?? '');
    this.marca.set(p?.marca ?? null);
    this.marcaOutra.set('');
    this.modelo.set(p?.modelo ?? '');
    this.largura.set(p?.largura ?? null);
    this.perfil.set(p?.perfil ?? null);
    this.aro.set(p?.aro ?? '');
    this.radial.set(p?.radial ?? true);
    this.comCamara.set(p?.comCamara ?? false);
    this.indiceCarga.set(p?.indiceCarga ?? '');
    this.indiceVelocidade.set(p?.indiceVelocidade ?? null);
    this.lonas.set(p?.lonas ?? null);
    this.dot.set(p?.dot ?? '');
    this.pressao.set(p?.pressaoRecomendadaPsi ?? null);
    this.fornecedor.set(p?.idFornecedor ?? null);
    this.notaFiscal.set(p?.notaFiscal ?? '');
    this.dataCompra.set(p?.dataCompra ? new Date(`${p.dataCompra}T12:00:00`) : null);
    this.valorCompra.set(p?.valorCompra ?? null);
    this.idEstoque.set(p?.idEstoque ?? this.almoxarifados().find((a) => a.ativo)?.id ?? null);
    this.sulcoInicial.set(p?.sulcoInicialMm ?? null);
    this.vida.set(p?.vida ?? 0);
    this.kmVida.set(null);
    this.observacao.set(p?.observacao ?? '');
    this.historico.set([]);
    this.inicial.set(JSON.stringify(this.request()));
  }

  /** Pneus da mesma compra: mantém marca, medida e nota, e limpa o que é de cada um. */
  private prepararProximo(): void {
    this.tentouSalvar.set(false);
    this.marcaFogo.set('');
    this.numeroSerie.set('');
    this.dot.set('');
    this.inicial.set(JSON.stringify(this.request()));
    setTimeout(() => this.drawer()?.focusFirstField());
  }

  private marcaEfetiva(): string {
    return (this.marca() === OUTRA ? this.marcaOutra() : this.marca() ?? '').trim();
  }

  private request(): PneuRequest {
    const texto = (v: string) => v.trim() || null;
    return {
      marcaFogo: this.marcaFogo().trim(),
      numeroSerie: texto(this.numeroSerie()),
      marca: this.marcaEfetiva(),
      modelo: texto(this.modelo()),
      largura: this.largura(),
      perfil: this.perfil(),
      aro: texto(this.aro()),
      radial: this.radial(),
      comCamara: this.comCamara(),
      indiceCarga: texto(this.indiceCarga()),
      indiceVelocidade: this.indiceVelocidade(),
      lonas: this.lonas(),
      dot: texto(this.dot()),
      idFornecedor: this.fornecedor(),
      notaFiscal: texto(this.notaFiscal()),
      dataCompra: paraDataIso(this.dataCompra()),
      valorCompra: this.valorCompra(),
      sulcoInicialMm: this.sulcoInicial(),
      pressaoRecomendadaPsi: this.pressao(),
      observacao: texto(this.observacao()),
      vida: this.vida() ?? 0,
      kmVida: this.kmVida(),
      sulcoAtualMm: null,
      idEstoque: this.idEstoque()
    };
  }
}
