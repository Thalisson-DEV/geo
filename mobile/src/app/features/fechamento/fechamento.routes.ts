import { Routes } from '@angular/router';
import { fechamentoCriarGuard, fechamentoMovimentarGuard } from '../../core/auth/almox.guard';

export type BaseFechamento = '/fechamento' | '/almox/fechamento';

/** As mesmas telas servem à seção do técnico e à aba do almoxarifado; `base` diz de onde se veio. */
export function rotasFechamento(base: BaseFechamento): Routes {
  const data = { base };
  return [
    { path: '', data, loadComponent: () => import('./fechamento-lista.component').then(m => m.FechamentoListaComponent) },
    { path: 'novo', canMatch: [fechamentoCriarGuard], data, loadComponent: () => import('./novo-fechamento.component').then(m => m.NovoFechamentoComponent) },
    { path: ':id/movimentar', canMatch: [fechamentoMovimentarGuard], data, loadComponent: () => import('./fechamento-movimentar.component').then(m => m.FechamentoMovimentarComponent) },
    { path: ':id/editar', canMatch: [fechamentoCriarGuard], data, loadComponent: () => import('./fechamento-editar.component').then(m => m.FechamentoEditarComponent) },
    { path: ':id', data, loadComponent: () => import('./fechamento-detalhe.component').then(m => m.FechamentoDetalheComponent) },
  ];
}
