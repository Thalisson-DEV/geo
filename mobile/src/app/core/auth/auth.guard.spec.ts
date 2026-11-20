import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('AuthGuard', () => {
    let authServiceSpy: any;
    let routerSpy: any;
    const arvoreLogin = {} as UrlTree;

    beforeEach(() => {
        authServiceSpy = {
            isAuthenticated: vi.fn().mockName("AuthService.isAuthenticated"),
            restaurarSessao: vi.fn().mockName("AuthService.restaurarSessao")
        };
        authServiceSpy.restaurarSessao.mockResolvedValue(false);
        routerSpy = {
            parseUrl: vi.fn().mockName("Router.parseUrl")
        };
        routerSpy.parseUrl.mockReturnValue(arvoreLogin);

        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: authServiceSpy },
                { provide: Router, useValue: routerSpy }
            ]
        });
    });

    const runGuard = () => TestBed.runInInjectionContext(() => authGuard({} as any, {} as any)) as Promise<boolean | UrlTree>;

    it('abre o app com a sessão do aparelho, com ou sem rede e mesmo com o token vencido', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(true);

        expect(await runGuard()).toBe(true);
        expect(authServiceSpy.restaurarSessao).not.toHaveBeenCalled();
    });

    it('sem sessão local, tenta recuperá-la pelo cookie antes do login', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(false);
        authServiceSpy.restaurarSessao.mockResolvedValue(true);

        expect(await runGuard()).toBe(true);
    });

    it('sem sessão nenhuma, vai para o login', async () => {
        authServiceSpy.isAuthenticated.mockReturnValue(false);

        expect(await runGuard()).toBe(arvoreLogin);
        expect(routerSpy.parseUrl).toHaveBeenCalledWith('/login');
    });
});
