import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked
} from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesFileInputComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesNumberInputComponent,
  CesTextareaComponent
} from '@ces/ui';
import { DescontoResponse, DescontoStatus, MAX_DESCONTO_ANEXO_SIZE_BYTES } from '../../../../core/models/desconto.models';

export type AcaoDesconto = 'VALIDAR' | 'BAIXAR' | 'REJEITAR' | 'DESFAZER' | 'FINALIZAR';

/** O que o drawer devolve ao confirmar: valor em validar e baixar, motivo em rejeitar e desfazer, arquivo em finalizar. */
export interface AcaoDescontoConfirmada {
  acao: AcaoDesconto;
  valor: number | null;
  motivo: string;
  arquivo: File | null;
}

interface ConfiguracaoAcao {
  titulo: string;
  descricao: string;
  confirmar: string;
  icone: string;
  variante: 'success' | 'destructive' | 'primary';
}

const CONFIGURACAO: Record<Exclude<AcaoDesconto, 'DESFAZER'>, ConfiguracaoAcao> = {
  VALIDAR: {
    titulo: 'Validar desconto',
    descricao: 'Confirme o valor aprovado. Depois de validado, os itens não podem mais ser alterados.',
    confirmar: 'Validar',
    icone: 'pi pi-check',
    variante: 'primary'
  },
  BAIXAR: {
    titulo: 'Baixar em folha',
    descricao: 'Informe o valor que entrou na folha do colaborador. Depois, falta só anexar o termo assinado.',
    confirmar: 'Registrar baixa',
    icone: 'pi pi-wallet',
    variante: 'success'
  },
  REJEITAR: {
    titulo: 'Rejeitar desconto',
    descricao: 'O desconto não segue para a folha. Quem lançou recebe o motivo.',
    confirmar: 'Rejeitar',
    icone: 'pi pi-times',
    variante: 'destructive'
  },
  FINALIZAR: {
    titulo: 'Anexar termo assinado',
    descricao: 'Digitalize o termo impresso pelo GEO com a assinatura do colaborador. Ao anexar, o desconto é finalizado.',
    confirmar: 'Anexar e finalizar',
    icone: 'pi pi-verified',
    variante: 'success'
  }
};

/** O desfazer muda de texto conforme a etapa que volta. */
const DESFAZER: Partial<Record<DescontoStatus, ConfiguracaoAcao & { volta: string; aviso: string }>> = {
  VALIDADO: {
    titulo: 'Desfazer validação', confirmar: 'Desfazer validação', icone: 'pi pi-undo', variante: 'primary',
    descricao: 'O desconto volta a aguardar validação e os itens podem ser alterados de novo.',
    volta: 'Aguardando validação',
    aviso: 'O valor validado deixa de valer. A validação desfeita continua na linha do tempo.'
  },
  REJEITADO: {
    titulo: 'Desfazer rejeição', confirmar: 'Desfazer rejeição', icone: 'pi pi-undo', variante: 'primary',
    descricao: 'O desconto volta a aguardar validação e pode ser corrigido e decidido de novo.',
    volta: 'Aguardando validação',
    aviso: 'A rejeição desfeita e o motivo dela continuam na linha do tempo.'
  },
  BAIXADO: {
    titulo: 'Desfazer baixa', confirmar: 'Desfazer baixa', icone: 'pi pi-undo', variante: 'primary',
    descricao: 'O desconto volta a aguardar a baixa em folha. A validação continua valendo.',
    volta: 'Validado, aguardando baixa',
    aviso: 'Se o valor já entrou na folha, registre no motivo como ele será estornado.'
  },
  FINALIZADO: {
    titulo: 'Desfazer finalização', confirmar: 'Desfazer finalização', icone: 'pi pi-undo', variante: 'primary',
    descricao: 'O desconto volta a aguardar o termo assinado. O arquivo anexado fica como comprovante comum.',
    volta: 'Baixado, aguardando termo assinado',
    aviso: 'Use quando o arquivo anexado não for o termo certo ou estiver ilegível.'
  }
};

const MOEDA = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MINIMO_MOTIVO = 5;

/**
 * Validar, baixar, rejeitar, desfazer e finalizar num drawer só, como a decisão da
 * solicitação financeira: cada ação pede o que precisa (valor, motivo ou arquivo).
 */
