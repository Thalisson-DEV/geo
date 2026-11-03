import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFileInputComponent,
  CesFormDrawerComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import {
  DocumentoFiscalOrdemServico,
  FornecedorFrota,
  OrdemServico,
  ROTULO_DOCUMENTO_FISCAL,
  TipoDocumentoFiscal,
  paraDataIso
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

const LIMITE_ARQUIVO = 15 * 1024 * 1024;
/** Valor do seletor de fornecedor que libera o campo de nome livre. */
const OUTRO_FORNECEDOR = '__outro__';

/**
 * Notas, cupons e recibos da OS. Entram com a OS aberta ou depois da conclusão (a nota
 * costuma chegar depois); a OS cancelada não recebe documento.
 */
@Component({
  selector: 'app-frota-os-documentos-fiscais',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFileInputComponent,
    CesFormDrawerComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesTextInputComponent
  ],
  template: `
    <ces-data-table
      title="Documentos fiscais"
      description="Notas, cupons e recibos do serviço. Podem ser lançados depois da conclusão, quando a nota chegar."
      storageKey="frota-os-documentos-fiscais"
      searchPlaceholder="Filtrar nesta lista"
      [columns]="colunas"
      [rows]="documentos()"
      [rowKey]="chave"
      [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar os documentos' : 'Nenhum documento fiscal'"
      [stateDescription]="erro() ?? (podeLancar() ? 'Use Lançar documento para registrar a nota com o arquivo.' : 'Nenhuma nota foi lançada nesta OS.')"
    >
      <ng-container table-actions>
        @if (podeLancar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Lançar documento" (pressed)="novo()"></ces-button>
        }
      </ng-container>
      <ng-template cesCell="numero" let-row>
        <span class="ces-cell-strong">{{ row.tipoRotulo }} {{ row.numero }}{{ row.serie ? ' série ' + row.serie : '' }}</span>
        <span class="ces-cell-muted">{{ row.possuiArquivo ? row.arquivoNome : 'Sem arquivo' }}</span>
      </ng-template>
      <ng-template cesCell="emitidoEm" let-row>{{ row.emitidoEm | date: 'dd/MM/yyyy' }}</ng-template>
      <ng-template cesCell="valor" let-row><span class="ces-cell-num">{{ row.valor | currency: 'BRL' }}</span></ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          @if (row.possuiArquivo) {
            <ces-icon-button icon="pi pi-download" [label]="'Baixar arquivo de ' + nome(row)" tooltip="Baixar arquivo" size="icon-sm"
              (pressed)="baixar(row)"></ces-icon-button>
          }
          @if (podeEditar() && ordem().situacao !== 'CANCELADA') {
            <ces-icon-button icon="pi pi-trash" [label]="'Excluir ' + nome(row)" tooltip="Excluir documento" size="icon-sm"
              (pressed)="excluir(row)"></ces-icon-button>
          }
        </span>
      </ng-template>
    </ces-data-table>

    <ces-form-drawer [(visible)]="formularioAberto" title="Lançar documento fiscal"
      [description]="'OS ' + ordem().numero + '. A mesma nota não entra duas vezes na OS.'" [dirty]="alterado()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        <div class="ces-form-grid">
          <ces-select label="Tipo" [required]="true" [options]="tipos" [(value)]="tipo"></ces-select>
          <ces-datepicker label="Emissão" [required]="true" [(value)]="emissao" [maxDate]="hoje" [error]="erro_('emissao')"></ces-datepicker>
        </div>
        <div class="ces-form-grid">
          <ces-text-input label="Número" [required]="true" [(value)]="numero" [maxlength]="60" [error]="erro_('numero')"></ces-text-input>
          <ces-text-input label="Série" [(value)]="serie" [maxlength]="10" [showOptional]="true"></ces-text-input>
        </div>
        <ces-select label="Fornecedor" [required]="true" [options]="fornecedoresOpcoes()" [(value)]="idFornecedor" [filter]="true"
          [error]="erro_('fornecedor')"></ces-select>
        @if (idFornecedor() === outro) {
          <ces-text-input label="Nome do fornecedor" [required]="true" [(value)]="fornecedorNome" [maxlength]="150"
            [error]="erro_('fornecedorNome')"></ces-text-input>
        }
        <ces-number-input label="Valor" mode="currency" [required]="true" [(value)]="valor" [min]="0" [error]="erro_('valor')"></ces-number-input>
        <ces-file-input label="Arquivo" description="PDF, XML da NF-e ou imagem, até 15 MB."
          accept="application/pdf,application/xml,text/xml,.xml,image/jpeg,image/png,image/webp"
          [maxBytes]="limiteArquivo" [(file)]="arquivo" [showOptional]="true"></ces-file-input>
        @if (erroServidor()) {
          <ces-callout tone="danger" [dense]="true">{{ erroServidor() }}</ces-callout>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Lançar documento" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOsDocumentosFiscaisComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);

  readonly ordem = input.required<OrdemServico>();
  readonly podeEditar = input(false);

  protected readonly hoje = new Date();
  protected readonly outro = OUTRO_FORNECEDOR;
  protected readonly limiteArquivo = LIMITE_ARQUIVO;
  protected readonly tipos: CesSelectOption<TipoDocumentoFiscal>[] = (Object.keys(ROTULO_DOCUMENTO_FISCAL) as TipoDocumentoFiscal[])
    .map((t) => ({ label: ROTULO_DOCUMENTO_FISCAL[t], value: t }));

  protected readonly documentos = signal<DocumentoFiscalOrdemServico[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);

  protected readonly formularioAberto = signal(false);
  protected readonly tipo = signal<TipoDocumentoFiscal | null>('NFSE');
  protected readonly numero = signal('');
  protected readonly serie = signal('');
  protected readonly emissao = signal<Date | null>(null);
  protected readonly idFornecedor = signal<string | null>(null);
  protected readonly fornecedorNome = signal('');
  protected readonly valor = signal<number | null>(null);
  protected readonly arquivo = signal<File | null>(null);
  protected readonly tentouSalvar = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erroServidor = signal<string | null>(null);

  /** Aceita documento com a OS aberta ou concluída; cancelada não. */
  protected readonly podeLancar = computed(() => this.podeEditar() && this.ordem().situacao !== 'CANCELADA');
  protected readonly estado = computed<'loading' | 'error' | 'empty' | 'ready'>(() =>
    this.carregando() ? 'loading' : this.erro() ? 'error' : this.documentos().length ? 'ready' : 'empty'
  );
  protected readonly fornecedoresOpcoes = computed<CesSelectOption<string>[]>(() => [
    ...this.fornecedores().map((f) => ({ label: f.nome, value: f.id })),
    { label: 'Outro (digitar o nome)', value: OUTRO_FORNECEDOR }
  ]);
  protected readonly alterado = computed(() => !!this.numero().trim() || this.valor() !== null || !!this.arquivo());

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.numero().trim()) e['numero'] = 'Informe o número.';
    if (!this.emissao()) e['emissao'] = 'Informe a emissão.';
    if (!this.idFornecedor()) e['fornecedor'] = 'Escolha o fornecedor.';
    if (this.idFornecedor() === OUTRO_FORNECEDOR && !this.fornecedorNome().trim()) e['fornecedorNome'] = 'Informe o nome.';
    if (this.valor() === null) e['valor'] = 'Informe o valor.';
    return e;
  });

  protected readonly colunas: CesDataTableColumn<DocumentoFiscalOrdemServico>[] = [
    { key: 'numero', header: 'Documento', type: 'custom', priority: 1, value: (r) => r.numero, display: (r) => `${r.tipoRotulo} ${r.numero}` },
    { key: 'emitidoEm', header: 'Emissão', type: 'custom', priority: 1, value: (r) => r.emitidoEm, display: (r) => r.emitidoEm },
    { key: 'fornecedor', header: 'Fornecedor', display: (r) => r.fornecedor ?? '—' },
    { key: 'valor', header: 'Valor', type: 'custom', value: (r) => r.valor, display: (r) => String(r.valor) }
  ];
  protected readonly chave = (r: DocumentoFiscalOrdemServico) => r.id;

  constructor() {
    effect(() => {
      const id = this.ordem().id;
      untracked(() => this.carregar(id));
    });
  }

  protected nome(d: DocumentoFiscalOrdemServico): string {
    return `${d.tipoRotulo} ${d.numero}`;
  }

  protected erro_(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    const agora = new Date();
    this.tipo.set(this.ordem().tipoOficina === 'EXTERNA' ? 'NFSE' : 'NFE');
    this.numero.set('');
    this.serie.set('');
    this.emissao.set(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
    this.idFornecedor.set(this.ordem().idFornecedor ?? (this.ordem().oficinaNome ? OUTRO_FORNECEDOR : null));
    this.fornecedorNome.set(this.ordem().idFornecedor ? '' : (this.ordem().oficinaNome ?? ''));
    this.valor.set(null);
    this.arquivo.set(null);
    this.tentouSalvar.set(false);
    this.erroServidor.set(null);
    if (!this.fornecedores().length) {
      this.frota.fornecedoresOficina().subscribe({ next: (f) => this.fornecedores.set(f), error: () => undefined });
    }
    this.formularioAberto.set(true);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    this.erroServidor.set(null);
    if (Object.keys(this.erros()).length) return;
    const outro = this.idFornecedor() === OUTRO_FORNECEDOR;
    this.salvando.set(true);
    this.frota
      .criarDocumentoFiscalOs(this.ordem().id, {
        tipo: this.tipo() ?? 'OUTRO',
        numero: this.numero().trim(),
        serie: this.serie().trim() || null,
        emitidoEm: paraDataIso(this.emissao())!,
        idFornecedor: outro ? null : this.idFornecedor(),
        fornecedorNome: outro ? this.fornecedorNome().trim() : null,
        valor: this.valor()!
      }, this.arquivo())
      .subscribe({
        next: (doc) => {
          this.salvando.set(false);
          this.formularioAberto.set(false);
          this.notificacoes.success(`${doc.tipoRotulo} ${doc.numero} lançada na OS.`);
          this.carregar(this.ordem().id);
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroServidor.set(getErrorMessage(e));
        }
      });
  }

  protected baixar(documento: DocumentoFiscalOrdemServico): void {
    this.frota.baixarArquivoDocumentoFiscalOs(this.ordem().id, documento.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = documento.arquivoNome ?? 'documento-fiscal';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async excluir(documento: DocumentoFiscalOrdemServico): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Excluir documento fiscal',
      message: `${this.nome(documento)} sai da OS. O arquivo fica guardado para auditoria e a exclusão entra no histórico.`,
      confirmLabel: 'Excluir documento',
      variant: 'destructive'
    });
    if (!ok) return;
    this.frota.excluirDocumentoFiscalOs(this.ordem().id, documento.id).subscribe({
      next: () => {
        this.notificacoes.success('Documento excluído.');
        this.carregar(this.ordem().id);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private carregar(idOs: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.frota.documentosFiscaisOs(idOs).subscribe({
      next: (lista) => {
        this.documentos.set(lista);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }
}
