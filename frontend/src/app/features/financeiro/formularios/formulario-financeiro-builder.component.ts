import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { GeoStatusComponent } from '@geo/ui';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';
import {
  CampoCanonico,
  CampoFormulario,
  CampoRequest,
  FormularioSchema,
  GrupoCampo,
  ICONE_GRUPO,
  TipoCampoFinanceiro
} from '../../../core/models/financeiro.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
import { agruparCampos, GrupoDeCampos } from '../shared/campos-financeiros';

/** Um bloco na tela do construtor: os campos em uso e os que ainda cabem nele. */
interface BlocoBuilder extends GrupoDeCampos {
  disponiveis: CampoCanonico[];
}

@Component({
  selector: 'app-formulario-financeiro-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    CommonModule,
    FormsModule,
    BreadcrumbModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    GeoStatusComponent,
    TooltipModule
  ],
  template: `
    <p-confirmdialog />

    <div class="flex flex-col gap-4 pb-28">
      <div class="flex justify-between items-center">
        <p-breadcrumb [model]="breadcrumb" />
        <p-button icon="pi pi-arrow-left" label="Voltar" [text]="true" severity="secondary"
          (onClick)="voltar()" />
      </div>

      @if (loading()) {
        <p-skeleton height="26rem" />
      } @else if (schema(); as doc) {
        <div class="form-shell max-w-4xl w-full mx-auto">
          <!-- CABEÇALHO: editado em linha, como no formulário de inspeção -->
          <div class="form-shell__header">
            <div class="flex items-center gap-2 mb-5">
              <i class="pi pi-file-edit text-primary-600 dark:text-primary-400 text-xs"></i>
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Formulário de {{ doc.tipoSolicitacao === 'COMPRA' ? 'compra' : 'pagamento' }}
              </span>
              <code class="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">{{ doc.codigo }}</code>
              @if (doc.padrao) { <geo-status [tone]="doc.tipoSolicitacao === 'COMPRA' ? 'success' : 'warning'" icon="pi-star-fill">Padrão</geo-status> }
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="field md:col-span-1">
                <label>Título</label>
                <input pInputText class="doc-input" [(ngModel)]="titulo"
                  placeholder="Ex: Solicitação de Compra" (blur)="salvarDados()" />
              </div>
              <div class="field md:col-span-2">
                <label>Descrição</label>
                <input pInputText class="doc-input" [(ngModel)]="descricao"
                  placeholder="Ex: Pedido de autorização para aquisição de material" (blur)="salvarDados()" />
              </div>
            </div>
            <label class="flex items-center gap-2 mt-4 cursor-pointer w-fit">
              <p-checkbox [binary]="true" size="small" [(ngModel)]="padrao" (onChange)="salvarDados()" />
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Sugerir esta variante por padrão
              </span>
            </label>
          </div>

          <!-- CORPO: um bloco por assunto, campos editados em linha -->
          <div class="form-shell__body flex flex-col gap-8">
            @for (bloco of blocos(); track bloco.grupo; let bi = $index) {
              <div class="flex flex-col gap-4">
                <div class="section-marker">
                  <span class="text-xs font-medium text-slate-400">{{ numero(bi + 1) }}</span>
                  <span class="text-slate-800 dark:text-slate-100 font-bold text-xs md:text-sm tracking-tight flex-grow">
                    <i [class]="icone(bloco.grupo) + ' mr-2 text-primary-600 dark:text-primary-400 text-sm'"></i>{{ bloco.rotulo }}
                  </span>
                  <span class="text-xs text-slate-400">
                    {{ bloco.campos.length }} {{ bloco.campos.length === 1 ? 'campo' : 'campos' }}
                  </span>
                </div>

                <div class="flex flex-col gap-3 md:pl-5">
                  @for (campo of bloco.campos; track campo.id; let ci = $index) {
                    <div class="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 px-4 py-4 flex flex-col gap-3">
                      <div class="flex items-start gap-3">
                        <span class="text-xs font-medium text-slate-400 mt-2.5 shrink-0">
                          {{ bi + 1 }}.{{ ci + 1 }}
                        </span>
                        <input pInputText class="doc-input flex-grow" [ngModel]="campo.rotulo"
                          (ngModelChange)="rascunhoRotulo[campo.id] = $event"
                          (blur)="salvarCampo(campo)"
                          [placeholder]="'Pergunta exibida ao usuário'" />
                        <div class="flex items-center gap-0.5 shrink-0">
                          <p-button icon="pi pi-chevron-up" [text]="true" [rounded]="true" pTooltip="Subir"
                            [disabled]="ci === 0" (onClick)="mover(bloco, ci, -1)" />
                          <p-button icon="pi pi-chevron-down" [text]="true" [rounded]="true" pTooltip="Descer"
                            [disabled]="ci === bloco.campos.length - 1" (onClick)="mover(bloco, ci, 1)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" pTooltip="Remover campo"
                            (onClick)="remover(campo)" />
                        </div>
                      </div>

                      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 md:pl-7">
                        <label class="flex items-center gap-2 h-[30px] cursor-pointer">
                          <p-checkbox [binary]="true" size="small" [ngModel]="campo.obrigatorio"
                            (onChange)="alternarObrigatorio(campo, $event.checked)" />
                          <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Obrigatória</span>
                        </label>
                        <span class="text-xs text-slate-400 dark:text-slate-400">
                          {{ descreverTipo(campo) }}
                        </span>
                        @if (campo.exibirQuando; as condicao) {
                          <span class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2 py-1">
                            <i class="pi pi-eye-slash text-[8px] mr-1"></i>
                            Só aparece se “{{ rotuloDaChave(condicao.campoChave) }}” for
                            {{ traduzir(condicao.valores) }}
                          </span>
                        }
                      </div>

                      <div class="md:pl-7">
                        <input pInputText class="doc-input" [ngModel]="campo.ajuda"
                          (ngModelChange)="rascunhoAjuda[campo.id] = $event" (blur)="salvarCampo(campo)"
                          placeholder="Texto de apoio exibido abaixo do campo (opcional)" />
                      </div>

                      @if (campo.opcoes.length) {
                        <div class="md:pl-7 flex flex-wrap gap-1">
                          @for (opcao of campo.opcoes; track opcao.valor) {
                            <span class="rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300">
                              {{ opcao.rotulo }}
                            </span>
                          }
                        </div>
                      }
                    </div>
                  } @empty {
                    <p class="text-xs text-slate-400 italic">Nenhum campo deste assunto ainda.</p>
                  }

                  @if (bloco.disponiveis.length) {
                    <div class="flex items-center gap-2">
                      <p-select [options]="bloco.disponiveis" optionLabel="rotuloPadrao" optionValue="campoCanonico"
                        [(ngModel)]="escolhaPorBloco[bloco.grupo]" placeholder="Escolha um campo para acrescentar"
                        class="doc-select flex-grow" [fluid]="true" appendTo="body" [filter]="bloco.disponiveis.length > 8"
                        filterBy="rotuloPadrao">
                        <ng-template #item let-item>
                          <div class="flex flex-col py-1">
                            <span class="text-xs font-medium text-slate-700 dark:text-slate-200">{{ item.rotuloPadrao }}</span>
                            <span class="text-xs text-slate-400 dark:text-slate-500">{{ item.chave }} · {{ nomeTipo(item.tipoCampo) }}</span>
                          </div>
                        </ng-template>
                      </p-select>
                      <p-button label="Adicionar" icon="pi pi-plus" size="small" [text]="true"
                        [disabled]="!escolhaPorBloco[bloco.grupo]" (onClick)="adicionar(bloco.grupo)" />
                    </div>
                  }
                </div>
              </div>
            }

            @if (blocos().length === 0) {
              <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <i class="pi pi-list text-2xl text-slate-300 dark:text-slate-600"></i>
                <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-3">Formulário vazio</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Comece acrescentando o campo de valor — é ele que a diretoria autoriza.
                </p>
              </div>
            }
          </div>

          <div class="px-5 md:px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 flex items-start gap-2">
            <i class="pi pi-info-circle text-primary-700 dark:text-primary-400 text-xs mt-0.5"></i>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              As alterações são salvas automaticamente. Cada campo já traz do sistema o tipo de resposta,
              as opções e quando deve aparecer — aqui você decide quais entram, em que ordem e como são
              apresentados.
            </p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Cores por token (--geo-*): claro e escuro sem regra por tema. */
    .form-shell { background: var(--geo-surface); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); overflow: hidden; }
    .form-shell__header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--geo-border); }
    .form-shell__body { padding: 1.25rem 1.5rem; }
    .section-marker { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .section-marker span { color: var(--geo-foreground); font-size: 1rem; font-weight: 600; letter-spacing: 0; text-transform: none; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field > label { color: var(--geo-foreground); font-size: var(--geo-font-label); font-weight: 500; letter-spacing: normal; text-transform: none; line-height: 1.35; }
    .doc-input { width: 100%; }
  `]
})
export class FormularioFinanceiroBuilderComponent {
  private readonly service = inject(FinanceiroService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly id = this.route.snapshot.paramMap.get('id')!;

  protected readonly schema = signal<FormularioSchema | null>(null);
  protected readonly canonicos = signal<CampoCanonico[]>([]);
  protected readonly loading = signal(true);

  protected titulo = '';
  protected descricao = '';
  protected padrao = false;
  /** Edição em linha: o valor digitado vive aqui até o blur salvar. */
  protected rascunhoRotulo: Record<string, string> = {};
  protected rascunhoAjuda: Record<string, string> = {};
  protected escolhaPorBloco: Record<string, string | null> = {};

  protected readonly breadcrumb: MenuItem[] = [
    { icon: 'pi pi-home', routerLink: '/home' },
    { label: 'Financeiro' },
    { label: 'Formulários', routerLink: '/financeiro/admin/formularios' },
    { label: 'Construtor' }
  ];

  protected readonly icone = (grupo: GrupoCampo) => ICONE_GRUPO[grupo];

  /**
   * Blocos exibidos: os que já têm campos, mais os que ainda podem receber algum.
   * Um bloco sem campos em uso e sem candidatos simplesmente não aparece.
   */
  protected readonly blocos = computed<BlocoBuilder[]>(() => {
    const doc = this.schema();
    if (!doc) return [];

    const emUso = agruparCampos(doc.campos);
    const disponiveisPorGrupo = new Map<GrupoCampo, CampoCanonico[]>();
    for (const item of this.canonicos().filter((candidato) => !candidato.jaUtilizado)) {
      const lista = disponiveisPorGrupo.get(item.grupo) ?? [];
      lista.push(item);
      disponiveisPorGrupo.set(item.grupo, lista);
    }

    const blocos: BlocoBuilder[] = emUso.map((bloco) => ({
      ...bloco,
      disponiveis: disponiveisPorGrupo.get(bloco.grupo) ?? []
    }));

    // Blocos ainda sem nenhum campo entram ao fim, para ficarem descobríveis.
    for (const [grupo, disponiveis] of disponiveisPorGrupo) {
      if (!blocos.some((bloco) => bloco.grupo === grupo)) {
        blocos.push({ grupo, rotulo: disponiveis[0].grupoRotulo, campos: [], disponiveis });
      }
    }
    return blocos;
  });

  constructor() {
    this.carregar();
  }

  protected voltar(): void {
    this.navegacao.back(['/financeiro/admin/formularios']);
  }

  protected numero(n: number): string {
    return n < 10 ? `0${n}` : String(n);
  }

  protected salvarDados(): void {
    const doc = this.schema();
    if (!doc || !this.titulo.trim()) return;
    const mudou =
      this.titulo.trim() !== doc.titulo ||
      (this.descricao.trim() || null) !== (doc.descricao ?? null) ||
      this.padrao !== doc.padrao;
    if (!mudou) return;

    this.executar(
      this.service.atualizarFormulario(this.id, {
        titulo: this.titulo.trim(),
        descricao: this.descricao.trim() || null,
        padrao: this.padrao
      })
    );
  }

  /** Salva rótulo e ajuda juntos, no blur de qualquer um dos dois. */
  protected salvarCampo(campo: CampoFormulario): void {
    const rotulo = this.rascunhoRotulo[campo.id] ?? campo.rotulo;
    const ajuda = this.rascunhoAjuda[campo.id] ?? campo.ajuda ?? '';
    if (rotulo === campo.rotulo && ajuda === (campo.ajuda ?? '')) return;

    this.enviarCampo(campo, { rotulo, ajuda, obrigatorio: campo.obrigatorio });
  }

  protected alternarObrigatorio(campo: CampoFormulario, obrigatorio: boolean): void {
    this.enviarCampo(campo, {
      rotulo: this.rascunhoRotulo[campo.id] ?? campo.rotulo,
      ajuda: this.rascunhoAjuda[campo.id] ?? campo.ajuda ?? '',
      obrigatorio
    });
  }

  protected adicionar(grupo: GrupoCampo): void {
    const escolhido = this.escolhaPorBloco[grupo];
    if (!escolhido) return;
    this.escolhaPorBloco[grupo] = null;
    this.executar(
      this.service.criarCampo(this.id, { campoCanonico: escolhido, obrigatorio: false })
    );
  }

  protected remover(campo: CampoFormulario): void {
    this.confirmation.confirm({
      header: 'Remover campo',
      message: `“${campo.rotulo}” sai deste formulário. As solicitações já registradas preservam o que foi preenchido.`,
      acceptLabel: 'Remover',
      rejectLabel: 'Voltar',
      accept: () => this.executar(this.service.removerCampo(this.id, campo.id))
    });
  }

  /**
   * Move o campo dentro do seu bloco e envia a permutação completa — os blocos
   * seguem a ordem do catálogo, então basta reenviar a lista na ordem visível.
   */
  protected mover(bloco: BlocoBuilder, indice: number, delta: number): void {
    const campos = [...bloco.campos];
    [campos[indice], campos[indice + delta]] = [campos[indice + delta], campos[indice]];

    const ordemFinal = this.blocos().flatMap((atual) =>
      atual.grupo === bloco.grupo ? campos : atual.campos
    );
    this.executar(this.service.reordenarCampos(this.id, ordemFinal.map((campo) => campo.id)));
  }

  protected rotuloDaChave(chave: string): string {
    return this.schema()?.campos.find((campo) => campo.chave === chave)?.rotulo ?? chave;
  }

  /** "true"/"false" não dizem nada a quem configura; "Sim"/"Não" dizem. */
  protected traduzir(valores: string[]): string {
    return valores
      .map((valor) => (valor === 'true' ? 'Sim' : valor === 'false' ? 'Não' : valor))
      .join(' ou ');
  }

  protected descreverTipo(campo: CampoFormulario): string {
    const partes = [this.nomeTipo(campo.tipoCampo)];
    if (campo.referencia) partes.push(campo.referencia.descricao);
    if (campo.restricoes?.tamanhoMaximo != null) {
      partes.push(`até ${campo.restricoes.tamanhoMaximo} caracteres`);
    }
    if (campo.restricoes?.valorMinimo != null || campo.restricoes?.valorMaximo != null) {
      const min = campo.restricoes.valorMinimo;
      const max = campo.restricoes.valorMaximo;
      partes.push(min != null && max != null ? `de ${min} a ${max}` : min != null ? `mín. ${min}` : `máx. ${max}`);
    }
    return partes.join(' · ');
  }

  protected nomeTipo(tipo: TipoCampoFinanceiro): string {
    return ({
      TEXTO: 'Texto curto',
      TEXTO_LONGO: 'Texto longo',
      INTEIRO: 'Número inteiro',
      DECIMAL: 'Número decimal',
      MOEDA: 'Valor em reais',
      DATA: 'Data',
      BOOLEANO: 'Sim ou Não',
      SELECAO_UNICA: 'Escolha única',
      REFERENCIA: 'Busca em cadastro'
    } as Record<string, string>)[tipo];
  }

  private enviarCampo(campo: CampoFormulario, dados: Omit<CampoRequest, 'campoCanonico'>): void {
    this.executar(
      this.service.atualizarCampo(this.id, campo.id, {
        rotulo: dados.rotulo?.trim() || null,
        ajuda: dados.ajuda?.trim() || null,
        obrigatorio: dados.obrigatorio
      })
    );
  }

  private carregar(): void {
    this.service.buscarSchema(this.id).subscribe({
      next: (schema) => {
        this.aplicar(schema);
        this.recarregarCatalogo();
      },
      error: (error) => this.erro(error)
    });
  }

  /** O catálogo carrega os `jaUtilizado`, então acompanha cada mudança. */
  private recarregarCatalogo(): void {
    this.service.listarCamposCanonicos(this.id).subscribe({
      next: (itens) => this.canonicos.set(itens),
      error: (error) => this.erro(error)
    });
  }

  private executar(operacao: Observable<FormularioSchema | void>): void {
    operacao.subscribe({
      next: (schema) => {
        if (schema) this.aplicar(schema);
        this.recarregarCatalogo();
      },
      error: (error: unknown) => this.erro(error)
    });
  }

  private aplicar(schema: FormularioSchema): void {
    this.schema.set(schema);
    this.titulo = schema.titulo;
    this.descricao = schema.descricao ?? '';
    this.padrao = schema.padrao;
    this.rascunhoRotulo = {};
    this.rascunhoAjuda = {};
    this.loading.set(false);
  }

  private erro(error: unknown): void {
    this.loading.set(false);
    this.messages.add({
      severity: 'error',
      summary: 'Não foi possível salvar',
      detail: getErrorMessage(error)
    });
    // Recarrega para a tela não ficar mostrando algo que o servidor recusou.
    this.carregar();
  }
}