@Component({
  selector: 'app-desconto-acao-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    CesButtonComponent,
    CesCalloutComponent,
    CesFileInputComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesNumberInputComponent,
    CesTextareaComponent
  ],
  template: `
    @if (config(); as c) {
      <ces-form-drawer [(visible)]="visivel" [title]="c.titulo" [description]="c.descricao"
        [dirty]="sujo()" [loading]="processando()" size="sm">
        @if (desconto(); as d) {
          <ces-form-section title="Desconto" icon="pi pi-file">
            <dl class="ces-sheet">
              <div><dt>Colaborador</dt><dd>{{ nomeColaborador() || '—' }}</dd></div>
              <div><dt>Motivo</dt><dd>{{ d.motivo.descricao || '—' }}</dd></div>
              <div><dt>Valor sugerido</dt><dd>{{ d.valorSugerido | currency: 'BRL' }}</dd></div>
              @if (d.valorValidado != null && acao() !== 'VALIDAR') {
                <div><dt>Valor validado</dt><dd>{{ d.valorValidado | currency: 'BRL' }}</dd></div>
              }
              @if (d.valorBaixado != null) {
                <div><dt>Valor baixado</dt><dd>{{ d.valorBaixado | currency: 'BRL' }}</dd></div>
              }
              <div><dt>Parcelas</dt><dd>{{ d.quantidadeParcelas }}x</dd></div>
              @if (desfazer(); as x) {
                <div><dt>Volta para</dt><dd>{{ x.volta }}</dd></div>
              }
            </dl>
          </ces-form-section>
        }

        @switch (acao()) {
          @case ('FINALIZAR') {
            <ces-form-section title="Termo assinado" icon="pi pi-verified">
              <div class="ces-form-stack">
                <ces-file-input label="Arquivo do termo" [required]="true" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  [maxBytes]="maxBytes" buttonLabel="Selecionar arquivo" emptyLabel="Nenhum arquivo selecionado"
                  description="PDF ou foto legível do termo inteiro, com a assinatura do colaborador. Até 15 MB."
                  [(file)]="arquivo" [error]="erroArquivo()"></ces-file-input>
                <ces-callout tone="info" icon="pi pi-info-circle" [dense]="true">
                  O arquivo fica em destaque entre os anexos, identificado como o termo assinado.
                </ces-callout>
              </div>
            </ces-form-section>
          }
          @case ('REJEITAR') {
            <ces-form-section title="Justificativa" icon="pi pi-comment">
              <div class="ces-form-stack">
                <ces-textarea label="Motivo da rejeição" [required]="true" [(value)]="motivo" [rows]="4"
                  [maxlength]="1000" placeholder="Ex.: o item já tinha sido devolvido; valor fora da tabela."
                  description="Fica registrado no termo, com seu nome e a data." [error]="erroMotivo()"></ces-textarea>
                <ces-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true">
                  Se precisar, a rejeição pode ser desfeita depois, com motivo.
                </ces-callout>
              </div>
            </ces-form-section>
          }
          @case ('DESFAZER') {
            <ces-form-section title="Justificativa" icon="pi pi-comment">
              <div class="ces-form-stack">
                @if (desfazer(); as x) {
                  <ces-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true">{{ x.aviso }}</ces-callout>
                }
                <ces-textarea label="Motivo" [required]="true" [(value)]="motivo" [rows]="4" [maxlength]="1000"
                  placeholder="Ex.: valor validado com erro de digitação; baixa lançada no colaborador errado."
                  description="Fica na linha do tempo do desconto, com seu nome e a data." [error]="erroMotivo()"></ces-textarea>
              </div>
            </ces-form-section>
          }
          @default {
            <ces-form-section title="Valor" icon="pi pi-wallet">
              <div class="ces-form-stack">
                <ces-number-input [label]="acao() === 'VALIDAR' ? 'Valor validado' : 'Valor baixado'" mode="currency"
                  [required]="true" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2"
                  [(value)]="valor" [error]="erroValor()" [description]="descricaoValor()"></ces-number-input>
              </div>
            </ces-form-section>
          }
        }

        <div drawer-footer class="ces-actions-row">
          <ces-button variant="ghost" label="Voltar" (pressed)="visivel.set(false)" [disabled]="processando()"></ces-button>
          <ces-button [variant]="c.variante" [icon]="c.icone" [label]="c.confirmar" [loading]="processando()"
            (pressed)="confirmar()"></ces-button>
        </div>
      </ces-form-drawer>
    }
  `
})
export class DescontoAcaoDrawerComponent {
  readonly visivel = model(false);
  readonly acao = input<AcaoDesconto | null>(null);
  readonly desconto = input<DescontoResponse | null>(null);
  readonly nomeColaborador = input<string | null>(null);
  readonly processando = input(false);
  readonly confirmado = output<AcaoDescontoConfirmada>();

