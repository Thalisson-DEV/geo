import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeiturasOfflineService } from '../offline/leituras-offline.service';
import { AuthService } from '../services/auth.service';
import { leituraOfflineInterceptor } from './leitura-offline.interceptor';

describe('leituraOfflineInterceptor', () => {
  const guardadas = new Map<string, { corpo: unknown; salvoEm: Date }>();
  const leituras = {
    mostrandoDesde: signal<Date | null>(null),
    podeGuardar: (url: string) => url.includes('/v1/obras'),
    guardar: vi.fn(async (u: string, url: string, corpo: unknown) => void guardadas.set(`${u}|${url}`, { corpo, salvoEm: new Date(2026, 10, 21, 9, 15) })),
    buscar: vi.fn(async (u: string, url: string) => guardadas.get(`${u}|${url}`) ?? null),
    marcarExibicao: vi.fn((d: Date) => leituras.mostrandoDesde.set(d)),
    voltouARede: vi.fn(() => leituras.mostrandoDesde.set(null))
  };
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    guardadas.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([leituraOfflineInterceptor])),
        provideHttpClientTesting(),
        { provide: LeiturasOfflineService, useValue: leituras },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1' }) } }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  it('sem rede, devolve a última resposta guardada da mesma consulta e marca de quando ela é', async () => {
    const primeira = firstValueFrom(http.get('/api/v1/obras?tamanho=10'));
    backend.expectOne('/api/v1/obras?tamanho=10').flush({ content: [{ numero: '7100001' }] });
    await primeira;
    await Promise.resolve();

    const semRede = firstValueFrom(http.get('/api/v1/obras?tamanho=10'));
    backend.expectOne('/api/v1/obras?tamanho=10').error(new ProgressEvent('error'), { status: 0 });

    expect(await semRede).toEqual({ content: [{ numero: '7100001' }] });
    expect(leituras.mostrandoDesde()).toEqual(new Date(2026, 10, 21, 9, 15));
  });

  it('erro do servidor não troca pela resposta guardada: ali há rede e o servidor respondeu', async () => {
    guardadas.set('u1|/api/v1/obras/1', { corpo: { id: '1' }, salvoEm: new Date() });
    const pedido = firstValueFrom(http.get('/api/v1/obras/1'));
    backend.expectOne('/api/v1/obras/1').flush({ title: 'Erro' }, { status: 500, statusText: 'Erro' });

    await expect(pedido).rejects.toMatchObject({ status: 500 });
  });

  it('consulta fora de Obras não é guardada', async () => {
    const pedido = firstValueFrom(http.get('/api/v1/financeiro/pagamentos'));
    backend.expectOne('/api/v1/financeiro/pagamentos').flush({ content: [] });
    await pedido;

    expect(leituras.guardar).not.toHaveBeenCalled();
  });
});
