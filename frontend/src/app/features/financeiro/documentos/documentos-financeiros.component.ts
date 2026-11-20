import { ICONE_SITUACAO_DOCUMENTO } from '../../../core/models/financeiro.models';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFileInputComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { GEO_FORM_KIT } from '@geo/ui/forms';

import {
  DocumentoFinanceiro,
  DocumentoRequest,
  ROTULO_SITUACAO_DOCUMENTO,
  ROTULO_TIPO_DOCUMENTO,
  SituacaoDocumento,
  TipoDocumentoFinanceiro
} from '../../../core/models/financeiro.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FileDownloadUtil } from '../../../core/utils/file-download.util';
import { DateMaskDirective } from '../../../shared/directives/date-mask.directive';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';

const TOM_SITUACAO: Record<SituacaoDocumento, GeoTone> = { PENDENTE: 'warning', CONFERIDO: 'success', COM_PENDENCIA: 'danger', ARQUIVADO: 'neutral' };
const TIPOS: GeoSelectOption<TipoDocumentoFinanceiro>[] = (Object.keys(ROTULO_TIPO_DOCUMENTO) as TipoDocumentoFinanceiro[]).map((value) => ({
  label: ROTULO_TIPO_DOCUMENTO[value],
  value
}));
const SITUACOES: GeoSelectOption<SituacaoDocumento>[] = (Object.keys(ROTULO_SITUACAO_DOCUMENTO) as SituacaoDocumento[]).map((value) => ({
  label: ROTULO_SITUACAO_DOCUMENTO[value],
  value
}));
const ORIGENS: GeoSelectOption<'COMPRA' | 'PAGAMENTO' | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Veio de uma compra', value: 'COMPRA' },
  { label: 'Veio de um pagamento', value: 'PAGAMENTO' }
];
const EXTENSOES = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'xml', 'doc', 'docx', 'xls', 'xlsx'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Atalhos que a contabilidade abre todo dia (mesmos parâmetros que o painel envia). */
type Atalho = 'vencidos' | 'aguardando' | 'semIdentificacao' | 'avulsos';
const ATALHOS: { chave: Atalho; rotulo: string; icone: string }[] = [
  { chave: 'vencidos', rotulo: 'Vencidos', icone: 'pi pi-clock' },
  { chave: 'aguardando', rotulo: 'Aguardando conferência', icone: 'pi pi-hourglass' },
  { chave: 'semIdentificacao', rotulo: 'Sem número', icone: 'pi pi-hashtag' },
  { chave: 'avulsos', rotulo: 'Sem solicitação', icone: 'pi pi-inbox' }
];

