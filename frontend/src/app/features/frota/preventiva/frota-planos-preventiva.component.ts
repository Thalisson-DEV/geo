import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoMultiSelectComponent,
  GeoNumberInputComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { PlanoPreventivo, PlanoPreventivoRequest } from '../../../core/models/frota-preventiva.models';
import { Criticidade, ROTULO_CRITICIDADE, contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';

const CRITICIDADES: GeoSelectOption<Criticidade>[] = (['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as Criticidade[])
  .map((c) => ({ label: ROTULO_CRITICIDADE[c], value: c }));

interface Tarefa {
  chave: number;
  texto: string;
}

/** Abrangência legível: os tipos de veículo e, com implemento, "com MUNCK". */
export function valePara(p: Pick<PlanoPreventivo, 'tiposVeiculo' | 'tiposImplemento' | 'placas'>): string {
  const placas = p.placas ?? [];
  if (placas.length) {
    const nomes = placas.map((v) => formatarPlaca(v.nome));
    return nomes.length > 4 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3} placas` : nomes.join(', ');
  }
  const partes = [...p.tiposVeiculo.map((t) => t.nome), ...p.tiposImplemento.map((t) => `com ${t.nome}`)];
  return partes.join(', ');
}

/**
 * Planos preventivos (cadastro da frota): o que fazer, em quais veículos e de quanto em quanto.
 * Salvar um plano já coloca os veículos cobertos no acompanhamento da preventiva.
 */
@Component({
  selector: 'app-frota-planos-preventiva',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoMultiSelectComponent,
    GeoNumberInputComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  styles: `
    .frequencia { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    @media (max-width: 480px) { .frequencia { grid-template-columns: minmax(0, 1fr); } }
    .tarefa { display: grid; grid-template-columns: 1.75rem minmax(0, 1fr) auto; gap: 0.5rem; align-items: center; }
    .tarefa__numero { font-weight: 700; color: var(--geo-foreground-subtle); text-align: end; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <geo-data-table title="Planos de preventiva"
      description="Cada plano vale para as placas escolhidas (ou para tipos de veículo e implementos) e vence pelo que chegar primeiro: km, horas ou dias."
      storageKey="frota-planos-preventiva" exportFileName="planos-preventiva" searchPlaceholder="Filtrar nesta lista"
      [columns]="colunas" [rows]="planos()" [rowKey]="chave" [state]="estado()"
      stateTitle="Nenhum plano de preventiva"
      stateDescription="Crie um plano, como Revisão 10 mil km para as picapes, para acompanhar quando cada veículo precisa da revisão."
      [emptyActionLabel]="acesso.editarPreventiva() ? 'Novo plano' : undefined" (emptyAction)="abrir(null)"
      [rowClickable]="acesso.editarPreventiva()" (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (acesso.editarPreventiva()) {
          <geo-button size="sm" icon="pi pi-plus" label="Novo plano" (pressed)="abrir(null)"></geo-button>
        }
      </ng-container>
      <ng-template geoCell="nome" let-row>
        <span class="geo-cell-strong">{{ row.nome }}</span>
        <span class="geo-cell-muted">{{ row.itens.length === 1 ? row.itens[0].nome : contar(row.itens.length, 'item', 'itens') }}{{ row.tarefas.length ? ' · roteiro com ' + contar(row.tarefas.length, 'tarefa', 'tarefas') : '' }}</span>
      </ng-template>
      <ng-template geoCell="frequencia" let-row>
        {{ row.frequencia }}
        @if (row.abrirOsAutomaticamente) { <span class="geo-cell-muted">Abre a OS sozinho</span> }
      </ng-template>
      <ng-template geoCell="veiculos" let-row>
        @if (row.ativo) {
          {{ contar(row.veiculos, 'veículo', 'veículos', 'Nenhum veículo') }}
        } @else {
          <span class="geo-cell-muted">—</span>
        }
      </ng-template>
      <ng-template geoCell="ativo" let-row>
        <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
      </ng-template>
      <ng-template geoRowActions let-row>
        @if (acesso.editarPreventiva()) {
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar plano" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
              [tooltip]="row.ativo ? 'Desativar plano' : 'Reativar plano'" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
          </span>
        }
      </ng-template>
    </geo-data-table>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar plano' : 'Novo plano de preventiva'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" [loading]="salvando()" size="md">
      <div class="geo-form-stack">
        <geo-form-section title="Plano" icon="pi pi-calendar-clock">
          <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="120" placeholder="Ex.: Revisão 10 mil km"
            [error]="tentou() && !nome().trim() ? 'Informe o nome do plano.' : undefined"></geo-text-input>
          <geo-textarea label="Descrição" [(value)]="descricao" [rows]="2" [maxlength]="1000" [showOptional]="true"></geo-textarea>
        </geo-form-section>

        <geo-form-section title="Vale para" icon="pi pi-car"
          [description]="porPlaca() ? 'Só as placas escolhidas entram no acompanhamento.' : 'Os veículos dos tipos escolhidos e os que estiverem com um dos implementos acoplado.'">
          <geo-select label="Escolher por" [options]="formasAbrangencia" [(value)]="abrangencia"></geo-select>
          @if (porPlaca()) {
            <geo-multiselect label="Placas" [options]="opcoesPlaca()" [(value)]="idsVeiculos" placeholder="Escolha as placas" display="chip"
              [maxSelectedLabels]="8" filterPlaceholder="Placa, modelo ou tipo"
              [error]="tentou() && semAbrangencia() ? 'Escolha ao menos uma placa.' : undefined"></geo-multiselect>
          } @else {
            <geo-multiselect label="Tipos de veículo" [options]="opcoesTipoVeiculo()" [(value)]="idsTiposVeiculo" placeholder="Nenhum"
              [error]="tentou() && semAbrangencia() ? 'Escolha ao menos um tipo de veículo ou de implemento.' : undefined"></geo-multiselect>
            <geo-multiselect label="Implementos acoplados" [options]="opcoesTipoImplemento()" [(value)]="idsTiposImplemento" placeholder="Nenhum"
              [showOptional]="true" description="Ex.: um plano do munck vale para o caminhão que estiver com ele, medido pelo próprio caminhão."></geo-multiselect>
          }
        </geo-form-section>

        <geo-form-section title="De quanto em quanto" icon="pi pi-replay"
          description="Vence pelo que chegar primeiro. A antecedência define quando o plano passa a aparecer como próximo e avisa o gestor.">
          <div class="frequencia">
            <geo-number-input label="A cada (km)" [(value)]="intervaloKm" [min]="1" suffix=" km" [showOptional]="true"></geo-number-input>
            <geo-number-input label="Avisar antes (km)" [(value)]="antecedenciaKm" [min]="0" suffix=" km" [showOptional]="true"
              [disabled]="!intervaloKm()" [error]="erroAntecedencia(intervaloKm(), antecedenciaKm(), 'km')"></geo-number-input>
            <geo-number-input label="A cada (horas)" [(value)]="intervaloHoras" [min]="1" suffix=" h" [showOptional]="true"
              description="Para os veículos medidos por horímetro."></geo-number-input>
            <geo-number-input label="Avisar antes (horas)" [(value)]="antecedenciaHoras" [min]="0" suffix=" h" [showOptional]="true"
              [disabled]="!intervaloHoras()" [error]="erroAntecedencia(intervaloHoras(), antecedenciaHoras(), 'horas')"></geo-number-input>
            <geo-number-input label="A cada (dias)" [(value)]="intervaloDias" [min]="1" suffix=" dias" [showOptional]="true"></geo-number-input>
            <geo-number-input label="Avisar antes (dias)" [(value)]="antecedenciaDias" [min]="0" suffix=" dias" [showOptional]="true"
              [disabled]="!intervaloDias()" [error]="erroAntecedencia(intervaloDias(), antecedenciaDias(), 'dias')"></geo-number-input>
          </div>
          @if (tentou() && semFrequencia()) {
            <geo-callout tone="danger" [dense]="true">Informe ao menos uma frequência: km, horas ou dias.</geo-callout>
          }
        </geo-form-section>

        <geo-form-section title="O que a OS leva" icon="pi pi-wrench">
          <geo-multiselect label="Itens de manutenção" [required]="true" [options]="opcoesItem()" [(value)]="idsItem" placeholder="Escolha os itens"
            description="Entram na OS preventiva e contam na repetição, como em qualquer OS."
            [error]="tentou() && !idsItem().length ? 'Escolha ao menos um item.' : undefined"></geo-multiselect>
          <geo-select label="Criticidade da OS" [options]="criticidades" [(value)]="criticidade"></geo-select>
          <geo-boolean-control kind="toggle" label="Abrir a OS sozinho" [(value)]="abrirSozinho"
            description="Quando o veículo entrar na antecedência, a rotina diária abre a OS pendente. Sem isso, o gestor abre pelo acompanhamento."></geo-boolean-control>
        </geo-form-section>

        <geo-form-section title="Roteiro de inspeção" icon="pi pi-list-check" description="Tarefas em ordem. Vão para a OS na abertura; mudar o plano depois não altera as OS já abertas.">
          @for (t of tarefas(); track t.chave; let i = $index) {
            <div class="tarefa">
              <span class="tarefa__numero" aria-hidden="true">{{ i + 1 }}.</span>
              <geo-text-input [label]="'Tarefa ' + (i + 1)" [labelVisible]="false" [value]="t.texto" [maxlength]="300"
                placeholder="Ex.: Conferir o nível do óleo do motor" (valueChange)="alterarTarefa(t.chave, $event)"></geo-text-input>
              <geo-icon-button icon="pi pi-trash" [label]="'Tirar a tarefa ' + (i + 1)" tooltip="Tirar" size="icon-sm" (pressed)="tirarTarefa(t.chave)"></geo-icon-button>
            </div>
          }
          @if (tarefas().length < 50) {
            <geo-button variant="ghost" size="sm" icon="pi pi-plus" label="Adicionar tarefa" (pressed)="adicionarTarefa()"></geo-button>
          }
        </geo-form-section>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar plano'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaPlanosPreventivaComponent {
  private readonly preventiva = inject(FrotaPreventivaService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  protected readonly acesso = acessoFrota();
  protected readonly contar = contar;
  protected readonly criticidades = CRITICIDADES;

  protected readonly planos = signal<PlanoPreventivo[]>([]);
  protected readonly carregando = signal(false);
  protected readonly opcoesTipoVeiculo = signal<GeoSelectOption<string>[]>([]);
  protected readonly opcoesTipoImplemento = signal<GeoSelectOption<string>[]>([]);
  protected readonly opcoesItem = signal<GeoSelectOption<string>[]>([]);

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<PlanoPreventivo | null>(null);
  protected readonly nome = signal('');
  protected readonly descricao = signal('');
  protected readonly idsTiposVeiculo = signal<string[]>([]);
  protected readonly idsTiposImplemento = signal<string[]>([]);
  protected readonly idsVeiculos = signal<string[]>([]);
  protected readonly abrangencia = signal<'PLACAS' | 'TIPOS'>('PLACAS');
  protected readonly porPlaca = computed(() => this.abrangencia() === 'PLACAS');
  protected readonly formasAbrangencia: GeoSelectOption<'PLACAS' | 'TIPOS'>[] = [
    { label: 'Placas escolhidas', value: 'PLACAS' },
    { label: 'Tipos de veículo (inclui os que chegarem depois)', value: 'TIPOS' }
  ];
  protected readonly opcoesPlaca = signal<GeoSelectOption<string>[]>([]);
  protected readonly intervaloKm = signal<number | null>(null);
  protected readonly intervaloHoras = signal<number | null>(null);
  protected readonly intervaloDias = signal<number | null>(null);
  protected readonly antecedenciaKm = signal<number | null>(null);
  protected readonly antecedenciaHoras = signal<number | null>(null);
  protected readonly antecedenciaDias = signal<number | null>(null);
  protected readonly idsItem = signal<string[]>([]);
  protected readonly criticidade = signal<Criticidade>('MEDIA');
  protected readonly abrirSozinho = signal(false);
  protected readonly tarefas = signal<Tarefa[]>([]);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  private proximaChave = 0;
  private original = '';

  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.planos().length ? 'ready' : 'empty'));
  protected readonly semAbrangencia = computed(() =>
    this.porPlaca() ? !this.idsVeiculos().length : !this.idsTiposVeiculo().length && !this.idsTiposImplemento().length);
  protected readonly semFrequencia = computed(() => !this.intervaloKm() && !this.intervaloHoras() && !this.intervaloDias());
  protected readonly alterado = computed(() => this.formularioAberto() && JSON.stringify(this.pedido()) !== this.original);

  protected readonly colunas: GeoDataTableColumn<PlanoPreventivo>[] = [
    { key: 'nome', header: 'Plano', type: 'custom', priority: 1, value: (p) => p.nome, display: (p) => p.nome },
    { key: 'valePara', header: 'Vale para', priority: 1, value: (p) => valePara(p), display: (p) => valePara(p) },
    { key: 'frequencia', header: 'Frequência', type: 'custom', priority: 1, value: (p) => p.frequencia, display: (p) => p.frequencia },
    { key: 'veiculos', header: 'Acompanha', type: 'custom', value: (p) => p.veiculos, display: (p) => contar(p.veiculos, 'veículo', 'veículos') },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (p) => p.ativo, display: (p) => (p.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (p: PlanoPreventivo) => p.id;

  constructor() {
    this.carregar();
    this.frota.tiposVeiculo(true).subscribe({
      next: (p) => this.opcoesTipoVeiculo.set(p.content.map((t) => ({ label: t.nome, value: t.id }))),
      error: () => undefined
    });
    this.frota.tiposImplemento(true).subscribe({
      next: (p) => this.opcoesTipoImplemento.set(p.content.map((t) => ({ label: t.nome, value: t.id }))),
      error: () => undefined
    });
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.opcoesPlaca.set(p.content.map((v) => ({
        label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}${v.tipoVeiculo ? ' · ' + v.tipoVeiculo : ''}`,
        value: v.idVeiculo
      }))),
      error: () => undefined
    });
    this.frota.itensManutencao(true).subscribe({
      next: (p) => this.opcoesItem.set(p.content.map((i) => ({ label: i.nome, value: i.id }))),
      error: () => undefined
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.preventiva.planos().subscribe({
      next: (planos) => {
        this.planos.set(planos);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrir(p: PlanoPreventivo | null): void {
    this.emEdicao.set(p);
    this.nome.set(p?.nome ?? '');
    this.descricao.set(p?.descricao ?? '');
    this.idsTiposVeiculo.set(p?.tiposVeiculo.map((t) => t.id) ?? []);
    this.idsTiposImplemento.set(p?.tiposImplemento.map((t) => t.id) ?? []);
    this.idsVeiculos.set(p?.placas?.map((v) => v.id) ?? []);
    // Plano antigo, só por tipo, abre por tipo; o novo, por placa.
    this.abrangencia.set(p && !p.placas?.length ? 'TIPOS' : 'PLACAS');
    this.intervaloKm.set(p?.intervaloKm ?? null);
    this.intervaloHoras.set(p?.intervaloHoras ?? null);
    this.intervaloDias.set(p?.intervaloDias ?? null);
    this.antecedenciaKm.set(p?.antecedenciaKm ?? null);
    this.antecedenciaHoras.set(p?.antecedenciaHoras ?? null);
    this.antecedenciaDias.set(p?.antecedenciaDias ?? null);
    this.idsItem.set(p?.itens.map((i) => i.id) ?? []);
    this.criticidade.set(p?.criticidade ?? 'MEDIA');
    this.abrirSozinho.set(p?.abrirOsAutomaticamente ?? false);
    this.tarefas.set((p?.tarefas ?? []).map((texto) => ({ chave: this.proximaChave++, texto })));
    if (!p) this.adicionarTarefa();
    // Itens desativados que o plano já tem continuam escolhíveis na edição.
    const faltando = (p?.itens ?? []).filter((i) => !this.opcoesItem().some((o) => o.value === i.id));
    if (faltando.length) this.opcoesItem.update((o) => [...o, ...faltando.map((i) => ({ label: `${i.nome} (inativo)`, value: i.id }))]);
    this.original = JSON.stringify(this.pedido());
    this.tentou.set(false);
    this.formularioAberto.set(true);
  }

  protected adicionarTarefa(): void {
    this.tarefas.update((t) => [...t, { chave: this.proximaChave++, texto: '' }]);
  }

  protected alterarTarefa(chave: number, texto: string): void {
    this.tarefas.update((lista) => lista.map((t) => (t.chave === chave ? { ...t, texto } : t)));
  }

  protected tirarTarefa(chave: number): void {
    this.tarefas.update((lista) => lista.filter((t) => t.chave !== chave));
  }

  protected erroAntecedencia(intervalo: number | null, antecedencia: number | null, unidade: string): string | undefined {
    return intervalo && antecedencia != null && antecedencia >= intervalo
      ? `A antecedência em ${unidade} precisa ser menor que a frequência.` : undefined;
  }

  protected salvar(): void {
    this.tentou.set(true);
    const invalido = !this.nome().trim() || this.semAbrangencia() || this.semFrequencia() || !this.idsItem().length
      || !!this.erroAntecedencia(this.intervaloKm(), this.antecedenciaKm(), 'km')
      || !!this.erroAntecedencia(this.intervaloHoras(), this.antecedenciaHoras(), 'horas')
      || !!this.erroAntecedencia(this.intervaloDias(), this.antecedenciaDias(), 'dias');
    if (invalido) return;
    this.salvando.set(true);
    this.preventiva.salvarPlano(this.pedido(), this.emEdicao()?.id).subscribe({
      next: (plano) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(`${plano.nome} salvo: acompanha ${contar(plano.veiculos, 'veículo', 'veículos', 'nenhum veículo')}.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(p: PlanoPreventivo): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: p.ativo ? 'Desativar plano' : 'Reativar plano',
      message: p.ativo
        ? `${p.nome} deixa de acompanhar ${contar(p.veiculos, 'veículo', 'veículos')}. As OS e realizações já feitas continuam no histórico.`
        : `${p.nome} volta a acompanhar os veículos dos tipos cobertos.`,
      confirmLabel: p.ativo ? 'Desativar' : 'Reativar',
      variant: p.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.preventiva.alternarPlano(p).subscribe({
      next: () => {
        this.notificacoes.success(p.ativo ? `${p.nome} desativado.` : `${p.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private pedido(): PlanoPreventivoRequest {
    return {
      nome: this.nome().trim(),
      descricao: this.descricao().trim() || null,
      idsTiposVeiculo: this.porPlaca() ? [] : this.idsTiposVeiculo(),
      idsTiposImplemento: this.porPlaca() ? [] : this.idsTiposImplemento(),
      idsVeiculos: this.porPlaca() ? this.idsVeiculos() : [],
      intervaloKm: this.intervaloKm(),
      intervaloHoras: this.intervaloHoras(),
      intervaloDias: this.intervaloDias(),
      antecedenciaKm: this.intervaloKm() ? this.antecedenciaKm() : null,
      antecedenciaHoras: this.intervaloHoras() ? this.antecedenciaHoras() : null,
      antecedenciaDias: this.intervaloDias() ? this.antecedenciaDias() : null,
      criticidade: this.criticidade(),
      abrirOsAutomaticamente: this.abrirSozinho(),
      idsItem: this.idsItem(),
      tarefas: this.tarefas().map((t) => t.texto.trim()).filter(Boolean)
    };
  }
}
