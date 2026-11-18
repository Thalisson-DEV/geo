import { Routes } from '@angular/router';
import { aprovacaoAbastecimentoGuard } from '../../core/auth/aprovacao-abastecimento.guard';

/**
 * Abastecimento: qualquer usuário do app pede, acompanha, cancela e registra (campo e administrativo).
 * Aprovar é só do administrativo com a permissão, como as solicitações do almoxarifado.
 */
export const ABASTECIMENTO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./abastecimento-lista.component').then(m => m.AbastecimentoListaComponent)
  },
  {
    path: 'novo',
    loadComponent: () => import('./abastecimento-novo.component').then(m => m.AbastecimentoNovoComponent)
  },
  {
    // Administrativo com a permissão de aprovar: a fila das placas da carteira dele.
    path: 'aprovacoes',
    canMatch: [aprovacaoAbastecimentoGuard],
    loadComponent: () => import('./aprovacoes-lista.component').then(m => m.AprovacoesListaComponent)
  },
  {
    path: 'aprovacoes/:id',
    canMatch: [aprovacaoAbastecimentoGuard],
    loadComponent: () => import('./aprovacao-detalhe.component').then(m => m.AprovacaoDetalheComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./abastecimento-detalhe.component').then(m => m.AbastecimentoDetalheComponent)
  },
  {
    path: ':id/realizado',
    loadComponent: () => import('./abastecimento-realizado.component').then(m => m.AbastecimentoRealizadoComponent)
  }
];
