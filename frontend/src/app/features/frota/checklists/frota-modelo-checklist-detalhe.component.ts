import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoBreadcrumbItem,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoStatusComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService,
  geoUrlParam
} from '@geo/ui';
import { FotoRecebimentoChecklist, ModeloChecklist, PerguntaChecklist, ROTULO_MODO_FOTO } from '../../../core/models/frota-checklist.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaModeloChecklistFormComponent } from './frota-modelo-checklist-form.component';
import { gruposDe, inserirNoGrupo, linhas, modoFoto, perguntaNova, requestDe, resumoResposta } from './frota-modelo-checklist.util';
import { FrotaPerguntaChecklistFormComponent } from './frota-pergunta-checklist-form.component';

type LinhaPergunta = PerguntaChecklist & { indice: number };
type LinhaFoto = FotoRecebimentoChecklist & { indice: number };
const ABAS = ['perguntas', 'fotos'] as const;
type Aba = (typeof ABAS)[number];

const SUGESTAO_FOTOS = ['Frente', 'Traseira', 'Lateral esquerda', 'Lateral direita', 'Painel'];

/**
 * Página do modelo de checklist, no padrão das páginas de detalhe da frota: cabeçalho com
 * situação e ações, e as perguntas e fotos de recebimento em tabelas, cada uma editada no seu drawer.
 */