  protected readonly maxBytes = MAX_DESCONTO_ANEXO_SIZE_BYTES;
  protected readonly valor = signal<number | null>(null);
  protected readonly motivo = signal('');
  protected readonly arquivo = signal<File | null>(null);
  protected readonly erroValor = signal<string | undefined>(undefined);
  protected readonly erroMotivo = signal<string | undefined>(undefined);
  protected readonly erroArquivo = signal<string | undefined>(undefined);
  private valorInicial: number | null = null;
  /**
   * Status de quando o drawer abriu. Depois de confirmar, o desconto recarrega com o
   * status novo enquanto o drawer ainda fecha; derivar dele faria o drawer sumir no meio
   * da animação e deixar a máscara presa na tela.
   */
  private readonly statusAoAbrir = signal<DescontoStatus | null>(null);

  protected readonly desfazer = computed(() => {
    if (this.acao() !== 'DESFAZER') return null;
    const status = this.statusAoAbrir() ?? this.desconto()?.status;
    return status ? DESFAZER[status] ?? null : null;
  });

  protected readonly config = computed<ConfiguracaoAcao | null>(() => {
    const acao = this.acao();
    if (!acao) return null;
    return acao === 'DESFAZER' ? this.desfazer() : CONFIGURACAO[acao];
  });

  protected readonly sujo = computed(() => {
    switch (this.acao()) {
      case 'REJEITAR':
      case 'DESFAZER': return !!this.motivo().trim();
      case 'FINALIZAR': return !!this.arquivo();
      default: return this.valor() !== this.valorInicial;
    }
  });

  /** Valor da etapa anterior: é contra ele que a diferença é mostrada. */
  private readonly referencia = computed(() => {
    const d = this.desconto();
    if (!d) return null;
    return this.acao() === 'BAIXAR' ? (d.valorValidado ?? d.valorSugerido) : d.valorSugerido;
  });

  protected readonly descricaoValor = computed(() => {
    const valor = this.valor();
    const referencia = this.referencia();
    if (valor == null || referencia == null) return undefined;
    const etapa = this.acao() === 'BAIXAR' ? 'validado' : 'sugerido';
    const diferenca = valor - referencia;
    let texto = Math.abs(diferenca) < 0.005
      ? `Igual ao valor ${etapa}.`
      : `${MOEDA(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} do ${etapa}.`;
    const parcelas = this.desconto()?.quantidadeParcelas || 1;
    if (this.acao() === 'BAIXAR' && parcelas > 1) {
      texto += ` Equivale a ${parcelas}x de ${MOEDA(valor / parcelas)}.`;
    }
    return texto;
  });

  constructor() {
    effect(() => {
      if (!this.visivel()) return;
      untracked(() => {
        this.statusAoAbrir.set(this.desconto()?.status ?? null);
        this.valorInicial = this.referencia();
        this.valor.set(this.valorInicial);
        this.motivo.set('');
        this.arquivo.set(null);
        this.erroValor.set(undefined);
        this.erroMotivo.set(undefined);
        this.erroArquivo.set(undefined);
      });
    });
  }

  protected confirmar(): void {
    const acao = this.acao();
    if (!acao) return;

    if (acao === 'FINALIZAR') {
      const arquivo = this.arquivo();
      if (!arquivo) {
        this.erroArquivo.set('Selecione o arquivo do termo assinado.');
        return;
      }
      this.erroArquivo.set(undefined);
      this.confirmado.emit({ acao, valor: null, motivo: '', arquivo });
      return;
    }

    if (acao === 'REJEITAR' || acao === 'DESFAZER') {
      const motivo = this.motivo().trim();
      if (motivo.length < (acao === 'DESFAZER' ? MINIMO_MOTIVO : 1)) {
        this.erroMotivo.set(motivo ? `Escreva ao menos ${MINIMO_MOTIVO} caracteres.` : 'Informe o motivo.');
        return;
      }
      this.erroMotivo.set(undefined);
      this.confirmado.emit({ acao, valor: null, motivo, arquivo: null });
      return;
    }

    const valor = this.valor();
    if (valor == null || valor < 0) {
      this.erroValor.set(acao === 'VALIDAR' ? 'Informe o valor validado.' : 'Informe o valor baixado.');
      return;
    }
    this.erroValor.set(undefined);
    this.confirmado.emit({ acao, valor, motivo: '', arquivo: null });
  }
}
