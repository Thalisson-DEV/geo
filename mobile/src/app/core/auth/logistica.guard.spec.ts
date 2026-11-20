import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { logisticaGuard } from './logistica.guard';
import { AuthService } from './auth.service';

describe('logisticaGuard', () => {
    let authServiceSpy: any;
    let routerSpy: any;

    beforeEach(() => {
        authServiceSpy = {
            podeAcessarLogistica: vi.fn().mockName("AuthService.podeAcessarLogistica")
        };
        routerSpy = {
            createUrlTree: vi.fn().mockName("Router.createUrlTree")
        };

        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: authServiceSpy },
                { provide: Router, useValue: routerSpy }
            ]
        });
    });

    const runGuard = () => TestBed.runInInjectionContext(() => logisticaGuard({} as any, [], {} as any));

    it('permite acesso para usuários com acesso à logística (campo)', () => {
        authServiceSpy.podeAcessarLogistica.mockReturnValue(true);
        const result = runGuard();
        expect(result).toBe(true);
    });

    it('redireciona para /dashboard se for usuário administrativo', () => {
        const mockTree = {} as UrlTree;
        authServiceSpy.podeAcessarLogistica.mockReturnValue(false);
        routerSpy.createUrlTree.mockReturnValue(mockTree);

        const result = runGuard();
        expect(result).toBe(mockTree);
        expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });
});
