import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesConfirmationService,
  CesDatepickerComponent,
  CesFileInputComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { Observable, of, switchMap } from 'rxjs';
import {
  DespesaVeiculo,
  DespesaVeiculoRequest,
  FormaPagamentoDespesa,
  ROTULO_DOCUMENTO,
  ROTULO_FORMA_PAGAMENTO,
  TipoDespesa,
  TipoDocumentoDespesa,
  pagamentoDespesa
} from '../../../core/models/frota-despesa.models';
import { FornecedorFrota, deDataIso, formatarPlaca, paraDataIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaDespesaService } from '../../../core/services/frota-despesa.service';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';

/** Veículo como o formulário oferece (placa, modelo e base atual). */
export interface VeiculoDespesa {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  idBaseOperacional: string | null;
}

const LIMITE_ARQUIVO = 15 * 1024 * 1024;
const FORMAS: CesSelectOption<FormaPagamentoDespesa>[] = (Object.keys(ROTULO_FORMA_PAGAMENTO) as FormaPagamentoDespesa[])
  .map((f) => ({ label: ROTULO_FORMA_PAGAMENTO[f], value: f }));
const DOCUMENTOS: CesSelectOption<TipoDocumentoDespesa>[] = (Object.keys(ROTULO_DOCUMENTO) as TipoDocumentoDespesa[])
  .map((d) => ({ label: ROTULO_DOCUMENTO[d], value: d }));

/**
 * Lançamento e correção da despesa do veículo, em seções: o que foi, como foi pago (e quem
 * recebeu), centro de custo e comprovantes. A pagar, a despesa vai ao financeiro pelo botão
 * "Pedir pagamento", que abre a solicitação já preenchida.
 */
