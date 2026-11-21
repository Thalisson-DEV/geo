import { Routes } from '@angular/router';

export const SUPERVISAO_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./supervisao.component').then(m => m.SupervisaoComponent) },
  { path: 'obras/:id', loadComponent: () => import('./documentacao-obra.component').then(m => m.DocumentacaoObraComponent) },
];
