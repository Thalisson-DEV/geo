import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  almoxBalcaoGuard, almoxEntregaGuard, almoxEquipesGuard, almoxFechamentoGuard, almoxMovimentacoesGuard, almoxMovimentarGuard, almoxSolicitacoesGuard,
} from '../../core/auth/almox.guard';
import { rotasFechamento } from '../fechamento/fechamento.routes';

export const ALMOX_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // Abre na parte que a pessoa pode usar (solicitações primeiro).
    redirectTo: () => {
      const auth = inject(AuthService);
      if (auth.podeOperarBalcao()) return '/almox/balcao';
      if (auth.podeVerEstoqueEquipes() && !auth.podeVerSolicitacoesAlmox()) return '/almox/equipes';
      if (auth.podeVerSolicitacoesAlmox()) return '/almox/tecnicas';
      return auth.podeVerMovimentacoes() ? '/almox/movimentacoes' : '/almox/fechamento';
    },
  },
  {
    // Balcão: a rotina do dia (retirada de manhã, devolução no fim do dia), feita no tablet do almoxarifado.
    path: 'balcao',
    canMatch: [almoxBalcaoGuard],
    children: [
      { path: '', loadComponent: () => import('./balcao/balcao-almox.component').then(m => m.BalcaoAlmoxComponent) },
      { path: ':idEquipe/:modo', loadComponent: () => import('./balcao/atendimento-balcao.component').then(m => m.AtendimentoBalcaoComponent) },
    ],
  },
  {
    // Estoque das equipes: o que cada caminhão leva, por obra, com sucata e negativos (precisa de internet).
    path: 'equipes',
    canMatch: [almoxEquipesGuard],
    loadComponent: () => import('./equipes/estoque-equipes-almox.component').then(m => m.EstoqueEquipesAlmoxComponent),
  },
  {
    path: 'solicitacoes',
    canMatch: [almoxSolicitacoesGuard],
    children: [
      // A lista comercial saiu do app (o GEO é de Obras): quem chega aqui vai para as técnicas.
      { path: '', pathMatch: 'full', redirectTo: '/almox/tecnicas' },
      {
        path: ':id/entrega',
        canMatch: [almoxEntregaGuard],
        loadComponent: () => import('./solicitacoes/entrega-almox.component').then(m => m.EntregaAlmoxComponent),
      },
      { path: ':id', loadComponent: () => import('./solicitacoes/solicitacao-almox-detalhe.component').then(m => m.SolicitacaoAlmoxDetalheComponent) },
    ],
  },
  {
    // Fluxo técnico (221/921/222/922): as ações dependem das permissões que o backend projeta.
    path: 'tecnicas',
    canMatch: [almoxSolicitacoesGuard],
    children: [
      { path: '', loadComponent: () => import('./tecnicas/tecnicas-almox.component').then(m => m.TecnicasAlmoxComponent) },
      { path: ':id/entrega', loadComponent: () => import('./solicitacoes/entrega-almox.component').then(m => m.EntregaAlmoxComponent) },
      { path: ':id/devolucao', loadComponent: () => import('./tecnicas/devolucao-tecnica-almox.component').then(m => m.DevolucaoTecnicaAlmoxComponent) },
      { path: ':id', loadComponent: () => import('./tecnicas/tecnica-almox-detalhe.component').then(m => m.TecnicaAlmoxDetalheComponent) },
    ],
  },
  {
    // Encerramento de obras: mesmas telas da seção do técnico, com as abas do almoxarifado.
    path: 'fechamento',
    canMatch: [almoxFechamentoGuard],
    children: rotasFechamento('/almox/fechamento'),
  },
  {
    path: 'movimentacoes',
    canMatch: [almoxMovimentacoesGuard],
    children: [
      { path: '', loadComponent: () => import('./movimentacoes/movimentacoes-almox.component').then(m => m.MovimentacoesAlmoxComponent) },
      {
        path: 'nova/:tipo',
        canMatch: [almoxMovimentarGuard],
        loadComponent: () => import('./movimentacoes/nova-movimentacao.component').then(m => m.NovaMovimentacaoComponent),
      },
      { path: ':id', loadComponent: () => import('./movimentacoes/movimentacao-almox-detalhe.component').then(m => m.MovimentacaoAlmoxDetalheComponent) },
    ],
  },
  { path: '**', redirectTo: '/almox' },
];
