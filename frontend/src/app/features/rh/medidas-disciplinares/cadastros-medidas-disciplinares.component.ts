import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CesBooleanControlComponent,
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesPageHeaderComponent,
  CesRowActionsDirective,
  CesStatusComponent,
  CesSurfaceComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { MotivoMedidaDisciplinar, ParametrosRh, TipoMedidaDisciplinar } from '../../../core/models/rh-medida-disciplinar.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';

/** Cada cadastro das medidas disciplinares tem a sua rota, como os cadastros da frota. */
export type SecaoCadastroMedida = 'tipos' | 'motivos' | 'parametros';
type Estado = 'loading' | 'error' | 'ready' | 'empty';

const SECOES: Record<SecaoCadastroMedida, { titulo: string; icone: string; descricao: string }> = {
  tipos: { titulo: 'Tipos de medida disciplinar', icone: 'pi pi-tag', descricao: 'Orientação, advertência, suspensão e desligamento: a gravidade e se exige período.' },
  motivos: { titulo: 'Motivos de medida disciplinar', icone: 'pi pi-list', descricao: 'Trânsito, segurança, conduta, assiduidade e outros. A reincidência compara medidas do mesmo motivo.' },
  parametros: { titulo: 'Parâmetros das medidas', icone: 'pi pi-sliders-h', descricao: 'Janela de reincidência e prazo de imediatidade.' }
};

/**
 * Cadastros das medidas disciplinares: tipos (gravidade e suspensão), motivos e os parâmetros de
 * reincidência e imediatidade. Desativar não apaga as medidas
 * já lançadas.
 */
