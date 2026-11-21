import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  LOCALE_ID,
  inject,
  provideAppInitializer
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, withNavigationErrorHandler, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';

import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { routes } from './app.routes';
import { comModulosOcultos } from './core/white-label/modulos-ocultos';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { idempotencyInterceptor } from './core/interceptors/idempotency.interceptor';
import {
  tratarErroDeNavegacao,
  VersaoObsoletaErrorHandler
} from './core/versao-obsoleta';
import { ConfirmationService, MessageService } from 'primeng/api';
import { geoPreset } from './design-system/core';
import { environment } from '../environments/environment';
import { GEO_PAGE_FAVORITES } from './design-system/patterns/page-header';
import { FavoritosService } from './core/services/favoritos.service';
import { NavigationHistoryService } from './core/navigation/navigation-history.service';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Rota lazy cujo chunk sumiu em um deploy: a navegação falha calada e a tela
    // simplesmente não muda. Foi assim que um desconto salvo com sucesso pareceu
    // não ter salvo, e o usuário lançou o mesmo desconto três vezes (07/08/2026).
    provideRouter(
      comModulosOcultos(routes),
      withNavigationErrorHandler(tratarErroDeNavegacao),
      // A janela não rola (o shell rola dentro de <main>, ver appScrollMemory em app.html);
      // isto cobre telas que rolam a janela e as âncoras.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Transição curta só no conteúdo (motion.css); sem suporte no navegador, troca direto.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition }) => {
          if (document.documentElement.dataset['motion'] === 'reduced') transition.skipTransition();
        }
      })
    ),
    // Precisa existir antes da navegação inicial para reconhecer F5 e deep links.
    provideAppInitializer(() => inject(NavigationHistoryService).start()),
    { provide: ErrorHandler, useClass: VersaoObsoletaErrorHandler },
    // A ordem importa: o de idempotência roda DEPOIS do de autenticação, sendo o último a
    // tocar nos headers antes do envio — é assim que a chave sobrevive até o backend.
    provideHttpClient(withXhr(), withInterceptors([authInterceptor, idempotencyInterceptor])),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    MessageService,
    ConfirmationService,
    // O cabeçalho de página do DS (geo-page-header) favorita sem depender de core/.
    {
      provide: GEO_PAGE_FAVORITES,
      useFactory: () => {
        const favoritos = inject(FavoritosService);
        return {
          isCurrentPageFavorite: favoritos.isCurrentPageFavorite,
          toggle: (titulo: string, icone?: string) => favoritos.toggleFavorite(titulo, icone)
        };
      }
    },
    providePrimeNG({
      license: environment.primeuiLicense,
      ripple: false,
      pt: {
        confirmDialog: {
          host: {
            'aria-label': 'Confirmação da ação'
          }
        }
      },
      theme: {
        preset: geoPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, geo.tokens, geo.base, geo.components, utilities, geo.legacy'
          }
        }
      },
      translation: {
        dayNames: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
        dayNamesShort: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
        dayNamesMin: ["D", "S", "T", "Q", "Q", "S", "S"],
        monthNames: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"],
        monthNamesShort: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
        today: 'Hoje',
        clear: 'Limpar',
        dateFormat: 'dd/mm/yy',
        firstDayOfWeek: 0,
        // Listas com busca (select, multiselect, autocomplete) e tabelas sem linhas.
        emptyFilterMessage: 'Nada encontrado com essa busca',
        emptySearchMessage: 'Nada encontrado com essa busca',
        emptyMessage: 'Nenhuma opção disponível',
        emptySelectionMessage: 'Nada selecionado',
        selectionMessage: '{0} selecionados',
        searchMessage: '{0} resultados disponíveis',
        weak: 'Fraca',
        medium: 'Média',
        strong: 'Forte',
        passwordPrompt: 'Digite uma senha',
        accept: 'Sim',
        reject: 'Não',
        choose: 'Escolher',
        upload: 'Enviar',
        cancel: 'Cancelar',
        weekHeader: 'Sem',
        noFilter: 'Sem filtro'
      }
    }),
  ],
};
