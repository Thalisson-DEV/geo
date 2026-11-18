import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoMultiSelectComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { ModeloChecklist, TipoModeloChecklist } from '../../../core/models/frota-checklist.models';
import { TipoImplemento, TipoVeiculo } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaService } from '../../../core/services/frota.service';
import { linhas, perguntaNova, requestDe } from './frota-modelo-checklist.util';

/**
 * Dados do modelo (nome, tipo, a que se aplica, instruções). No modelo novo pede também as
 * primeiras perguntas, uma por linha: cada uma é detalhada depois na página do modelo.
 */
@Component({
  selector: 'app-frota-modelo-checklist-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoMultiSelectComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  template: `
    <geo-form-drawer [(visible)]="visible" [title]="modelo() ? 'Editar dados do modelo' : 'Novo modelo de checklist'"
      [description]="modelo() ? modelo()!.nome : 'Depois de criar, você detalha cada pergunta na página do modelo.'"
      [dirty]="alterado()" [loading]="salvando()" size="md">
      <div class="geo-form-stack">
        <geo-form-section title="Identificação" icon="pi pi-id-card">
          <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="120" placeholder="Ex.: Caminhonete"
            [error]="tentou() && !nome().trim() ? 'Informe o nome.' : undefined"></geo-text-input>
          <geo-select label="Tipo" [required]="true" [options]="tipos" [(value)]="tipo"
            [description]="tipo() === 'PRINCIPAL' ? 'O checklist do veículo.' : 'Perguntas extras quando o implemento está acoplado ao veículo.'"></geo-select>
        </geo-form-section>

        <geo-form-section title="A que se aplica" icon="pi pi-car">
          @if (tipo() === 'PRINCIPAL') {
            <geo-multiselect label="Tipos de veículo" [options]="opcoesTiposVeiculo()" [(value)]="idsTiposVeiculo" [showOptional]="true"
              display="chip" description="Em branco, vale para todos os veículos que não têm modelo próprio."></geo-multiselect>
          } @else {
            <geo-multiselect label="Tipos de implemento" [required]="true" [options]="opcoesTiposImplemento()" [(value)]="idsTiposImplemento"
              display="chip" [error]="tentou() && !idsTiposImplemento().length ? 'Escolha ao menos um tipo de implemento.' : undefined"></geo-multiselect>
          }
        </geo-form-section>

        <geo-form-section title="No app" icon="pi pi-mobile">
          <geo-textarea label="Instruções ao condutor" [(value)]="instrucoes" [rows]="2" [maxlength]="2000" [showOptional]="true"
            placeholder="Ex.: Faça o checklist com o veículo parado e o motor desligado."></geo-textarea>
          <geo-boolean-control kind="toggle" label="Pedir confirmação de quem preencheu" [(value)]="exigeAssinatura"
            description="Antes de enviar, o app pede a confirmação com o login."></geo-boolean-control>
        </geo-form-section>

        @if (!modelo()) {
          <geo-form-section title="Primeiras perguntas" icon="pi pi-list-check">
            <geo-textarea label="Perguntas" [required]="true" [(value)]="perguntas" [rows]="6"
              description="Uma por linha. Todas começam como OK / Não OK; você ajusta cada uma depois."
              placeholder="Faróis&#10;Lanternas&#10;Pneus&#10;Extintor"
              [error]="tentou() && !linhas(perguntas()).length ? 'Escreva pelo menos uma pergunta.' : undefined"></geo-textarea>
          </geo-form-section>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="modelo() ? 'Salvar dados' : 'Criar modelo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaModeloChecklistFormComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  /** Nulo: modelo novo. */
  readonly modelo = input<ModeloChecklist | null>(null);
  readonly salvo = output<ModeloChecklist>();

  protected readonly linhas = linhas;
  protected readonly tipos: GeoSelectOption<TipoModeloChecklist>[] = [
    { label: 'Principal', value: 'PRINCIPAL' },
    { label: 'Adicional por implemento', value: 'ADICIONAL' }
  ];
  protected readonly tiposVeiculo = signal<TipoVeiculo[]>([]);
  protected readonly tiposImplemento = signal<TipoImplemento[]>([]);

  protected readonly nome = signal('');
  protected readonly tipo = signal<TipoModeloChecklist>('PRINCIPAL');
  protected readonly idsTiposVeiculo = signal<string[]>([]);
  protected readonly idsTiposImplemento = signal<string[]>([]);
  protected readonly instrucoes = signal('');
  protected readonly exigeAssinatura = signal(false);
  protected readonly perguntas = signal('');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  private inicial = '';

  protected readonly opcoesTiposVeiculo = computed<GeoSelectOption<string>[]>(() =>
    this.tiposVeiculo().filter((t) => t.ativo || this.idsTiposVeiculo().includes(t.id)).map((t) => ({ label: t.nome, value: t.id }))
  );
  protected readonly opcoesTiposImplemento = computed<GeoSelectOption<string>[]>(() =>
    this.tiposImplemento().filter((t) => t.ativo || this.idsTiposImplemento().includes(t.id)).map((t) => ({ label: t.nome, value: t.id }))
  );
  protected readonly alterado = computed(() => this.visible() && this.retrato() !== this.inicial);

  constructor() {
    this.frota.tiposVeiculo().subscribe({ next: (p) => this.tiposVeiculo.set(p.content), error: () => undefined });
    this.frota.tiposImplemento().subscribe({ next: (p) => this.tiposImplemento.set(p.content), error: () => undefined });
    effect(() => {
      if (!this.visible()) return;
      const m = this.modelo();
      untracked(() => this.preencher(m));
    });
  }

  protected salvar(): void {
    this.tentou.set(true);
    const novas = linhas(this.perguntas());
    if (!this.nome().trim() || (this.tipo() === 'ADICIONAL' && !this.idsTiposImplemento().length) || (!this.modelo() && !novas.length)) {
      this.notificacoes.warning('Revise os campos destacados.');
      return;
    }
    const atual = this.modelo();
    const base: ModeloChecklist = {
      ...(atual ?? { id: '', tipoRotulo: '', perguntas: novas.map((t) => perguntaNova(t.slice(0, 300))), fotosRecebimento: [], ativo: true }),
      nome: this.nome().trim(),
      tipo: this.tipo(),
      instrucoes: this.instrucoes().trim() || null,
      exigeAssinatura: this.exigeAssinatura(),
      tiposVeiculo: this.tipo() === 'PRINCIPAL' ? this.idsTiposVeiculo().map((valor) => ({ valor, rotulo: '' })) : [],
      tiposImplemento: this.tipo() === 'ADICIONAL' ? this.idsTiposImplemento().map((valor) => ({ valor, rotulo: '' })) : []
    } as ModeloChecklist;
    this.salvando.set(true);
    this.checklist.salvarModelo(requestDe(base), atual?.id).subscribe({
      next: (m) => {
        this.salvando.set(false);
        this.visible.set(false);
        this.notificacoes.success(atual ? 'Dados do modelo salvos.' : `Modelo ${m.nome} criado.`);
        this.salvo.emit(m);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preencher(m: ModeloChecklist | null): void {
    this.nome.set(m?.nome ?? '');
    this.tipo.set(m?.tipo ?? 'PRINCIPAL');
    this.idsTiposVeiculo.set(m?.tiposVeiculo.map((t) => t.valor) ?? []);
    this.idsTiposImplemento.set(m?.tiposImplemento.map((t) => t.valor) ?? []);
    this.instrucoes.set(m?.instrucoes ?? '');
    this.exigeAssinatura.set(m?.exigeAssinatura ?? false);
    this.perguntas.set('');
    this.tentou.set(false);
    this.inicial = this.retrato();
  }

  private retrato(): string {
    return JSON.stringify([this.nome(), this.tipo(), this.idsTiposVeiculo(), this.idsTiposImplemento(), this.instrucoes(),
      this.exigeAssinatura(), this.perguntas()]);
  }
}
