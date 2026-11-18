import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output, signal } from '@angular/core';
import {
  GeoBlockingProgressDialogComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoNumberInputComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoImportStatus
} from '@geo/ui';
import { forkJoin } from 'rxjs';

import { FechamentoImportacaoRegistro, FechamentoImportacaoResposta } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { ObrasService } from '../../../core/services/obras.service';
import { FileDownloadUtil } from '../../../core/utils/file-download.util';
import { novaChaveIdempotencia } from '../../../core/utils/idempotencia.util';
import { toLocalDate } from '../../../core/utils/local-date.util';
import { parseImportDate } from '../../almoxarifado/solicitacoes-material/import-date.util';
import { MENSAGENS_PROCESSAMENTO_IMPORTACAO } from '../../almoxarifado/solicitacoes-material/importacao-progress-messages';
import { OPCOES_TIPO } from './fechamento-ui';

type LinhaImportacao = FechamentoImportacaoRegistro & { editing?: boolean };

/**
 * Importação de solicitações de encerramento por planilha (`geo-import-drawer`). Toda regra fica no
 * servidor: cada correção de linha é revalidada lá, e cada obra + almoxarifado + tipo + reserva vira
 * uma solicitação.
 */
@Component({
  selector: 'app-fechamento-importacao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    GeoBlockingProgressDialogComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoNumberInputComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent
  ],
  template: `
    <geo-import-drawer [(visible)]="visible" title="Importar solicitações de encerramento"
      description="Planilha CSV com obra, almoxarifado, tipo (221, 921, 222 ou 922), material, quantidade e, se já existir, a reserva. Quem solicita é você."
      [rows]="registros()" [uploading]="enviando()" [processing]="processando() || revalidando()"
      (templateRequested)="baixarModelo()" (fileSelected)="aoEscolherArquivo($event)"
      (processed)="processar()" (cleared)="limpar()">
      @if (registros().length) {
        <p class="geo-cell-muted">
          {{ validos() }} {{ validos() === 1 ? 'item válido formará' : 'itens válidos formarão' }} {{ solicitacoesPrevistas() }}
          {{ solicitacoesPrevistas() === 1 ? 'solicitação' : 'solicitações' }}. Só as linhas sem erro são processadas.
        </p>
        @if (comErro() > 0) {
          <div class="geo-quick-filters">
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="apenasErros()" (click)="apenasErros.set(!apenasErros())">
              <i class="pi pi-filter" aria-hidden="true"></i> Só as {{ comErro() }} com erro
            </button>
          </div>
        }
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunas"
          [rows]="exibidos()" [rowKey]="chaveLinha" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="obra" let-row>
            @if (row.editing) {
              <geo-select label="Obra" [labelVisible]="false" [options]="opcoesObras()" [(value)]="row.numeroObra" [filter]="true" [clearable]="true"></geo-select>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.numeroObra, erro: row.campoErro === 'numeroObra' }"></ng-container>
              @if (row.tituloObra) { <span class="geo-cell-muted" [title]="row.tituloObra">{{ row.tituloObra }}</span> }
            }
          </ng-template>
          <ng-template geoCell="almoxarifado" let-row>
            @if (row.editing) {
              <geo-select label="Almoxarifado" [labelVisible]="false" [options]="opcoesAlmoxarifados()" [(value)]="row.almoxarifado" [filter]="true" [clearable]="true"></geo-select>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.almoxarifado, erro: row.campoErro === 'almoxarifado' }"></ng-container>
            }
          </ng-template>
          <ng-template geoCell="tipo" let-row>
            @if (row.editing) {
              <geo-select label="Tipo" [labelVisible]="false" [options]="tipos" [(value)]="row.tipo"></geo-select>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.tipo, erro: row.campoErro === 'tipo' }"></ng-container>
            }
          </ng-template>
          <ng-template geoCell="material" let-row>
            @if (row.editing) {
              <geo-select label="Material" [labelVisible]="false" [options]="opcoesMateriais()" [(value)]="row.codigoMaterial" [filter]="true" [clearable]="true"></geo-select>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.codigoMaterial, erro: row.campoErro === 'codigoMaterial' }"></ng-container>
              @if (row.nomeMaterial) { <span class="geo-cell-muted" [title]="row.nomeMaterial">{{ row.nomeMaterial }}</span> }
            }
          </ng-template>
          <ng-template geoCell="quantidade" let-row>
            @if (row.editing) {
              <geo-number-input label="Quantidade" [labelVisible]="false" mode="decimal" [min]="0.001" [maxFractionDigits]="3" [(value)]="row.quantidade"></geo-number-input>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.quantidade != null ? (row.quantidade | number: '1.0-3') : '', erro: row.campoErro === 'quantidade' }"></ng-container>
            }
          </ng-template>
          <ng-template geoCell="reserva" let-row>
            @if (row.editing) {
              <geo-text-input label="Número da reserva" placeholder="Nº da reserva" [labelVisible]="false" [(value)]="row.numeroReserva"></geo-text-input>
              <geo-datepicker label="Data da reserva" [labelVisible]="false" [value]="parseImportDate(row.dataReserva)" [clearable]="true"
                (valueChange)="row.dataReserva = toLocalDate($event) ?? ''"></geo-datepicker>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.numeroReserva, erro: row.campoErro === 'numeroReserva' }"></ng-container>
              @if (row.campoErro === 'dataReserva') {
                <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.dataReserva, erro: true }"></ng-container>
              } @else if (row.dataReserva) {
                <span class="geo-cell-muted">{{ dataExibida(row.dataReserva) }}</span>
              }
            }
          </ng-template>
          <ng-template geoCell="observacao" let-row>
            @if (row.editing) {
              <geo-text-input label="Observação" [labelVisible]="false" [(value)]="row.observacao"></geo-text-input>
            } @else {
              <ng-container *ngTemplateOutlet="valor; context: { $implicit: row.observacao, erro: row.campoErro === 'observacao' }"></ng-container>
            }
          </ng-template>
          <ng-template geoCell="situacao" let-row>
            <geo-status [tone]="situacao(row.status).tone" [icon]="situacao(row.status).icon">{{ situacao(row.status).label }}</geo-status>
            @if (row.mensagemErro) { <span class="geo-cell-muted" [title]="row.mensagemErro">{{ row.mensagemErro }}</span> }
          </ng-template>
          <ng-template geoRowActions let-row>
            <span class="geo-table-actions">
              @if (row.editing) {
                <geo-icon-button icon="pi pi-check" [label]="'Concluir correção da linha ' + row.linha" size="icon-sm" (pressed)="concluirEdicao(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="editar(row)"></geo-icon-button>
                <geo-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="remover(row)"></geo-icon-button>
              }
            </span>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>

    <ng-template #valor let-texto let-erro="erro">
      @if (erro) {
        <geo-status tone="danger" emphasis="outline" icon="pi-exclamation-circle">{{ texto || 'vazio' }}</geo-status>
      } @else {
        <span>{{ texto || '—' }}</span>
      }
    </ng-template>

    <geo-blocking-progress-dialog [visible]="processando()" title="Processando solicitações de encerramento" statusTitle="Criando solicitações"
      [statusMessages]="mensagensProcessamento"></geo-blocking-progress-dialog>
  `
})
export class FechamentoImportacaoComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly obras = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly visible = model(false);
  /** Ao menos uma solicitação foi criada (a lista recarrega). */
  readonly processado = output<void>();

  protected readonly parseImportDate = parseImportDate;
  protected readonly toLocalDate = toLocalDate;
  protected readonly mensagensProcessamento = MENSAGENS_PROCESSAMENTO_IMPORTACAO;
  protected readonly situacao = geoImportStatus;
  protected readonly tipos = OPCOES_TIPO as GeoSelectOption<string>[];
  protected readonly chaveLinha = (r: LinhaImportacao) => String(r.linha);

  protected readonly enviando = signal(false);
  protected readonly processando = signal(false);
  protected readonly revalidando = signal(false);
  protected readonly apenasErros = signal(false);
  protected readonly registros = signal<LinhaImportacao[]>([]);
  protected readonly solicitacoesPrevistas = signal(0);
  protected readonly comErro = computed(() => this.registros().filter((r) => r.status === 'COM_ERRO').length);
  protected readonly validos = computed(() => this.registros().length - this.comErro());
  protected readonly exibidos = computed(() => (this.apenasErros() ? this.registros().filter((r) => r.status === 'COM_ERRO') : this.registros()));

  protected readonly opcoesObras = signal<GeoSelectOption<string>[]>([]);
  protected readonly opcoesAlmoxarifados = signal<GeoSelectOption<string>[]>([]);
  protected readonly opcoesMateriais = signal<GeoSelectOption<string>[]>([]);
  private cadastrosCarregados = false;
  /** Repetir uma confirmação que falhou na rede usa a mesma chave: o servidor não cria duas vezes. */
  private chaveEnvio: string | null = null;

  protected readonly colunas: GeoDataTableColumn<LinhaImportacao>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'obra', header: 'Obra', type: 'custom', priority: 1, value: (r) => r.numeroObra },
    { key: 'almoxarifado', header: 'Almoxarifado', type: 'custom', value: (r) => r.almoxarifado },
    { key: 'tipo', header: 'Tipo', type: 'custom', value: (r) => r.tipo },
    { key: 'material', header: 'Material', type: 'custom', priority: 1, value: (r) => r.codigoMaterial },
    { key: 'quantidade', header: 'Qtd.', type: 'custom', value: (r) => r.quantidade },
    { key: 'reserva', header: 'Reserva', type: 'custom', value: (r) => r.numeroReserva },
    { key: 'observacao', header: 'Observação', type: 'custom', value: (r) => r.observacao },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  constructor() {
    effect(() => {
      if (this.visible() && !this.cadastrosCarregados) this.carregarCadastros();
    });
  }

  private carregarCadastros(): void {
    this.cadastrosCarregados = true;
    forkJoin({
      obras: this.obras.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }),
      estoques: this.almoxarifado.listarEstoquesAtivos(),
      materiais: this.almoxarifado.listarMateriais({ ativo: true, page: 0, size: 1000, sort: 'codigo,asc' })
    }).subscribe({
      next: ({ obras, estoques, materiais }) => {
        this.opcoesObras.set((obras.content ?? []).map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.numero })));
        this.opcoesAlmoxarifados.set(
          (estoques.content ?? [])
            .filter((e) => e.tipoEstoque?.nome?.toUpperCase() === 'FISICO')
            .map((e) => ({ label: e.nomeIdentificador, value: e.nomeIdentificador }))
        );
        this.opcoesMateriais.set((materiais?.content ?? []).map((m) => ({ label: `${m.codigo} - ${m.descricao}`, value: m.codigo })));
      },
      error: () => {
        this.cadastrosCarregados = false;
        this.notificacoes.warning('Não foi possível carregar as opções para corrigir as linhas.');
      }
    });
  }

  protected baixarModelo(): void {
    this.service.baixarModeloImportacao().subscribe({
      next: (arquivo) => FileDownloadUtil.downloadBlob(arquivo, 'modelo_importacao_fechamento_obras.csv'),
      error: (erro) => this.notificacoes.error(getErrorMessage(erro), { title: 'Falha ao baixar modelo' })
    });
  }

  protected aoEscolherArquivo(arquivo: File): void {
    this.enviando.set(true);
    this.service.validarImportacao(arquivo).subscribe({
      next: (resposta) => {
        this.enviando.set(false);
        this.apenasErros.set(false);
        this.aplicar(resposta);
        if (resposta.totalFalha > 0) {
          this.notificacoes.warning(`${resposta.totalFalha} de ${resposta.totalProcessados} linhas têm inconsistências.`);
        } else {
          this.notificacoes.info(`${resposta.totalSucesso} ${resposta.totalSucesso === 1 ? 'linha pronta' : 'linhas prontas'} para importação.`);
        }
      },
      error: (erro) => {
        this.enviando.set(false);
        this.notificacoes.error(getErrorMessage(erro), { title: 'Erro ao validar arquivo' });
      }
    });
  }

  protected editar(linha: LinhaImportacao): void {
    linha.editing = true;
    this.registros.update((linhas) => [...linhas]);
  }

  protected concluirEdicao(linha: LinhaImportacao): void {
    linha.editing = false;
    this.revalidar(this.registros());
  }

  protected remover(linha: LinhaImportacao): void {
    const restantes = this.registros().filter((r) => r !== linha);
    if (restantes.length) {
      this.registros.set(restantes);
      this.revalidar(restantes);
    } else {
      this.limpar();
    }
  }

  /** O servidor refaz a validação do conjunto: remover uma repetida, por exemplo, libera a outra linha. */
  private revalidar(linhas: LinhaImportacao[]): void {
    this.chaveEnvio = null;
    this.revalidando.set(true);
    this.service.revalidarImportacao(linhas.map(semEdicao)).subscribe({
      next: (resposta) => {
        this.revalidando.set(false);
        this.aplicar(resposta);
      },
      error: (erro) => {
        this.revalidando.set(false);
        this.registros.update((atuais) => [...atuais]);
        this.notificacoes.error(getErrorMessage(erro), { title: 'Não foi possível revalidar' });
      }
    });
  }

  /** Quem ainda está em edição continua aberto depois da resposta. */
  private aplicar(resposta: FechamentoImportacaoResposta): void {
    const emEdicao = new Set(this.registros().filter((r) => r.editing).map((r) => r.linha));
    this.registros.set(resposta.registros.map((r) => ({ ...r, editing: emEdicao.has(r.linha) })));
    this.solicitacoesPrevistas.set(resposta.totalSolicitacoes);
    if (!this.comErro()) this.apenasErros.set(false);
  }

  protected limpar(): void {
    this.registros.set([]);
    this.solicitacoesPrevistas.set(0);
    this.apenasErros.set(false);
    this.chaveEnvio = null;
  }

  protected dataExibida(valor: string): string {
    return parseImportDate(valor)?.toLocaleDateString('pt-BR') ?? valor;
  }

  protected async processar(): Promise<void> {
    if (this.processando() || this.revalidando()) return;
    if (this.registros().some((r) => r.editing)) {
      this.notificacoes.warning('Conclua a correção das linhas abertas antes de processar.');
      return;
    }
    const validos = this.registros().filter((r) => r.status !== 'COM_ERRO');
    const deFora = this.comErro();
    if (!validos.length) {
      this.notificacoes.warning('Não há linhas válidas para criar solicitações.');
      return;
    }
    const previstas = this.solicitacoesPrevistas();
    const ok = await this.confirmacao.confirm({
      title: 'Processar importação',
      message: `Criar ${previstas} ${previstas === 1 ? 'solicitação' : 'solicitações'} com ${validos.length === 1 ? 'a linha válida' : `as ${validos.length} linhas válidas`}?`,
      confirmLabel: 'Processar'
    });
    if (!ok) return;

    this.chaveEnvio ??= novaChaveIdempotencia();
    this.processando.set(true);
    this.service.confirmarImportacao(validos.map(semEdicao), this.chaveEnvio).subscribe({
      next: (resposta) => {
        this.processando.set(false);
        this.chaveEnvio = null;
        this.aoConcluir(resposta, deFora);
      },
      error: (erro) => {
        this.processando.set(false);
        this.notificacoes.error(getErrorMessage(erro), { title: 'Erro ao confirmar importação' });
      }
    });
  }

  private aoConcluir(resposta: FechamentoImportacaoResposta, deFora: number): void {
    const criadas = resposta.totalSolicitacoes;
    const texto = `${criadas} ${criadas === 1 ? 'solicitação criada' : 'solicitações criadas'}`;
    if (criadas > 0) this.processado.emit();
    if (resposta.totalFalha === 0) {
      const aviso = deFora ? ` ${deFora} ${deFora === 1 ? 'linha com erro ficou' : 'linhas com erro ficaram'} de fora.` : '';
      this.notificacoes.success(`${texto}.${aviso}`, { title: 'Importação concluída' });
      this.limpar();
      this.visible.set(false);
      return;
    }
    // As linhas com erro ficam para corrigir; as linhas que viraram solicitação saem da tabela.
    const pendentes = resposta.registros.filter((r) => r.status === 'COM_ERRO');
    this.registros.set(pendentes.map((r) => ({ ...r, editing: false })));
    this.solicitacoesPrevistas.set(0);
    if (criadas > 0) {
      this.notificacoes.warning(`${texto}; ${pendentes.length} ${pendentes.length === 1 ? 'linha ficou' : 'linhas ficaram'} com erro.`, { title: 'Importação parcial' });
    } else {
      this.notificacoes.error('Nenhuma solicitação foi criada. Revise os erros na tabela.', { title: 'Importação não processada' });
    }
  }
}

function semEdicao({ editing: _editing, ...linha }: LinhaImportacao): FechamentoImportacaoRegistro {
  return linha;
}
