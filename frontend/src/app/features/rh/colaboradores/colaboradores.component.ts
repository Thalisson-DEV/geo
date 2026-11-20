import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoPasswordInputComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoImportStatus,
  geoListState
} from '@geo/ui';
import { Observable, of, Subscription, switchMap } from 'rxjs';

import {
  BaseOperacionalResponse,
  ColaboradorImportacaoDTO,
  ColaboradorRequest,
  ColaboradorResponse,
  FuncaoResponse,
  PerfilAcessoResponse,
  ProcessoNegocioResponse
} from '../../../core/models/rh.models';
import { UsuarioResponse } from '../../../core/models/iam.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { AuthService } from '../../../core/services/auth.service';
import { RhService } from '../../../core/services/rh.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { ColaboradorMedidasComponent } from '../medidas-disciplinares/colaborador-medidas.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, dataIso, dataLocal, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

type TipoUsuario = 'ADMINISTRATIVO' | 'CAMPO';

const LOGIN_VALIDO = /^[uU][sS][rR]\d{6}$/;
type ModoAcesso = 'NENHUM' | 'NOVO' | 'EXISTENTE';

/** `00000000000` → `000.000.000-00`, aceitando digitação parcial. */
export function formatarCpf(valor: string | null | undefined): string {
  const d = (valor ?? '').replace(/\D/g, '').substring(0, 11);
  if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return d;
}

