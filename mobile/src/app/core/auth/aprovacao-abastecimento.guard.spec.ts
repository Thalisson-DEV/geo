import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { aprovacaoAbastecimentoGuard } from './aprovacao-abastecimento.guard';
import { AuthService } from './auth.service';

describe('aprovacaoAbastecimentoGuard', () => {
    const podeAprovar = signal(false);
    let routerSpy: any;

    beforeEach(() => {
        routerSpy = {
            createUrlTree: vi.fn().mockName("Router.createUrlTree")
        };
        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: { podeAprovarAbastecimento: podeAprovar } },
                { provide: Router, useValue: routerSpy }
            ]
        });
    });

    const runGuard = () => TestBed.runInInjectionContext(() => aprovacaoAbastecimentoGuard({} as never, [], {} as never));

    it('deixa o administrativo que aprova entrar na fila', () => {
        podeAprovar.set(true);
        expect(runGuard()).toBe(true);
    });

    it('manda quem só pede (campo) para a aba Frota', () => {
        const arvore = {} as UrlTree;
        podeAprovar.set(false);
        routerSpy.createUrlTree.mockReturnValue(arvore);
        expect(runGuard()).toBe(arvore);
        expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/frota']);
    });
});
