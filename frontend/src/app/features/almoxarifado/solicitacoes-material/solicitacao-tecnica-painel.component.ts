import { ChangeDetectionStrategy, Component, inject, output, signal, viewChild } from '@angular/core';
import { NotificationService } from '@geo/ui';
import { Observable } from 'rxjs';

import { getErrorMessage } from '../../../core/models/shared.models';
import { SolicitacaoMaterialSummaryResponse } from '../../../core/models/solicitacao-material-tecnica.models';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { SolicitacaoRejeicaoDialogComponent } from './solicitacao-rejeicao-dialog.component';
import { AbaDetalheTecnico, SolicitacaoTecnicaDetalheDrawerComponent } from './solicitacao-tecnica-detalhe-drawer.component';

/** O mínimo para abrir o painel: o id (o resto é buscado). */
export type ReferenciaSolicitacaoTecnica = Pick<SolicitacaoMaterialSummaryResponse, 'id'> & Partial<SolicitacaoMaterialSummaryResponse>;

export type AcaoPainelTecnico =
  | 'DETALHE'
  | 'PLANEJAR'
  | 'INICIAR_SEPARACAO'
  | 'CONCLUIR_SEPARACAO'
  | 'PULAR_SEPARACAO'
  | 'ENTREGAR'
  | 'DEVOLVER'
  | 'ENCERRAR_SALDO'
  | 'REJEITAR';

const ABA_DA_ACAO: Partial<Record<AcaoPainelTecnico, AbaDetalheTecnico>> = { PLANEJAR: 'planejamento', ENTREGAR: 'entrega', DEVOLVER: 'devolucao' };
const SEPARACAO: Partial<Record<AcaoPainelTecnico, string>> = {
  INICIAR_SEPARACAO: 'Separação iniciada.',
  CONCLUIR_SEPARACAO: 'Separação concluída. A solicitação está pronta para entrega.',
  PULAR_SEPARACAO: 'Separação dispensada. A solicitação está pronta para entrega.'
};

/**
 * Painel lateral da solicitação técnica, igual na tabela, no quadro e no calendário, no mesmo
 * modelo do comercial: o detalhe abre em drawer e planejar/editar e entregar são abas dele.
 * Separar (iniciar, concluir, dispensar) não pede formulário e grava direto.
 */
@Component({
  selector: 'app-solicitacao-tecnica-painel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SolicitacaoRejeicaoDialogComponent, SolicitacaoTecnicaDetalheDrawerComponent],
  template: `
    <app-solicitacao-tecnica-detalhe-drawer #detalhe [(visible)]="detalheAberto" [solicitacaoId]="idDetalhe()" [abaInicial]="abaDetalhe()"
      (alterado)="alterado.emit()" />

    <app-solicitacao-rejeicao-dialog [visible]="!!rejeitarId()" (visibleChange)="!$event && rejeitarId.set(null)"
      [idSolicitacao]="rejeitarId()" [reprovar]="false" (rejeitada)="concluido()"></app-solicitacao-rejeicao-dialog>
  `
})
export class SolicitacaoTecnicaPainelComponent {
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly notificacoes = inject(NotificationService);

  /** Algo mudou (planejamento, separação, entrega, rejeição): a tela recarrega. */
  readonly alterado = output<void>();

  protected readonly detalheAberto = signal(false);
  protected readonly idDetalhe = signal<string | null>(null);
  protected readonly abaDetalhe = signal<AbaDetalheTecnico>('itens');
  private readonly drawerDetalhe = viewChild<SolicitacaoTecnicaDetalheDrawerComponent>('detalhe');
  protected readonly rejeitarId = signal<string | null>(null);
  private ocupado = false;

  /** Abre o detalhe lateral, opcionalmente já na aba de uma ação. */
  abrirDetalhe(item: ReferenciaSolicitacaoTecnica, aba: AbaDetalheTecnico = 'itens'): void {
    // Reabrir a mesma solicitação em outra aba: fecha e abre para o efeito do drawer rodar de novo.
    if (this.detalheAberto() && this.idDetalhe() === item.id) this.detalheAberto.set(false);
    this.abaDetalhe.set(aba);
    this.idDetalhe.set(item.id);
    setTimeout(() => this.detalheAberto.set(true));
  }

  /** Executa a ação pedida por um cartão, linha ou arraste. */
  executar(item: ReferenciaSolicitacaoTecnica, acao: AcaoPainelTecnico | string): void {
    const pedido = acao as AcaoPainelTecnico;
    if (pedido === 'REJEITAR') return this.rejeitarId.set(item.id);
    const aba = ABA_DA_ACAO[pedido];
    if (aba) return this.abrirDetalhe(item, aba);
    const sucesso = SEPARACAO[pedido];
    if (sucesso) return this.separar(item, pedido, sucesso);
    this.abrirDetalhe(item);
  }

  /** Separação não pede formulário: grava direto com a versão mais recente. */
  private separar(item: ReferenciaSolicitacaoTecnica, acao: AcaoPainelTecnico, sucesso: string): void {
    if (this.ocupado) return;
    this.ocupado = true;
    this.service.buscarPorId(item.id).subscribe({
      next: (det) => {
        const corpo = { versaoEsperada: det.versao ?? item.versao ?? 1 };
        const chamada: Observable<unknown> =
          acao === 'INICIAR_SEPARACAO' ? this.service.iniciarSeparacao(item.id, corpo)
            : acao === 'CONCLUIR_SEPARACAO' ? this.service.concluirSeparacao(item.id, corpo)
              : this.service.pularSeparacao(item.id, corpo);
        chamada.subscribe({
          next: () => {
            this.ocupado = false;
            this.concluido(sucesso);
          },
          error: (e) => {
            this.ocupado = false;
            this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível atualizar a separação' });
          }
        });
      },
      error: (e) => {
        this.ocupado = false;
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected concluido(mensagem?: string): void {
    this.rejeitarId.set(null);
    if (mensagem) this.notificacoes.success(mensagem);
    if (this.detalheAberto()) this.drawerDetalhe()?.recarregar();
    this.alterado.emit();
  }
}