@Component({
  selector: 'app-frota-modelo-checklist-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoStatusComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    FrotaModeloChecklistFormComponent,
    FrotaPerguntaChecklistFormComponent
  ],
  template: `
    <div class="geo-page">
      @if (carregando() && !modelo()) {
        <geo-async-state state="loading" title="Carregando o modelo de checklist"></geo-async-state>
      } @else if (erro()) {
        <geo-async-state state="error" title="Não foi possível carregar o modelo" [description]="erro()!"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
      } @else if (modelo(); as m) {
        <geo-page-header [title]="m.nome" icon="pi pi-list-check" [breadcrumb]="trilha(m)" [description]="descricao(m)">
          <ng-container status>
            <geo-status [tone]="m.ativo ? 'success' : 'neutral'" [emphasis]="m.ativo ? 'soft' : 'outline'">{{ m.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
            <geo-status tone="info" emphasis="outline">{{ m.tipoRotulo }}</geo-status>
            @if (m.exigeAssinatura) {
              <geo-status tone="neutral" emphasis="outline" icon="pi-user-edit">Pede confirmação</geo-status>
            }
          </ng-container>
          <ng-container actions>
            @if (podeEditar()) {
              <geo-button variant="outline" icon="pi pi-pencil" label="Editar dados" (pressed)="dadosAbertos.set(true)"></geo-button>
              <geo-button variant="ghost" [icon]="m.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="m.ativo ? 'Desativar' : 'Reativar'"
                (pressed)="alternar(m)"></geo-button>
            }
          </ng-container>
        </geo-page-header>

        @if (!m.ativo) {
          <geo-callout tone="warning" [dense]="true">Modelo desativado: o app não oferece este checklist. Reative para voltar a usar.</geo-callout>
        }
        @if (m.instrucoes) {
          <geo-callout tone="info" [dense]="true" title="Instruções ao condutor">{{ m.instrucoes }}</geo-callout>
        }

        <geo-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções do modelo de checklist">
          <ng-template geoTabPanel="perguntas">
            <geo-data-table title="Perguntas" description="Na ordem em que aparecem no app. Clique numa pergunta para editar."
              storageKey="frota-checklist-perguntas" searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasPerguntas" [rows]="linhasPerguntas()" [rowKey]="chave" [state]="m.perguntas.length ? 'ready' : 'empty'"
              stateTitle="Nenhuma pergunta" stateDescription="Adicione o que o condutor deve conferir antes de usar o veículo."
              [rowClickable]="podeEditar()" (rowActivate)="editarPergunta($event)">
              <ng-container table-actions>
                @if (podeEditar()) {
                  <geo-button size="sm" variant="outline" icon="pi pi-clone" label="Colar várias" (pressed)="abrirColar()"></geo-button>
                  <geo-button size="sm" icon="pi pi-plus" label="Adicionar pergunta" (pressed)="novaPergunta()"></geo-button>
                }
              </ng-container>
              <ng-template geoCell="texto" let-row>
                <span class="geo-cell-strong">{{ row.texto }}</span>
              </ng-template>
              <ng-template geoCell="grupo" let-row>
                @if (row.grupo) {
                  {{ row.grupo }}
                } @else {
                  <span class="geo-cell-muted">Sem grupo</span>
                }
              </ng-template>
              <ng-template geoCell="foto" let-row>
                @if (modoFoto(row) !== 'NUNCA') {
                  <geo-status [tone]="modoFoto(row) === 'SEMPRE' ? 'brand' : 'info'" icon="pi-camera">{{ rotuloModoFoto[modoFoto(row)] }}</geo-status>
                } @else {
                  <span class="geo-cell-muted">—</span>
                }
              </ng-template>
              <ng-template geoRowActions let-row>
                @if (podeEditar()) {
                  <span class="geo-table-actions">
                    <geo-icon-button icon="pi pi-arrow-up" [label]="'Subir ' + row.texto" tooltip="Subir" size="icon-sm"
                      [disabled]="row.indice === 0 || salvando()" (pressed)="moverPergunta(row.indice, -1)"></geo-icon-button>
                    <geo-icon-button icon="pi pi-arrow-down" [label]="'Descer ' + row.texto" tooltip="Descer" size="icon-sm"
                      [disabled]="row.indice === m.perguntas.length - 1 || salvando()" (pressed)="moverPergunta(row.indice, 1)"></geo-icon-button>
                    <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + row.texto" tooltip="Remover" size="icon-sm"
                      [disabled]="salvando()" (pressed)="removerPergunta(row)"></geo-icon-button>
                  </span>
                }
              </ng-template>
            </geo-data-table>
          </ng-template>

          <ng-template geoTabPanel="fotos">
            <geo-data-table title="Fotos de recebimento"
              description="Pedidas quando o condutor recebe o veículo de outra pessoa. O app não deixa pular."
              storageKey="frota-checklist-fotos" [columns]="colunasFotos" [rows]="linhasFotos()" [rowKey]="chaveFoto"
              [state]="m.fotosRecebimento.length ? 'ready' : 'empty'" stateTitle="Nenhuma foto de recebimento"
              stateDescription="Sugestão: frente, traseira, as duas laterais e o painel."
              [rowClickable]="podeEditar()" (rowActivate)="editarFoto($event)">
              <ng-container table-actions>
                @if (podeEditar()) {
                  @if (!m.fotosRecebimento.length) {
                    <geo-button size="sm" variant="outline" icon="pi pi-images" label="Usar a sugestão" [loading]="salvando()" (pressed)="usarSugestao()"></geo-button>
                  }
                  <geo-button size="sm" icon="pi pi-plus" label="Adicionar foto" (pressed)="editarFoto(null)"></geo-button>
                }
              </ng-container>
              <ng-template geoRowActions let-row>
                @if (podeEditar()) {
                  <span class="geo-table-actions">
                    <geo-icon-button icon="pi pi-trash" [label]="'Remover ' + row.descricao" tooltip="Remover" size="icon-sm"
                      [disabled]="salvando()" (pressed)="removerFoto(row)"></geo-icon-button>
                  </span>
                }
              </ng-template>
            </geo-data-table>
          </ng-template>
        </geo-tabs>

        <app-frota-modelo-checklist-form [(visible)]="dadosAbertos" [modelo]="m" (salvo)="modelo.set($event)"></app-frota-modelo-checklist-form>

        <app-frota-pergunta-checklist-form [(visible)]="perguntaAberta" [pergunta]="perguntaEmEdicao()" [grupos]="grupos()"
          [salvando]="salvando()" (confirmado)="salvarPergunta($event)"></app-frota-pergunta-checklist-form>

        <geo-form-drawer [(visible)]="colarAberto" title="Colar várias perguntas"
          description="Uma por linha. Entram como OK / Não OK no fim da lista; depois você ajusta cada uma." [dirty]="!!textoColado().trim()"
          [loading]="salvando()" size="sm">
          <div class="geo-form-stack">
            <geo-text-input label="Grupo" [(value)]="grupoColado" [maxlength]="80" [showOptional]="true" placeholder="Ex.: Iluminação"></geo-text-input>
            <geo-textarea label="Perguntas" [required]="true" [(value)]="textoColado" [rows]="10" placeholder="Faróis&#10;Lanternas&#10;Setas"></geo-textarea>
          </div>
          <div drawer-footer class="geo-actions-row">
            <geo-button variant="ghost" label="Cancelar" (pressed)="colarAberto.set(false)"></geo-button>
            <geo-button icon="pi pi-check" [label]="'Adicionar ' + linhas(textoColado()).length" [disabled]="!linhas(textoColado()).length"
              [loading]="salvando()" (pressed)="colar()"></geo-button>
          </div>
        </geo-form-drawer>

        <geo-form-drawer [(visible)]="fotoAberta" [title]="fotoEmEdicao() ? 'Editar foto de recebimento' : 'Nova foto de recebimento'"
          [dirty]="descricaoFoto().trim() !== (fotoEmEdicao()?.descricao ?? '')" [loading]="salvando()" size="sm">
          <div class="geo-form-stack">
            <geo-text-input label="O que fotografar" [required]="true" [(value)]="descricaoFoto" [maxlength]="120" placeholder="Ex.: Lateral esquerda"
              description="Aparece como instrução no app." [error]="tentouFoto() && !descricaoFoto().trim() ? 'Descreva a foto.' : undefined"></geo-text-input>
          </div>
          <div drawer-footer class="geo-actions-row">
            <geo-button variant="ghost" label="Cancelar" (pressed)="fotoAberta.set(false)"></geo-button>
            <geo-button icon="pi pi-check" label="Salvar foto" [loading]="salvando()" (pressed)="salvarFoto()"></geo-button>
          </div>
        </geo-form-drawer>
      }
    </div>
  `
})
export class FrotaModeloChecklistDetalheComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;

  protected readonly podeEditar = acessoFrota().configurarChecklist;
  protected readonly linhas = linhas;
  protected readonly aba = geoUrlParam<Aba>({ values: ABAS, default: 'perguntas' });

  protected readonly modelo = signal<ModeloChecklist | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly dadosAbertos = signal(false);
  protected readonly perguntaAberta = signal(false);
  protected readonly perguntaEmEdicao = signal<PerguntaChecklist | null>(null);
  private indiceEmEdicao: number | null = null;
  protected readonly colarAberto = signal(false);
  protected readonly textoColado = signal('');
  protected readonly grupoColado = signal('');
  protected readonly fotoAberta = signal(false);
  protected readonly fotoEmEdicao = signal<LinhaFoto | null>(null);
  protected readonly descricaoFoto = signal('');
  protected readonly tentouFoto = signal(false);

  protected readonly grupos = computed(() => gruposDe(this.modelo()?.perguntas ?? []));
  protected readonly linhasPerguntas = computed<LinhaPergunta[]>(() => (this.modelo()?.perguntas ?? []).map((p, indice) => ({ ...p, indice })));
  protected readonly linhasFotos = computed<LinhaFoto[]>(() => (this.modelo()?.fotosRecebimento ?? []).map((f, indice) => ({ ...f, indice })));
  protected readonly abas = computed<GeoTabItem[]>(() => {
    const m = this.modelo();
    return [
      { value: 'perguntas', label: 'Perguntas', icon: 'pi pi-check-square', badge: m?.perguntas.length || undefined },
      ...(m?.tipo === 'PRINCIPAL'
        ? [{ value: 'fotos', label: 'Fotos de recebimento', icon: 'pi pi-camera', badge: m.fotosRecebimento.length || undefined }]
        : [])
    ];
  });

  protected readonly modoFoto = modoFoto;
  protected readonly rotuloModoFoto = ROTULO_MODO_FOTO;
  protected readonly colunasPerguntas: GeoDataTableColumn<LinhaPergunta>[] = [
    { key: 'indice', header: 'Nº', type: 'number', sortable: false, width: '4rem', priority: 3, display: (p) => String(p.indice + 1) },
    { key: 'texto', header: 'Pergunta', priority: 1, sortable: false },
    { key: 'grupo', header: 'Grupo', priority: 1, sortable: false, value: (p) => p.grupo ?? '', display: (p) => p.grupo ?? 'Sem grupo' },
    { key: 'resposta', header: 'Resposta', priority: 1, sortable: false, value: (p) => resumoResposta(p), display: (p) => resumoResposta(p) },
    { key: 'foto', header: 'Foto', type: 'custom', sortable: false, value: (p) => modoFoto(p),
      display: (p) => (modoFoto(p) === 'NUNCA' ? '' : ROTULO_MODO_FOTO[modoFoto(p)]) }
  ];
  protected readonly colunasFotos: GeoDataTableColumn<LinhaFoto>[] = [
    { key: 'indice', header: 'Nº', type: 'number', sortable: false, width: '4rem', priority: 3, display: (f) => String(f.indice + 1) },
    { key: 'descricao', header: 'O que fotografar', priority: 1, sortable: false }
  ];
  protected readonly chave = (p: LinhaPergunta) => p.id ?? `nova-${p.indice}`;
  protected readonly chaveFoto = (f: LinhaFoto) => f.id ?? `nova-${f.indice}`;

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.checklist.modelo(this.id).subscribe({
      next: (m) => {
        this.modelo.set(m);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected trilha(m: ModeloChecklist): GeoBreadcrumbItem[] {
    return [
      { label: 'Frota' },
      { label: 'Modelos de checklist', route: '/frota/cadastros/modelos-checklist' },
      { label: m.nome }
    ];
  }

  protected descricao(m: ModeloChecklist): string {
    const aplicacao = m.tipo === 'ADICIONAL'
      ? 'Quando acoplado: ' + m.tiposImplemento.map((t) => t.rotulo).join(', ')
      : m.tiposVeiculo.length ? 'Veículos: ' + m.tiposVeiculo.map((t) => t.rotulo).join(', ') : 'Todos os veículos sem modelo próprio';
    return `${aplicacao} · ${m.perguntas.length} ${m.perguntas.length === 1 ? 'pergunta' : 'perguntas'}`;
  }

  // ── Perguntas ────────────────────────────────────────────────────────────
  protected novaPergunta(): void {
    this.indiceEmEdicao = null;
    this.perguntaEmEdicao.set(null);
    this.perguntaAberta.set(true);
  }

  protected editarPergunta(p: LinhaPergunta): void {
    if (!this.podeEditar()) return;
    this.indiceEmEdicao = p.indice;
    const { indice: _, ...pergunta } = p;
    this.perguntaEmEdicao.set(pergunta);
    this.perguntaAberta.set(true);
  }

  protected salvarPergunta(p: PerguntaChecklist): void {
    const atuais = this.modelo()!.perguntas;
    const indice = this.indiceEmEdicao;
    const perguntas = indice === null ? inserirNoGrupo(atuais, p) : atuais.map((x, i) => (i === indice ? p : x));
    this.gravar(perguntas, undefined, indice === null ? `Pergunta ${p.texto} adicionada.` : 'Pergunta salva.', () => this.perguntaAberta.set(false));
  }

  protected moverPergunta(indice: number, delta: number): void {
    const perguntas = [...this.modelo()!.perguntas];
    const [p] = perguntas.splice(indice, 1);
    perguntas.splice(indice + delta, 0, p);
    this.gravar(perguntas);
  }

  protected async removerPergunta(p: LinhaPergunta): Promise<void> {
    if (this.modelo()!.perguntas.length === 1) {
      this.notificacoes.warning('O modelo precisa de pelo menos uma pergunta.');
      return;
    }
    const ok = await this.confirmacao.confirm({
      title: 'Remover pergunta',
      message: `${p.texto} sai do checklist. Os checklists já preenchidos continuam com a resposta.`,
      confirmLabel: 'Remover',
      variant: 'destructive'
    });
    if (!ok) return;
    this.gravar(this.modelo()!.perguntas.filter((_, i) => i !== p.indice), undefined, 'Pergunta removida.');
  }

  protected abrirColar(): void {
    this.textoColado.set('');
    this.grupoColado.set('');
    this.colarAberto.set(true);
  }

  protected colar(): void {
    const grupo = this.grupoColado().trim() || null;
    const novas = linhas(this.textoColado()).map((t) => perguntaNova(t.slice(0, 300), grupo));
    const perguntas = novas.reduce((lista, p) => inserirNoGrupo(lista, p), this.modelo()!.perguntas);
    this.gravar(perguntas, undefined, `${novas.length} ${novas.length === 1 ? 'pergunta adicionada' : 'perguntas adicionadas'}.`,
      () => this.colarAberto.set(false));
  }

  // ── Fotos de recebimento ─────────────────────────────────────────────────
  protected editarFoto(f: LinhaFoto | null): void {
    if (!this.podeEditar()) return;
    this.fotoEmEdicao.set(f);
    this.descricaoFoto.set(f?.descricao ?? '');
    this.tentouFoto.set(false);
    this.fotoAberta.set(true);
  }

  protected salvarFoto(): void {
    this.tentouFoto.set(true);
    const descricao = this.descricaoFoto().trim();
    if (!descricao) return;
    const atuais = this.modelo()!.fotosRecebimento;
    const editada = this.fotoEmEdicao();
    const fotos = editada ? atuais.map((x, i) => (i === editada.indice ? { ...x, descricao } : x)) : [...atuais, { id: null, descricao }];
    this.gravar(undefined, fotos, 'Foto de recebimento salva.', () => this.fotoAberta.set(false));
  }

  protected usarSugestao(): void {
    this.gravar(undefined, SUGESTAO_FOTOS.map((descricao) => ({ id: null, descricao })), 'Fotos de recebimento incluídas.');
  }

  protected async removerFoto(f: LinhaFoto): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Remover foto de recebimento',
      message: `${f.descricao} deixa de ser pedida na troca de condutor.`,
      confirmLabel: 'Remover',
      variant: 'destructive'
    });
    if (!ok) return;
    this.gravar(undefined, this.modelo()!.fotosRecebimento.filter((_, i) => i !== f.indice), 'Foto removida.');
  }

  protected async alternar(m: ModeloChecklist): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: m.ativo ? 'Desativar modelo' : 'Reativar modelo',
      message: m.ativo
        ? `O app deixa de oferecer ${m.nome}. Os checklists já preenchidos continuam como foram.`
        : `O app volta a oferecer ${m.nome} na próxima sincronização.`,
      confirmLabel: m.ativo ? 'Desativar' : 'Reativar',
      variant: m.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.checklist.alternarModelo(m).subscribe({
      next: () => {
        this.notificacoes.success(m.ativo ? `${m.nome} desativado.` : `${m.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  /** Cada mudança grava o modelo inteiro; o servidor mantém o histórico das perguntas que saem. */
  private gravar(perguntas?: PerguntaChecklist[], fotos?: FotoRecebimentoChecklist[], mensagem?: string, depois?: () => void): void {
    const m = this.modelo()!;
    this.salvando.set(true);
    this.checklist.salvarModelo(requestDe(m, perguntas ?? m.perguntas, fotos ?? m.fotosRecebimento), m.id).subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.modelo.set(salvo);
        depois?.();
        if (mensagem) this.notificacoes.success(mensagem);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
