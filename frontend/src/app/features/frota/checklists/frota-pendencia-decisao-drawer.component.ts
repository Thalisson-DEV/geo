import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GeoAutocompleteComponent,
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
import { LookupStore } from '../../../core/lookup';
import { PendenciaChecklist } from '../../../core/models/frota-checklist.models';
import { FornecedorFrota, ItemManutencao, OpcoesFrota, OrdemServicoDetalhe, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaService } from '../../../core/services/frota.service';
import { basesFrota } from '../shared/frota-lista';

export type ModoDecisao = 'os' | 'hora';

/**
 * Decisão do gestor sobre uma ou mais pendências do mesmo veículo: abrir a OS (o serviço segue
 * pela OS) ou registrar que foi resolvido na hora (a OS nasce concluída, para o histórico).
 */
@Component({
  selector: 'app-frota-pendencia-decisao-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    GeoAutocompleteComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoMultiSelectComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  styles: `
    .problemas { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .problemas__comentario { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
  `,
  template: `
    <geo-form-drawer [(visible)]="visible" [title]="modo() === 'os' ? 'Abrir OS' : 'Resolvido na hora'"
      [description]="descricao()" [dirty]="alterado()" [loading]="salvando()" size="md">
      <div class="geo-form-stack">
        <geo-form-section [title]="pendencias().length === 1 ? 'Problema apontado' : pendencias().length + ' problemas apontados'" icon="pi pi-exclamation-triangle">
          <ul class="problemas">
            @for (p of pendencias(); track p.id) {
              <li>
                {{ p.resumo }}
                @if (p.comentario) {
                  <span class="problemas__comentario"> · {{ p.comentario }}</span>
                }
              </li>
            }
          </ul>
        </geo-form-section>

        <geo-form-section title="Manutenção" icon="pi pi-wrench">
          <geo-multiselect label="Itens de manutenção" [required]="true" [options]="opcoesItens()" [(value)]="idsItem" display="chip"
            [loading]="!itens().length" [error]="tentou() && !idsItem().length ? 'Escolha ao menos um item.' : undefined"
            description="O que a OS registra no histórico do veículo."></geo-multiselect>
          @if (modo() === 'os') {
            <geo-select label="Criticidade" [options]="opcoesCriticidade()" [(value)]="criticidade"></geo-select>
            <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="500" [showOptional]="true"
              description="Entra na descrição da OS, depois dos problemas apontados."></geo-textarea>
          }
        </geo-form-section>

        @if (modo() === 'os') {
          <geo-form-section title="Oficina e fornecedor" icon="pi pi-building" description="Opcional: informe já se o fornecedor é conhecido.">
            <geo-select label="Onde será feito" [options]="opcoesOficina()" [(value)]="tipoOficina"></geo-select>
            @if (tipoOficina() === 'EXTERNA') {
              <geo-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="idFornecedor" [filter]="true" [clearable]="true"
                [showOptional]="true" description="Cadastro de fornecedores do financeiro."></geo-select>
            }
            <geo-text-input [label]="tipoOficina() === 'EXTERNA' ? 'Oficina não cadastrada' : 'Oficina'" [(value)]="oficinaNome" [maxlength]="150"
              [showOptional]="true"></geo-text-input>
          </geo-form-section>
        }

        @if (modo() === 'hora') {
          <geo-form-section title="O que foi feito" icon="pi pi-check-circle">
            <geo-textarea label="Serviço feito" [required]="true" [(value)]="servico" [rows]="2" [maxlength]="1000"
              placeholder="Ex.: Lâmpada do farol trocada pelo condutor." [error]="tentou() && !servico().trim() ? 'Descreva o que foi feito.' : undefined"></geo-textarea>
            <geo-boolean-control kind="toggle" label="Feito por um colaborador" [(value)]="porColaborador"
              [description]="porColaborador() ? 'Fica como serviço da oficina interna, em nome dele.' : 'Fica como oficina externa, com o nome de quem fez.'"></geo-boolean-control>
            @if (porColaborador()) {
              <geo-autocomplete label="Quem fez" [required]="true" [options]="opcoesColaborador()" [status]="statusBusca()"
                [loading]="statusBusca() === 'loading'" [ngModel]="idExecutor()" (ngModelChange)="idExecutor.set($event)"
                (search)="buscarColaborador($event)" [error]="tentou() && !idExecutor() ? 'Escolha quem fez.' : undefined"></geo-autocomplete>
            } @else {
              <geo-text-input label="Quem fez" [required]="true" [(value)]="executorNome" [maxlength]="120" placeholder="Ex.: Borracharia do posto"
                [error]="tentou() && !executorNome().trim() ? 'Informe quem fez.' : undefined"></geo-text-input>
            }
            <geo-select label="Base onde foi feito" [options]="bases.opcoes()" [(value)]="idBase" [clearable]="true" [showOptional]="true"></geo-select>
            <geo-select label="Causa" [options]="opcoesCausa()" [(value)]="causa" [clearable]="true" [showOptional]="true"
              description="Em branco, fica como serviço corretivo."></geo-select>
          </geo-form-section>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)"></geo-button>
        <geo-button [icon]="modo() === 'os' ? 'pi pi-wrench' : 'pi pi-check'" [label]="modo() === 'os' ? 'Abrir OS' : 'Registrar e concluir OS'"
          [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaPendenciaDecisaoDrawerComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  protected readonly bases = basesFrota();

  readonly visible = model(false);
  readonly modo = input<ModoDecisao>('os');
  readonly pendencias = input<readonly PendenciaChecklist[]>([]);
  readonly concluido = output<OrdemServicoDetalhe>();

  protected readonly itens = signal<ItemManutencao[]>([]);
  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly idsItem = signal<string[]>([]);
  protected readonly criticidade = signal<string | null>('MEDIA');
  protected readonly observacao = signal('');
  protected readonly servico = signal('');
  protected readonly porColaborador = signal(true);
  protected readonly idExecutor = signal<string | null>(null);
  protected readonly executorNome = signal('');
  protected readonly idBase = signal<string | null>(null);
  protected readonly causa = signal<string | null>(null);
  protected readonly opcoesColaborador = signal<GeoSelectOption<string>[]>([]);
  protected readonly statusBusca = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly tipoOficina = signal<'INTERNA' | 'EXTERNA'>('EXTERNA');
  protected readonly idFornecedor = signal<string | null>(null);
  protected readonly oficinaNome = signal('');
  private readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly opcoesFornecedor = computed<GeoSelectOption<string>[]>(() => this.fornecedores().map((f) => ({ label: f.nome, value: f.id })));
  protected readonly opcoesOficina = computed<GeoSelectOption<'INTERNA' | 'EXTERNA'>[]>(() =>
    (this.opcoes()?.tiposOficina ?? []).map((o) => ({ label: o.rotulo, value: o.valor as 'INTERNA' | 'EXTERNA' }))
  );

  protected readonly opcoesItens = computed<GeoSelectOption<string>[]>(() => this.itens().map((i) => ({ label: i.nome, value: i.id })));
  protected readonly opcoesCriticidade = computed<GeoSelectOption<string>[]>(() =>
    (this.opcoes()?.criticidades ?? []).map((c) => ({ label: c.rotulo, value: c.valor }))
  );
  protected readonly opcoesCausa = computed<GeoSelectOption<string>[]>(() =>
    (this.opcoes()?.causasManutencao ?? []).map((c) => ({ label: c.rotulo, value: c.valor }))
  );
  protected readonly descricao = computed(() => {
    const p = this.pendencias()[0];
    if (!p) return undefined;
    return `${formatarPlaca(p.placa)}${p.baseNome ? ' · ' + p.baseNome : ''}${p.condutorNome ? ' · condutor ' + p.condutorNome : ''}`;
  });
  protected readonly alterado = computed(
    () => this.visible() && (this.idsItem().length > 0 || !!this.observacao().trim() || !!this.servico().trim())
  );

  constructor() {
    effect(() => {
      if (this.visible()) untracked(() => {
        this.limpar();
        this.carregarListas();
      });
    });
  }

  protected buscarColaborador(termo: string): void {
    this.statusBusca.set('loading');
    this.lookups.searchCollaborators({ query: termo, limit: 20 }).subscribe({
      next: (pagina) => {
        this.opcoesColaborador.set(pagina.items.map((i) => ({ label: i.label, value: i.value })));
        this.statusBusca.set(pagina.items.length ? 'success' : 'empty');
      },
      error: () => this.statusBusca.set('error')
    });
  }

  protected salvar(): void {
    this.tentou.set(true);
    const ids = this.pendencias().map((p) => p.id);
    if (!this.idsItem().length) return;
    const hora = this.modo() === 'hora';
    if (hora && (!this.servico().trim() || (this.porColaborador() ? !this.idExecutor() : !this.executorNome().trim()))) return;
    const operacao = hora
      ? this.checklist.resolverNaHora({
          idsPendencia: ids,
          idsItem: this.idsItem(),
          descricaoServico: this.servico().trim(),
          idExecutor: this.porColaborador() ? this.idExecutor() : null,
          executorNome: this.porColaborador() ? null : this.executorNome().trim(),
          idBaseOperacional: this.idBase(),
          causa: this.causa()
        })
      : this.checklist.abrirOs({
          idsPendencia: ids,
          idsItem: this.idsItem(),
          criticidade: this.criticidade(),
          observacao: this.observacao().trim() || null,
          tipoOficina: this.tipoOficina(),
          idFornecedor: this.tipoOficina() === 'EXTERNA' ? this.idFornecedor() : null,
          oficinaNome: this.oficinaNome().trim() || null
        });
    this.salvando.set(true);
    operacao.subscribe({
      next: (os) => {
        this.salvando.set(false);
        this.visible.set(false);
        this.notificacoes.success(hora ? `Registrado na OS ${os.ordem.numero}, já concluída.` : `OS ${os.ordem.numero} aberta.`);
        this.concluido.emit(os);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Itens e opções vêm na primeira abertura, não com a tela. */
  private carregarListas(): void {
    if (!this.itens().length) {
      this.frota.itensManutencao(true).subscribe({ next: (p) => this.itens.set(p.content), error: () => undefined });
    }
    if (!this.opcoes()) {
      this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    }
    if (!this.fornecedores().length && this.modo() === 'os') {
      this.frota.fornecedoresOficina().subscribe({ next: (f) => this.fornecedores.set(f), error: () => undefined });
    }
  }

  private limpar(): void {
    this.idsItem.set([]);
    this.criticidade.set('MEDIA');
    this.observacao.set('');
    this.servico.set('');
    this.porColaborador.set(true);
    this.idExecutor.set(null);
    this.executorNome.set('');
    this.idBase.set(null);
    this.causa.set(null);
    this.tipoOficina.set('EXTERNA');
    this.idFornecedor.set(null);
    this.oficinaNome.set('');
    this.tentou.set(false);
  }
}