@Component({
  selector: 'app-cadastros-medidas-disciplinares',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesBooleanControlComponent,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesPageHeaderComponent,
    CesRowActionsDirective,
    CesStatusComponent,
    CesSurfaceComponent,
    CesTextInputComponent
  ],
  styles: `
    .parametros { display: grid; gap: 1rem; max-width: 42rem; }
  `,
  template: `
    <div class="ces-page">
      <ces-page-header [title]="info.titulo" [icon]="info.icone" [description]="info.descricao"
        [breadcrumb]="[{ label: 'Departamento Pessoal' }, { label: 'Cadastros' }, { label: info.titulo }]"></ces-page-header>

      @switch (secao) {
        @case ('tipos') {
          <ces-data-table title="Tipos de medida" description="Ordenados por gravidade. A gravidade indica o tipo sugerido na reincidência."
            storageKey="rh-tipos-medida" exportFileName="tipos-medida-disciplinar" searchPlaceholder="Filtrar nesta lista"
            [columns]="colunasTipo" [rows]="tipos()" [rowKey]="chaveTipo" [state]="estadoTipos()"
            [stateTitle]="erroTipos() ? 'Não foi possível carregar os tipos' : 'Nenhum tipo cadastrado'" [stateDescription]="erroTipos() ?? undefined"
            [rowClickable]="podeEditar()" (rowActivate)="abrirTipo($event)">
            <ng-container table-actions>
              @if (podeEditar()) { <ces-button size="sm" icon="pi pi-plus" label="Novo tipo" (pressed)="abrirTipo(null)"></ces-button> }
            </ng-container>
            <ng-template cesCell="nome" let-row>
              <span class="ces-cell-strong">{{ row.nome }}</span>
              @if (row.exigePeriodo) { <span class="ces-cell-muted">Exige dias e período</span> }
            </ng-template>
            <ng-template cesCell="gravidade" let-row>{{ row.gravidade }} de 5</ng-template>
            <ng-template cesCell="ativo" let-row>
              <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
            </ng-template>
            <ng-template cesRowActions let-row>
              @if (podeEditar()) {
                <span class="ces-table-actions">
                  <ces-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar" size="icon-sm" (pressed)="abrirTipo(row)"></ces-icon-button>
                  <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                    [tooltip]="row.ativo ? 'Desativar' : 'Reativar'" size="icon-sm" (pressed)="alternarTipo(row)"></ces-icon-button>
                </span>
              }
            </ng-template>
          </ces-data-table>
        }

        @case ('motivos') {
          <ces-data-table title="Motivos" description="A reincidência compara medidas do mesmo motivo."
            storageKey="rh-motivos-medida" exportFileName="motivos-medida-disciplinar" searchPlaceholder="Filtrar nesta lista"
            [columns]="colunasMotivo" [rows]="motivos()" [rowKey]="chaveMotivo" [state]="estadoMotivos()"
            [stateTitle]="erroMotivos() ? 'Não foi possível carregar os motivos' : 'Nenhum motivo cadastrado'" [stateDescription]="erroMotivos() ?? undefined"
            [rowClickable]="podeEditar()" (rowActivate)="abrirMotivo($event)">
            <ng-container table-actions>
              @if (podeEditar()) { <ces-button size="sm" icon="pi pi-plus" label="Novo motivo" (pressed)="abrirMotivo(null)"></ces-button> }
            </ng-container>
            <ng-template cesCell="nome" let-row><span class="ces-cell-strong">{{ row.nome }}</span></ng-template>
            <ng-template cesCell="ativo" let-row>
              <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
            </ng-template>
            <ng-template cesRowActions let-row>
              @if (podeEditar()) {
                <span class="ces-table-actions">
                  <ces-icon-button icon="pi pi-pencil" [label]="'Renomear ' + row.nome" tooltip="Renomear" size="icon-sm" (pressed)="abrirMotivo(row)"></ces-icon-button>
                  <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                    [tooltip]="row.ativo ? 'Desativar' : 'Reativar'" size="icon-sm" (pressed)="alternarMotivo(row)"></ces-icon-button>
                </span>
              }
            </ng-template>
          </ces-data-table>
        }

        @case ('parametros') {
          <ces-surface>
          <div class="parametros">
            <ces-form-section title="Prazos" icon="pi pi-clock">
              <ces-number-input label="Janela de reincidência (meses)" [(value)]="janela" [min]="1" [max]="60" [readonly]="!podeEditar()"
                description="Medidas do mesmo motivo dentro desta janela aparecem como reincidência."></ces-number-input>
              <ces-number-input label="Prazo de imediatidade (dias)" [(value)]="imediatidade" [min]="1" [max]="365" [readonly]="!podeEditar()"
                description="Acima disto entre o fato e a aplicação, o formulário avisa do risco de perdão tácito."></ces-number-input>
            </ces-form-section>
            @if (podeEditar()) {
              <div class="ces-actions-row">
                <ces-button icon="pi pi-check" label="Salvar parâmetros" [loading]="salvando()" (pressed)="salvarParametros()"></ces-button>
              </div>
            }
          </div>
          </ces-surface>
        }
      }
    </div>

    <ces-form-drawer [(visible)]="tipoAberto" [title]="tipoEmEdicao() ? 'Editar tipo de medida' : 'Novo tipo de medida'" [description]="tipoEmEdicao()?.nome"
      [loading]="salvando()" size="sm">
      <ces-form-section title="Tipo" icon="pi pi-tag">
        <div class="ces-form-grid">
          <ces-text-input label="Nome" [required]="true" [(value)]="nomeTipo" [maxlength]="80" placeholder="Ex.: Advertência escrita"
            [error]="tentou() && !nomeTipo().trim() ? 'Informe o nome.' : undefined"></ces-text-input>
          <ces-number-input label="Gravidade" [required]="true" [(value)]="gravidade" [min]="1" [max]="5" description="1 (mais leve) a 5 (mais grave)."
            [error]="tentou() && !gravidadeValida() ? 'De 1 a 5.' : undefined"></ces-number-input>
        </div>
        <ces-boolean-control kind="toggle" label="Exige dias e período (suspensão)" [(value)]="exigePeriodo"></ces-boolean-control>
      </ces-form-section>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="tipoAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="tipoEmEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvarTipo()"></ces-button>
      </div>
    </ces-form-drawer>

    <ces-form-drawer [(visible)]="motivoAberto" [title]="motivoEmEdicao() ? 'Renomear motivo' : 'Novo motivo'" [description]="motivoEmEdicao()?.nome"
      [loading]="salvando()" size="sm">
      <ces-text-input label="Nome" [required]="true" [(value)]="nomeMotivo" [maxlength]="80" placeholder="Ex.: Trânsito"
        [error]="tentou() && !nomeMotivo().trim() ? 'Informe o nome.' : undefined"></ces-text-input>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="motivoAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="motivoEmEdicao() ? 'Salvar' : 'Cadastrar motivo'" [loading]="salvando()" (pressed)="salvarMotivo()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class CadastrosMedidasDisciplinaresComponent {
  private readonly servico = inject(RhMedidaDisciplinarService);
  private readonly notificacoes = inject(NotificationService);
  private readonly auth = inject(AuthService);

  protected readonly podeEditar = computed(() => this.auth.currentUser()?.permissoes?.includes('rh:medida-disciplinar:write') ?? false);
  /** Qual cadastro esta rota mostra (`data.secao`). */
  protected readonly secao: SecaoCadastroMedida = (inject(ActivatedRoute).snapshot.data['secao'] as SecaoCadastroMedida) ?? 'tipos';
  protected readonly info = SECOES[this.secao];

  protected readonly tipos = signal<TipoMedidaDisciplinar[]>([]);
  protected readonly motivos = signal<MotivoMedidaDisciplinar[]>([]);
  private readonly carregandoTipos = signal(true);
  private readonly carregandoMotivos = signal(true);
  protected readonly erroTipos = signal<string | null>(null);
  protected readonly erroMotivos = signal<string | null>(null);
  protected readonly estadoTipos = computed<Estado>(() => this.estado(this.carregandoTipos(), this.erroTipos(), this.tipos().length));
  protected readonly estadoMotivos = computed<Estado>(() => this.estado(this.carregandoMotivos(), this.erroMotivos(), this.motivos().length));

  protected readonly tipoAberto = signal(false);
  protected readonly tipoEmEdicao = signal<TipoMedidaDisciplinar | null>(null);
  protected readonly nomeTipo = signal('');
  protected readonly gravidade = signal<number | null>(1);
  protected readonly exigePeriodo = signal(false);
  protected readonly gravidadeValida = computed(() => { const g = this.gravidade(); return g !== null && g >= 1 && g <= 5; });

  protected readonly motivoAberto = signal(false);
  protected readonly motivoEmEdicao = signal<MotivoMedidaDisciplinar | null>(null);
  protected readonly nomeMotivo = signal('');

  protected readonly janela = signal<number | null>(12);
  protected readonly imediatidade = signal<number | null>(30);

  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  protected readonly colunasTipo: CesDataTableColumn<TipoMedidaDisciplinar>[] = [
    { key: 'nome', header: 'Tipo', type: 'custom', priority: 1, value: (t) => t.nome, display: (t) => t.nome },
    { key: 'gravidade', header: 'Gravidade', type: 'custom', priority: 1, value: (t) => t.gravidade, display: (t) => `${t.gravidade} de 5` },
    { key: 'ativo', header: 'Situação', type: 'custom', priority: 1, value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly colunasMotivo: CesDataTableColumn<MotivoMedidaDisciplinar>[] = [
    { key: 'nome', header: 'Motivo', type: 'custom', priority: 1, value: (m) => m.nome, display: (m) => m.nome },
    { key: 'ativo', header: 'Situação', type: 'custom', priority: 1, value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chaveTipo = (t: TipoMedidaDisciplinar) => t.id;
  protected readonly chaveMotivo = (m: MotivoMedidaDisciplinar) => m.id;

  constructor() {
    if (this.secao === 'tipos') {
      this.carregarTipos();
    } else if (this.secao === 'motivos') {
      this.carregarMotivos();
    } else {
      this.servico.parametros().subscribe({ next: (p) => this.aplicarParametros(p), error: (e) => this.notificacoes.error(getErrorMessage(e)) });
    }
  }

  protected abrirTipo(t: TipoMedidaDisciplinar | null): void {
    if (!this.podeEditar()) return;
    this.tentou.set(false);
    this.tipoEmEdicao.set(t);
    this.nomeTipo.set(t?.nome ?? '');
    this.gravidade.set(t?.gravidade ?? 1);
    this.exigePeriodo.set(t?.exigePeriodo ?? false);
    this.tipoAberto.set(true);
  }

  protected salvarTipo(): void {
    this.tentou.set(true);
    if (!this.nomeTipo().trim() || !this.gravidadeValida()) return;
    this.salvando.set(true);
    this.servico.salvarTipo({ nome: this.nomeTipo().trim(), gravidade: this.gravidade()!, exigePeriodo: this.exigePeriodo() },
      this.tipoEmEdicao()?.id).subscribe({
      next: () => {
        this.salvando.set(false);
        this.tipoAberto.set(false);
        this.notificacoes.success('Tipo de medida salvo.');
        this.carregarTipos();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected alternarTipo(t: TipoMedidaDisciplinar): void {
    this.servico.alternarTipo(t).subscribe({
      next: () => {
        this.notificacoes.success(t.ativo ? `${t.nome} desativado.` : `${t.nome} reativado.`);
        this.carregarTipos();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirMotivo(m: MotivoMedidaDisciplinar | null): void {
    if (!this.podeEditar()) return;
    this.tentou.set(false);
    this.motivoEmEdicao.set(m);
    this.nomeMotivo.set(m?.nome ?? '');
    this.motivoAberto.set(true);
  }

  protected salvarMotivo(): void {
    this.tentou.set(true);
    if (!this.nomeMotivo().trim()) return;
    this.salvando.set(true);
    this.servico.salvarMotivo(this.nomeMotivo().trim(), this.motivoEmEdicao()?.id).subscribe({
      next: () => {
        this.salvando.set(false);
        this.motivoAberto.set(false);
        this.notificacoes.success('Motivo salvo.');
        this.carregarMotivos();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected alternarMotivo(m: MotivoMedidaDisciplinar): void {
    this.servico.alternarMotivo(m).subscribe({
      next: () => {
        this.notificacoes.success(m.ativo ? `${m.nome} desativado.` : `${m.nome} reativado.`);
        this.carregarMotivos();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected salvarParametros(): void {
    const [janela, imediatidade] = [this.janela(), this.imediatidade()];
    if (!janela || !imediatidade) {
      this.notificacoes.warning('Preencha todos os parâmetros.');
      return;
    }
    this.salvando.set(true);
    this.servico.salvarParametros({ janelaReincidenciaMeses: janela, diasImediatidade: imediatidade })
      .subscribe({
        next: (p) => {
          this.salvando.set(false);
          this.aplicarParametros(p);
          this.notificacoes.success('Parâmetros salvos.');
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  private aplicarParametros(p: ParametrosRh): void {
    this.janela.set(p.janelaReincidenciaMeses);
    this.imediatidade.set(p.diasImediatidade);
  }

  private carregarTipos(): void {
    this.carregandoTipos.set(true);
    this.servico.tipos(false).subscribe({
      next: (t) => { this.tipos.set(t); this.erroTipos.set(null); this.carregandoTipos.set(false); },
      error: (e) => { this.erroTipos.set(getErrorMessage(e)); this.carregandoTipos.set(false); }
    });
  }

  private carregarMotivos(): void {
    this.carregandoMotivos.set(true);
    this.servico.motivos(false).subscribe({
      next: (m) => { this.motivos.set(m); this.erroMotivos.set(null); this.carregandoMotivos.set(false); },
      error: (e) => { this.erroMotivos.set(getErrorMessage(e)); this.carregandoMotivos.set(false); }
    });
  }

  private estado(carregando: boolean, erro: string | null, quantidade: number): Estado {
    return carregando ? 'loading' : erro ? 'error' : quantidade ? 'ready' : 'empty';
  }
}
