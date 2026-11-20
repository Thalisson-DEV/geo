import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { campoGuard } from './campo.guard';
import { AuthService } from './auth.service';

describe('campoGuard', () => {
    let authServiceSpy: any;
    let routerSpy: any;

    beforeEach(() => {
        authServiceSpy = {
            isCampo: vi.fn().mockName("AuthService.isCampo")
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

    const runGuard = () => TestBed.runInInjectionContext(() => campoGuard({} as any, [], {} as any));

    it('permite acesso para usuários do tipo CAMPO', () => {
        authServiceSpy.isCampo.mockReturnValue(true);
        const result = runGuard();
        expect(result).toBe(true);
    });

    it('redireciona para /dashboard se não for usuário de campo', () => {
        const mockTree = {} as UrlTree;
        authServiceSpy.isCampo.mockReturnValue(false);
        routerSpy.createUrlTree.mockReturnValue(mockTree);

        const result = runGuard();
        expect(result).toBe(mockTree);
        expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });
});
