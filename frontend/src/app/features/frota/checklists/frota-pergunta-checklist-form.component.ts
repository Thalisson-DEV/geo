import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked
} from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { AlternativaChecklist, ModoFotoPergunta, PerguntaChecklist, ROTULO_MODO_FOTO, TipoRespostaChecklist } from '../../../core/models/frota-checklist.models';
import { ROTULO_RESPOSTA, modoFoto as modoFotoDe } from './frota-modelo-checklist.util';

interface Linha {
  uid: number;
  id: string | null;
  texto: string;
  indicaProblema: boolean;
}

let sequencia = 0;

/**
 * Uma pergunta do checklist, em três partes: o que perguntar (e em que grupo), como o condutor
 * responde e, conforme a resposta, os motivos do Não OK ou as opções.
 */
@Component({
  selector: 'app-frota-pergunta-checklist-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoTextInputComponent
  ],
  styles: `
    .linhas { display: flex; flex-direction: column; gap: 0.5rem; }
    .linha { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .linha__texto { flex: 1; min-width: 12rem; }
    .sugestoes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
    .sugestoes__rotulo { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); margin-right: 0.25rem; }
  `,
  template: `
    <geo-form-drawer [(visible)]="visible" [title]="pergunta()?.texto ? 'Editar pergunta' : 'Nova pergunta'"
      [description]="pergunta()?.texto || 'O que o condutor confere no veículo.'" [dirty]="alterado()" [loading]="salvando()" size="md">
      <div class="geo-form-stack">
        <geo-form-section title="Pergunta" icon="pi pi-question-circle">
          <geo-text-input label="Pergunta" [required]="true" [(value)]="texto" [maxlength]="300" placeholder="Ex.: Faróis"
            description="Curta e direta: o condutor lê no celular." [error]="tentou() && !texto().trim() ? 'Escreva a pergunta.' : undefined"></geo-text-input>
          <geo-text-input label="Grupo" [(value)]="grupo" [maxlength]="80" [showOptional]="true" placeholder="Ex.: Iluminação"
            description="Perguntas do mesmo grupo aparecem juntas no app."></geo-text-input>
          @if (sugestoesGrupo().length) {
            <div class="sugestoes">
              <span class="sugestoes__rotulo">Grupos do modelo:</span>
              @for (g of sugestoesGrupo(); track g) {
                <geo-button size="sm" variant="ghost" [label]="g" (pressed)="grupo.set(g)"></geo-button>
              }
            </div>
          }
        </geo-form-section>

        <geo-form-section title="Resposta" icon="pi pi-check-square">
          <geo-select label="Como o condutor responde" [required]="true" [options]="tiposResposta" [(value)]="tipoResposta"></geo-select>
          <geo-select label="Foto" [options]="opcoesFoto()" [(value)]="modoFoto"
            [description]="modoFoto() === 'SEMPRE' ? 'O app pede a foto em todo checklist (ex.: extintor, macaco, triângulo).' : modoFoto() === 'NAO_OK' ? 'O app não deixa enviar o Não OK sem a foto.' : 'Sem foto obrigatória; a pessoa pode anexar se quiser.'"></geo-select>
          <geo-callout tone="info" [dense]="true">{{ explicacao() }}</geo-callout>
        </geo-form-section>

        @if (tipoResposta() === 'OK_NOK') {
          <geo-form-section title="Motivos do Não OK" icon="pi pi-list" description="Opcional. O condutor escolhe um quando marca Não OK.">
            <div class="linhas">
              @for (l of motivos(); track l.uid; let i = $index) {
                <div class="linha">
                  <geo-text-input class="linha__texto" [inputId]="'linha-' + l.uid" [label]="'Motivo ' + (i + 1)" [labelVisible]="false"
                    [value]="l.texto" (valueChange)="alterarLinha(motivos, i, { texto: $event })" [maxlength]="120" placeholder="Ex.: Queimado"></geo-text-input>
                  <geo-icon-button icon="pi pi-trash" [label]="'Remover o motivo ' + (i + 1)" tooltip="Remover" size="icon-sm"
                    (pressed)="removerLinha(motivos, i)"></geo-icon-button>
                </div>
              } @empty {
                <p class="sugestoes__rotulo">Sem motivos: o condutor só marca Não OK e comenta.</p>
              }
              <div>
                <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Adicionar motivo" (pressed)="adicionarLinha(motivos)"></geo-button>
              </div>
            </div>
          </geo-form-section>
        } @else if (tipoResposta() === 'OPCOES') {
          <geo-form-section title="Opções de resposta" icon="pi pi-list" description="Pelo menos duas. Marque as que indicam problema: elas viram pendência para o gestor.">
            <div class="linhas">
              @for (l of opcoes(); track l.uid; let i = $index) {
                <div class="linha">
                  <geo-text-input class="linha__texto" [inputId]="'linha-' + l.uid" [label]="'Opção ' + (i + 1)" [labelVisible]="false"
                    [value]="l.texto" (valueChange)="alterarLinha(opcoes, i, { texto: $event })" [maxlength]="120" placeholder="Ex.: Bom"></geo-text-input>
                  <geo-boolean-control [inline]="true" label="Indica problema" [value]="l.indicaProblema"
                    (valueChange)="alterarLinha(opcoes, i, { indicaProblema: $event })"></geo-boolean-control>
                  <geo-icon-button icon="pi pi-trash" [label]="'Remover a opção ' + (i + 1)" tooltip="Remover" size="icon-sm"
                    (pressed)="removerLinha(opcoes, i)"></geo-icon-button>
                </div>
              }
              @if (tentou() && preenchidas(opcoes()).length < 2) {
                <p class="geo-field-error" role="alert">Informe pelo menos duas opções.</p>
              }
              <div>
                <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Adicionar opção" (pressed)="adicionarLinha(opcoes)"></geo-button>
              </div>
            </div>
          </geo-form-section>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="pergunta()?.texto ? 'Salvar pergunta' : 'Adicionar pergunta'" [loading]="salvando()"
          (pressed)="confirmar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaPerguntaChecklistFormComponent {
  private readonly notificacoes = inject(NotificationService);
  private readonly injector = inject(Injector);

  readonly visible = model(false);
  /** Nulo ou sem texto: pergunta nova (pode vir com o grupo já escolhido). */
  readonly pergunta = input<PerguntaChecklist | null>(null);
  readonly grupos = input<string[]>([]);
  readonly salvando = input(false);
  readonly confirmado = output<PerguntaChecklist>();

  protected readonly tiposResposta: GeoSelectOption<TipoRespostaChecklist>[] = (Object.keys(ROTULO_RESPOSTA) as TipoRespostaChecklist[])
    .map((value) => ({ label: ROTULO_RESPOSTA[value], value }));

  protected readonly texto = signal('');
  protected readonly grupo = signal('');
  protected readonly tipoResposta = signal<TipoRespostaChecklist>('OK_NOK');
  protected readonly modoFoto = signal<ModoFotoPergunta>('NUNCA');
  /** Foto no Não OK só existe em pergunta OK / Não OK. */
  protected readonly opcoesFoto = computed(() =>
    (['NUNCA', 'NAO_OK', 'SEMPRE'] as ModoFotoPergunta[])
      .filter((m) => m !== 'NAO_OK' || this.tipoResposta() === 'OK_NOK')
      .map((m) => ({ label: ROTULO_MODO_FOTO[m], value: m }))
  );
  protected readonly motivos = signal<Linha[]>([]);
  protected readonly opcoes = signal<Linha[]>([]);
  protected readonly tentou = signal(false);
  private inicial = '';

  protected readonly sugestoesGrupo = computed(() => this.grupos().filter((g) => g !== this.grupo().trim()));
  protected readonly alterado = computed(() => this.visible() && JSON.stringify(this.resultado()) !== this.inicial);
  protected readonly explicacao = computed(() => {
    switch (this.tipoResposta()) {
      case 'OK_NOK':
        return 'No app: botões OK e Não OK. O Não OK vira pendência para o gestor'
          + (this.modoFoto() === 'NAO_OK' ? ' e exige foto.' : this.modoFoto() === 'SEMPRE' ? '; a foto é pedida sempre.' : '.');
      case 'OPCOES':
        return 'No app: o condutor escolhe uma das opções. As que indicam problema viram pendência para o gestor.';
      default:
        return 'No app: o condutor escreve a resposta. Não gera pendência.';
    }
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const p = this.pergunta();
      untracked(() => this.preencher(p));
    });
  }

  protected preenchidas(lista: Linha[]): Linha[] {
    return lista.filter((l) => l.texto.trim());
  }

  protected adicionarLinha(lista: typeof this.motivos): void {
    const nova: Linha = { uid: ++sequencia, id: null, texto: '', indicaProblema: false };
    lista.update((l) => [...l, nova]);
    afterNextRender(() => document.getElementById(`linha-${nova.uid}`)?.focus(), { injector: this.injector });
  }

  protected alterarLinha(lista: typeof this.motivos, indice: number, mudanca: Partial<Linha>): void {
    lista.update((l) => l.map((x, i) => (i === indice ? { ...x, ...mudanca } : x)));
  }

  protected removerLinha(lista: typeof this.motivos, indice: number): void {
    lista.update((l) => l.filter((_, i) => i !== indice));
  }

  protected confirmar(): void {
    this.tentou.set(true);
    if (!this.texto().trim() || (this.tipoResposta() === 'OPCOES' && this.preenchidas(this.opcoes()).length < 2)) {
      this.notificacoes.warning('Revise os campos destacados da pergunta.');
      return;
    }
    this.confirmado.emit(this.resultado());
  }

  private resultado(): PerguntaChecklist {
    const tipo = this.tipoResposta();
    const alternativas = (lista: Linha[], comProblema: boolean): AlternativaChecklist[] =>
      this.preenchidas(lista).map((l) => ({ id: l.id, texto: l.texto.trim(), indicaProblema: comProblema && l.indicaProblema }));
    return {
      id: this.pergunta()?.id ?? null,
      grupo: this.grupo().trim() || null,
      texto: this.texto().trim(),
      tipoResposta: tipo,
      fotoNoNaoOk: tipo === 'OK_NOK' && this.modoFoto() === 'NAO_OK',
      modoFoto: tipo !== 'OK_NOK' && this.modoFoto() === 'NAO_OK' ? 'NUNCA' : this.modoFoto(),
      motivos: tipo === 'OK_NOK' ? alternativas(this.motivos(), false) : [],
      opcoes: tipo === 'OPCOES' ? alternativas(this.opcoes(), true) : []
    };
  }

  private preencher(p: PerguntaChecklist | null): void {
    const linhas = (lista: AlternativaChecklist[]) => lista.map((a) => ({ uid: ++sequencia, id: a.id, texto: a.texto, indicaProblema: a.indicaProblema }));
    this.texto.set(p?.texto ?? '');
    this.grupo.set(p?.grupo ?? '');
    this.tipoResposta.set(p?.tipoResposta ?? 'OK_NOK');
    this.modoFoto.set(p ? modoFotoDe(p) : 'NUNCA');
    this.motivos.set(linhas(p?.motivos ?? []));
    const opcoes = linhas(p?.opcoes ?? []);
    this.opcoes.set(opcoes.length ? opcoes : [1, 2].map(() => ({ uid: ++sequencia, id: null, texto: '', indicaProblema: false })));
    this.tentou.set(false);
    this.inicial = JSON.stringify(this.resultado());
  }
}
