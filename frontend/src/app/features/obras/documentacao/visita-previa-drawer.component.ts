import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { GeoAutocompleteComponent } from '@geo/ui/forms';
import { catchError, concatMap, from, map, of, take, toArray } from 'rxjs';
import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import { EvidenciaVisita, ModeloChecklistResponse, VisitaPrevia } from '../../../core/models/obras-documentacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';
import { dataIso } from '../../../shared/listagem/listagem';
import { ChecklistRespostasComponent } from './checklist-respostas.component';
import { RespostasEmEdicao, marcarRestantesComoConforme, naoConformidades, paraInformadas, pendentes, progresso, respostasIniciais, restantesConformes } from './checklist.logic';
import { VisitaEvidenciasComponent } from './visita-evidencias.component';
import { EvidenciaPendente, novaPendente, porPergunta } from './visita-evidencias.logic';

/**
 * Registro e correção da visita prévia (pré-vistoria): modelo, data, colaborador responsável, checklist com progresso por
 * seção, resumo das não conformidades e evidências opcionais por pergunta e gerais. As evidências escolhidas ficam no
 * aparelho e vão depois que a visita é salva; nenhuma é exigida.
 */
@Component({
  selector: 'app-visita-previa-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    GeoAutocompleteComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoSelectComponent,
    GeoTextareaComponent,
    ChecklistRespostasComponent,
    VisitaEvidenciasComponent
  ],
  template: `
    <geo-form-drawer [(visible)]="aberto" [title]="visita() ? 'Corrigir visita prévia' : 'Registrar visita prévia'" [dirty]="alterado()" size="lg"
      description="Checklist feito antes da execução, com as condições e necessidades da obra.">
      @if (carregando()) {
        <p class="vp-dica" role="status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Carregando os modelos</p>
      } @else if (!modelosAtivos().length && !modelo()) {
        <geo-callout tone="warning" icon="pi pi-exclamation-triangle" title="Nenhum modelo ativo" [dense]="true">
          Cadastre um modelo de visita prévia em
          @if (podeVerModelos()) { <a routerLink="/obras/cadastros/checklists">Checklists da documentação</a> } @else { Checklists da documentação }
          para registrar a visita.
        </geo-callout>
      } @else {
        <geo-form-section title="Visita" icon="pi pi-map-marker">
          <div class="geo-form-grid">
            <geo-select label="Modelo" [required]="true" [options]="opcoesModelo()" [value]="modelo()?.id ?? null" [disabled]="!!visita()" (valueChange)="escolherModelo($event)"></geo-select>
            <geo-datepicker label="Data da visita" [required]="true" [maxDate]="hoje" [(value)]="dataVisita" [error]="tentou() && !dataVisita() ? 'Informe a data.' : undefined"></geo-datepicker>
          </div>
          <div class="geo-form-stack">
            <geo-autocomplete label="Responsável" placeholder="Busque pelo nome do colaborador" [required]="!nomeAntigo()" [clearable]="true"
              [options]="colaboradores()" [loading]="colaboradorLookup.loading()" [status]="colaboradorLookup.status()" [error]="erroResponsavel()" [minLength]="2"
              [description]="nomeAntigo() ? 'Registrada como ' + nomeAntigo() + '. Escolha o colaborador para vincular; sem escolher, o nome é mantido.' : undefined"
              [ngModel]="idColaborador()" (ngModelChange)="idColaborador.set($event ?? null)"
              (search)="colaboradorLookup.search($event)" (loadMore)="colaboradorLookup.loadNext()" (retry)="colaboradorLookup.retry()"></geo-autocomplete>
          </div>
        </geo-form-section>
      }

      @if (modelo(); as m) {
        <section class="vp-checklist" aria-labelledby="vp-checklist-titulo">
          <div class="vp-checklist__topo">
            <div class="vp-checklist__titulo">
              <h3 id="vp-checklist-titulo">Checklist</h3>
              <span class="vp-dica">{{ geral().respondidas }} de {{ geral().total }} respondidas</span>
            </div>
            <geo-boolean-control label="Só pendentes" kind="toggle" [inline]="true" [(value)]="somentePendentes"></geo-boolean-control>
          </div>
          <div class="vp-barra" role="progressbar" aria-label="Progresso do checklist" aria-valuemin="0" [attr.aria-valuemax]="geral().total" [attr.aria-valuenow]="geral().respondidas">
            <span [style.width.%]="geral().total ? (geral().respondidas / geral().total) * 100 : 0"></span>
          </div>
          @if (conformesRestantes() > 0) {
            <geo-button class="vp-checklist__acao" variant="outline" size="sm" icon="pi pi-check-square"
              [label]="'Marcar ' + conformesRestantes() + (conformesRestantes() === 1 ? ' restante como conforme' : ' restantes como conforme')"
              (pressed)="marcarTodosConformes()"></geo-button>
          }
          @if (naoConformes().length) {
            <geo-callout tone="warning" icon="pi pi-exclamation-triangle" [title]="naoConformes().length === 1 ? '1 não conformidade' : naoConformes().length + ' não conformidades'" [dense]="true">
              <ul class="vp-nc">
                @for (n of naoConformes(); track n.pergunta.id) {
                  <li><span class="vp-nc__grupo">{{ n.grupo }}</span> {{ n.pergunta.enunciado }}: <strong>{{ n.resposta }}</strong></li>
                }
              </ul>
            </geo-callout>
          }
          @if (somentePendentes() && geral().respondidas === geral().total) {
            <p class="vp-dica" role="status"><i class="pi pi-check-circle" aria-hidden="true"></i> Todas as perguntas respondidas.</p>
          }
          <app-checklist-respostas [estrutura]="m.estrutura" [(respostas)]="respostas" [mostrarPendencias]="tentou()" [somentePendentes]="somentePendentes()"
            [extra]="evidenciaDaPergunta"></app-checklist-respostas>
        </section>

        <ng-template #evidenciaDaPergunta let-p>
          <app-visita-evidencias [idObra]="idObra()" [idVisita]="visita()?.id ?? null" [podeEscrever]="podeEscrever()" [discreto]="true" [rotulo]="p.enunciado"
            [gravadas]="gravadasDa(p.id)" [pendentes]="pendentesDa(p.id)"
            (adicionar)="adicionar($event, p.id)" (removerGravada)="removerGravada($event)" (removerPendente)="removerPendente($event)"></app-visita-evidencias>
        </ng-template>

        <geo-form-section title="Evidências gerais" icon="pi pi-images" description="Fotos do local ou documentos da visita que não são de uma pergunta específica.">
          <app-visita-evidencias [idObra]="idObra()" [idVisita]="visita()?.id ?? null" [podeEscrever]="podeEscrever()" rotulo="Evidências gerais"
            [gravadas]="gravadasDa(null)" [pendentes]="pendentesDa(null)"
            (adicionar)="adicionar($event, null)" (removerGravada)="removerGravada($event)" (removerPendente)="removerPendente($event)"></app-visita-evidencias>
        </geo-form-section>

        <div class="geo-form-stack vp-observacoes">
          <geo-textarea label="Observações" [rows]="3" [maxlength]="2000" [(value)]="observacoes"></geo-textarea>
        </div>
      }

      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" [label]="podeEscrever() ? 'Cancelar' : 'Fechar'" (pressed)="aberto.set(false)"></geo-button>
        @if (podeEscrever() && modelo()) {
          <geo-button icon="pi pi-check" label="Salvar visita" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `,
  styles: `
    .vp-dica { display: inline-flex; align-items: center; gap: 0.375rem; margin: 0; color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .vp-checklist { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.25rem; }
    .vp-checklist__topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
    .vp-checklist__titulo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.75rem; }
    .vp-checklist__titulo h3 { margin: 0; color: var(--geo-foreground); font-size: 1rem; font-weight: 600; }
    .vp-checklist__acao { align-self: flex-start; }
    .vp-barra { display: block; height: 0.5rem; overflow: hidden; border-radius: 999px; background: var(--geo-surface-muted); }
    .vp-barra span { display: block; height: 100%; border-radius: inherit; background: var(--geo-brand); transition: width 160ms ease-out; }
    .vp-nc { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.25rem 0 0; padding-left: 1rem; }
    .vp-nc__grupo { color: var(--geo-foreground-muted); font-weight: 600; }
    .vp-nc__grupo::after { content: ' ·'; }
    .vp-observacoes { margin-top: 1rem; }
    @media (prefers-reduced-motion: reduce) { .vp-barra span { transition: none; } }
  `
})
export class VisitaPreviaDrawerComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly lookupStore = inject(LookupStore);

  readonly idObra = input.required<string>();
  /** Visita a corrigir; nula para registrar uma nova. */
  readonly visita = input<VisitaPrevia | null>(null);
  readonly podeEscrever = input(false);
  readonly podeVerModelos = input(false);
  readonly aberto = model(false);
  /** A visita foi salva, ou uma evidência dela foi removida. */
  readonly alterada = output<void>();

  protected readonly hoje = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly carregando = signal(false);
  protected readonly modelosAtivos = signal<ModeloChecklistResponse[]>([]);
  protected readonly modelo = signal<ModeloChecklistResponse | null>(null);
  protected readonly respostas = signal<RespostasEmEdicao>({});
  protected readonly dataVisita = signal<Date | null>(null);
  protected readonly idColaborador = signal<string | null>(null);
  protected readonly observacoes = signal('');
  protected readonly somentePendentes = signal(false);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly gravadas = signal<EvidenciaVisita[]>([]);
  protected readonly pendentesLocais = signal<EvidenciaPendente[]>([]);
  private readonly original = signal('');

  protected readonly colaboradorLookup = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: (): string[] => [this.idColaborador()].filter((id): id is string => !!id),
    destroyRef: inject(DestroyRef)
  });
  protected readonly colaboradores = this.colaboradorLookup.items;

  /** Registro antigo, sem colaborador: mostra o nome que ficou gravado. */
  protected readonly nomeAntigo = computed(() => {
    const v = this.visita();
    return v && !v.idColaborador && !this.idColaborador() ? v.responsavel : null;
  });
  protected readonly erroResponsavel = computed(() => {
    const erro = this.colaboradorLookup.error();
    if (erro) return getErrorMessage(erro);
    return this.tentou() && !this.idColaborador() && !this.nomeAntigo() ? 'Escolha o colaborador responsável.' : undefined;
  });
  protected readonly opcoesModelo = computed<GeoSelectOption<string>[]>(() => {
    const atual = this.modelo();
    const ativos = this.modelosAtivos().map((m) => ({ label: m.titulo, value: m.id }));
    return atual && !ativos.some((o) => o.value === atual.id) ? [{ label: atual.titulo, value: atual.id }, ...ativos] : ativos;
  });
  private readonly perguntas = computed(() => this.modelo()?.estrutura.grupos.flatMap((g) => g.perguntas) ?? []);
  protected readonly geral = computed(() => progresso(this.perguntas(), this.respostas()));
  protected readonly conformesRestantes = computed(() => restantesConformes(this.perguntas(), this.respostas()).length);
  protected readonly naoConformes = computed(() => {
    const m = this.modelo();
    return m ? naoConformidades(m.estrutura, this.respostas()) : [];
  });
  private readonly gravadasPorPergunta = computed(() => porPergunta(this.gravadas()));
  private readonly pendentesPorPergunta = computed(() => porPergunta(this.pendentesLocais()));
  protected readonly alterado = computed(() => this.instantaneo() !== this.original() || this.pendentesLocais().length > 0);

  constructor() {
    effect(() => {
      if (!this.aberto()) return;
      untracked(() => this.abrir());
    });
    inject(DestroyRef).onDestroy(() => this.descartarPendentes());
  }

  protected gravadasDa(idPergunta: string | null): EvidenciaVisita[] {
    return this.gravadasPorPergunta().get(idPergunta) ?? [];
  }

  protected pendentesDa(idPergunta: string | null): EvidenciaPendente[] {
    return this.pendentesPorPergunta().get(idPergunta) ?? [];
  }

  private abrir(): void {
    const v = this.visita();
    this.descartarPendentes();
    this.tentou.set(false);
    this.somentePendentes.set(false);
    this.modelo.set(null);
    this.respostas.set({});
    this.gravadas.set(v?.evidencias ?? []);
    this.dataVisita.set(v ? new Date(`${v.dataVisita}T00:00:00`) : new Date());
    this.idColaborador.set(v?.idColaborador ?? null);
    if (v?.idColaborador) this.colaboradorLookup.seedSelected({ value: v.idColaborador, label: v.responsavel });
    this.observacoes.set(v?.observacoes ?? '');
    this.carregando.set(true);
    this.servico.listarModelos({ finalidade: 'VISITA_PREVIA', ativo: true, size: 100, sort: 'titulo,asc' }).pipe(take(1)).subscribe({
      next: (pagina) => {
        this.modelosAtivos.set(pagina.content);
        if (v) {
          this.servico.buscarModelo(v.idModelo).pipe(take(1)).subscribe({
            next: (modelo) => this.comModelo(modelo, v),
            error: (e) => this.falhou(e)
          });
        } else {
          this.comModelo(pagina.content.length === 1 ? pagina.content[0] : null, null);
        }
      },
      error: (e) => this.falhou(e)
    });
  }

  private comModelo(modelo: ModeloChecklistResponse | null, v: VisitaPrevia | null): void {
    this.carregando.set(false);
    this.modelo.set(modelo);
    this.respostas.set(modelo ? respostasIniciais(modelo.estrutura, v?.respostas.itens ?? []) : {});
    this.original.set(this.instantaneo());
  }

  private falhou(e: unknown): void {
    this.carregando.set(false);
    this.notificacoes.error(getErrorMessage(e));
  }

  protected escolherModelo(id: string | null): void {
    const modelo = this.modelosAtivos().find((m) => m.id === id) ?? null;
    this.modelo.set(modelo);
    this.respostas.set(modelo ? respostasIniciais(modelo.estrutura) : {});
    // As evidências de pergunta pertencem ao modelo anterior; as gerais continuam.
    this.pendentesLocais.update((lista) => {
      lista.filter((p) => p.idPergunta).forEach((p) => p.url && URL.revokeObjectURL(p.url));
      return lista.filter((p) => !p.idPergunta);
    });
  }

  protected marcarTodosConformes(): void {
    this.respostas.update((atuais) => marcarRestantesComoConforme(this.perguntas(), atuais));
  }

  protected adicionar(arquivos: File[], idPergunta: string | null): void {
    this.pendentesLocais.update((lista) => [...lista, ...arquivos.map((a) => novaPendente(a, idPergunta))]);
  }

  protected removerPendente(pendente: EvidenciaPendente): void {
    if (pendente.url) URL.revokeObjectURL(pendente.url);
    this.pendentesLocais.update((lista) => lista.filter((p) => p.chave !== pendente.chave));
  }

  protected async removerGravada(evidencia: EvidenciaVisita): Promise<void> {
    const v = this.visita();
    if (!v) return;
    const ok = await this.confirmacao.confirm({
      title: 'Remover esta evidência?',
      message: 'Ela sai da visita e das próximas versões do PDF. A visita continua salva.',
      confirmLabel: 'Remover'
    });
    if (!ok) return;
    this.servico.removerEvidenciaDaVisita(this.idObra(), v.id, evidencia.id).pipe(take(1)).subscribe({
      next: () => {
        this.gravadas.update((lista) => lista.filter((e) => e.id !== evidencia.id));
        this.notificacoes.success('Evidência removida.');
        this.alterada.emit();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected salvar(): void {
    const modelo = this.modelo();
    if (!modelo) return;
    this.tentou.set(true);
    const data = dataIso(this.dataVisita());
    if (!data || (!this.idColaborador() && !this.nomeAntigo()) || pendentes(modelo.estrutura, this.respostas()).length) {
      this.notificacoes.warning('Confira os campos destacados antes de salvar.');
      return;
    }
    const v = this.visita();
    const request = {
      idModelo: modelo.id,
      dataVisita: data,
      idColaborador: this.idColaborador(),
      responsavel: this.idColaborador() ? null : this.nomeAntigo(),
      observacoes: this.observacoes().trim() || null,
      respostas: paraInformadas(modelo.estrutura, this.respostas())
    };
    this.salvando.set(true);
    this.servico.salvarVisita(this.idObra(), v?.id ?? null, request).pipe(take(1)).subscribe({
      next: (salva) => this.enviarPendentes(salva),
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** A visita já está salva; cada evidência vai em seguida. A que falhar não desfaz a visita: o aviso diz quantas faltaram. */
  private enviarPendentes(salva: VisitaPrevia): void {
    const fila = this.pendentesLocais();
    from(fila).pipe(
      concatMap((p) =>
        this.servico.enviarEvidenciaDaVisita(this.idObra(), salva.id, p.arquivo, p.idPergunta).pipe(
          map(() => true),
          catchError(() => of(false))
        )
      ),
      toArray()
    ).subscribe((resultados) => {
      const falhas = resultados.filter((ok) => !ok).length;
      const enviadas = resultados.length - falhas;
      this.salvando.set(false);
      this.descartarPendentes();
      this.original.set(this.instantaneo());
      this.aberto.set(false);
      this.alterada.emit();
      if (falhas) {
        this.notificacoes.warning(`Visita salva, mas ${falhas === 1 ? '1 evidência não foi enviada' : falhas + ' evidências não foram enviadas'}. Abra a visita e anexe de novo.`);
      } else {
        this.notificacoes.success(enviadas ? `Visita prévia salva com ${enviadas === 1 ? '1 evidência' : enviadas + ' evidências'}.` : 'Visita prévia salva.');
      }
    });
  }

  private descartarPendentes(): void {
    this.pendentesLocais().forEach((p) => p.url && URL.revokeObjectURL(p.url));
    this.pendentesLocais.set([]);
  }

  private instantaneo(): string {
    return JSON.stringify([this.modelo()?.id, this.respostas(), this.dataVisita(), this.idColaborador(), this.observacoes()]);
  }
}
