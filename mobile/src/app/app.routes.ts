import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { loginGuard } from './core/auth/login.guard';
import { adminGuard } from './core/auth/admin.guard';
import { desviosGuard } from './core/auth/desvios.guard';
import { logisticaGuard } from './core/auth/logistica.guard';
import { campoGuard } from './core/auth/campo.guard';
import { obrasGuard, supervisaoObrasGuard } from './core/auth/obras.guard';
import { almoxGuard, fechamentoCriarGuard } from './core/auth/almox.guard';
import { retomadaGuard } from './core/sessao/retomada.guard';

export const routes: Routes = [
  {
    // Raiz = start_url do manifest (abrir pelo ícone): decide entre voltar ao ponto
    // exato, pedir login e depois voltar, ou abrir o início. Nunca renderiza nada.
    path: '',
    pathMatch: 'full',
    canActivate: [retomadaGuard],
    children: []
  },
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'sync',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sync/sync-loading.component').then(m => m.SyncLoadingComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/app-shell.component').then(m => m.AppShellComponent),
    children: [
      {
        path: 'hoje',
        loadComponent: () => import('./features/hoje/hoje.component').then(m => m.HojeComponent)
      },
      {
        // Rota da versão anterior: links, atalhos e retratos de sessão antigos continuam válidos.
        path: 'dashboard',
        redirectTo: 'hoje'
      },
      {
        path: 'material',
        canMatch: [logisticaGuard],
        loadComponent: () => import('./features/material/material.component').then(m => m.MaterialComponent)
      },
      {
        // Saldo do caminhão (a equipe de campo não pede material: ele vem da programação ou de solicitação manual).
        path: 'material/saldo',
        canMatch: [logisticaGuard],
        loadComponent: () => import('./features/material/saldo/estoque-list.component').then(m => m.EstoqueListComponent)
      },
      {
        path: 'transferencias',
        canMatch: [logisticaGuard],
        loadChildren: () => import('./features/transferencias/transferencias.routes').then(m => m.TRANSFERENCIAS_ROUTES)
      },
      {
        // Obras da equipe de campo: agenda, ficha, APR, execução e fechamento do dia (offline).
        path: 'obras',
        canMatch: [obrasGuard],
        loadChildren: () => import('./features/obras/obras.routes').then(m => m.OBRAS_ROUTES)
      },
      {
        // Supervisor de Obras no app: acompanhamento das equipes, visita prévia, As Built e book.
        path: 'supervisao',
        canMatch: [supervisaoObrasGuard],
        loadChildren: () => import('./features/supervisao/supervisao.routes').then(m => m.SUPERVISAO_ROUTES)
      },
      {
        path: 'turno/abrir',
        canMatch: [campoGuard],
        loadComponent: () => import('./features/turno/abrir-turno.component').then(m => m.AbrirTurnoComponent)
      },
      {
        // Módulo administrativo: fora do escopo do encarregado de campo.
        path: 'inspecoes',
        canMatch: [adminGuard],
        loadChildren: () => import('./features/inspecoes/inspecoes.routes').then(m => m.INSPECOES_ROUTES)
      },
      {
        // Almoxarifado do perfil administrativo: gestão de solicitações e movimentações de estoque.
        path: 'almox',
        canMatch: [almoxGuard],
        loadChildren: () => import('./features/almox/almox.routes').then(m => m.ALMOX_ROUTES)
      },
      {
        // Encerramento de obras do técnico: abre nas solicitações da própria pessoa.
        path: 'fechamento',
        canMatch: [fechamentoCriarGuard],
        loadChildren: () => import('./features/fechamento/fechamento.routes').then(m => m.rotasFechamento('/fechamento')),
      },
      {
        path: 'desvios',
        canMatch: [desviosGuard],
        loadComponent: () => import('./features/desvios/meus-desvios.component').then(m => m.MeusDesviosComponent)
      },
      {
        // Frota: checklist, abastecimento e situação do veículo num destino só (qualquer usuário do app).
        path: 'frota',
        loadComponent: () => import('./features/frota/frota.component').then(m => m.FrotaComponent)
      },
      {
        path: 'frota/veiculo',
        loadComponent: () => import('./features/frota/veiculo-situacao.component').then(m => m.VeiculoSituacaoComponent)
      },
      {
        // Documentos do veículo para a fiscalização: abrem dentro do app, também sem sinal.
        path: 'frota/documentos',
        loadComponent: () => import('./features/frota/veiculo-documentos.component').then(m => m.VeiculoDocumentosComponent)
      },
      {
        path: 'frota/documentos/:idDocumento',
        loadComponent: () => import('./features/frota/documento-visor.component').then(m => m.DocumentoVisorComponent)
      },
      {
        path: 'checklist',
        loadChildren: () => import('./features/checklist-veiculo/checklist-veiculo.routes').then(m => m.CHECKLIST_VEICULO_ROUTES)
      },
      {
        path: 'abastecimento',
        loadChildren: () => import('./features/abastecimento/abastecimento.routes').then(m => m.ABASTECIMENTO_ROUTES)
      },
      {
        // Catálogo dos componentes de toque (desenvolvimento e screenshots do redesign); sem link no app.
        path: 'catalogo',
        loadComponent: () => import('./features/catalogo/catalogo.component').then(m => m.CatalogoComponent)
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/perfil/perfil.component').then(m => m.PerfilComponent)
      },
      {
        path: '',
        redirectTo: 'hoje',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'hoje'
  }
];
