import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { GeoDrillStateService, parseGeoDrill, serializeGeoDrill } from './geo-drill-state.service';

function configurar(drillInicial: string | null) {
  const params = new BehaviorSubject(convertToParamMap(drillInicial ? { drill: drillInicial } : {}));
  const router = { navigate: vi.fn(() => Promise.resolve(true)) };
  const location = { back: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      GeoDrillStateService,
      { provide: Router, useValue: router },
      { provide: Location, useValue: location },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: params.value }, queryParamMap: params.asObservable() },
      },
    ],
  });
  return { service: TestBed.inject(GeoDrillStateService), router, location, params };
}

describe('GeoDrillStateService', () => {
  it('serializa e valida o parâmetro', () => {
    expect(parseGeoDrill('dia:2026-09-14')).toEqual({ dimension: 'dia', value: '2026-09-14' });
    expect(parseGeoDrill('inspetor:abc:def')).toEqual({ dimension: 'inspetor', value: 'abc:def' });
    expect(parseGeoDrill(':x')).toBeNull();
    expect(parseGeoDrill('dia:')).toBeNull();
    expect(parseGeoDrill('1x:y')).toBeNull();
    expect(serializeGeoDrill({ dimension: 'mes', value: '2026-09' })).toBe('mes:2026-09');
  });

  it('restaura o alvo da URL (link compartilhado) e fecha sem voltar no histórico', () => {
    const { service, router, location } = configurar('dia:2026-09-14');
    expect(service.target()).toEqual({ dimension: 'dia', value: '2026-09-14' });
    service.close();
    expect(service.target()).toBeNull();
    expect(location.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { drill: null }, replaceUrl: true }));
  });

  it('empilha ao abrir, substitui ao trocar de alvo e volta no histórico ao fechar', () => {
    const { service, router, location } = configurar(null);
    service.open({ dimension: 'dia', value: '2026-09-14' });
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { drill: 'dia:2026-09-14' }, replaceUrl: false }));
    service.open({ dimension: 'dia', value: '2026-09-15' });
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ replaceUrl: true }));
    service.close();
    expect(location.back).toHaveBeenCalledOnce();
  });

  it('acompanha o Voltar do navegador', () => {
    const { service, params } = configurar('dia:2026-09-14');
    params.next(convertToParamMap({}));
    expect(service.target()).toBeNull();
  });
});
