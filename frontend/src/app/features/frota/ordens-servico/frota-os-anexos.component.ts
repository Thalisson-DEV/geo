import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFileInputComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { AnexoOrdemServico, OrdemServico } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

const LIMITE_ARQUIVO = 15 * 1024 * 1024;
/** Valor do seletor que libera a descrição livre. */
const OUTRO = '__outro__';
const TIPOS: GeoSelectOption<string>[] = [
  { label: 'Checklist da oficina assinado', value: 'Checklist da oficina assinado' },
  { label: 'Foto de antes do serviço', value: 'Foto de antes do serviço' },
  { label: 'Foto de depois do serviço', value: 'Foto de depois do serviço' },
  { label: 'Laudo ou orçamento da oficina', value: 'Laudo ou orçamento da oficina' },
  { label: 'Outro', value: OUTRO }
];

const tamanho = (bytes: number | null | undefined) =>
  bytes == null ? '' : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Anexos e evidências da OS: o checklist da oficina assinado, fotos de antes e depois (o estado
 * do pneu, a peça quebrada) e laudos. Entram com a OS aberta ou depois de concluída.
 */
@Component({
  selector: 'app-frota-os-anexos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFileInputComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoTextInputComponent
  ],
  template: `
    <geo-data-table
      title="Anexos e evidências"
      description="Checklist da oficina assinado, fotos de antes e depois e laudos. Podem entrar depois da conclusão."
      storageKey="frota-os-anexos"
      searchPlaceholder="Filtrar nesta lista"
      rowActionLabel="Abrir arquivo"
      [columns]="colunas"
      [rows]="anexos()"
      [rowKey]="chave"
      [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar os anexos' : 'Nenhum anexo'"
      [stateDescription]="erro() ?? (podeAnexar() ? 'Use Anexar arquivo para guardar o checklist assinado ou as fotos do serviço.' : 'Nenhum arquivo foi anexado a esta OS.')"
      (rowActivate)="abrir($event)"
    >
      <ng-container table-actions>
        @if (podeAnexar()) {
          <geo-button size="sm" icon="pi pi-paperclip" label="Anexar arquivo" (pressed)="novo()"></geo-button>
        }
      </ng-container>
      <ng-template geoCell="descricao" let-row>
        <span class="geo-cell-strong">{{ row.descricao ?? row.arquivoNome }}</span>
        <span class="geo-cell-muted">{{ row.descricao ? row.arquivoNome + ' · ' : '' }}{{ tamanho(row.arquivoTamanhoBytes) }}</span>
      </ng-template>
      <ng-template geoCell="enviadoEm" let-row>
        {{ row.enviadoEm | date: 'dd/MM/yyyy HH:mm' }}
        @if (row.enviadoPor) {<span class="geo-cell-muted">{{ row.enviadoPor }}</span>}
      </ng-template>
      <ng-template geoRowActions let-row>
        <span class="geo-table-actions">
          <geo-icon-button icon="pi pi-download" [label]="'Baixar ' + (row.descricao ?? row.arquivoNome)" tooltip="Baixar" size="icon-sm"
            (pressed)="baixar(row)"></geo-icon-button>
          @if (podeAnexar()) {
            <geo-icon-button icon="pi pi-trash" [label]="'Excluir ' + (row.descricao ?? row.arquivoNome)" tooltip="Excluir anexo" size="icon-sm"
              (pressed)="excluir(row)"></geo-icon-button>
          }
        </span>
      </ng-template>
    </geo-data-table>

    <geo-form-drawer [(visible)]="formularioAberto" title="Anexar arquivo"
      [description]="'OS ' + ordem().numero + '. PDF ou imagem, até 15 MB.'" [dirty]="!!arquivo()" [loading]="salvando()" size="sm">
      <div class="geo-form-stack">
        <geo-select label="O que é" [required]="true" [options]="tipos" [(value)]="tipo"></geo-select>
        @if (tipo() === outro) {
          <geo-text-input label="Descrição" [(value)]="descricaoLivre" [maxlength]="200" [showOptional]="true"
            placeholder="Ex.: foto do pneu dianteiro"></geo-text-input>
        }
        <geo-file-input label="Arquivo" [required]="true" description="PDF ou imagem (JPG, PNG, WEBP), até 15 MB."
          accept="application/pdf,image/jpeg,image/png,image/webp" [maxBytes]="limiteArquivo" [(file)]="arquivo"
          [error]="tentouSalvar() && !arquivo() ? 'Escolha o arquivo.' : undefined"></geo-file-input>
        @if (erroServidor()) {
          <geo-callout tone="danger" [dense]="true">{{ erroServidor() }}</geo-callout>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" label="Anexar" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaOsAnexosComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly ordem = input.required<OrdemServico>();
  readonly podeEditar = input(false);

  protected readonly tipos = TIPOS;
  protected readonly outro = OUTRO;
  protected readonly limiteArquivo = LIMITE_ARQUIVO;
  protected readonly tamanho = tamanho;

  protected readonly anexos = signal<AnexoOrdemServico[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly formularioAberto = signal(false);
  protected readonly tipo = signal<string | null>(TIPOS[0].value);
  protected readonly descricaoLivre = signal('');
  protected readonly arquivo = signal<File | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);
  protected readonly erroServidor = signal<string | null>(null);

  /** Só o id: a OS atualizada por outra ação não recarrega a lista. */
  private readonly idOrdem = computed(() => this.ordem().id);
  protected readonly podeAnexar = computed(() => this.podeEditar() && this.ordem().situacao !== 'CANCELADA');
  protected readonly estado = computed<'loading' | 'error' | 'empty' | 'ready'>(() =>
    this.carregando() ? 'loading' : this.erro() ? 'error' : this.anexos().length ? 'ready' : 'empty'
  );

  protected readonly colunas: GeoDataTableColumn<AnexoOrdemServico>[] = [
    { key: 'descricao', header: 'Anexo', type: 'custom', priority: 1, value: (r) => r.descricao ?? r.arquivoNome, display: (r) => `${r.descricao ?? ''} ${r.arquivoNome}` },
    { key: 'enviadoEm', header: 'Enviado em', type: 'custom', priority: 1, value: (r) => r.enviadoEm, display: (r) => r.enviadoEm }
  ];
  protected readonly chave = (r: AnexoOrdemServico) => r.id;

  constructor() {
    effect(() => {
      const id = this.idOrdem();
      untracked(() => this.carregar(id));
    });
  }

  protected novo(): void {
    this.tipo.set(TIPOS[0].value);
    this.descricaoLivre.set('');
    this.arquivo.set(null);
    this.tentouSalvar.set(false);
    this.erroServidor.set(null);
    this.formularioAberto.set(true);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    const arquivo = this.arquivo();
    if (!arquivo) return;
    const descricao = this.tipo() === OUTRO ? this.descricaoLivre() : this.tipo();
    this.salvando.set(true);
    this.erroServidor.set(null);
    this.frota.anexarOs(this.ordem().id, arquivo, descricao).subscribe({
      next: (lista) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.anexos.set(lista);
        this.notificacoes.success('Arquivo anexado à OS.');
      },
      error: (e) => {
        this.salvando.set(false);
        this.erroServidor.set(getErrorMessage(e));
      }
    });
  }

  /** Imagem e PDF abrem em outra aba; o navegador mostra sem baixar. */
  protected abrir(anexo: AnexoOrdemServico): void {
    this.frota.baixarAnexoOs(this.ordem().id, anexo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected baixar(anexo: AnexoOrdemServico): void {
    this.frota.baixarAnexoOs(this.ordem().id, anexo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = anexo.arquivoNome;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async excluir(anexo: AnexoOrdemServico): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Excluir anexo',
      message: `${anexo.descricao ?? anexo.arquivoNome} sai da OS. O arquivo fica guardado para auditoria e a exclusão entra no histórico.`,
      confirmLabel: 'Excluir anexo',
      variant: 'destructive'
    });
    if (!ok) return;
    this.frota.removerAnexoOs(this.ordem().id, anexo.id).subscribe({
      next: (lista) => {
        this.anexos.set(lista);
        this.notificacoes.success('Anexo excluído.');
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private carregar(idOs: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.frota.anexosOs(idOs).subscribe({
      next: (lista) => {
        this.anexos.set(lista);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }
}
