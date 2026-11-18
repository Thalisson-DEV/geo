import { Routes } from '@angular/router';

/** Checklist do veículo: qualquer usuário do app preenche e consulta (campo e administrativo). */
export const CHECKLIST_VEICULO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./checklist-veiculo-lista.component').then(m => m.ChecklistVeiculoListaComponent)
  },
  {
    path: 'novo',
    loadComponent: () => import('./checklist-veiculo-novo.component').then(m => m.ChecklistVeiculoNovoComponent)
  },
  {
    // Id do aparelho (o que está neste celular) ou do servidor (feito em outro aparelho).
    path: ':id',
    loadComponent: () => import('./checklist-veiculo-detalhe.component').then(m => m.ChecklistVeiculoDetalheComponent)
  }
];
