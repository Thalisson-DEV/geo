import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoFileInputComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable, catchError, concat, last, map, of, switchMap, toArray } from 'rxjs';
import { LookupStore } from '../../../core/lookup';
import {
  MedidaDisciplinar,
  MedidaDisciplinarRequest,
  MotivoMedidaDisciplinar,
  OrigemMedidaRequest,
  ROTULO_ORIGEM_MEDIDA,
  ReincidenciaMedida,
  TipoMedidaDisciplinar,
  diasEntre,
  situacaoMedida
} from '../../../core/models/rh-medida-disciplinar.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';

const LIMITE_ARQUIVO = 15 * 1024 * 1024;
const MAXIMO_DIAS_SUSPENSAO = 30;

/** Colaborador já definido por quem abriu o formulário (ficha do colaborador ou origem). */
export interface ColaboradorMedida {
  id: string;
  nome: string;
}

/** O que outro módulo mandou para preencher a medida (ex.: a multa da frota). */
export interface PreenchimentoMedida {
  colaborador?: ColaboradorMedida | null;
  dataFato?: string | null;
  descricao?: string | null;
  /** Nome do motivo no catálogo do RH (ex.: "Trânsito"). */
  motivo?: string | null;
}

function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tamanho(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Lançamento e acompanhamento da medida disciplinar. O lançamento é feito depois que a medida
 * foi aplicada ao colaborador: traz o fato, a data da aplicação e, se houver, os anexos (o
 * documento assinado pela empresa, fotos e outros). O formulário mostra as medidas anteriores do
 * mesmo motivo (reincidência) e o aviso de imediatidade. Depois, a medida pode ter os dados
 * corrigidos, receber anexos ou ser cancelada com justificativa.
 */
@Component({
  selector: 'app-medida-disciplinar-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFileInputComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  styles: `
    .resumo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    @media (max-width: 640px) { .resumo { grid-template-columns: minmax(0, 1fr); } }
    .resumo dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .resumo dd { margin: 0; font-weight: 600; color: var(--geo-foreground); }
    .resumo__largo { grid-column: 1 / -1; }
    .resumo dd.resumo__fatos { white-space: pre-line; font-weight: 400; }
    .anteriores { list-style: none; margin: 0.375rem 0 0; padding: 0; display: grid; gap: 0.25rem; }
    .anteriores li { display: flex; justify-content: space-between; gap: 0.75rem; font-size: var(--geo-font-caption); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .anexo { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .anexo .pi-file { color: var(--geo-brand); }
    .anexo__texto { flex: 1; min-width: 0; display: grid; }
    .anexo__texto strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .anexo__texto span { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .evento { display: grid; gap: 0.125rem; padding-left: 0.75rem; border-left: 2px solid var(--geo-border); }
    .evento strong { font-weight: 600; }
    .evento span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <geo-form-drawer [(visible)]="visivel" [title]="titulo()" [description]="descricaoDrawer()" [dirty]="alterado()" [loading]="salvando()" size="lg">

      @if (medida(); as m) {
        @if (corrigindo()) {
          <geo-callout tone="info" icon="pi pi-pencil" [dense]="true" title="Corrigindo os dados lançados">
            A correção fica no histórico da medida.
          </geo-callout>
        } @else if (m.situacao === 'CANCELADA') {
          @let s = situacao(m);
          <geo-callout tone="info" [icon]="'pi ' + s.icone" [dense]="true" [title]="s.rotulo">
            Cancelada em {{ m.canceladaEm | date: 'dd/MM/yyyy' }}: {{ m.justificativaCancelamento }} Não conta para a reincidência.
          </geo-callout>
        }
      }

      @if (origem(); as o) {
        <geo-callout tone="info" icon="pi pi-link" [dense]="true" [title]="'Pedida pela ' + rotuloOrigem(o.tipo).toLowerCase()">
          {{ preenchimentoIndisponivel() ? 'Os dados da origem não puderam ser carregados; preencha a medida manualmente.' : 'Os dados vieram da origem; confira antes de lançar.' }}
          Ao lançar, a medida fica vinculada a ela.
        </geo-callout>
      }

      @if (formulario()) {
        <geo-form-section title="Colaborador e medida" icon="pi pi-user">
          @if (colaboradorTravado()) {
            <geo-text-input label="Colaborador" [value]="nomeColaborador()" [readonly]="true"></geo-text-input>
          } @else {
            <geo-autocomplete label="Colaborador" [required]="true" [options]="opcoesColaborador()" [status]="statusBusca()"
              [loading]="statusBusca() === 'loading'" [ngModel]="idColaborador()" (ngModelChange)="trocarColaborador($event)"
              (search)="buscarColaborador($event)" [error]="erro('colaborador')"></geo-autocomplete>
          }
          <div class="geo-form-grid">
            <geo-select label="Motivo" [required]="true" [options]="opcoesMotivo()" [(value)]="idMotivo" [error]="erro('motivo')"
              (valueChange)="carregarReincidencia()"></geo-select>
            <geo-select label="Tipo de medida" [required]="true" [options]="opcoesTipo()" [(value)]="idTipo" [error]="erro('tipo')"></geo-select>
          </div>
          @if (reincidencia(); as r) {
            @if (r.anteriores.length) {
              <geo-callout tone="warning" icon="pi pi-history" [dense]="true"
                [title]="'Reincidência: ' + (r.anteriores.length === 1 ? '1 medida' : r.anteriores.length + ' medidas') + ' pelo mesmo motivo em ' + r.janelaMeses + ' meses'">
                <ul class="anteriores">
                  @for (a of r.anteriores; track a.id) {
                    <li><span>{{ a.tipoNome }}</span><span>fato em {{ a.dataFato | date: 'dd/MM/yyyy' }}</span></li>
                  }
                </ul>
                @if (r.idTipoSugerido) {
                  <div class="acoes">
                    <span>Sugestão: <strong>{{ r.tipoSugeridoNome }}</strong> (acima da última). A decisão é do RH.</span>
                    @if (idTipo() !== r.idTipoSugerido) {
                      <geo-button size="sm" variant="outline" label="Usar a sugestão" (pressed)="idTipo.set(r.idTipoSugerido)"></geo-button>
                    }
                  </div>
                } @else {
                  <span>A última já foi do tipo mais grave.</span>
                }
              </geo-callout>
            }
          }
        </geo-form-section>

        <geo-form-section title="Fato e aplicação" icon="pi pi-file-edit">
          <div class="geo-form-grid">
            <geo-datepicker label="Data do fato" [required]="true" [(value)]="dataFato" [maxDate]="hoje" [error]="erro('dataFato')"
              (valueChange)="carregarReincidencia()"></geo-datepicker>
            <geo-datepicker label="Data da aplicação" [required]="true" [(value)]="dataAplicacao" [minDate]="dataFato()" [maxDate]="hoje"
              description="Dia em que a medida foi aplicada ao colaborador." [error]="erro('dataAplicacao')"></geo-datepicker>
          </div>
          @if (avisoImediatidade(); as dias) {
            <geo-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true" title="Aplicação longe do fato">
              {{ dias }} dias entre o fato e a aplicação, acima do prazo de {{ prazoImediatidade() }} dias. A demora pode ser entendida como perdão tácito; registre nos fatos o motivo (ex.: apuração, ciência tardia da multa).
            </geo-callout>
          }
          <geo-textarea label="Descrição dos fatos" [required]="true" [(value)]="descricao" [rows]="5" [maxlength]="4000"
            placeholder="O que aconteceu, onde, quando e como a empresa soube." [error]="erro('descricao')"></geo-textarea>
        </geo-form-section>

        @if (tipoSelecionado()?.exigePeriodo) {
          <geo-form-section title="Suspensão" icon="pi pi-calendar-times" description="Dias corridos, de 1 a 30 (CLT, art. 474).">
            <div class="geo-form-grid">
              <geo-number-input label="Dias" [required]="true" [(value)]="diasSuspensao" [min]="1" [max]="maximoDias" [error]="erro('dias')"></geo-number-input>
              <geo-datepicker label="Início" [required]="true" [(value)]="inicioSuspensao" [minDate]="dataFato()" [error]="erro('inicio')"></geo-datepicker>
            </div>
            @if (fimSuspensao(); as fim) {
              <geo-callout tone="info" icon="pi pi-calendar" [dense]="true">Termina em {{ fim | date: 'dd/MM/yyyy' }}; o colaborador volta no dia seguinte.</geo-callout>
            }
          </geo-form-section>
        }

        @if (!medida()) {
          <geo-form-section title="Anexos" icon="pi pi-paperclip" description="Opcional. O documento assinado, fotos ou outros arquivos; dá para anexar depois.">
            @if (anexosPendentes().length) {
              <ul class="lista">
                @for (a of anexosPendentes(); track $index) {
                  <li class="anexo">
                    <i class="pi pi-file" aria-hidden="true"></i>
                    <span class="anexo__texto">
                      <strong>{{ a.name }}</strong>
                      <span>{{ tamanho(a.size) }} · enviado ao lançar</span>
                    </span>
                    <geo-icon-button icon="pi pi-times" [label]="'Tirar ' + a.name" tooltip="Tirar da lista" size="icon-sm" (pressed)="tirarAnexo($index)"></geo-icon-button>
                  </li>
                }
              </ul>
            }
            <geo-file-input [label]="anexosPendentes().length ? 'Outro anexo' : 'Anexo'" [showOptional]="true"
              description="PDF ou imagem (JPG, PNG, WebP), até 15 MB cada." accept="application/pdf,image/jpeg,image/png,image/webp"
              [maxBytes]="limiteArquivo" [file]="null" (fileChange)="incluirAnexo($event)"></geo-file-input>
          </geo-form-section>
        }
      } @else if (medida(); as m) {
        <geo-form-section title="Medida" icon="pi pi-user">
          <dl class="resumo">
            <div><dt>Colaborador</dt><dd>{{ m.colaboradorNome ?? '—' }}</dd></div>
            <div><dt>Função · base</dt><dd>{{ m.colaboradorFuncao ?? '—' }} · {{ m.baseNome ?? 'sem base' }}</dd></div>
            <div><dt>Tipo</dt><dd>{{ m.tipoNome }}</dd></div>
            <div><dt>Motivo</dt><dd>{{ m.motivoNome }}</dd></div>
            <div><dt>Fato</dt><dd>{{ m.dataFato | date: 'dd/MM/yyyy' }}</dd></div>
            <div><dt>Aplicação</dt><dd>{{ m.dataAplicacao | date: 'dd/MM/yyyy' }}{{ m.aplicadaPorNome ? ' · lançada por ' + m.aplicadaPorNome : '' }}</dd></div>
            @if (m.diasSuspensao) {
              <div class="resumo__largo"><dt>Suspensão</dt><dd>{{ m.diasSuspensao }} {{ m.diasSuspensao === 1 ? 'dia' : 'dias' }}, de {{ m.inicioSuspensao | date: 'dd/MM/yyyy' }} a {{ m.fimSuspensao | date: 'dd/MM/yyyy' }}</dd></div>
            }
            <div class="resumo__largo"><dt>Fatos</dt><dd class="resumo__fatos">{{ m.descricao }}</dd></div>
          </dl>
          @if (m.foraDaImediatidade) {
            <geo-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true" title="Aplicação longe do fato">
              {{ m.diasDesdeOFato }} dias entre o fato e a aplicação.
            </geo-callout>
          }
        </geo-form-section>
      }

      @if (medida(); as m) {
        @if (!corrigindo()) {
          @if (m.situacao !== 'CANCELADA' || m.anexos.length) {
            <geo-form-section title="Anexos" icon="pi pi-paperclip"
              [description]="m.situacao !== 'CANCELADA' ? 'Opcional. O documento assinado, fotos ou outros arquivos da medida.' : undefined">
              @if (m.anexos.length) {
                <ul class="lista">
                  @for (a of m.anexos; track a.id) {
                    <li class="anexo">
                      <i class="pi pi-file" aria-hidden="true"></i>
                      <span class="anexo__texto">
                        <strong>{{ a.nome }}</strong>
                        <span>Enviado em {{ a.enviadoEm | date: "dd/MM/yyyy 'às' HH:mm" }} · SHA-256 {{ a.sha256.substring(0, 12) }}…</span>
                      </span>
                      <geo-icon-button icon="pi pi-download" [label]="'Baixar ' + a.nome" tooltip="Baixar" size="icon-sm" (pressed)="baixarAnexo(a.id, a.nome)"></geo-icon-button>
                      @if (podeEditar() && m.situacao !== 'CANCELADA') {
                        <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + a.nome" tooltip="Remover" size="icon-sm" (pressed)="removerAnexo(a.id, a.nome)"></geo-icon-button>
                      }
                    </li>
                  }
                </ul>
              }
              @if (podeEditar() && m.situacao !== 'CANCELADA') {
                <geo-file-input label="Anexo" description="PDF ou imagem (JPG, PNG, WebP), até 15 MB."
                  accept="application/pdf,image/jpeg,image/png,image/webp" [maxBytes]="limiteArquivo" [(file)]="arquivo" [showOptional]="true"></geo-file-input>
                @if (arquivo()) {
                  <div class="acoes">
                    <geo-button size="sm" icon="pi pi-upload" label="Enviar anexo" [loading]="salvando()" (pressed)="enviarAnexo()"></geo-button>
                  </div>
                }
              }
            </geo-form-section>
          }

          @if (cancelando()) {
            <geo-form-section title="Cancelar medida" icon="pi pi-ban" description="A medida fica no histórico e deixa de contar para a reincidência.">
              <geo-textarea label="Justificativa" [required]="true" [(value)]="justificativa" [rows]="3" [maxlength]="500"
                placeholder="Ex.: multa anulada pelo órgão de trânsito." [error]="tentouCancelar() && !justificativa().trim() ? 'Informe a justificativa.' : undefined"></geo-textarea>
              <div class="acoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="cancelando.set(false)"></geo-button>
                <geo-button variant="destructive" icon="pi pi-ban" label="Confirmar cancelamento" [loading]="salvando()" (pressed)="cancelar()"></geo-button>
              </div>
            </geo-form-section>
          }

          @if (m.historico.length) {
            <geo-form-section title="Histórico" icon="pi pi-history">
              <ul class="lista">
                @for (e of m.historico; track $index) {
                  <li class="evento">
                    <strong>{{ e.tipoRotulo }}</strong>
                    <span>{{ e.descricao }}</span>
                    <span>{{ e.ocorridoEm | date: "dd/MM/yyyy 'às' HH:mm" }}{{ e.usuarioNome ? ' · ' + e.usuarioNome : '' }}</span>
                  </li>
                }
              </ul>
            </geo-form-section>
          }
        }
      }

      <div drawer-footer class="rodape">
        @if (medida(); as m) {
          @if (corrigindo()) {
            <span class="rodape__espaco"></span>
            <geo-button variant="ghost" label="Descartar correção" (pressed)="descartarCorrecao()"></geo-button>
            <geo-button icon="pi pi-check" label="Salvar correção" [loading]="salvando()" (pressed)="salvar()"></geo-button>
          } @else {
            @if (podeCancelar() && m.situacao !== 'CANCELADA' && !cancelando()) {
              <geo-button variant="ghost" icon="pi pi-ban" label="Cancelar medida" (pressed)="cancelando.set(true)"></geo-button>
            }
            <span class="rodape__espaco"></span>
            @if (podeEditar() && m.situacao !== 'CANCELADA') {
              <geo-button variant="outline" icon="pi pi-pencil" label="Corrigir dados" (pressed)="corrigir()"></geo-button>
            }
            <geo-button variant="ghost" label="Fechar" (pressed)="visivel.set(false)"></geo-button>
          }
        } @else {
          <span class="rodape__espaco"></span>
          <geo-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></geo-button>
          @if (podeEditar()) {
            <geo-button icon="pi pi-check" label="Lançar medida" [loading]="salvando()" (pressed)="salvar()"></geo-button>
          }
        }
      </div>
    </geo-form-drawer>
  `
})
export class MedidaDisciplinarDrawerComponent {
  private readonly servico = inject(RhMedidaDisciplinarService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly visivel = model(false);
  /** Detalhe da medida aberta; nulo = lançamento. */
  readonly medida = input<MedidaDisciplinar | null>(null);
  readonly tipos = input<TipoMedidaDisciplinar[]>([]);
  readonly motivos = input<MotivoMedidaDisciplinar[]>([]);
  /** Lançamento para um colaborador já escolhido (ficha do colaborador). */
  readonly colaborador = input<ColaboradorMedida | null>(null);
  /** Outro módulo que pediu a medida (ex.: FROTA_MULTA); só vale no lançamento. */
  readonly origem = input<OrigemMedidaRequest | null>(null);
  readonly preenchimento = input<PreenchimentoMedida | null>(null);
  readonly preenchimentoIndisponivel = input(false);
  readonly podeEditar = input(false);
  readonly podeCancelar = input(false);
  readonly salva = output<MedidaDisciplinar>();

  protected readonly limiteArquivo = LIMITE_ARQUIVO;
  protected readonly maximoDias = MAXIMO_DIAS_SUSPENSAO;
  protected readonly hoje = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
  protected readonly situacao = situacaoMedida;
  protected readonly tamanho = tamanho;
  protected readonly rotuloOrigem = (tipo: string) => ROTULO_ORIGEM_MEDIDA[tipo as keyof typeof ROTULO_ORIGEM_MEDIDA] ?? tipo;

  protected readonly idColaborador = signal<string | null>(null);
  protected readonly nomeColaborador = signal('');
  protected readonly opcoesColaborador = signal<GeoSelectOption<string>[]>([]);
  protected readonly statusBusca = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly idTipo = signal<string | null>(null);
  protected readonly idMotivo = signal<string | null>(null);
  protected readonly dataFato = signal<Date | null>(null);
  protected readonly dataAplicacao = signal<Date | null>(null);
  protected readonly descricao = signal('');
  protected readonly diasSuspensao = signal<number | null>(null);
  protected readonly inicioSuspensao = signal<Date | null>(null);
  protected readonly reincidencia = signal<ReincidenciaMedida | null>(null);
  protected readonly prazoImediatidade = signal(30);

  protected readonly anexosPendentes = signal<File[]>([]);
  protected readonly arquivo = signal<File | null>(null);
  protected readonly cancelando = signal(false);
  protected readonly justificativa = signal('');
  protected readonly tentouCancelar = signal(false);

  protected readonly corrigindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  private readonly snapshot = signal('');

  /** Lançamento, ou correção de uma medida aberta. */
  protected readonly formulario = computed(() => this.podeEditar() && (!this.medida() || this.corrigindo()));
  protected readonly colaboradorTravado = computed(() => !!this.medida() || !!this.colaborador() || !!this.origem() && !!this.preenchimento()?.colaborador);
  protected readonly titulo = computed(() => {
    const m = this.medida();
    if (!m) return 'Lançar medida disciplinar';
    return `${m.tipoNome} · ${m.colaboradorNome ?? 'colaborador'}`;
  });
  protected readonly descricaoDrawer = computed(() => {
    const m = this.medida();
    if (!m) return 'Registre a medida já aplicada ao colaborador: o fato, a data da aplicação e, se quiser, os anexos.';
    return `${m.motivoNome} · fato em ${m.dataFato.split('-').reverse().join('/')}${m.origem === 'MANUAL' ? '' : ' · ' + m.origemRotulo.toLowerCase()}`;
  });
  protected readonly tipoSelecionado = computed(() => this.tipos().find((t) => t.id === this.idTipo()) ?? null);
  protected readonly opcoesTipo = computed<GeoSelectOption<string>[]>(() =>
    this.tipos().filter((t) => t.ativo || t.id === this.medida()?.idTipo).map((t) => ({ label: t.nome, value: t.id })));
  protected readonly opcoesMotivo = computed<GeoSelectOption<string>[]>(() =>
    this.motivos().filter((m) => m.ativo || m.id === this.medida()?.idMotivo).map((m) => ({ label: m.nome, value: m.id })));
  protected readonly fimSuspensao = computed(() => {
    const inicio = this.inicioSuspensao();
    const dias = this.diasSuspensao();
    if (!inicio || !dias || dias < 1) return null;
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + dias - 1);
    return fim;
  });
  /** Dias entre o fato e a aplicação quando passam do prazo; nulo dentro do prazo. */
  protected readonly avisoImediatidade = computed(() => {
    const fato = dataIso(this.dataFato());
    const aplicacao = dataIso(this.dataAplicacao());
    if (!fato || !aplicacao) return null;
    const dias = diasEntre(fato, aplicacao);
    return dias > this.prazoImediatidade() ? dias : null;
  });

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.idColaborador()) e['colaborador'] = 'Escolha o colaborador.';
    if (!this.idMotivo()) e['motivo'] = 'Escolha o motivo.';
    if (!this.idTipo()) e['tipo'] = 'Escolha o tipo de medida.';
    if (!this.dataFato()) e['dataFato'] = 'Informe a data do fato.';
    const fato = dataIso(this.dataFato());
    const aplicacao = dataIso(this.dataAplicacao());
    if (!aplicacao) e['dataAplicacao'] = 'Informe quando a medida foi aplicada.';
    else if (fato && aplicacao < fato) e['dataAplicacao'] = 'A aplicação não pode ser antes do fato.';
    else if (aplicacao > dataIso(new Date())!) e['dataAplicacao'] = 'A aplicação não pode ser no futuro.';
    if (!this.descricao().trim()) e['descricao'] = 'Descreva os fatos.';
    if (this.tipoSelecionado()?.exigePeriodo) {
      const dias = this.diasSuspensao();
      if (!dias) e['dias'] = 'Informe os dias da suspensão.';
      else if (dias < 1 || dias > MAXIMO_DIAS_SUSPENSAO) e['dias'] = `De 1 a ${MAXIMO_DIAS_SUSPENSAO} dias.`;
      const inicio = dataIso(this.inicioSuspensao());
      if (!inicio) e['inicio'] = 'Informe o início da suspensão.';
      else if (fato && inicio < fato) e['inicio'] = 'A suspensão não pode começar antes do fato.';
    }
    return e;
  });
  protected readonly alterado = computed(() => this.formulario() && this.snapshot() !== this.estadoFormulario());

  constructor() {
    effect(() => {
      if (this.visivel()) {
        const m = this.medida();
        const p = this.preenchimento();
        untracked(() => this.preencher(m, p));
      }
    });
    this.servico.parametros().subscribe({ next: (p) => this.prazoImediatidade.set(p.diasImediatidade), error: () => undefined });
  }

  protected erro(campo: string): string | undefined {
    return this.tentou() ? this.erros()[campo] : undefined;
  }

  protected buscarColaborador(termo: string): void {
    this.statusBusca.set('loading');
    this.lookups.searchCollaborators({ query: termo, limit: 20 }).subscribe({
      next: (pagina) => {
        this.opcoesColaborador.set(pagina.items.map((i) => ({ label: i.label, value: i.value })));
        this.statusBusca.set(pagina.items.length ? 'success' : 'empty');
      },
      error: () => this.statusBusca.set('error')
    });
  }

  protected trocarColaborador(id: string | null): void {
    this.idColaborador.set(id);
    this.carregarReincidencia();
  }

  /** Medidas anteriores do mesmo colaborador e motivo na janela, contadas da data do fato. */
  protected carregarReincidencia(): void {
    const colaborador = this.idColaborador();
    const motivo = this.idMotivo();
    if (!colaborador || !motivo) {
      this.reincidencia.set(null);
      return;
    }
    this.servico.reincidencia(colaborador, motivo, dataIso(this.dataFato()), this.medida()?.id).subscribe({
      next: (r) => {
        this.reincidencia.set(r);
        this.prazoImediatidade.set(r.diasImediatidade);
      },
      error: () => this.reincidencia.set(null)
    });
  }

  protected incluirAnexo(arquivo: File | null): void {
    if (arquivo) this.anexosPendentes.update((lista) => [...lista, arquivo]);
  }

  protected tirarAnexo(indice: number): void {
    this.anexosPendentes.update((lista) => lista.filter((_, i) => i !== indice));
  }

  protected corrigir(): void {
    this.cancelando.set(false);
    this.preencher(this.medida(), null);
    this.corrigindo.set(true);
    this.carregarReincidencia();
  }

  protected descartarCorrecao(): void {
    this.corrigindo.set(false);
    this.tentou.set(false);
  }

  /** Lança (com os anexos) ou salva a correção; a medida fica aberta no detalhe. */
  protected salvar(): void {
    this.tentou.set(true);
    if (Object.keys(this.erros()).length) {
      this.notificacoes.warning('Revise os campos destacados antes de salvar.');
      return;
    }
    const existente = this.medida();
    if (existente) {
      this.executar(this.servico.salvar(this.request(), existente.id), 'Medida corrigida.').subscribe({
        next: () => this.corrigindo.set(false),
        error: () => undefined
      });
      return;
    }
    const anexos = this.anexosPendentes();
    this.salvando.set(true);
    this.servico.salvar(this.request()).pipe(
      switchMap((lancada) => !anexos.length ? of({ medida: lancada, falhas: 0 }) : concat(
        ...anexos.map((arquivo) => this.servico.anexar(lancada.id, arquivo).pipe(
          map((m) => ({ medida: m as MedidaDisciplinar | null, falhou: false })),
          catchError(() => of({ medida: null as MedidaDisciplinar | null, falhou: true }))))
      ).pipe(toArray(), map((envios) => ({
        medida: [...envios].reverse().find((e) => e.medida)?.medida ?? lancada,
        falhas: envios.filter((e) => e.falhou).length
      })))),
      last()
    ).subscribe({
      next: ({ medida, falhas }) => {
        this.salvando.set(false);
        if (falhas) {
          this.notificacoes.warning(`Medida lançada, mas ${falhas === 1 ? '1 anexo não foi enviado' : falhas + ' anexos não foram enviados'}. Anexe de novo pela medida.`);
        } else {
          this.notificacoes.success('Medida lançada.');
        }
        this.anexosPendentes.set([]);
        this.snapshot.set(this.estadoFormulario());
        this.salva.emit(medida);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected cancelar(): void {
    const m = this.medida();
    if (!m) return;
    this.tentouCancelar.set(true);
    if (!this.justificativa().trim()) return;
    this.executar(this.servico.cancelar(m.id, this.justificativa().trim()), 'Medida cancelada.').subscribe({
      next: () => this.cancelando.set(false),
      error: () => undefined
    });
  }

  protected enviarAnexo(): void {
    const m = this.medida();
    const arquivo = this.arquivo();
    if (!m || !arquivo) return;
    this.executar(this.servico.anexar(m.id, arquivo), 'Anexo enviado.').subscribe({
      next: () => this.arquivo.set(null),
      error: () => undefined
    });
  }

  protected baixarAnexo(idAnexo: string, nome: string): void {
    const m = this.medida();
    if (!m) return;
    this.servico.baixarAnexo(m.id, idAnexo).subscribe({
      next: (blob) => baixarArquivo(blob, nome),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async removerAnexo(idAnexo: string, nome: string): Promise<void> {
    const m = this.medida();
    if (!m) return;
    const ok = await this.confirmacao.confirm({ title: 'Remover anexo', message: `Remover ${nome} desta medida? O arquivo fica guardado para auditoria.`, variant: 'destructive' });
    if (!ok) return;
    this.executar(this.servico.removerAnexo(m.id, idAnexo), 'Anexo removido.').subscribe({ error: () => undefined });
  }

  /** Roda uma ação, avisa e devolve a medida atualizada ao pai. */
  private executar(acao: Observable<MedidaDisciplinar>, sucesso: string): Observable<MedidaDisciplinar> {
    this.salvando.set(true);
    return new Observable<MedidaDisciplinar>((assinante) => {
      acao.subscribe({
        next: (m) => {
          this.salvando.set(false);
          this.notificacoes.success(sucesso);
          this.salva.emit(m);
          assinante.next(m);
          assinante.complete();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
          assinante.error(e);
        }
      });
    });
  }

  private preencher(m: MedidaDisciplinar | null, p: PreenchimentoMedida | null): void {
    this.tentou.set(false);
    this.tentouCancelar.set(false);
    this.cancelando.set(false);
    this.corrigindo.set(false);
    this.justificativa.set('');
    this.arquivo.set(null);
    this.anexosPendentes.set([]);
    const fixo = this.colaborador() ?? p?.colaborador ?? null;
    const id = m?.idColaborador ?? fixo?.id ?? null;
    const nome = m?.colaboradorNome ?? fixo?.nome ?? '';
    this.idColaborador.set(id);
    this.nomeColaborador.set(nome);
    this.opcoesColaborador.set(id ? [{ label: nome, value: id }] : []);
    const motivoOrigem = p?.motivo ? this.motivos().find((x) => x.ativo && x.nome.toLowerCase() === p.motivo!.toLowerCase())?.id ?? null : null;
    this.idMotivo.set(m?.idMotivo ?? motivoOrigem);
    this.idTipo.set(m?.idTipo ?? null);
    this.dataFato.set(m ? dataLocal(m.dataFato) : p?.dataFato ? dataLocal(p.dataFato) : null);
    this.dataAplicacao.set(m ? dataLocal(m.dataAplicacao) : new Date());
    this.descricao.set(m?.descricao ?? p?.descricao ?? '');
    this.diasSuspensao.set(m?.diasSuspensao ?? null);
    this.inicioSuspensao.set(m?.inicioSuspensao ? dataLocal(m.inicioSuspensao) : null);
    this.reincidencia.set(null);
    this.snapshot.set(this.estadoFormulario());
    if (!m) this.carregarReincidencia();
  }

  /** O que o formulário tem preenchido, para saber se há algo a perder ao fechar. */
  private estadoFormulario(): string {
    return JSON.stringify([this.request(), this.anexosPendentes().map((a) => a.name)]);
  }

  private request(): MedidaDisciplinarRequest {
    const exige = this.tipoSelecionado()?.exigePeriodo ?? false;
    const origem = this.origem();
    return {
      idColaborador: this.idColaborador() ?? '',
      idTipo: this.idTipo() ?? '',
      idMotivo: this.idMotivo() ?? '',
      dataFato: dataIso(this.dataFato()) ?? '',
      dataAplicacao: dataIso(this.dataAplicacao()) ?? '',
      descricao: this.descricao().trim(),
      diasSuspensao: exige ? this.diasSuspensao() : null,
      inicioSuspensao: exige ? dataIso(this.inicioSuspensao()) : null,
      origem: !this.medida() && origem ? origem : null
    };
  }
}
