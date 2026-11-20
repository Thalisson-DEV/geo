import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { loginGuard } from './login.guard';
import { AuthService } from './auth.service';

describe('LoginGuard', () => {
    let authServiceSpy: any & {
        reautenticacaoNecessaria: ReturnType<typeof signal<boolean>>;
    };
    let routerSpy: any;
    const arvore = {} as UrlTree;

    beforeEach(() => {
        authServiceSpy = Object.assign({
            isAuthenticated: vi.fn().mockName("AuthService.isAuthenticated"),
            restaurarSessao: vi.fn().mockName("AuthService.restaurarSessao")
        }, {
            reautenticacaoNecessaria: signal(false),
        });
        authServiceSpy.restaurarSessao.mockResolvedValue(false);
        routerSpy = {
            parseUrl: vi.fn().mockName("Router.parseUrl")
        };
        routerSpy.parseUrl.mockReturnValue(arvore);

        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: authServiceSpy },
                { provide: Router, useValue: routerSpy }
            ]
        });
    });

    const runGuard = (volta?: string) => {
        const rota = { queryParamMap: convertToParamMap(volta ? { volta } : {}) } as ActivatedRouteSnapshot;
        return TestBed.runInInjectionContext(() => loginGuard(rota, {} as any)) as Promise<boolean | UrlTree>;
    };

    it('com sessão no aparelho, o app reaberto no login vai direto para o início', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(true);

        expect(await runGuard()).toBe(arvore);
        expect(routerSpy.parseUrl).toHaveBeenCalledWith('/hoje');
        expect(authServiceSpy.restaurarSessao).not.toHaveBeenCalled();
    });

    it('com sessão, volta para a tela de onde o login foi aberto', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(true);

        await runGuard('/campo/nova');

        expect(routerSpy.parseUrl).toHaveBeenCalledWith('/campo/nova');
    });

    it('não segue um "volta" externo', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(true);

        await runGuard('//site.externo');

        expect(routerSpy.parseUrl).toHaveBeenCalledWith('/hoje');
    });

    it('sem token, recupera a sessão pelo cookie em vez de pedir a senha', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(false);
        authServiceSpy.restaurarSessao.mockResolvedValue(true);

        expect(await runGuard()).toBe(arvore);
    });

    it('sem sessão nenhuma (inclusive depois de "Sair"), mostra o formulário', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(false);

        expect(await runGuard()).toBe(true);
    });

    it('sessão encerrada pelo servidor: o formulário é o caminho de volta', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(true);
        authServiceSpy.reautenticacaoNecessaria.set(true);

        expect(await runGuard()).toBe(true);
        expect(authServiceSpy.restaurarSessao).not.toHaveBeenCalled();
    });
});