@Component({
  selector: 'app-frota-despesa-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesFileInputComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  styles: `
    .anexos { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .anexo { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md); background: var(--ces-surface); }
    .anexo .pi-file { color: var(--ces-brand); }
    .anexo__texto { flex: 1; min-width: 0; display: grid; }
    .anexo__texto strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .anexo__texto span { color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .pagamento { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <ces-form-drawer [(visible)]="visivel" [title]="despesa() ? 'Despesa do ' + placa(despesa()!.placa) : idVeiculoFixo() && veiculos()[0] ? 'Lançar despesa do ' + placa(veiculos()[0].placa) : 'Lançar despesa'"
      [description]="descricao()" [dirty]="alterado()" [loading]="salvando()" size="md">

      @if (despesa(); as d) {
        @let p = pagamento(d);
        <ces-callout [tone]="p.tom === 'neutral' ? 'info' : p.tom" [icon]="'pi ' + p.icone" [dense]="true" [title]="p.rotulo">
          <div class="pagamento">
            <span>
              @switch (d.situacaoPagamento) {
                @case ('SOLICITADO') { Solicitação nº {{ d.numeroSolicitacaoFinanceira ?? '—' }} no financeiro. Valor, fornecedor e documento ficam travados até a decisão. }
                @case ('APROVADO') { Solicitação nº {{ d.numeroSolicitacaoFinanceira }} aprovada. Valor, fornecedor e documento não mudam mais. }
                @case ('REPROVADO') { {{ d.motivoReprovacaoPagamento ?? 'Reprovado no financeiro.' }} Corrija e peça de novo. }
                @default {
                  @if (d.formaPagamento === 'A_PAGAR') { Ainda não foi ao financeiro. } @else { Só registro: não vai ao financeiro. }
                }
              }
            </span>
            @if (d.podePedirPagamento && podePedirPagamento()) {
              <ces-button size="sm" icon="pi pi-send" label="Pedir pagamento" [loading]="salvando()" (pressed)="pedirPagamento()"></ces-button>
            }
          </div>
        </ces-callout>
      }

      <ces-form-section title="Despesa" icon="pi pi-receipt">
        @if (!idVeiculoFixo()) {
          <ces-select label="Veículo" [required]="true" [options]="opcoesVeiculo()" [(value)]="veiculo" [filter]="true" [disabled]="!!despesa()"
            [description]="despesa() ? 'O veículo não muda; para outro, exclua e lance de novo.' : undefined"
            [loading]="!veiculos().length" [error]="erro('veiculo')" (valueChange)="aoTrocarVeiculo()"></ces-select>
        }
        <div class="ces-form-grid">
          <ces-select label="Tipo" [required]="true" [options]="opcoesTipo()" [(value)]="tipo" [error]="erro('tipo')"
            (valueChange)="subtipo.set(null)"></ces-select>
          @if (subtipos().length) {
            <ces-select label="Subtipo" [options]="subtipos()" [(value)]="subtipo" [clearable]="true" [showOptional]="true"></ces-select>
          }
        </div>
        <div class="ces-form-grid">
          <ces-datepicker label="Data" [required]="true" [(value)]="data" [maxDate]="hoje" [error]="erro('data')"></ces-datepicker>
          <ces-number-input label="Valor" [required]="true" mode="currency" [(value)]="valor" [min]="0.01" [disabled]="travado()"
            [error]="erro('valor')"></ces-number-input>
        </div>
        <ces-textarea label="Descrição" [(value)]="descricaoDespesa" [rows]="2" [maxlength]="500" [showOptional]="true"
          placeholder="Ex.: lavagem depois da obra na zona rural"></ces-textarea>
      </ces-form-section>

      <ces-form-section title="Pagamento" icon="pi pi-wallet">
        <ces-select label="Pagamento" [required]="true" [options]="formas" [(value)]="forma" [disabled]="travado()"
          [description]="forma() === 'A_PAGAR' ? 'Vai ao financeiro como solicitação de pagamento.' : 'Só registro: já foi pago e não vai ao financeiro.'"></ces-select>
        <ces-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="fornecedor" [filter]="true" [clearable]="true"
          [showOptional]="true" [disabled]="travado()" [loading]="carregandoFornecedores()"
          description="Cadastrado no financeiro. Se não estiver, escreva o nome abaixo."></ces-select>
        @if (!fornecedor()) {
          <ces-text-input label="Nome" [(value)]="fornecedorNome" description="Fornecedor sem cadastro no financeiro." [maxlength]="150" [showOptional]="true" [disabled]="travado()"
            placeholder="Ex.: Lava Rápido do Centro"></ces-text-input>
        }
        <div class="ces-form-grid">
          <ces-select label="Documento" [options]="documentos" [(value)]="documento" [clearable]="true" [showOptional]="true" [disabled]="travado()"></ces-select>
          <ces-text-input label="Número" [(value)]="documentoNumero" [maxlength]="60" [required]="!!documento()"
            [disabled]="travado() || !documento()" [error]="erro('documento')"></ces-text-input>
        </div>
      </ces-form-section>

      <ces-form-section title="Centro de custo" icon="pi pi-sitemap" description="A base vem do veículo; troque se a despesa for de outra base.">
        <div class="ces-form-grid">
          <ces-select label="Base" [options]="bases()" [(value)]="base" [filter]="true" [clearable]="true" [showOptional]="true"></ces-select>
          <ces-select label="Setor" [options]="processos()" description="Centro de custo do financeiro." [(value)]="processo" [filter]="true" [clearable]="true"
            [showOptional]="true"></ces-select>
        </div>
        <ces-number-input label="Medição" description="KM ou horas no dia da despesa." [(value)]="medicao" [min]="0" [maxFractionDigits]="1" [showOptional]="true"></ces-number-input>
      </ces-form-section>

      <ces-form-section title="Comprovantes" icon="pi pi-paperclip">
        @if (despesa()?.anexos?.length) {
          <ul class="anexos">
            @for (a of despesa()!.anexos; track a.id) {
              <li class="anexo">
                <i class="pi pi-file" aria-hidden="true"></i>
                <span class="anexo__texto"><strong>{{ a.nome }}</strong><span>Enviado em {{ a.enviadoEm | date: "dd/MM/yyyy 'às' HH:mm" }}</span></span>
                <ces-icon-button icon="pi pi-download" [label]="'Baixar ' + a.nome" tooltip="Baixar" size="icon-sm" (pressed)="baixar(a.id, a.nome)"></ces-icon-button>
                <ces-icon-button icon="pi pi-trash" [label]="'Remover ' + a.nome" tooltip="Remover" size="icon-sm" (pressed)="removerAnexo(a.id, a.nome)"></ces-icon-button>
              </li>
            }
          </ul>
        }
        <ces-file-input label="Comprovante" description="Nota, recibo ou cupom em PDF ou imagem (JPG, PNG, WebP), até 15 MB." accept="application/pdf,image/jpeg,image/png,image/webp"
          [maxBytes]="limiteArquivo" [(file)]="arquivo" [showOptional]="true"></ces-file-input>
      </ces-form-section>

      <div drawer-footer class="rodape">
        @if (despesa() && podeExcluir()) {
          <ces-button variant="ghost" icon="pi pi-trash" label="Excluir" (pressed)="excluir()"></ces-button>
        }
        <span class="rodape__espaco"></span>
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="despesa() ? 'Salvar' : 'Lançar despesa'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaDespesaFormComponent {
  private readonly servico = inject(FrotaDespesaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly router = inject(Router);

  readonly visivel = model(false);
  readonly despesa = input<DespesaVeiculo | null>(null);
  /** Na ficha do veículo a despesa nasce para ele. */
  readonly idVeiculoFixo = input<string | null>(null);
  readonly veiculos = input<VeiculoDespesa[]>([]);
  readonly tipos = input<TipoDespesa[]>([]);
  readonly fornecedores = input<FornecedorFrota[]>([]);
  readonly carregandoFornecedores = input(false);
  readonly bases = input<CesSelectOption<string>[]>([]);
  readonly processos = input<CesSelectOption<string>[]>([]);
  readonly podePedirPagamento = input(false);
  readonly salva = output<DespesaVeiculo>();
  readonly excluida = output<void>();

  protected readonly formas = FORMAS;
  protected readonly documentos = DOCUMENTOS;
  protected readonly limiteArquivo = LIMITE_ARQUIVO;
  /** Fim de hoje: a data pode ser hoje (qualquer hora), nunca amanhã. */
  protected readonly hoje = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
  protected readonly pagamento = pagamentoDespesa;
  protected readonly placa = formatarPlaca;

  protected readonly veiculo = signal<string | null>(null);
  protected readonly data = signal<Date | null>(null);
  protected readonly valor = signal<number | null>(null);
  protected readonly tipo = signal<string | null>(null);
  protected readonly subtipo = signal<string | null>(null);
  protected readonly descricaoDespesa = signal('');
  protected readonly forma = signal<FormaPagamentoDespesa>('A_PAGAR');
  protected readonly fornecedor = signal<string | null>(null);
  protected readonly fornecedorNome = signal('');
  protected readonly documento = signal<TipoDocumentoDespesa | null>(null);
  protected readonly documentoNumero = signal('');
  protected readonly base = signal<string | null>(null);
  protected readonly processo = signal<string | null>(null);
  protected readonly medicao = signal<number | null>(null);
  protected readonly arquivo = signal<File | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  private readonly snapshot = signal('');

  /** Pagamento pedido ou aprovado: o que o financeiro paga não muda. */
  protected readonly travado = computed(() => {
    const s = this.despesa()?.situacaoPagamento;
    return s === 'SOLICITADO' || s === 'APROVADO';
  });
  protected readonly podeExcluir = computed(() => !this.travado());
  protected readonly descricao = computed(() => {
    const d = this.despesa();
    if (!d) return 'Lavagem, pedágio, estacionamento, mensalidade, taxa ou outra despesa do veículo.';
    return `${d.tipo}${d.subtipo ? ' ' + d.subtipo.toLowerCase() : ''}${d.origem === 'IMPORTACAO' ? ' · importada da planilha' : ''}`;
  });
  protected readonly opcoesVeiculo = computed<CesSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({ label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}`, value: v.idVeiculo })));
  protected readonly opcoesTipo = computed<CesSelectOption<string>[]>(() =>
    this.tipos().filter((t) => t.ativo || t.id === this.despesa()?.idTipo).map((t) => ({ label: t.nome, value: t.id })));
  protected readonly subtipos = computed<CesSelectOption<string>[]>(() =>
    (this.tipos().find((t) => t.id === this.tipo())?.subtipos ?? []).map((s) => ({ label: s.nome, value: s.id })));
  protected readonly opcoesFornecedor = computed<CesSelectOption<string>[]>(() =>
    this.fornecedores().map((f) => ({ label: f.nome, value: f.id })));

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.idVeiculoFixo() && !this.despesa() && !this.veiculo()) e['veiculo'] = 'Escolha o veículo.';
    if (!this.data()) e['data'] = 'Informe a data.';
    if (!this.valor() || this.valor()! <= 0) e['valor'] = 'Informe o valor.';
    if (!this.tipo()) e['tipo'] = 'Escolha o tipo.';
    if (this.documento() && !this.documentoNumero().trim()) e['documento'] = 'Informe o número.';
    return e;
  });
  protected readonly alterado = computed(() => !!this.arquivo() || this.snapshot() !== JSON.stringify(this.request()));

  constructor() {
    effect(() => {
      if (this.visivel()) {
        const d = this.despesa();
        untracked(() => this.preencher(d));
      }
    });
  }

  protected erro(campo: string): string | undefined {
    return this.tentou() ? this.erros()[campo] : undefined;
  }

  /** Ao escolher o veículo, a base sugerida é a dele. */
  protected aoTrocarVeiculo(): void {
    const v = this.veiculos().find((x) => x.idVeiculo === this.veiculo());
    if (v && !this.despesa()) this.base.set(v.idBaseOperacional);
  }

  protected salvar(): void {
    this.gravar().subscribe({ next: () => this.visivel.set(false), error: () => undefined });
  }

  /** Salva o que mudou e abre o pagamento no financeiro já preenchido. */
  protected pedirPagamento(): void {
    const id = this.despesa()?.id;
    if (!id) return;
    const seguir = (d: DespesaVeiculo) => {
      this.visivel.set(false);
      navegarAposFecharDrawer(this.router, ['/financeiro', 'pagamentos', 'nova'], 1000, { queryParams: { origem: 'FROTA_DESPESA', origemId: d.id } });
    };
    if (this.alterado()) this.gravar().subscribe({ next: seguir, error: () => undefined });
    else seguir(this.despesa()!);
  }

  protected baixar(idAnexo: string, nome: string): void {
    const d = this.despesa();
    if (!d) return;
    this.servico.baixarAnexo(d.id, idAnexo).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nome;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async removerAnexo(idAnexo: string, nome: string): Promise<void> {
    const d = this.despesa();
    if (!d) return;
    const ok = await this.confirmacao.confirm({ title: 'Remover comprovante', message: `Remover ${nome} desta despesa?`, variant: 'destructive' });
    if (!ok) return;
    this.servico.removerAnexo(d.id, idAnexo).subscribe({
      next: (atualizada) => {
        this.notificacoes.success('Comprovante removido.');
        this.salva.emit(atualizada);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async excluir(): Promise<void> {
    const d = this.despesa();
    if (!d) return;
    const ok = await this.confirmacao.confirm({
      title: 'Excluir despesa',
      message: `Excluir ${d.tipo.toLowerCase()} de ${d.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} do ${formatarPlaca(d.placa)}? Ela sai das listas e dos totais.`,
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.excluir(d.id).subscribe({
      next: () => {
        this.notificacoes.success('Despesa excluída.');
        this.visivel.set(false);
        this.excluida.emit();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private gravar(): Observable<DespesaVeiculo> {
    this.tentou.set(true);
    if (Object.keys(this.erros()).length) {
      this.notificacoes.warning('Revise os campos destacados antes de salvar.');
      return new Observable((s) => s.error('invalido'));
    }
    const existente = this.despesa();
    const arquivo = this.arquivo();
    this.salvando.set(true);
    return new Observable<DespesaVeiculo>((assinante) => {
      this.servico.salvar(this.request(), existente?.id)
        .pipe(switchMap((d) => (arquivo ? this.servico.anexar(d.id, arquivo) : of(d))))
        .subscribe({
          next: (d) => {
            this.salvando.set(false);
            this.notificacoes.success(existente ? 'Despesa atualizada.' : 'Despesa lançada.');
            this.arquivo.set(null);
            this.snapshot.set(JSON.stringify(this.request()));
            this.salva.emit(d);
            assinante.next(d);
            assinante.complete();
          },
          error: (e) => {
            this.salvando.set(false);
            this.notificacoes.error(getErrorMessage(e));
            assinante.error(e);
          }
        });
    });
  }

  private preencher(d: DespesaVeiculo | null): void {
    this.tentou.set(false);
    const fixo = this.idVeiculoFixo();
    const v = this.veiculos().find((x) => x.idVeiculo === (d?.idVeiculo ?? fixo));
    this.veiculo.set(d?.idVeiculo ?? fixo ?? null);
    this.data.set(d ? deDataIso(d.data) : new Date());
    this.valor.set(d?.valor ?? null);
    this.tipo.set(d?.idTipo ?? null);
    this.subtipo.set(d?.idSubtipo ?? null);
    this.descricaoDespesa.set(d?.descricao ?? '');
    this.forma.set(d?.formaPagamento ?? 'A_PAGAR');
    this.fornecedor.set(d?.idFornecedor ?? null);
    this.fornecedorNome.set(d && !d.idFornecedor ? d.fornecedorNome ?? '' : '');
    this.documento.set(d?.documentoTipo ?? null);
    this.documentoNumero.set(d?.documentoNumero ?? '');
    this.base.set(d ? d.idBaseOperacional : v?.idBaseOperacional ?? null);
    this.processo.set(d?.idProcesso ?? null);
    this.medicao.set(d?.medicao ?? null);
    this.arquivo.set(null);
    this.snapshot.set(JSON.stringify(this.request()));
  }

  private request(): DespesaVeiculoRequest {
    const texto = (valor: string) => (valor.trim() ? valor.trim() : null);
    return {
      idVeiculo: this.despesa()?.idVeiculo ?? this.idVeiculoFixo() ?? this.veiculo() ?? '',
      data: paraDataIso(this.data()) ?? '',
      idTipo: this.tipo() ?? '',
      idSubtipo: this.subtipo(),
      descricao: texto(this.descricaoDespesa()),
      valor: this.valor() ?? 0,
      idBaseOperacional: this.base(),
      idProcesso: this.processo(),
      idFornecedor: this.fornecedor(),
      fornecedorNome: this.fornecedor() ? null : texto(this.fornecedorNome()),
      documentoTipo: this.documento(),
      documentoNumero: this.documento() ? texto(this.documentoNumero()) : null,
      medicao: this.medicao(),
      formaPagamento: this.forma()
    };
  }
}
