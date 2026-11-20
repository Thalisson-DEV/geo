import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { GeoBreadcrumbItem, GeoButtonComponent, GeoIconButtonComponent, GeoPageHeaderComponent } from '@geo/ui';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';

import { SstService } from '../../../core/services/sst.service';
import {
  CriarFormularioRequest,
  FormularioInspecaoResponse,
  GravidadeDesvio,
  GRAVIDADE_LABELS,
  TipoResposta,
  TIPO_RESPOSTA_LABELS,
  isTipoObjetivo
} from '../../../core/models/sst.models';
import { getErrorMessage } from '../../../core/models/shared.models';

interface BuilderOpcao {
  id?: string;
  uid: string;
  texto: string;
  geraDesvio: boolean;
  gravidade?: GravidadeDesvio | null;
  padrao: boolean;
}
interface BuilderPergunta {
  id?: string;
  uid: string;
  enunciado: string;
  tipoResposta: TipoResposta;
  obrigatoria: boolean;
  opcoes: BuilderOpcao[];
  orientacao: string;
  desvioPorColaborador: boolean;
}
interface BuilderGrupo {
  id?: string;
  uid: string;
  titulo: string;
  perguntas: BuilderPergunta[];
}

function uid(): string {
  return (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

@Component({
  selector: 'app-sst-formulario-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GeoPageHeaderComponent,
    GeoButtonComponent,
    GeoIconButtonComponent,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    TooltipModule,
    SkeletonModule
  ],
  template: `

    <div class="flex flex-col gap-4">
      <geo-page-header
        [title]="formId() ? 'Editar formulário de inspeção' : 'Novo formulário de inspeção'"
        icon="pi pi-file-edit"
        [breadcrumb]="trilha"
        description="Monte os grupos, as perguntas e as opções de resposta do checklist usado em campo."
      >
        <geo-button actions label="Voltar" icon="pi pi-arrow-left" variant="ghost" (pressed)="voltar()"></geo-button>
      </geo-page-header>

      @if (loading()) {
        <p-skeleton height="22rem"></p-skeleton>
      } @else {
        <!-- DOCUMENTO -->
        <div class="bg-[var(--geo-surface)] rounded-lg border border-[var(--geo-border)] overflow-hidden">
          <!-- CABEÇALHO -->
          <div class="px-5 md:px-8 py-6 border-b border-[var(--geo-border)]">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="flex flex-col gap-1.5 md:col-span-1">
                <label class="text-sm font-medium text-[var(--geo-foreground-muted)]">Título</label>
                <input pInputText placeholder="Ex: Inspeção de Campo" class="doc-input" [(ngModel)]="titulo" />
              </div>
              <div class="flex flex-col gap-1.5 md:col-span-2">
                <label class="text-sm font-medium text-[var(--geo-foreground-muted)]">Descrição</label>
                <input pInputText placeholder="Ex: Checklist diário" class="doc-input" [(ngModel)]="descricao" />
              </div>
            </div>
            @if (emUso()) {
              <div class="mt-5 flex items-start gap-3 bg-[var(--geo-warning-soft)] border border-[var(--geo-warning-border)] rounded-lg px-4 py-3">
                <i class="pi pi-lock text-[var(--geo-warning-text)] text-[length:var(--geo-font-caption)] mt-0.5"></i>
                <div class="flex-grow">
                  <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-warning-text)]">Formulário em uso</span>
                  <p class="text-[length:var(--geo-font-caption)] text-[var(--geo-warning-text)] leading-relaxed mt-1">
                    A estrutura está bloqueada porque já existem inspeções lançadas. É possível reordenar os itens e
                    editar o título/descrição. Para mudar a estrutura, gere uma cópia editável.
                  </p>
                </div>
                <div class="flex flex-col gap-2 shrink-0">
                  <geo-button size="sm" label="Salvar dados" icon="pi pi-check" [loading]="saving()" (pressed)="salvarDados()"></geo-button>
                  <geo-button size="sm" variant="outline" label="Duplicar" icon="pi pi-copy" (pressed)="duplicar()"></geo-button>
                </div>
              </div>
            }
          </div>

          <!-- CORPO -->
          <div class="px-5 md:px-8 py-6 flex flex-col gap-8">
            @for (grupo of grupos(); track grupo.uid; let gi = $index) {
              <div class="flex flex-col gap-4">
                <!-- Marcador do grupo -->
                <div class="flex items-center gap-3 border-l-2 border-[var(--geo-brand)] pl-3">
                  <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-subtle)]">{{ formatarNumero(gi + 1) }}</span>
                  <input pInputText placeholder="Título do grupo (ex: Kit SMC)" class="doc-input flex-grow" [(ngModel)]="grupo.titulo" [disabled]="emUso()" />
                  <div class="flex items-center gap-0.5 shrink-0">
                    <geo-icon-button icon="pi pi-chevron-up" label="Subir grupo" size="icon-sm" [disabled]="gi === 0" (pressed)="moverGrupo(gi, -1)"></geo-icon-button>
                    <geo-icon-button icon="pi pi-chevron-down" label="Descer grupo" size="icon-sm" [disabled]="gi === grupos().length - 1" (pressed)="moverGrupo(gi, 1)"></geo-icon-button>
                    @if (!emUso()) {
                      <geo-icon-button icon="pi pi-trash" label="Remover grupo" size="icon-sm" (pressed)="removerGrupo(gi)"></geo-icon-button>
                    }
                  </div>
                </div>

                <!-- Perguntas -->
                <div class="flex flex-col gap-3 md:pl-5">
                  @for (pergunta of grupo.perguntas; track pergunta.uid; let pi = $index) {
                    <div class="rounded-lg border border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] px-4 py-4 flex flex-col gap-3">
                      <div class="flex items-start gap-3">
                        <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-subtle)] mt-2.5 shrink-0">{{ gi + 1 }}.{{ pi + 1 }}</span>
                        <div class="flex flex-col gap-1.5 flex-grow min-w-0">
                          <input pInputText placeholder="Enunciado da pergunta" class="doc-input w-full" [(ngModel)]="pergunta.enunciado" [disabled]="emUso()" [attr.aria-label]="'Enunciado da pergunta ' + (gi + 1) + '.' + (pi + 1)" />
                          <input pInputText placeholder="Orientação (opcional): quantidade esperada ou observação, ex.: Individual · Por escada" class="doc-input w-full"
                            [(ngModel)]="pergunta.orientacao" [disabled]="emUso()" maxlength="300" [attr.aria-label]="'Orientação da pergunta ' + (gi + 1) + '.' + (pi + 1)" />
                        </div>
                        <div class="flex items-center gap-0.5 shrink-0">
                          <geo-icon-button icon="pi pi-chevron-up" label="Subir pergunta" size="icon-sm" [disabled]="pi === 0" (pressed)="moverPergunta(grupo, pi, -1)"></geo-icon-button>
                          <geo-icon-button icon="pi pi-chevron-down" label="Descer pergunta" size="icon-sm" [disabled]="pi === grupo.perguntas.length - 1" (pressed)="moverPergunta(grupo, pi, 1)"></geo-icon-button>
                          @if (!emUso()) {
                            <geo-icon-button icon="pi pi-trash" label="Remover pergunta" size="icon-sm" (pressed)="removerPergunta(grupo, pi)"></geo-icon-button>
                          }
                        </div>
                      </div>

                      <div class="flex flex-wrap items-end gap-3 md:pl-7">
                        <div class="flex flex-col gap-1.5">
                          <label class="text-sm font-medium text-[var(--geo-foreground-muted)]">Tipo de resposta</label>
                          <p-select
                            [options]="tipoOptions"
                            [(ngModel)]="pergunta.tipoResposta"
                            optionLabel="label"
                            optionValue="value"
                            class="doc-select w-56"
                            appendTo="body"
                            [disabled]="emUso()"
                            (onChange)="onTipoChange(pergunta)"
                          ></p-select>
                        </div>
                        <label class="flex items-center gap-2 h-8 cursor-pointer">
                          <p-checkbox [binary]="true" size="small" [(ngModel)]="pergunta.obrigatoria" [disabled]="emUso()"></p-checkbox>
                          <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-muted)]">Obrigatória</span>
                        </label>
                        @if (temDesvio(pergunta)) {
                          <label class="flex items-center gap-2 h-8 cursor-pointer" pTooltip="Desmarque em itens da equipe ou do veículo (pneu, extintor, ferramenta): o desvio poderá ser lançado sem apontar ninguém.">
                            <p-checkbox [binary]="true" size="small" [(ngModel)]="pergunta.desvioPorColaborador" [disabled]="emUso()"></p-checkbox>
                            <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-muted)]">Desvio aponta colaborador</span>
                          </label>
                        }
                      </div>

                      @if (isObjetivo(pergunta.tipoResposta)) {
                        <div class="md:pl-7 flex flex-col gap-2 mt-1">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-subtle)]">Opções de resposta</span>
                            @if (!emUso() && pergunta.tipoResposta === 'MULTIPLA_ESCOLHA' && !ehChecklist(pergunta)) {
                              <button type="button" (click)="aplicarChecklist(pergunta)" class="flex items-center gap-1.5 text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-brand-text)] w-fit">
                                <i class="pi pi-list-check text-[length:var(--geo-font-caption)]"></i> Usar Conforme / Não conforme / Não se aplica
                              </button>
                            }
                          </div>
                          @for (opcao of pergunta.opcoes; track opcao.uid; let oi = $index) {
                            <div class="flex items-center gap-2">
                              <i class="pi pi-circle text-[length:var(--geo-font-caption)] text-[var(--geo-foreground-subtle)]"></i>
                              <input pInputText placeholder="Texto da opção" class="doc-input flex-grow" [(ngModel)]="opcao.texto" [disabled]="emUso()" />
                              <label class="flex items-center gap-1.5 h-8 px-2.5 rounded-md border shrink-0 cursor-pointer transition-colors"
                                [ngClass]="opcao.padrao ? 'border-[var(--geo-brand)] bg-[var(--geo-brand-soft)]' : 'border-[var(--geo-border)] bg-[var(--geo-surface)]'">
                                <p-checkbox [binary]="true" size="small" [(ngModel)]="opcao.padrao" [disabled]="emUso() || opcao.geraDesvio" (onChange)="onPadraoChange(pergunta, opcao)"></p-checkbox>
                                <span class="text-[length:var(--geo-font-caption)] font-medium" [ngClass]="opcao.padrao ? 'text-[var(--geo-brand-text)]' : 'text-[var(--geo-foreground-subtle)]'">Padrão</span>
                              </label>
                              <label class="flex items-center gap-1.5 h-8 px-2.5 rounded-md border shrink-0 cursor-pointer transition-colors"
                                [ngClass]="opcao.geraDesvio ? 'border-[var(--geo-danger-border)] bg-[var(--geo-danger-soft)]' : 'border-[var(--geo-border)] bg-[var(--geo-surface)]'">
                                <p-checkbox [binary]="true" size="small" [(ngModel)]="opcao.geraDesvio" [disabled]="emUso()" (onChange)="onGeraDesvioChange(opcao)"></p-checkbox>
                                <span class="text-[length:var(--geo-font-caption)] font-medium" [ngClass]="opcao.geraDesvio ? 'text-[var(--geo-danger-text)]' : 'text-[var(--geo-foreground-subtle)]'">Gera desvio</span>
                              </label>
                              @if (opcao.geraDesvio) {
                                <p-select
                                  [options]="gravidadeOptions"
                                  [(ngModel)]="opcao.gravidade"
                                  optionLabel="label"
                                  optionValue="value"
                                  placeholder="Gravidade *"
                                  class="doc-select w-32"
                                  appendTo="body"
                                  [disabled]="emUso()"
                                ></p-select>
                              }
                              <div class="flex items-center gap-0.5 shrink-0">
                                <geo-icon-button icon="pi pi-chevron-up" label="Subir opção" size="icon-sm" [disabled]="oi === 0" (pressed)="moverOpcao(grupo, pergunta, oi, -1)"></geo-icon-button>
                                <geo-icon-button icon="pi pi-chevron-down" label="Descer opção" size="icon-sm" [disabled]="oi === pergunta.opcoes.length - 1" (pressed)="moverOpcao(grupo, pergunta, oi, 1)"></geo-icon-button>
                                @if (!emUso()) {
                                  <geo-icon-button icon="pi pi-times" label="Remover opção" size="icon-sm" (pressed)="removerOpcao(pergunta, oi)"></geo-icon-button>
                                }
                              </div>
                            </div>
                          }
                          @if (!emUso()) {
                            <button type="button" (click)="adicionarOpcao(pergunta)" class="flex items-center gap-1.5 text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-brand-text)] mt-1 w-fit">
                              <i class="pi pi-plus text-[length:var(--geo-font-caption)]"></i> Adicionar opção
                            </button>
                          }
                        </div>
                      } @else {
                        <div class="md:pl-7 text-[length:var(--geo-font-caption)] text-[var(--geo-foreground-subtle)]">
                          <i class="pi pi-info-circle text-[length:var(--geo-font-caption)]"></i> Resposta livre — preenchida em campo, sem opções.
                        </div>
                      }
                    </div>
                  }

                  @if (!emUso()) {
                    <button type="button" (click)="adicionarPergunta(grupo)" class="flex items-center gap-1.5 text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-brand-text)] w-fit">
                      <i class="pi pi-plus text-[length:var(--geo-font-caption)]"></i> Adicionar pergunta
                    </button>
                  }
                </div>
              </div>
            }

            @if (!emUso()) {
              <button type="button" (click)="adicionarGrupo()" class="flex items-center justify-center gap-2 text-[length:var(--geo-font-caption)] font-medium text-[var(--geo-foreground-muted)] border border-dashed border-[var(--geo-border)] rounded-lg py-3 hover:bg-[var(--geo-surface-subtle)] transition-colors">
                <i class="pi pi-plus text-[length:var(--geo-font-caption)]"></i> Adicionar grupo
              </button>
            }
          </div>
          @if (!emUso()) {
            <div class="sticky bottom-0 flex items-center justify-end gap-2 px-5 md:px-8 py-3 border-t border-[var(--geo-border)] bg-[var(--geo-surface)]">
              <geo-button variant="ghost" label="Cancelar" (pressed)="voltar()"></geo-button>
              <geo-button [label]="formId() ? 'Salvar estrutura' : 'Criar formulário'" icon="pi pi-check" [loading]="saving()" (pressed)="salvar()"></geo-button>
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FormularioBuilderComponent implements OnInit {
  private sst = inject(SstService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  protected loading = signal(false);
  protected saving = signal(false);
  protected formId = signal<string | null>(null);
  protected emUso = signal(false);
  protected ativo = signal(true);

  protected titulo = '';
  protected descricao = '';
  protected grupos = signal<BuilderGrupo[]>([]);

  protected readonly trilha: GeoBreadcrumbItem[] = [
    { label: 'Segurança' },
    { label: 'Formulários', route: '/sst/formularios' },
    { label: 'Construtor' }
  ];

  protected tipoOptions = (Object.keys(TIPO_RESPOSTA_LABELS) as TipoResposta[]).map((value) => ({
    // Rótulos em caixa de frase ("Múltipla escolha"), como no restante da interface.
    label: TIPO_RESPOSTA_LABELS[value].charAt(0) + TIPO_RESPOSTA_LABELS[value].slice(1).toLowerCase(),
    value
  }));

  protected gravidadeOptions = (Object.keys(GRAVIDADE_LABELS) as GravidadeDesvio[]).map((value) => ({
    label: GRAVIDADE_LABELS[value],
    value
  }));

  protected isObjetivo = isTipoObjetivo;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'novo') {
      this.carregar(id);
    } else {
      this.grupos.set([this.novoGrupo()]);
    }
  }

  protected formatarNumero(n: number): string {
    return n < 10 ? `0${n}` : String(n);
  }

  private carregar(id: string) {
    this.loading.set(true);
    this.sst.buscarFormularioPorId(id).subscribe({
      next: (form) => {
        this.mapearParaBuilder(form);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro ao carregar', detail: getErrorMessage(err) });
        this.router.navigate(['/sst/formularios']);
      }
    });
  }

  private mapearParaBuilder(form: FormularioInspecaoResponse) {
    this.formId.set(form.id);
    this.emUso.set(form.emUso);
    this.ativo.set(form.ativo);
    this.titulo = form.titulo;
    this.descricao = form.descricao ?? '';
    this.grupos.set(
      (form.grupos ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((g) => ({
          id: g.id,
          uid: uid(),
          titulo: g.titulo,
          perguntas: (g.perguntas ?? [])
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((p) => ({
              id: p.id,
              uid: uid(),
              enunciado: p.enunciado,
              tipoResposta: p.tipoResposta,
              obrigatoria: p.obrigatoria,
              orientacao: p.orientacao ?? '',
              desvioPorColaborador: p.desvioPorColaborador ?? true,
              opcoes: (p.opcoes ?? [])
                .slice()
                .sort((a, b) => a.ordem - b.ordem)
                .map((o) => ({ id: o.id, uid: uid(), texto: o.texto, geraDesvio: o.geraDesvio, gravidade: o.gravidade ?? null, padrao: o.padrao ?? false }))
            }))
        }))
    );
  }

  // ---------- factories ----------
  private novoGrupo(): BuilderGrupo {
    return { uid: uid(), titulo: '', perguntas: [this.novaPergunta()] };
  }
  private novaPergunta(): BuilderPergunta {
    return {
      uid: uid(),
      enunciado: '',
      tipoResposta: 'MULTIPLA_ESCOLHA',
      obrigatoria: true,
      orientacao: '',
      desvioPorColaborador: true,
      opcoes: this.opcoesChecklist()
    };
  }
  /** Padrão das inspeções de campo: Conforme já marcado, Não conforme gera desvio, Não se aplica neutro. */
  private opcoesChecklist(gravidade: GravidadeDesvio = 'MEDIA'): BuilderOpcao[] {
    return [this.novaOpcao('Conforme', false, null, true), this.novaOpcao('Não conforme', true, gravidade), this.novaOpcao('Não se aplica')];
  }
  protected ehChecklist(p: BuilderPergunta): boolean {
    const textos = p.opcoes.map((o) => o.texto.trim().toLowerCase());
    return textos.length === 3 && textos[0] === 'conforme' && textos[1] === 'não conforme' && textos[2] === 'não se aplica';
  }
  protected aplicarChecklist(p: BuilderPergunta): void {
    const gravidade = p.opcoes.find((o) => o.geraDesvio)?.gravidade ?? 'MEDIA';
    p.opcoes = this.opcoesChecklist(gravidade);
  }
  protected temDesvio(p: BuilderPergunta): boolean {
    return isTipoObjetivo(p.tipoResposta) && p.opcoes.some((o) => o.geraDesvio);
  }
  private novaOpcao(texto = '', geraDesvio = false, gravidade: GravidadeDesvio | null = null, padrao = false): BuilderOpcao {
    return { uid: uid(), texto, geraDesvio, gravidade: geraDesvio ? (gravidade || 'MEDIA') : null, padrao: geraDesvio ? false : padrao };
  }

  // ---------- estrutura (somente quando editável) ----------
  protected adicionarGrupo() {
    this.grupos.update((gs) => [...gs, this.novoGrupo()]);
  }
  protected removerGrupo(index: number) {
    this.grupos.update((gs) => gs.filter((_, i) => i !== index));
  }
  protected adicionarPergunta(grupo: BuilderGrupo) {
    grupo.perguntas.push(this.novaPergunta());
    this.grupos.update((gs) => [...gs]);
  }
  protected removerPergunta(grupo: BuilderGrupo, index: number) {
    grupo.perguntas.splice(index, 1);
    this.grupos.update((gs) => [...gs]);
  }
  protected adicionarOpcao(pergunta: BuilderPergunta) {
    pergunta.opcoes.push(this.novaOpcao());
    this.grupos.update((gs) => [...gs]);
  }
  protected removerOpcao(pergunta: BuilderPergunta, index: number) {
    pergunta.opcoes.splice(index, 1);
    this.grupos.update((gs) => [...gs]);
  }

  protected onTipoChange(pergunta: BuilderPergunta) {
    if (isTipoObjetivo(pergunta.tipoResposta)) {
      if (pergunta.opcoes.length === 0) {
        pergunta.opcoes = [this.novaOpcao('Sim', false), this.novaOpcao('Não', true)];
      }
    } else {
      pergunta.opcoes = [];
    }
    this.grupos.update((gs) => [...gs]);
  }

  protected onPadraoChange(pergunta: BuilderPergunta, opcao: BuilderOpcao) {
    if (opcao.padrao) {
      opcao.geraDesvio = false;
      opcao.gravidade = null;
      if (pergunta.tipoResposta === 'MULTIPLA_ESCOLHA') {
        pergunta.opcoes.forEach((o) => {
          if (o !== opcao) o.padrao = false;
        });
      }
    }
  }

  protected onGeraDesvioChange(opcao: BuilderOpcao) {
    if (opcao.geraDesvio) {
      opcao.padrao = false;
      if (!opcao.gravidade) opcao.gravidade = 'MEDIA';
    } else {
      opcao.gravidade = null;
    }
  }

  // ---------- reordenação (local + endpoint quando em uso) ----------
  protected moverGrupo(index: number, dir: -1 | 1) {
    const gs = this.grupos();
    const target = index + dir;
    if (target < 0 || target >= gs.length) return;
    const novo = [...gs];
    [novo[index], novo[target]] = [novo[target], novo[index]];
    this.grupos.set(novo);
    if (this.emUso() && this.formId()) {
      const ids = novo.map((g) => g.id!).filter(Boolean);
      this.persistirOrdem(this.sst.reordenarGrupos(this.formId()!, { idsNaOrdem: ids }), gs);
    }
  }

  protected moverPergunta(grupo: BuilderGrupo, index: number, dir: -1 | 1) {
    const snapshot = this.grupos();
    const target = index + dir;
    if (target < 0 || target >= grupo.perguntas.length) return;
    [grupo.perguntas[index], grupo.perguntas[target]] = [grupo.perguntas[target], grupo.perguntas[index]];
    this.grupos.update((gs) => [...gs]);
    if (this.emUso() && this.formId() && grupo.id) {
      const ids = grupo.perguntas.map((p) => p.id!).filter(Boolean);
      this.persistirOrdem(this.sst.reordenarPerguntas(this.formId()!, grupo.id, { idsNaOrdem: ids }), snapshot);
    }
  }

  protected moverOpcao(grupo: BuilderGrupo, pergunta: BuilderPergunta, index: number, dir: -1 | 1) {
    const snapshot = this.grupos();
    const target = index + dir;
    if (target < 0 || target >= pergunta.opcoes.length) return;
    [pergunta.opcoes[index], pergunta.opcoes[target]] = [pergunta.opcoes[target], pergunta.opcoes[index]];
    this.grupos.update((gs) => [...gs]);
    if (this.emUso() && this.formId() && grupo.id && pergunta.id) {
      const ids = pergunta.opcoes.map((o) => o.id!).filter(Boolean);
      this.persistirOrdem(
        this.sst.reordenarOpcoes(this.formId()!, grupo.id, pergunta.id, { idsNaOrdem: ids }),
        snapshot
      );
    }
  }

  private persistirOrdem(obs: ReturnType<SstService['reordenarGrupos']>, rollback: BuilderGrupo[]) {
    obs.subscribe({
      next: (form) => {
        if (form) this.mapearParaBuilder(form);
      },
      error: (err) => {
        this.grupos.set(rollback);
        this.messageService.add({ severity: 'error', summary: 'Falha ao reordenar', detail: getErrorMessage(err) });
      }
    });
  }

  // ---------- validação + save ----------
  private validar(): string | null {
    if (!this.titulo.trim()) return 'Informe o título do formulário.';
    const grupos = this.grupos();
    if (grupos.length === 0) return 'Adicione ao menos um grupo.';
    for (const [gi, g] of grupos.entries()) {
      if (!g.titulo.trim()) return `Informe o título do grupo ${gi + 1}.`;
      if (g.perguntas.length === 0) return `O grupo "${g.titulo}" precisa de ao menos uma pergunta.`;
      for (const [pi, p] of g.perguntas.entries()) {
        if (!p.enunciado.trim()) return `Informe o enunciado da pergunta ${gi + 1}.${pi + 1}.`;
        if (isTipoObjetivo(p.tipoResposta)) {
          if (p.opcoes.length === 0) return `A pergunta "${p.enunciado}" precisa de ao menos uma opção.`;
          if (p.opcoes.some((o) => !o.texto.trim())) return `Preencha o texto de todas as opções da pergunta "${p.enunciado}".`;
          if (p.opcoes.some((o) => o.geraDesvio && !o.gravidade)) return `Selecione a gravidade para as opções configuradas para gerar desvio na pergunta "${p.enunciado}".`;
          const padroes = p.opcoes.filter((o) => o.padrao);
          if (p.tipoResposta === 'MULTIPLA_ESCOLHA' && padroes.length > 1) {
            return `A pergunta "${p.enunciado}" não pode ter mais de uma opção padrão.`;
          }
          if (p.opcoes.some((o) => o.padrao && o.geraDesvio)) {
            return `A opção padrão não pode gerar desvio na pergunta "${p.enunciado}".`;
          }
        }
      }
    }
    return null;
  }

  private montarRequest(): CriarFormularioRequest {
    return {
      titulo: this.titulo.trim(),
      descricao: this.descricao.trim() || undefined,
      grupos: this.grupos().map((g) => ({
        titulo: g.titulo.trim(),
        perguntas: g.perguntas.map((p) => ({
          enunciado: p.enunciado.trim(),
          tipoResposta: p.tipoResposta,
          obrigatoria: p.obrigatoria,
          orientacao: p.orientacao.trim() || null,
          desvioPorColaborador: p.desvioPorColaborador,
          opcoes: isTipoObjetivo(p.tipoResposta)
            ? p.opcoes.map((o) => ({
                texto: o.texto.trim(),
                geraDesvio: o.geraDesvio,
                gravidade: o.geraDesvio ? (o.gravidade || 'MEDIA') : null,
                padrao: o.padrao
              }))
            : []
        }))
      }))
    };
  }

  protected salvar() {
    const erro = this.validar();
    if (erro) {
      this.messageService.add({ severity: 'warn', summary: 'Revise o formulário', detail: erro });
      return;
    }
    this.saving.set(true);
    const request = this.montarRequest();
    const id = this.formId();
    const obs = id ? this.sst.atualizarEstrutura(id, request) : this.sst.criarFormulario(request);
    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Formulário salvo.' });
        this.router.navigate(['/sst/formularios']);
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro ao salvar', detail: getErrorMessage(err) });
      }
    });
  }

  protected salvarDados() {
    if (!this.titulo.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Informe o título.' });
      return;
    }
    const id = this.formId();
    if (!id) return;
    this.saving.set(true);
    this.sst.atualizarDados(id, { titulo: this.titulo.trim(), descricao: this.descricao.trim() || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Dados atualizados.' });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: getErrorMessage(err) });
      }
    });
  }

  protected duplicar() {
    const id = this.formId();
    if (!id) return;
    this.sst.duplicarFormulario(id).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Cópia criada.' });
        if (res) {
          this.formId.set(null);
          this.router.navigate(['/sst/formularios', res.id]).then(() => window.location.reload());
        }
      },
      error: (err) => this.messageService.add({ severity: 'error', summary: 'Erro', detail: getErrorMessage(err) })
    });
  }

  protected voltar() {
    this.router.navigate(['/sst/formularios']);
  }
}
