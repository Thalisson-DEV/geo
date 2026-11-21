import { Routes } from '@angular/router';
import { ObrasListaComponent } from './obras-lista.component';

/** Obras da equipe. A ficha abre ao lado da lista no tablet deitado; APR, execução e ocorrência ocupam a tela. */
export const OBRAS_ROUTES: Routes = [
  { path: 'nao-programada', loadComponent: () => import('./obra-nao-programada.component').then(m => m.ObraNaoProgramadaComponent) },
  { path: 'relatorio', loadComponent: () => import('./relatorio-dia.component').then(m => m.RelatorioDiaComponent) },
  { path: ':id/apr', loadComponent: () => import('./apr.component').then(m => m.AprComponent) },
  { path: ':id/execucao', loadComponent: () => import('./execucao.component').then(m => m.ExecucaoComponent) },
  { path: ':id/ocorrencia', loadComponent: () => import('./ocorrencia.component').then(m => m.OcorrenciaObraComponent) },
  {
    path: '',
    component: ObrasListaComponent,
    children: [{ path: ':id', loadComponent: () => import('./obra-ficha.component').then(m => m.ObraFichaComponent) }],
  },
];
