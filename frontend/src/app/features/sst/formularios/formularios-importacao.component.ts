import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesImportDrawerComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  cesImportStatus
} from '@ces/ui';

import { FormularioInspecaoImportacaoDTO } from '../../../core/models/sst.models';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { SstService } from '../../../core/services/sst.service';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';

const TIPOS: CesSelectOption<string>[] = [
  { label: 'Checklist (Conforme / Não conforme / Não se aplica)', value: 'Checklist' },
  { label: 'Escolha', value: 'Escolha' },
  { label: 'Texto', value: 'Texto' },
  { label: 'Número', value: 'Número' },
  { label: 'Data', value: 'Data' }
];
const GRAVIDADES: CesSelectOption<string>[] = ['Baixa', 'Média', 'Alta', 'Crítica'].map((g) => ({ label: g, value: g }));
const SIM_NAO: CesSelectOption<string>[] = [
  { label: 'Sim', value: 'Sim' },
  { label: 'Não', value: 'Não' }
];

/** Checklist é o padrão quando a coluna vem vazia. */
function ehChecklist(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').trim().toLowerCase();
  return !t || t.startsWith('checklist') || t.startsWith('conforme');
}

/**
 * Importação de formulários de inspeção por planilha: cada linha é uma pergunta; linhas com o
 * mesmo formulário e grupo se juntam na ordem do arquivo. Pré-visualização no `ces-import-drawer`
 * e correção de uma linha por vez, como nas demais importações.
 */