@Component({
  selector: 'app-colaboradores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoPasswordInputComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    ColaboradorMedidasComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Colaboradores"
        icon="pi pi-users"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Colaboradores' }]"
        description="Quadro de pessoal com base, processo e função. O acesso ao sistema pode ser gerado no próprio cadastro."
        helpLabel="Ajuda sobre colaboradores"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo colaborador" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="rh-colaboradores" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="CPF" [value]="lista.filters.cpf() ?? ''" (valueChange)="lista.filters.cpf.set(cpfOuNulo($event))"
            [maxlength]="14" placeholder="000.000.000-00" description="Busca exata. Não fica salvo no endereço da página."></geo-text-input>
          <geo-select label="Base operacional" [options]="basesOpcoes()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Processo" [options]="processosOpcoes()" [(value)]="lista.filters.idProcesso" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Função" [options]="funcoesOpcoes()" [(value)]="lista.filters.idFuncao" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
          <geo-datepicker label="Contratados a partir de" [value]="dataLocal(lista.filters.contratacao().from)" [clearable]="true"
            (valueChange)="contratacao('from', $event)"></geo-datepicker>
          <geo-datepicker label="Contratados até" [value]="dataLocal(lista.filters.contratacao().to)" [clearable]="true"
            (valueChange)="contratacao('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Colaboradores"
        mode="server"
        storageKey="rh-colaboradores"
        exportFileName="colaboradores"
        searchPlaceholder="Nome do colaborador"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo colaborador"
        noResultsTitle="Nenhum colaborador encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os colaboradores' : 'Nenhum colaborador cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre um colaborador ou importe uma planilha.'"
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template geoCell="nome" let-row>
          <span class="geo-cell-strong">{{ row.nomeCompleto }}</span>
          @if (row.idUsuario) {
            <span class="geo-cell-muted"><i class="pi pi-key" aria-hidden="true"></i> Com acesso ao sistema</span>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.nomeCompleto" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nomeCompleto" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar colaborador' : 'Novo colaborador'" [description]="$safeNavigationMigration(emEdicao()?.nomeCompleto)"
      [dirty]="alterado()" size="lg">
      @if (emEdicao() && verMedidas()) {
        <geo-tabs [(value)]="abaColaborador" [tabs]="abasColaborador" ariaLabel="Seções do colaborador">
          <ng-template geoTabPanel="cadastro"><ng-container *ngTemplateOutlet="cadastro" /></ng-template>
          <ng-template geoTabPanel="medidas">
            <app-colaborador-medidas [idColaborador]="emEdicao()!.id" [nomeColaborador]="emEdicao()!.nomeCompleto"></app-colaborador-medidas>
          </ng-template>
        </geo-tabs>
      } @else {
        <ng-container *ngTemplateOutlet="cadastro" />
      }

      <ng-template #cadastro>
        <geo-form-section title="Dados pessoais" icon="pi pi-user">
          <div class="geo-form-grid">
            <geo-text-input label="Primeiro nome" [required]="true" [(value)]="primeiroNome" [maxlength]="100" [error]="erro('primeiroNome')"></geo-text-input>
            <geo-text-input label="Último nome" [required]="true" [(value)]="ultimoNome" [maxlength]="100" [error]="erro('ultimoNome')"></geo-text-input>
          </div>
          <geo-text-input label="Nome completo" [required]="true" [(value)]="nomeCompleto" [maxlength]="200" [error]="erro('nomeCompleto')"></geo-text-input>
          <div class="geo-form-grid">
            <geo-text-input label="CPF" [required]="true" [value]="cpf()" (valueChange)="cpf.set(formatarCpf($event))" [maxlength]="14"
              placeholder="000.000.000-00" [readonly]="!!emEdicao()" [description]="emEdicao() ? 'O CPF não pode ser alterado.' : undefined"
              [error]="erro('cpf')"></geo-text-input>
            <geo-datepicker label="Data de contratação" [required]="true" [(value)]="dataContratacao" [readonly]="!!emEdicao()" [error]="erro('dataContratacao')"></geo-datepicker>
          </div>
          @if (emEdicao()) {
            <geo-boolean-control label="Colaborador ativo" kind="toggle" [(value)]="ativo"></geo-boolean-control>
          }
        </geo-form-section>

        <geo-form-section title="Vínculo" icon="pi pi-sitemap">
          <div class="geo-form-grid">
            <geo-select label="Base operacional" [required]="true" [options]="basesOpcoes()" [(value)]="idBase" [filter]="true" [error]="erro('base')"></geo-select>
            <geo-select label="Processo" [required]="true" [options]="processosOpcoes()" [(value)]="idProcesso" [filter]="true" [error]="erro('processo')"></geo-select>
            <geo-select label="Função" [required]="true" [options]="funcoesOpcoes()" [(value)]="idFuncao" [filter]="true" [error]="erro('funcao')"></geo-select>
          </div>
        </geo-form-section>

        @if (emEdicao()?.idUsuario) {
          <geo-form-section title="Acesso ao sistema" icon="pi pi-key" description="Usuário de login ligado a este colaborador.">
            <geo-text-input label="Usuário vinculado" [readonly]="true" [value]="usuarioVinculadoRotulo()"
              [placeholder]="usuarioVinculado.loading() ? 'Carregando usuário…' : ''"
              [description]="usuarioVinculadoDescricao()" [error]="usuarioVinculado.error()"></geo-text-input>
          </geo-form-section>
        } @else {
          <geo-form-section title="Acesso ao sistema" icon="pi pi-key" description="Opcional. Cria um usuário de login ou liga um usuário que já existe e não tem colaborador.">
            <geo-select label="Acesso" [options]="opcoesAcesso" [(value)]="acesso"></geo-select>
            @if (acesso() === 'EXISTENTE') {
              <geo-select label="Usuário" [required]="true" [options]="usuariosOpcoes()" [(value)]="idUsuarioExistente" [filter]="true" [clearable]="true"
                [loading]="usuariosSemColaborador.loading()" (opened)="usuariosSemColaborador.open()" (search)="usuariosSemColaborador.search($event)"
                placeholder="Pesquise pelo login ou e-mail" description="Só aparecem usuários ativos sem colaborador vinculado." [error]="erro('usuario') ?? erroUsuarios()"></geo-select>
            }
            @if (acesso() === 'NOVO') {
              <div class="geo-form-grid">
                <geo-text-input label="Login" [required]="true" [value]="login()" (valueChange)="login.set($event.toUpperCase())" [maxlength]="9"
                  placeholder="USR000000" description="USR seguido de 6 dígitos." [error]="erro('login')"></geo-text-input>
                <geo-password-input label="Senha inicial" [required]="true" [(value)]="senha" [minlength]="6" [error]="erro('senha')"></geo-password-input>
                <geo-select label="Perfil de acesso" [required]="true" [options]="perfisOpcoes()" [(value)]="idPerfil" [filter]="true" [error]="erro('perfil')"></geo-select>
                <geo-select label="Tipo de usuário" [required]="true" [options]="tiposUsuario" [(value)]="tipo"></geo-select>
              </div>
            }
          </geo-form-section>
        }
      </ng-template>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        @if (abaColaborador() === 'cadastro' || !emEdicao() || !verMedidas()) {
          <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar colaborador'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar colaboradores"
      description="Planilha CSV com nome, CPF, data de contratação, base, processo e função (pelos nomes cadastrados)."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="nome" let-row>
            @if (row.editing) { <geo-text-input label="Nome completo" [labelVisible]="false" [(value)]="row.nomeCompleto"></geo-text-input> } @else { {{ row.nomeCompleto }} }
          </ng-template>
          <ng-template geoCell="cpf" let-row>
            @if (row.editing) {
              <geo-text-input label="CPF" [labelVisible]="false" [value]="formatarCpf(row.cpf)" (valueChange)="row.cpf = formatarCpf($event)" [maxlength]="14"></geo-text-input>
            } @else {
              {{ formatarCpf(row.cpf) }}
            }
          </ng-template>
          <ng-template geoCell="contratacao" let-row>
            @if (row.editing) {
              <geo-datepicker label="Data de contratação" [labelVisible]="false" [value]="dataLocal(row.dataContratacao)" (valueChange)="row.dataContratacao = dataIso($event) ?? ''"></geo-datepicker>
            } @else {
              {{ dataBr(row.dataContratacao) }}
            }
          </ng-template>
          <ng-template geoCell="base" let-row>
            @if (row.editing) {
              <geo-select label="Base" [labelVisible]="false" [options]="basesPorNome()" [(value)]="row.nomeBase" [filter]="true"></geo-select>
            } @else {
              {{ row.nomeBase || '—' }}
            }
          </ng-template>
          <ng-template geoCell="processo" let-row>
            @if (row.editing) {
              <geo-select label="Processo" [labelVisible]="false" [options]="processosPorNome()" [(value)]="row.nomeProcesso" [filter]="true"></geo-select>
            } @else {
              {{ row.nomeProcesso || '—' }}
            }
          </ng-template>
          <ng-template geoCell="funcao" let-row>
            @if (row.editing) {
              <geo-select label="Função" [labelVisible]="false" [options]="funcoesPorNome()" [(value)]="row.nomeFuncao" [filter]="true"></geo-select>
            } @else {
              {{ row.nomeFuncao || '—' }}
            }
          </ng-template>
          <ng-template geoCell="status" let-row>
            <geo-status [tone]="situacao(row.status).tone" [icon]="situacao(row.status).icon">{{ situacao(row.status).label }}</geo-status>
            @if (row.mensagemErro) {
              <span class="geo-cell-muted" [title]="row.mensagemErro">{{ row.mensagemErro }}</span>
            }
          </ng-template>
          <ng-template geoRowActions let-row>
            <span class="geo-table-actions">
              @if (row.editing) {
                <geo-icon-button icon="pi pi-check" [label]="'Concluir correção da linha ' + row.linha" size="icon-sm" (pressed)="importacao.concluirCorrecao(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="row.editing = true"></geo-icon-button>
                <geo-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="importacao.remover(row)"></geo-icon-button>
              }
            </span>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Colaboradores" entidadePlural="colaboradores" busca="nome do colaborador" rotuloNovo="Novo colaborador"
      [importacao]="true" video="https://www.youtube.com/embed/ZSV3YnVRH2o">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-key"></i> Acesso ao sistema</h4>
        <p class="help-text-desc">Ao cadastrar (ou editar quem ainda não tem usuário), escolha em "Acesso": "Gerar novo acesso" pede login (USR + 6 dígitos), senha inicial, perfil e tipo; "Vincular a usuário existente" liga um usuário ativo que ainda não tem colaborador.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-id-card"></i> Busca por CPF</h4>
        <p class="help-text-desc">O filtro de CPF é exato e, por ser dado pessoal, não fica salvo no endereço da página nem no navegador.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class ColaboradoresComponent {
  private readonly rh = inject(RhService);
  private readonly usuarios = inject(UsuariosService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auth = inject(AuthService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly formatarCpf = formatarCpf;
  protected readonly dataLocal = dataLocal;
  protected readonly dataIso = dataIso;
  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly tiposUsuario: GeoSelectOption<TipoUsuario>[] = [
    { label: 'Campo', value: 'CAMPO' },
    { label: 'Administrativo', value: 'ADMINISTRATIVO' }
  ];

  protected readonly bases = signal<BaseOperacionalResponse[]>([]);
  protected readonly processos = signal<ProcessoNegocioResponse[]>([]);
  protected readonly funcoes = signal<FuncaoResponse[]>([]);
  protected readonly perfis = signal<PerfilAcessoResponse[]>([]);
  protected readonly basesOpcoes = computed(() => opcoes(this.bases(), 'id'));
  protected readonly processosOpcoes = computed(() => opcoes(this.processos(), 'id'));
  protected readonly funcoesOpcoes = computed(() => opcoes(this.funcoes(), 'id'));
  protected readonly perfisOpcoes = computed(() => opcoes(this.perfis(), 'id'));
  protected readonly basesPorNome = computed(() => opcoes(this.bases(), 'nome'));
  protected readonly processosPorNome = computed(() => opcoes(this.processos(), 'nome'));
  protected readonly funcoesPorNome = computed(() => opcoes(this.funcoes(), 'nome'));

  protected readonly lista = geoListState({
    storageKey: 'rh-colaboradores',
    filters: {
      // Dado pessoal (LGPD): não vai para a URL.
      cpf: geoFilter.value<string | null>(null, { label: 'CPF', url: false }),
      idBaseOperacional: geoFilter.value<string | null>(null, { label: 'Base', param: 'base', format: (id): string | null => (id ? this.nome(this.bases(), id) : null) }),
      idProcesso: geoFilter.value<string | null>(null, { label: 'Processo', param: 'processo', format: (id): string | null => (id ? this.nome(this.processos(), id) : null) }),
      idFuncao: geoFilter.value<string | null>(null, { label: 'Função', param: 'funcao', format: (id): string | null => (id ? this.nome(this.funcoes(), id) : null) }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS }),
      contratacao: geoFilter.range({ from: null, to: null }, { label: 'Contratação' })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<ColaboradorResponse>(
    (pedido) => this.rh.listarColaboradores({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.rh.listarColaboradores({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<ColaboradorResponse>[] = [
    { key: 'nome', header: 'Nome', type: 'custom', priority: 1, sortField: 'nomeCompleto', value: (c) => c.nomeCompleto, display: (c) => c.nomeCompleto },
    { key: 'cpf', header: 'CPF', sortField: 'cpf', value: (c) => c.cpf, display: (c) => formatarCpf(c.cpf) },
    { key: 'base', header: 'Base', sortField: 'baseOperacional.nome', value: (c) => c.baseOperacional?.nome, display: (c) => c.baseOperacional?.nome ?? '—' },
    { key: 'processo', header: 'Processo', sortField: 'processo.nome', value: (c) => c.processo?.nome, display: (c) => c.processo?.nome ?? '—' },
    { key: 'funcao', header: 'Função', priority: 1, sortField: 'funcao.nome', value: (c) => c.funcao?.nome, display: (c) => c.funcao?.nome ?? '—' },
    { key: 'contratacao', header: 'Contratação', type: 'date', sortField: 'dataContratacao', value: (c) => c.dataContratacao },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (c) => c.ativo, display: (c) => (c.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (c: ColaboradorResponse) => c.nomeCompleto;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<ColaboradorResponse | null>(null);
  /** Medida disciplinar é dado restrito: a aba só existe com a permissão própria, não com rh:colaborador:read. */
  protected readonly verMedidas = computed(() => this.auth.currentUser()?.permissoes?.includes('rh:medida-disciplinar:read') ?? false);
  protected readonly abaColaborador = signal<'cadastro' | 'medidas'>('cadastro');
  protected readonly abasColaborador: GeoTabItem[] = [
    { value: 'cadastro', label: 'Cadastro', icon: 'pi pi-user' },
    { value: 'medidas', label: 'Medidas disciplinares', icon: 'pi pi-exclamation-triangle' }
  ];
  protected readonly primeiroNome = signal('');
  protected readonly ultimoNome = signal('');
  protected readonly nomeCompleto = signal('');
  protected readonly cpf = signal('');
  protected readonly dataContratacao = signal<Date | null>(null);
  protected readonly idBase = signal<string | null>(null);
  protected readonly idProcesso = signal<string | null>(null);
  protected readonly idFuncao = signal<string | null>(null);
  protected readonly ativo = signal(true);
  protected readonly opcoesAcesso: GeoSelectOption<ModoAcesso>[] = [
    { label: 'Sem acesso', value: 'NENHUM' },
    { label: 'Gerar novo acesso', value: 'NOVO' },
    { label: 'Vincular a usuário existente', value: 'EXISTENTE' }
  ];
  protected readonly acesso = signal<ModoAcesso>('NENHUM');
  protected readonly idUsuarioExistente = signal<string | null>(null);
  protected readonly usuariosSemColaborador = new RemoteLookup<UsuarioResponse, string>(
    {
      identify: (u) => u.id,
      selectedKeys: () => (this.idUsuarioExistente() ? [this.idUsuarioExistente()!] : []),
      load: ({ query, page, size }) =>
        this.usuarios.listarUsuarios({ vinculadoAColaborador: false, ativo: true, buscaGlobal: query || undefined, page, size, sort: 'login,asc' })
    },
    inject(DestroyRef)
  );
  protected readonly usuariosOpcoes = computed<GeoSelectOption<string>[]>(() =>
    this.usuariosSemColaborador.items().map((u) => ({ label: u.email ? `${u.login} · ${u.email}` : u.login, value: u.id }))
  );
  protected readonly erroUsuarios = computed(() => {
    const erro = this.usuariosSemColaborador.error();
    return erro ? `Não foi possível carregar os usuários: ${getErrorMessage(erro)}` : undefined;
  });
  protected readonly login = signal('');
  protected readonly senha = signal('');
  protected readonly idPerfil = signal<string | null>(null);
  protected readonly usuarioVinculado = {
    dados: signal<UsuarioResponse | null>(null),
    loading: signal(false),
    error: signal<string | undefined>(undefined)
  };
  protected readonly usuarioVinculadoRotulo = computed(() => {
    const u = this.usuarioVinculado.dados();
    return u ? (u.email ? `${u.login} · ${u.email}` : u.login) : '';
  });
  protected readonly usuarioVinculadoDescricao = computed(() => {
    const u = this.usuarioVinculado.dados();
    const perfil = u ? `Perfil ${u.perfil?.nome ?? '—'}${u.ativo ? '' : ' · usuário inativo'}. ` : '';
    return `${perfil}Para trocar ou desfazer o vínculo, use a tela de Usuários.`;
  });
  private carregamentoUsuarioVinculado?: Subscription;
  protected readonly tipo = signal<TipoUsuario>('CAMPO');
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);

  protected readonly alterado = computed(() => {
    const c = this.emEdicao();
    const acesso = (this.acesso() === 'NOVO' && !!(this.login() + this.senha()).trim()) || (this.acesso() === 'EXISTENTE' && !!this.idUsuarioExistente());
    if (!c) {
      return acesso || !!(this.primeiroNome() + this.ultimoNome() + this.nomeCompleto() + this.cpf()).trim() || !!this.dataContratacao() || !!this.idBase() || !!this.idProcesso() || !!this.idFuncao();
    }
    return (
      acesso ||
      this.primeiroNome() !== c.primeiroNome ||
      this.ultimoNome() !== c.ultimoNome ||
      this.nomeCompleto() !== c.nomeCompleto ||
      this.idBase() !== (c.baseOperacional?.id ?? null) ||
      this.idProcesso() !== (c.processo?.id ?? null) ||
      this.idFuncao() !== (c.funcao?.id ?? null) ||
      this.ativo() !== c.ativo
    );
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.primeiroNome().trim()) e['primeiroNome'] = 'Informe o primeiro nome.';
    if (!this.ultimoNome().trim()) e['ultimoNome'] = 'Informe o último nome.';
    if (!this.nomeCompleto().trim()) e['nomeCompleto'] = 'Informe o nome completo.';
    if (this.cpf().replace(/\D/g, '').length !== 11) e['cpf'] = 'Informe os 11 dígitos do CPF.';
    if (!this.dataContratacao()) e['dataContratacao'] = 'Informe a data de contratação.';
    if (!this.idBase()) e['base'] = 'Escolha a base.';
    if (!this.idProcesso()) e['processo'] = 'Escolha o processo.';
    if (!this.idFuncao()) e['funcao'] = 'Escolha a função.';
    if (this.criaAcesso()) {
      if (!LOGIN_VALIDO.test(this.login())) e['login'] = 'Use USR seguido de 6 dígitos (ex.: USR123456).';
      if (this.senha().length < 6) e['senha'] = 'A senha precisa de pelo menos 6 caracteres.';
      if (!this.idPerfil()) e['perfil'] = 'Escolha o perfil de acesso.';
    }
    if (this.vinculaUsuarioExistente() && !this.idUsuarioExistente()) e['usuario'] = 'Escolha o usuário.';
    return e;
  });

  protected readonly importacao = importacaoListagem<ColaboradorImportacaoDTO>({
    enviar: (arquivo) => this.rh.importarColaboradores(arquivo),
    confirmar: (colaboradores) => this.rh.confirmarImportacao({ colaboradores }),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/rh/colaboradores/importar/modelo', 'modelo-colaboradores.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<ColaboradorImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'nome', header: 'Nome', type: 'custom', priority: 1, value: (r) => r.nomeCompleto },
    { key: 'cpf', header: 'CPF', type: 'custom', value: (r) => r.cpf },
    { key: 'contratacao', header: 'Contratação', type: 'custom', value: (r) => r.dataContratacao },
    { key: 'base', header: 'Base', type: 'custom', value: (r) => r.nomeBase },
    { key: 'processo', header: 'Processo', type: 'custom', value: (r) => r.nomeProcesso },
    { key: 'funcao', header: 'Função', type: 'custom', value: (r) => r.nomeFuncao },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  constructor() {
    this.rh.listarBasesOperacionaisAtivas().subscribe({ next: (r) => this.bases.set(r.content), error: () => undefined });
    this.rh.listarProcessosAtivos().subscribe({ next: (r) => this.processos.set(r.content), error: () => undefined });
    this.rh.listarFuncoesAtivas().subscribe({ next: (r) => this.funcoes.set(r.content), error: () => undefined });
    this.rh.listarPerfisAcessoAtivos().subscribe({ next: (r) => this.perfis.set(r), error: () => undefined });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      nomeCompleto: query || undefined,
      cpf: filters.cpf?.replace(/\D/g, '') || undefined,
      idBaseOperacional: filters.idBaseOperacional,
      idProcesso: filters.idProcesso,
      idFuncao: filters.idFuncao,
      ativo: filters.ativo,
      dataContratacao: filters.contratacao.from ?? undefined,
      dataContratacaoFim: filters.contratacao.to ?? undefined
    };
  }

  private nome(itens: readonly { id: string; nome: string }[], id: string): string {
    return itens.find((i) => i.id === id)?.nome ?? 'selecionado';
  }

  protected cpfOuNulo(valor: string): string | null {
    return formatarCpf(valor) || null;
  }

  protected contratacao(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.contratacao.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected dataBr(iso: string | undefined): string {
    const d = dataLocal(iso);
    return d ? d.toLocaleDateString('pt-BR') : '—';
  }

  private criaAcesso(): boolean {
    return this.acesso() === 'NOVO' && !this.emEdicao()?.idUsuario;
  }

  private vinculaUsuarioExistente(): boolean {
    return this.acesso() === 'EXISTENTE' && !this.emEdicao()?.idUsuario;
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(c: ColaboradorResponse): void {
    this.preencher(c);
    this.formularioAberto.set(true);
  }

  private preencher(c: ColaboradorResponse | null): void {
    this.emEdicao.set(c);
    this.abaColaborador.set('cadastro');
    this.primeiroNome.set(c?.primeiroNome ?? '');
    this.ultimoNome.set(c?.ultimoNome ?? '');
    this.nomeCompleto.set(c?.nomeCompleto ?? '');
    this.cpf.set(formatarCpf(c?.cpf));
    this.dataContratacao.set(dataLocal(c?.dataContratacao));
    this.idBase.set(c?.baseOperacional?.id ?? null);
    this.idProcesso.set(c?.processo?.id ?? null);
    this.idFuncao.set(c?.funcao?.id ?? null);
    this.ativo.set(c?.ativo ?? true);
    this.acesso.set('NENHUM');
    this.idUsuarioExistente.set(null);
    // Quem foi vinculado no cadastro anterior não pode continuar na lista de usuários livres.
    this.usuariosSemColaborador.reset();
    this.carregarUsuarioVinculado(c?.idUsuario);
    this.login.set('');
    this.senha.set('');
    this.idPerfil.set(null);
    this.tipo.set('CAMPO');
    this.tentouSalvar.set(false);
  }

  private carregarUsuarioVinculado(idUsuario: string | undefined): void {
    // Cancela a consulta do colaborador aberto antes, para não mostrar o usuário de outra pessoa.
    this.carregamentoUsuarioVinculado?.unsubscribe();
    this.usuarioVinculado.dados.set(null);
    this.usuarioVinculado.error.set(undefined);
    this.usuarioVinculado.loading.set(!!idUsuario);
    if (!idUsuario) return;
    this.carregamentoUsuarioVinculado = this.usuarios.buscarUsuarioPorId(idUsuario).subscribe({
      next: (u) => {
        this.usuarioVinculado.dados.set(u);
        this.usuarioVinculado.loading.set(false);
      },
      error: () => {
        this.usuarioVinculado.error.set('Não foi possível carregar o usuário vinculado.');
        this.usuarioVinculado.loading.set(false);
      }
    });
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const ativo = this.ativo();
    const criaAcesso = this.criaAcesso();
    const idUsuarioExistente = this.vinculaUsuarioExistente() ? this.idUsuarioExistente() : null;
    const request: ColaboradorRequest = {
      primeiroNome: this.primeiroNome().trim(),
      ultimoNome: this.ultimoNome().trim(),
      nomeCompleto: this.nomeCompleto().trim(),
      cpf: this.cpf().replace(/\D/g, ''),
      dataContratacao: dataIso(this.dataContratacao())!,
      idProcesso: this.idProcesso()!,
      idBaseOperacional: this.idBase()!,
      idFuncao: this.idFuncao()!
    };
    this.salvando.set(true);
    const salvar$: Observable<ColaboradorResponse | null> = atual
      ? this.rh.atualizarColaborador(atual.id, request).pipe(
          switchMap((r) =>
            r && r.ativo !== ativo
              ? (ativo ? this.rh.ativarColaborador(atual.id) : this.rh.desativarColaborador(atual.id)).pipe(switchMap(() => of(r)))
              : of(r)
          )
        )
      : this.rh.criarColaborador(request);
    salvar$.subscribe({
      next: (salvo) => {
        // `null` = gravação enfileirada offline; o acesso só pode ser gerado com o colaborador no servidor.
        if (criaAcesso && salvo) {
          this.rh
            .gerarAcesso({ colaboradorId: salvo.id, usuario: { login: this.login().toUpperCase(), senha: this.senha(), idPerfil: this.idPerfil()!, tipo: this.tipo() } })
            .subscribe({
              next: () => this.confirmarAcesso(salvo.id, undefined, atual ? 'Colaborador atualizado e acesso gerado.' : 'Colaborador cadastrado e acesso gerado.'),
              error: (e) => {
                this.concluir(null);
                this.notificacoes.warning(`Colaborador salvo, mas o acesso não foi gerado: ${getErrorMessage(e)}`);
              }
            });
          return;
        }
        if (idUsuarioExistente && salvo) {
          this.usuarios.vincularColaborador(idUsuarioExistente, salvo.id).subscribe({
            next: () => this.confirmarAcesso(salvo.id, idUsuarioExistente, atual ? 'Colaborador atualizado e vinculado ao usuário.' : 'Colaborador cadastrado e vinculado ao usuário.'),
            error: (e) => {
              this.concluir(null);
              this.notificacoes.warning(`Colaborador salvo, mas o usuário não foi vinculado: ${getErrorMessage(e)}`);
            }
          });
          return;
        }
        this.concluir(atual ? 'Colaborador atualizado.' : 'Colaborador cadastrado.');
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private confirmarAcesso(idColaborador: string, idUsuario: string | undefined, mensagem: string): void {
    this.rh.aguardarAcessoColaborador(idColaborador, idUsuario).subscribe((confirmado) => {
      this.concluir(confirmado ? mensagem : null);
      if (!confirmado) this.notificacoes.warning('Colaborador salvo, mas o acesso ainda não foi confirmado. Confira a lista em instantes.');
    });
  }

  private concluir(mensagem: string | null): void {
    this.salvando.set(false);
    this.formularioAberto.set(false);
    if (mensagem) this.notificacoes.success(mensagem);
    this.lista.reload();
  }

  protected async alternar(c: ColaboradorResponse): Promise<void> {
    const desativar = c.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar colaborador' : 'Ativar colaborador',
      message: desativar ? `${c.nomeCompleto} deixa de aparecer nas seleções. O histórico é mantido.` : `${c.nomeCompleto} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.rh.desativarColaborador(c.id) : this.rh.ativarColaborador(c.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Colaborador desativado.' : 'Colaborador ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(c: ColaboradorResponse): void {
    this.auditoria().show(c.id, c.nomeCompleto, {
      primeiroNome: 'Primeiro nome',
      ultimoNome: 'Último nome',
      nomeCompleto: 'Nome completo',
      cpf: 'CPF',
      dataContratacao: 'Data de contratação',
      dataDesativacao: 'Data de desativação',
      ativo: 'Status (ativo)',
      baseOperacional: 'Base operacional',
      processo: 'Processo de negócio',
      funcao: 'Função',
      idUsuario: 'Vínculo de usuário'
    });
  }
}

function opcoes(itens: readonly { id: string; nome: string }[], valor: 'id' | 'nome'): GeoSelectOption<string>[] {
  return itens.map((i) => ({ label: i.nome, value: i[valor] }));
}
