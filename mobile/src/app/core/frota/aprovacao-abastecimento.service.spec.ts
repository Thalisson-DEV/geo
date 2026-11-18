import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AprovacaoAbastecimentoService } from './aprovacao-abastecimento.service';

const URL = `${environment.apiBaseUrl}/v1/frota/app/abastecimento/aprovacoes/carteira`;

describe('AprovacaoAbastecimentoService', () => {
  let servico: AprovacaoAbastecimentoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servico = TestBed.inject(AprovacaoAbastecimentoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('carteira manda cada situação, a placa, o dia inicial e a página, do mais novo para o mais antigo', async () => {
    const pagina = servico.carteira({ situacoes: ['REPROVADA', 'CANCELADA'], busca: 'ABC', de: '2026-10-01', page: 1, size: 30 });
    const req = http.expectOne((r) => r.url === URL);
    const p = req.request.params;
    expect(p.getAll('situacao')).toEqual(['REPROVADA', 'CANCELADA']);
    expect(p.get('busca')).toBe('ABC');
    expect(p.get('de')).toBe('2026-10-01');
    expect(p.get('page')).toBe('1');
    expect(p.get('sort')).toBe('solicitadoEm,desc');
    req.flush({ content: [], page: { totalElements: 0 } });
    expect((await pagina).content).toEqual([]);
  });

  it('carteira sem situação nem filtro não manda os parâmetros vazios', async () => {
    const pagina = servico.carteira({ situacoes: [], busca: null, de: null, page: 0, size: 30 });
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.has('situacao')).toBeFalse();
    expect(req.request.params.has('busca')).toBeFalse();
    expect(req.request.params.has('de')).toBeFalse();
    req.flush({ content: [], page: { totalElements: 0 } });
    await pagina;
  });
});