@Component({
  selector: 'app-documentos-financeiros',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFileInputComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    ...GEO_FORM_KIT,
    AjudaListagemComponent,
    DateMaskDirective
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhosTeclado="geoListShortcuts" [newAction]="podeEnviar" (newRequested)="abrirEnvio()">
      <geo-page-header
        title="Documentos do financeiro"
        icon="pi pi-folder-open"
        [breadcrumb]="[{ label: 'Financeiro' }, { label: 'Documentos' }]"
        description="Notas, boletos e comprovantes: guarda, conferência pela contabilidade, pendências e arquivamento."
        helpLabel="Ajuda sobre documentos"
        (help)="ajuda.show()"
      >
        @if (podeEnviar) {
          <geo-button actions icon="pi pi-plus" label="Adicionar documento" [keyShortcut]="atalhosTeclado.newShortcut()" (pressed)="abrirEnvio()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="fin-documentos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-multiselect label="Tipo" [options]="tipos" [(value)]="lista.filters.tipo" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Situação" [options]="situacoes" [(value)]="lista.filters.situacao" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-select label="Origem" [options]="origens" [(value)]="lista.filters.origem"></geo-select>
          <geo-text-input label="Número" [value]="lista.filters.numero() ?? ''" (valueChange)="lista.filters.numero.set($event || null)" placeholder="Nº da nota ou do boleto"></geo-text-input>
          <geo-text-input label="Chave de acesso" [value]="lista.filters.chaveAcesso() ?? ''" (valueChange)="lista.filters.chaveAcesso.set($event || null)" placeholder="44 dígitos"></geo-text-input>
          <geo-datepicker label="Vencimento a partir de" [value]="dataLocal(lista.filters.vencimento().from)" [clearable]="true" (valueChange)="vencimento('from', $event)"></geo-datepicker>
          <geo-datepicker label="Vencimento até" [value]="dataLocal(lista.filters.vencimento().to)" [clearable]="true" (valueChange)="vencimento('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Documentos"
        mode="server"
        storageKey="fin-documentos"
        searchPlaceholder="Arquivo, número, emissor ou descrição"
        [rowActionLabel]="podeEnviar ? 'Editar dados' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEnviar ? 'Adicionar documento' : undefined"
        noResultsTitle="Nenhum documento encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os documentos' : 'Nenhum documento guardado'"
        [stateDescription]="resultado.error() ?? 'Guarde notas, boletos e comprovantes para a contabilidade conferir.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="abrirEnvio()"
        (rowActivate)="podeEnviar && abrirEdicao($event)"
      >
        <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos da contabilidade">
          @for (atalho of atalhos; track atalho.chave) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="atalhoAtivo() === atalho.chave" (click)="alternarAtalho(atalho.chave)">
              <i [class]="atalho.icone" aria-hidden="true"></i> {{ atalho.rotulo }}
            </button>
          }
        </div>
        <ng-template geoCell="documento" let-row>
          <span class="geo-cell-strong"><i [class]="icone(row)" aria-hidden="true"></i> {{ row.nomeArquivo }}</span>
          <span class="geo-cell-muted">{{ row.tipoRotulo }}{{ row.numeroDocumento ? ' · nº ' + row.numeroDocumento : '' }}</span>
          <span class="geo-cell-chips">
            @if (row.duplicado) {
              <geo-status tone="warning" icon="pi-copy">Arquivo repetido</geo-status>
            }
            @if (row.identificacaoPendente) {
              <geo-status tone="neutral" icon="pi-hashtag" emphasis="outline">Falta o número</geo-status>
            }
            @if (row.vencido) {
              <geo-status tone="danger" icon="pi-clock">Vencido</geo-status>
            }
          </span>
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <geo-status [tone]="tom(row.situacao)" [icon]="iconeSituacao[row.situacao]">{{ row.situacaoRotulo }}</geo-status>
          <span class="geo-cell-muted">{{ row.diasNaSituacao }} {{ row.diasNaSituacao === 1 ? 'dia' : 'dias' }} nesta situação</span>
          @if (row.motivoPendencia) {
            <span class="geo-cell-muted" [title]="row.motivoPendencia"><i class="pi pi-comment" aria-hidden="true"></i> {{ row.motivoPendencia }}</span>
          }
        </ng-template>
        <ng-template geoCell="origem" let-row>
          @if (row.origemSolicitacaoId) {
            <a [routerLink]="rotaOrigem(row)">{{ row.origemTipo === 'COMPRA' ? 'Compra' : 'Pagamento' }} nº {{ row.origemNumero }}</a>
          } @else {
            <span class="geo-cell-muted">Documento avulso</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (podeVisualizar(row)) {
              <geo-icon-button icon="pi pi-eye" [label]="'Abrir ' + row.nomeArquivo + ' em nova aba'" size="icon-sm" [loading]="ocupadoId() === row.id" (pressed)="visualizar(row)"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-download" [label]="'Baixar ' + row.nomeArquivo" size="icon-sm" [loading]="ocupadoId() === row.id" (pressed)="baixar(row)"></geo-icon-button>
            @if (podeConferir && row.situacao === 'PENDENTE') {
              <geo-icon-button icon="pi pi-exclamation-circle" [label]="'Devolver com pendência: ' + row.nomeArquivo" size="icon-sm" (pressed)="abrirPendencia(row)"></geo-icon-button>
            }
            @if (podeConferir && row.situacao === 'CONFERIDO') {
              <geo-icon-button icon="pi pi-inbox" [label]="'Arquivar ' + row.nomeArquivo" size="icon-sm" (pressed)="arquivar(row)"></geo-icon-button>
            }
            @if (podeConferir && (row.situacao === 'COM_PENDENCIA' || row.situacao === 'ARQUIVADO')) {
              <geo-icon-button icon="pi pi-replay" [label]="(row.situacao === 'ARQUIVADO' ? 'Desarquivar ' : 'Voltar para a conferência: ') + row.nomeArquivo" size="icon-sm" (pressed)="reabrir(row)"></geo-icon-button>
            }
            @if (podeEnviar) {
              <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + row.nomeArquivo" size="icon-sm" (pressed)="remover(row)"></geo-icon-button>
            }
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <ng-template #campos>
      <form [formGroup]="form">
        <geo-form-section title="Dados do documento" icon="pi pi-file" description="Todos opcionais: podem ser completados na conferência.">
          <geo-form-field label="Tipo" size="md">
            <p-select formControlName="tipo" [options]="tipos" optionLabel="label" optionValue="value" appendTo="body" size="small"></p-select>
          </geo-form-field>
          <geo-form-field label="Número" size="md">
            <input pInputText formControlName="numeroDocumento" placeholder="Como está impresso" pSize="small" />
          </geo-form-field>
          <geo-form-field label="Valor" size="md">
            <p-inputnumber formControlName="valor" mode="currency" currency="BRL" locale="pt-BR" size="small"></p-inputnumber>
          </geo-form-field>
          <geo-form-field label="Emissão" size="md">
            <p-datepicker formControlName="dataEmissao" dateFormat="dd/mm/yy" dateMask [showIcon]="true" iconDisplay="input" [showClear]="true" appendTo="body" size="small"></p-datepicker>
          </geo-form-field>
          <geo-form-field label="Vencimento" size="md">
            <p-datepicker formControlName="dataVencimento" dateFormat="dd/mm/yy" dateMask [showIcon]="true" iconDisplay="input" [showClear]="true" appendTo="body" size="small"></p-datepicker>
          </geo-form-field>
          <geo-form-field label="Competência" size="md" hint="Vazio: usamos o mês do vencimento.">
            <p-datepicker formControlName="competencia" view="month" dateFormat="mm/yy" [showIcon]="true" iconDisplay="input" [showClear]="true" appendTo="body" size="small"></p-datepicker>
          </geo-form-field>
          <geo-form-field label="Emissor" size="lg">
            <input pInputText formControlName="emissorNome" placeholder="Nome do fornecedor ou da empresa" pSize="small" />
          </geo-form-field>
          <geo-form-field label="Chave de acesso" size="lg">
            <input pInputText formControlName="chaveAcesso" placeholder="44 dígitos, com ou sem pontuação" pSize="small" />
          </geo-form-field>
          <geo-form-field label="Descrição" size="full">
            <textarea pTextarea formControlName="descricao" rows="2" placeholder="Uma linha que ajude a encontrar este documento depois"></textarea>
          </geo-form-field>
        </geo-form-section>
      </form>
    </ng-template>

    <geo-form-drawer #envio [(visible)]="envioAberto" title="Adicionar documento" description="Guarde o arquivo primeiro; os dados podem ser completados depois." [dirty]="!!arquivo()" size="md">
      <geo-form-section title="Arquivo" icon="pi pi-upload">
        <geo-file-input label="Arquivo" [required]="true" [accept]="aceitos" [maxBytes]="15 * 1024 * 1024" [file]="arquivo()" (fileChange)="escolherArquivo($event)"
          description="Imagem, PDF, XML da nota, Word ou Excel, até 15 MB."></geo-file-input>
      </geo-form-section>
      <ng-container [ngTemplateOutlet]="campos"></ng-container>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="envio.requestClose()"></geo-button>
        <geo-button icon="pi pi-check" label="Guardar documento" [disabled]="!arquivo()" [loading]="salvando()" (pressed)="enviar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-form-drawer #edicao [(visible)]="edicaoAberta" title="Dados do documento" [description]="$safeNavigationMigration(editando()?.nomeArquivo)" [dirty]="form.dirty" size="md">
      <geo-callout tone="info">Corrija ou complete o que ficou faltando. Documentos arquivados precisam ser reabertos antes.</geo-callout>
      <ng-container [ngTemplateOutlet]="campos"></ng-container>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="edicao.requestClose()"></geo-button>
        <geo-button icon="pi pi-check" label="Salvar alterações" [loading]="salvando()" (pressed)="salvarEdicao()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-form-drawer [(visible)]="pendenciaAberta" title="Devolver com pendência" [description]="$safeNavigationMigration(emPendencia()?.nomeArquivo)" [dirty]="!!motivo().trim()" size="sm">
      <geo-callout tone="info">Quem enviou o documento verá esta mensagem e poderá corrigir.</geo-callout>
      <geo-textarea label="O que está pendente?" [required]="true" [(value)]="motivo" [rows]="4" placeholder="Ex.: a nota está sem o número e não confere com o boleto"></geo-textarea>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Voltar" (pressed)="pendenciaAberta.set(false)"></geo-button>
        <geo-button icon="pi pi-exclamation-circle" label="Devolver" [disabled]="!motivo().trim()" [loading]="salvando()" (pressed)="apontarPendencia()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda titulo="Documentos do financeiro" entidadePlural="documentos" busca="arquivo, número, emissor ou descrição" rotuloNovo="Adicionar documento" [podeCriar]="podeEnviar">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-bolt"></i> Atalhos</h4>
        <p class="help-text-desc">Vencidos, aguardando conferência, sem número e sem solicitação ficam acima da tabela: um clique aplica, outro desfaz.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-check-circle"></i> Conferência</h4>
        <p class="help-text-desc">A contabilidade devolve com pendência (com o motivo), arquiva o que está conferido e pode reabrir. Documentos repetidos e sem número aparecem marcados.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class DocumentosFinanceirosComponent {
  private readonly service = inject(FinanceiroService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auth = inject(AuthService);

  protected readonly podeEnviar = this.temPermissao('financeiro:documento:write');
  protected readonly podeConferir = this.temPermissao('financeiro:documento:conferir');
  protected readonly tipos = TIPOS;
  protected readonly situacoes = SITUACOES;
  protected readonly origens = ORIGENS;
  protected readonly atalhos = ATALHOS;
  protected readonly aceitos = EXTENSOES.map((e) => `.${e}`).join(',');
  protected readonly dataLocal = dataLocal;

  protected readonly lista = geoListState({
    storageKey: 'fin-documentos',
    pageSize: 20,
    filters: {
      tipo: geoFilter.list<TipoDocumentoFinanceiro>([], { label: 'Tipo', itemLabel: (t) => ROTULO_TIPO_DOCUMENTO[t] ?? t }),
      situacao: geoFilter.list<SituacaoDocumento>([], { label: 'Situação', itemLabel: (s) => ROTULO_SITUACAO_DOCUMENTO[s] ?? s, countLabel: (n) => `${n} selecionadas` }),
      origem: geoFilter.value<'COMPRA' | 'PAGAMENTO' | null>(null, { label: 'Origem', type: 'string', options: () => ORIGENS }),
      numero: geoFilter.value<string | null>(null, { label: 'Número' }),
      chaveAcesso: geoFilter.value<string | null>(null, { label: 'Chave', param: 'chave' }),
      vencimento: geoFilter.range({ from: null, to: null }, { label: 'Vencimento' }),
      vencidos: geoFilter.value<boolean>(false, { label: 'Atalho', format: (v): string | null => (v ? 'vencidos' : null) }),
      aguardando: geoFilter.value<boolean>(false, { label: 'Atalho', format: (v): string | null => (v ? 'aguardando conferência' : null) }),
      semIdentificacao: geoFilter.value<boolean>(false, { label: 'Atalho', format: (v): string | null => (v ? 'sem número' : null) }),
      avulsos: geoFilter.value<boolean>(false, { label: 'Atalho', format: (v): string | null => (v ? 'sem solicitação' : null) })
    },
    sort: [{ key: 'documento', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<DocumentoFinanceiro>(
    (pedido) => {
      const { filters: f, query } = this.lista.request();
      const params: Record<string, unknown> = {
        page: pedido.page,
        size: pedido.size,
        sort: pedido.sort.map((r) => `${r.key},${r.direction}`)[0] ?? 'dataCriacao,desc',
        buscaGlobal: query || undefined,
        tipo: f.tipo.length ? [...f.tipo] : undefined,
        // "Aguardando conferência" é um recorte de situação; os outros atalhos têm flag própria.
        situacao: f.aguardando ? ['PENDENTE'] : f.situacao.length ? [...f.situacao] : undefined,
        origemTipo: f.origem ?? undefined,
        numeroDocumento: f.numero || undefined,
        chaveAcesso: f.chaveAcesso || undefined,
        vencimentoInicio: f.vencimento.from ?? undefined,
        vencimentoFim: f.vencimento.to ?? undefined,
        apenasVencidos: f.vencidos || undefined,
        apenasSemIdentificacao: f.semIdentificacao || undefined,
        apenasAvulsos: f.avulsos || undefined
      };
      return this.service.listarDocumentos(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)));
    },
    { errorMessage: getErrorMessage }
  );
  protected readonly atalhoAtivo = computed<Atalho | null>(() => ATALHOS.find((a) => this.lista.applied()[a.chave])?.chave ?? null);

  protected readonly colunas: GeoDataTableColumn<DocumentoFinanceiro>[] = [
    { key: 'documento', header: 'Documento', type: 'custom', priority: 1, sortField: 'dataCriacao', value: (d) => d.nomeArquivo },
    { key: 'emissor', header: 'Emissor', value: (d) => d.emissorNome, display: (d) => d.emissorNome || '—' },
    { key: 'competencia', header: 'Competência', value: (d) => d.competencia, display: (d) => this.mesContabil(d.competencia) },
    { key: 'vencimento', header: 'Vencimento', type: 'date', sortField: 'dataVencimento', value: (d) => d.dataVencimento },
    { key: 'valor', header: 'Valor', type: 'currency', sortField: 'valor', value: (d) => d.valor },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (d) => d.situacao, display: (d) => d.situacaoRotulo },
    { key: 'origem', header: 'Origem', type: 'custom', value: (d) => d.origemNumero, display: (d) => (d.origemSolicitacaoId ? `${d.origemTipo} ${d.origemNumero}` : 'Avulso') }
  ];
  protected readonly rotulo = (d: DocumentoFinanceiro) => d.nomeArquivo;

  protected readonly form = new FormGroup({
    tipo: new FormControl<TipoDocumentoFinanceiro>('OUTRO', { nonNullable: true }),
    numeroDocumento: new FormControl<string | null>(null),
    chaveAcesso: new FormControl<string | null>(null),
    emissorNome: new FormControl<string | null>(null),
    dataEmissao: new FormControl<Date | null>(null),
    dataVencimento: new FormControl<Date | null>(null),
    competencia: new FormControl<Date | null>(null),
    valor: new FormControl<number | null>(null),
    descricao: new FormControl<string | null>(null)
  });
  protected readonly envioAberto = signal(false);
  protected readonly edicaoAberta = signal(false);
  protected readonly pendenciaAberta = signal(false);
  protected readonly arquivo = signal<File | null>(null);
  protected readonly editando = signal<DocumentoFinanceiro | null>(null);
  protected readonly emPendencia = signal<DocumentoFinanceiro | null>(null);
  protected readonly motivo = signal('');
  protected readonly salvando = signal(false);
  protected readonly ocupadoId = signal<string | null>(null);

  protected vencimento(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.vencimento.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  /** Um atalho por vez; clicar no ativo desfaz. */
  protected alternarAtalho(chave: Atalho): void {
    const ativo = this.atalhoAtivo() === chave;
    for (const a of ATALHOS) this.lista.filters[a.chave].set(!ativo && a.chave === chave);
    this.lista.apply();
  }

  // ── Envio e edição
  protected abrirEnvio(): void {
    if (!this.podeEnviar) return;
    this.arquivo.set(null);
    this.editando.set(null);
    this.form.reset({ tipo: 'OUTRO' });
    this.envioAberto.set(true);
  }

  protected abrirEdicao(d: DocumentoFinanceiro): void {
    this.editando.set(d);
    this.form.reset({
      tipo: d.tipo,
      numeroDocumento: d.numeroDocumento ?? null,
      chaveAcesso: d.chaveAcesso ?? null,
      emissorNome: d.emissorNome ?? null,
      dataEmissao: dataLocal(d.dataEmissao),
      dataVencimento: dataLocal(d.dataVencimento),
      competencia: dataLocal(d.competencia),
      valor: d.valor ?? null,
      descricao: d.descricao ?? null
    });
    this.edicaoAberta.set(true);
  }

  protected escolherArquivo(arquivo: File | null): void {
    if (!arquivo) return this.arquivo.set(null);
    const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSOES.includes(extensao)) {
      this.notificacoes.warning('Formato não aceito: envie imagem, PDF, XML da nota, Word ou Excel.');
      return;
    }
    this.arquivo.set(arquivo);
    // Um XML só existe como nota fiscal eletrônica; adiantar isso poupa um clique.
    if (extensao === 'xml' && this.form.controls.tipo.value === 'OUTRO') this.form.controls.tipo.setValue('NOTA_FISCAL');
  }

  protected enviar(): void {
    const arquivo = this.arquivo();
    if (!arquivo) return;
    this.salvando.set(true);
    this.service.enviarDocumento(arquivo, this.metadados()).subscribe({
      next: () => {
        this.arquivo.set(null);
        this.envioAberto.set(false);
        this.concluir('Documento guardado.');
      },
      error: (e) => this.falhar(e)
    });
  }

  protected salvarEdicao(): void {
    const d = this.editando();
    if (!d) return;
    this.salvando.set(true);
    this.service.atualizarDocumento(d.id, this.metadados()).subscribe({
      next: () => {
        this.form.markAsPristine();
        this.edicaoAberta.set(false);
        this.concluir('Dados atualizados.');
      },
      error: (e) => this.falhar(e)
    });
  }

  private metadados(): DocumentoRequest {
    const v = this.form.getRawValue();
    return {
      tipo: v.tipo,
      numeroDocumento: v.numeroDocumento || null,
      chaveAcesso: v.chaveAcesso || null,
      emissorNome: v.emissorNome || null,
      // O backend espera LocalDate: ISO completo faria o fuso mudar o dia.
      dataEmissao: dataIso(v.dataEmissao),
      dataVencimento: dataIso(v.dataVencimento),
      competencia: dataIso(v.competencia),
      valor: v.valor ?? null,
      descricao: v.descricao || null
    };
  }

  // ── Conferência
  protected abrirPendencia(d: DocumentoFinanceiro): void {
    this.emPendencia.set(d);
    this.motivo.set('');
    this.pendenciaAberta.set(true);
  }

  protected apontarPendencia(): void {
    const d = this.emPendencia();
    const motivo = this.motivo().trim();
    if (!d || !motivo) return;
    this.salvando.set(true);
    this.service.apontarPendenciaDocumento(d.id, motivo).subscribe({
      next: () => {
        this.motivo.set('');
        this.pendenciaAberta.set(false);
        this.concluir('Documento devolvido com pendência.');
      },
      error: (e) => this.falhar(e)
    });
  }

  protected arquivar(d: DocumentoFinanceiro): void {
    this.service.arquivarDocumento(d.id).subscribe({ next: () => this.concluir('Documento arquivado.'), error: (e) => this.falhar(e) });
  }

  protected reabrir(d: DocumentoFinanceiro): void {
    if (d.situacao === 'CONFERIDO') return;
    const mensagem = d.situacao === 'ARQUIVADO' ? 'Documento desarquivado.' : 'Voltou para a fila de conferência.';
    this.service.reabrirDocumento(d.id).subscribe({ next: () => this.concluir(mensagem), error: (e) => this.falhar(e) });
  }

  protected async remover(d: DocumentoFinanceiro): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Remover documento',
      message: `"${d.nomeArquivo}" é apagado e a ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      variant: 'destructive'
    });
    if (!ok) return;
    this.service.removerDocumento(d.id).subscribe({ next: () => this.concluir('Documento removido.'), error: (e) => this.falhar(e) });
  }

  // ── Arquivo
  protected baixar(d: DocumentoFinanceiro): void {
    this.ocupadoId.set(d.id);
    this.service.baixarDocumento(d.id).subscribe({
      next: (blob) => {
        this.ocupadoId.set(null);
        FileDownloadUtil.downloadBlob(blob, d.nomeArquivo);
      },
      error: (e) => this.falhar(e)
    });
  }

  protected visualizar(d: DocumentoFinanceiro): void {
    this.ocupadoId.set(d.id);
    this.service.baixarDocumento(d.id).subscribe({
      next: (blob) => {
        this.ocupadoId.set(null);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.falhar(e)
    });
  }

  protected podeVisualizar(d: DocumentoFinanceiro): boolean {
    const ct = d?.contentType ?? '';
    return ct.startsWith('image/') || ct === 'application/pdf';
  }

  protected icone(d: DocumentoFinanceiro): string {
    const ct = d?.contentType ?? '';
    if (ct.includes('image')) return 'pi pi-image';
    if (ct.includes('pdf')) return 'pi pi-file-pdf';
    if (ct.includes('xml')) return 'pi pi-code';
    if (ct.includes('sheet') || ct.includes('excel')) return 'pi pi-file-excel';
    return 'pi pi-file';
  }

  protected readonly iconeSituacao: Record<string, string> = ICONE_SITUACAO_DOCUMENTO;

  protected tom(s: SituacaoDocumento): GeoTone {
    return TOM_SITUACAO[s] ?? 'neutral';
  }

  protected rotaOrigem(d: DocumentoFinanceiro): string[] {
    return ['/financeiro', d?.origemTipo === 'COMPRA' ? 'compras' : 'pagamentos', d?.origemSolicitacaoId ?? ''];
  }

  /** "ago/2026" é o que a contabilidade fala; "01/08/2026" só confunde. */
  protected mesContabil(competencia?: string | null): string {
    if (!competencia) return '—';
    const [ano, mes] = competencia.split('-');
    return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
  }

  private concluir(mensagem: string): void {
    this.salvando.set(false);
    this.notificacoes.success(mensagem);
    this.lista.reload();
  }

  private falhar(e: unknown): void {
    this.salvando.set(false);
    this.ocupadoId.set(null);
    this.notificacoes.error(getErrorMessage(e));
  }

  private temPermissao(permissao: string): boolean {
    return this.auth.currentUser()?.permissoes?.includes(permissao) ?? false;
  }
}
