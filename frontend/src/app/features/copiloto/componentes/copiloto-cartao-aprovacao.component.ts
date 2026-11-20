import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GeoButtonComponent, GeoIconButtonComponent, GeoStatusComponent, GeoTextareaComponent, GeoTone, GeoIconComponent } from '@geo/ui';
import { GeoCalloutComponent } from '@geo/ui/feedback';
import {
  AcaoCartao,
  AlteracaoCartao,
  ItemAprovacao,
  ItemDecidido,
  PreviaAprovacao,
  ResultadoAprovacao,
} from '../../../core/models/assistente.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AssistenteService } from '../../../core/services/assistente.service';
import { PropostaAcaoView } from '../copiloto-pacotes';
import { CopilotoStore } from '../copiloto.store';

type Ocupado = 'revisando' | 'confirmando' | 'cancelando' | null;

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Cartão de aprovação preparado pela Bússola: a lista exata do que será aprovado ou rejeitado (número,
 * fornecedor, valor), o que ficou de fora e por quê. Nada é decidido antes de a pessoa confirmar; depois, o cartão
 * mostra solicitação por solicitação o que aconteceu.
 */
@Component({
  selector: 'app-copiloto-cartao-aprovacao',
  standalone: true,
  imports: [GeoIconComponent, GeoButtonComponent, GeoIconButtonComponent, GeoStatusComponent, GeoTextareaComponent, GeoCalloutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copiloto-cartao-aprovacao.component.html',
  styleUrl: './copiloto-cartao-aprovacao.component.css',
})
export class CopilotoCartaoAprovacaoComponent {
  private readonly api = inject(AssistenteService);
  private readonly store = inject(CopilotoStore);
  private readonly router = inject(Router);

  readonly proposta = input.required<PropostaAcaoView>();

  protected readonly ocupado = signal<Ocupado>(null);
  protected readonly erro = signal<string | null>(null);
  /** Motivos digitados e ainda não enviados, por item. */
  protected readonly motivos = signal<Record<number, string>>({});

  protected readonly acao = computed<AcaoCartao>(() => {
    const proposta = this.proposta();
    return this.store.acoesCartao()[proposta.acaoId] ?? {
      acaoId: proposta.acaoId,
      ferramenta: proposta.ferramenta,
      status: 'PENDENTE',
    };
  });
  protected readonly previa = computed<PreviaAprovacao | null>(() => {
    const atual = this.acao().previa as unknown as PreviaAprovacao | null | undefined;
    if (atual?.tipo === 'aprovacao') return atual;
    return (this.proposta().previa as PreviaAprovacao | null) ?? null;
  });
  protected readonly resultado = computed(() => this.acao().resultado as unknown as ResultadoAprovacao | null | undefined);
  protected readonly status = computed(() => this.acao().status);
  protected readonly pendente = computed(() => this.status() === 'PENDENTE');

  protected readonly entram = computed(() => (this.previa()?.itens ?? []).filter((i) => !i.problema));
  protected readonly fora = computed(() => (this.previa()?.itens ?? []).filter((i) => !!i.problema));
  /** Rejeições ainda sem motivo, contando o que já foi digitado no cartão. */
  protected readonly faltam = computed(() => this.entram().filter((i) => !!i.falta && !this.motivos()[i.indice]?.trim()).length);

  protected readonly selo = computed<{ tom: GeoTone; texto: string; icone: string }>(() => {
    switch (this.status()) {
      case 'CONFIRMADA': {
        const r = this.resultado();
        return r?.falhas
          ? { tom: 'warning', texto: 'Decidido em parte', icone: 'circle-alert' }
          : { tom: 'success', texto: 'Decidido', icone: 'check' };
      }
      case 'FALHOU':
        return { tom: 'danger', texto: 'Não decidido', icone: 'circle-x' };
      case 'REJEITADA':
        return { tom: 'neutral', texto: 'Cancelado', icone: 'ban' };
      case 'EXPIRADA':
        return { tom: 'neutral', texto: 'Sem efeito', icone: 'clock' };
      default:
        return this.previa()?.pronta
          ? { tom: 'info', texto: 'Confira e confirme', icone: 'circle-check' }
          : { tom: 'warning', texto: 'Falta completar', icone: 'pencil' };
    }
  });

  protected readonly subtitulo = computed(() => {
    const previa = this.previa();
    if (!previa) return '';
    const r = this.resultado();
    if (r && !this.pendente()) {
      const decididas = r.decididas === 1 ? '1 decidida' : `${r.decididas} decididas`;
      return r.falhas ? `${previa.modulo} · ${decididas}, ${r.falhas} não` : `${previa.modulo} · ${decididas}`;
    }
    const partes = [previa.modulo];
    if (previa.valorAprovar > 0) partes.push(`${this.moeda(previa.valorAprovar)} a aprovar`);
    return partes.join(' · ');
  });

  protected readonly rotuloConfirmar = computed(() => {
    const previa = this.previa();
    if (!previa) return 'Confirmar';
    if (previa.rejeitar === 0) return previa.aprovar === 1 ? 'Aprovar' : `Aprovar ${previa.aprovar}`;
    if (previa.aprovar === 0) return previa.rejeitar === 1 ? 'Rejeitar' : `Rejeitar ${previa.rejeitar}`;
    return 'Confirmar decisão';
  });

  protected readonly resumo = computed(() => {
    const faltam = this.faltam();
    if (faltam) return faltam === 1 ? 'Falta o motivo de 1 rejeição.' : `Falta o motivo de ${faltam} rejeições.`;
    if (!this.entram().length) return 'Nenhuma solicitação para decidir.';
    return 'Confira número, fornecedor e valor. Nada foi decidido ainda.';
  });

  protected readonly decididos = computed(() => (this.resultado()?.itens ?? []).filter((i) => i.status !== 'FORA'));
  protected readonly foraDoResultado = computed(() => (this.resultado()?.itens ?? []).filter((i) => i.status === 'FORA'));

  protected moeda(valor: number | null | undefined): string {
    return valor == null ? '' : MOEDA.format(valor);
  }

  protected data(iso: string | null | undefined): string {
    if (!iso) return '';
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? '' : DATA.format(data);
  }

  protected parcial(item: { valor?: number; valorAprovado?: number }): boolean {
    return item.valorAprovado != null && item.valor != null && item.valorAprovado < item.valor;
  }

  protected detalhes(item: ItemAprovacao): string {
    const partes: string[] = [];
    if (item.solicitante) partes.push(item.solicitante);
    if (item.base) partes.push(item.base);
    const enviada = this.data(item.enviadaEm);
    if (enviada) partes.push(`enviada em ${enviada}`);
    return partes.join(' · ');
  }

  protected rotuloStatus(item: ItemDecidido): string {
    switch (item.status) {
      case 'APROVADA':
        return this.parcial(item) ? `Aprovada por ${this.moeda(item.valorAprovado)}` : 'Aprovada';
      case 'REJEITADA':
        return 'Rejeitada';
      case 'FALHOU':
        return 'Não decidida';
      default:
        return 'Ficou de fora';
    }
  }

  protected motivo(item: ItemAprovacao): string {
    return this.motivos()[item.indice] ?? item.observacao ?? '';
  }

  protected digitarMotivo(item: ItemAprovacao, texto: string): void {
    this.motivos.update((atual) => ({ ...atual, [item.indice]: texto }));
  }

  protected trocarDecisao(item: ItemAprovacao): void {
    this.revisar([
      ...this.motivosDigitados(),
      { registro: item.indice, caminho: 'decisao', valor: item.decisao === 'APROVAR' ? 'rejeitar' : 'aprovar' },
    ]);
  }

  protected tirar(item: ItemAprovacao): void {
    this.revisar([...this.motivosDigitados(), { registro: item.indice, remover: true }]);
  }

  /** O motivo digitado vai junto com a próxima ação do cartão, para confirmar com um clique só. */
  private motivosDigitados(): AlteracaoCartao[] {
    return Object.entries(this.motivos())
      .map(([indice, texto]) => ({ registro: Number(indice), caminho: 'observacao', valor: texto.trim() }))
      .filter((a) => a.valor);
  }

  protected abrir(caminho: string | undefined): void {
    if (caminho) void this.router.navigateByUrl(caminho);
  }

  private revisar(alteracoes: AlteracaoCartao[]): void {
    if (!this.pendente() || this.ocupado() === 'confirmando') return;
    this.ocupado.set('revisando');
    this.erro.set(null);
    this.api.revisarAcao(this.proposta().acaoId, alteracoes).subscribe({
      next: (acao) => {
        this.motivos.set({});
        this.store.atualizarAcao(acao);
        this.ocupado.set(null);
      },
      error: (erro) => {
        this.ocupado.set(null);
        this.tratarErro(erro);
      },
    });
  }

  protected confirmar(): void {
    if (!this.pendente() || this.ocupado()) return;
    const pendentes = this.motivosDigitados();
    this.ocupado.set('confirmando');
    this.erro.set(null);
    this.api.confirmarAcao(this.proposta().acaoId, pendentes.length ? pendentes : undefined).subscribe({
      next: (acao) => {
        this.ocupado.set(null);
        this.motivos.set({});
        this.store.atualizarAcao(acao);
        if (acao.status === 'PENDENTE' && acao.mensagem) this.erro.set(acao.mensagem);
      },
      error: (erro) => {
        this.ocupado.set(null);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    if (!this.pendente() || this.ocupado()) return;
    this.ocupado.set('cancelando');
    this.erro.set(null);
    this.api.cancelarAcao(this.proposta().acaoId).subscribe({
      next: (acao) => {
        this.ocupado.set(null);
        this.store.atualizarAcao(acao);
      },
      error: (erro) => {
        this.ocupado.set(null);
        this.tratarErro(erro);
      },
    });
  }

  private tratarErro(erro: unknown): void {
    const mensagem = getErrorMessage(erro);
    this.erro.set(mensagem);
    const conversa = this.store.conversaId();
    if (conversa && /confirmado|cancelado|expirou/i.test(mensagem)) {
      this.api.listarAcoes(conversa).subscribe({
        next: (acoes) => acoes.forEach((acao) => this.store.atualizarAcao(acao)),
        error: () => undefined,
      });
    }
  }
}