@Component({
  selector: 'app-formularios-importacao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesImportDrawerComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent
  ],
  template: `
    <ces-import-drawer [(visible)]="visible" title="Importar formulários de inspeção"
      description="Planilha CSV com uma pergunta por linha: formulário, grupo, pergunta, orientação, tipo de resposta, gravidade da não conformidade e se o desvio aponta colaborador."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <ces-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunas"
          [rows]="importacao.linhas()" [rowKey]="chaveLinha" [pageSizeOptions]="[25, 50, 100]">
          <ng-template cesCell="pergunta" let-row>
            <span class="ces-cell-strong">{{ row.pergunta || '—' }}</span>
            @if (row.orientacao) { <span class="ces-cell-muted">{{ row.orientacao }}</span> }
          </ng-template>
          <ng-template cesCell="situacao" let-row>
            <ces-status [tone]="situacao(row.status).tone" [icon]="situacao(row.status).icon">{{ situacao(row.status).label }}</ces-status>
            @if (row.mensagemErro) { <span class="ces-cell-muted" [title]="row.mensagemErro">{{ row.mensagemErro }}</span> }
          </ng-template>
          <ng-template cesRowActions let-row>
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="corrigir(row)"></ces-icon-button>
              <ces-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="importacao.remover(row)"></ces-icon-button>
            </span>
          </ng-template>
        </ces-data-table>
      }
    </ces-import-drawer>

    <ces-form-drawer [visible]="!!editando()" (visibleChange)="!$event && concluir()" [title]="'Corrigir linha ' + (editando()?.linha ?? '')"
      [description]="editando()?.mensagemErro ?? undefined" size="md">
      @if (editando(); as row) {
        <ces-form-section title="Onde fica" icon="pi pi-list-check">
          <div class="ces-form-grid">
            <ces-text-input label="Formulário" [required]="true" [(value)]="row.formulario"></ces-text-input>
            <ces-text-input label="Grupo" [required]="true" [(value)]="row.grupo"></ces-text-input>
          </div>
          <ces-text-input label="Descrição do formulário" [(value)]="row.descricao"></ces-text-input>
        </ces-form-section>
        <ces-form-section title="Pergunta" icon="pi pi-question-circle">
          <ces-text-input label="Pergunta" [required]="true" [(value)]="row.pergunta"></ces-text-input>
          <ces-text-input label="Orientação" hint="Quantidade esperada ou observação, mostrada abaixo da pergunta." [(value)]="row.orientacao"></ces-text-input>
          <div class="ces-form-grid">
            <ces-select label="Tipo de resposta" [options]="tipos" [value]="tipoDe(row)" (valueChange)="row.tipoResposta = $event ?? ''"></ces-select>
            <ces-select label="Obrigatória" [options]="simNao" [value]="row.obrigatoria || 'Sim'" (valueChange)="row.obrigatoria = $event ?? ''"></ces-select>
          </div>
          @if (checklist(row)) {
            <div class="ces-form-grid">
              <ces-select label="Gravidade da não conformidade" [options]="gravidades" [(value)]="row.gravidade" [clearable]="true"></ces-select>
              <ces-select label="Desvio por colaborador" hint="Não para itens da equipe ou do veículo." [options]="simNao"
                [value]="row.desvioPorColaborador || 'Sim'" (valueChange)="row.desvioPorColaborador = $event ?? ''"></ces-select>
            </div>
          }
          @if (tipoDe(row) === 'Escolha') {
            <ces-text-input label="Opções" hint="Separe por |. Exemplo: Sim|Não" [(value)]="row.opcoes"></ces-text-input>
          }
        </ces-form-section>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button icon="pi pi-check" label="Concluir correção" (pressed)="concluir()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FormulariosImportacaoComponent {
  private readonly sst = inject(SstService);
  private readonly importacaoService = inject(ImportacaoService);

  readonly visible = model(false);
  readonly processado = output<void>();

  protected readonly tipos = TIPOS;
  protected readonly gravidades = GRAVIDADES;
  protected readonly simNao = SIM_NAO;
  protected readonly situacao = cesImportStatus;
  protected readonly chaveLinha = CHAVE_LINHA_IMPORTACAO;
  protected readonly editando = signal<FormularioInspecaoImportacaoDTO | null>(null, { equal: () => false });

  protected readonly importacao = importacaoListagem<FormularioInspecaoImportacaoDTO>({
    enviar: (arquivo) => this.sst.importarFormularios(arquivo),
    confirmar: (perguntas) => this.sst.confirmarImportacaoFormularios(perguntas),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/sst/formularios-inspecao/importar/modelo', 'modelo-importacao-formularios-inspecao.csv'),
    aoProcessar: () => this.processado.emit()
  });

  protected readonly colunas: CesDataTableColumn<FormularioInspecaoImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'formulario', header: 'Formulário', priority: 1, value: (r) => r.formulario, display: (r) => r.formulario || '—' },
    { key: 'grupo', header: 'Grupo', value: (r) => r.grupo, display: (r) => r.grupo || '—' },
    { key: 'pergunta', header: 'Pergunta', type: 'custom', priority: 1, value: (r) => r.pergunta },
    { key: 'tipo', header: 'Resposta', value: (r) => r.tipoResposta, display: (r) => this.resumoResposta(r) },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  protected checklist(row: FormularioInspecaoImportacaoDTO): boolean {
    return ehChecklist(row.tipoResposta);
  }

  protected tipoDe(row: FormularioInspecaoImportacaoDTO): string {
    if (ehChecklist(row.tipoResposta)) return 'Checklist';
    const t = row.tipoResposta.trim().toLowerCase();
    return TIPOS.find((o) => o.value.toLowerCase() === t)?.value ?? row.tipoResposta;
  }

  private resumoResposta(r: FormularioInspecaoImportacaoDTO): string {
    if (!ehChecklist(r.tipoResposta)) return this.tipoDe(r);
    const quem = (r.desvioPorColaborador || 'Sim').toLowerCase().startsWith('n') ? 'da equipe' : 'por colaborador';
    return `Checklist · ${r.gravidade || 'sem gravidade'} · ${quem}`;
  }

  protected corrigir(row: FormularioInspecaoImportacaoDTO): void {
    row.editing = true;
    this.editando.set(row);
  }

  protected concluir(): void {
    const row = this.editando();
    if (!row) return;
    this.editando.set(null);
    this.importacao.concluirCorrecao(row);
  }
}
