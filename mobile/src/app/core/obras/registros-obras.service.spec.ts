import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { db } from '../db/app-db';
import { LocalizacaoService } from './localizacao.service';
import { FalhaDeEnvioObras, OBRAS_ENDPOINT, RegistrosObrasService } from './registros-obras.service';

describe('RegistrosObrasService (fila de Obras)', () => {
  let servico: RegistrosObrasService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LocalizacaoService, useValue: { agora: async () => null } }],
    });
    servico = TestBed.inject(RegistrosObrasService);
    http = TestBed.inject(HttpTestingController);
    // O envio logo após o lançamento chama a fila inteira; aqui o teste chama o envio direto.
    vi.spyOn(servico as unknown as { enviarLogo(): void }, 'enviarLogo').mockImplementation(() => undefined);
    await Promise.all([db.outbox.clear(), db.obrasRegistros.clear()]);
  });

  afterEach(async () => {
    http.verify();
    await Promise.all([db.outbox.clear(), db.obrasRegistros.clear()]);
  });

  async function itemDa(idRegistro: string) {
    return (await db.outbox.toArray()).find(i => i.endpoint === OBRAS_ENDPOINT && i.payload.idRegistro === idRegistro)!;
  }

  it('grava no aparelho com id, hora e põe na fila', async () => {
    const r = await servico.registrar({ tipo: 'PRESENCA', idObra: 'o-1', comando: { idObra: 'o-1', tipo: 'CHEGADA' } });
    expect(r.envio).toBe('NO_APARELHO');
    expect(r.comando.campo.idLocal).toBe(r.id);
    expect(r.comando.campo.instante).toMatch(/[+-]\d\d:\d\d$/);
    expect(await itemDa(r.id)).toBeTruthy();
  });

  it('resolvido no servidor: enviado e sai da fila', async () => {
    const r = await servico.registrar({ tipo: 'OCORRENCIA', idObra: 'o-1', comando: { tipo: 'CLIMA', descricao: 'Chuva', impedeExecucao: false } });
    const envio = servico.processarEnvio(await itemDa(r.id));
    await new Promise(res => setTimeout(res, 20));
    const req = http.expectOne(c => c.url.endsWith('/v1/sincronizacao/operacoes'));
    expect(req.request.body.tipo).toBe('OBRA_OCORRENCIA');
    expect(req.request.headers.get('Idempotency-Key')).toBe(r.id);
    req.flush({ status: 'RESOLVIDO', idsRegistros: ['srv-1'] });
    await envio;
    expect((await db.obrasRegistros.get(r.id))?.envio).toBe('ENVIADO');
    expect(await itemDa(r.id)).toBeUndefined();
  });

  it('recusa vira conflito com motivo, e o apontamento que dependia da APR espera', async () => {
    const apr = await servico.registrar({ tipo: 'APR', idObra: 'o-1', idProgramacao: 'p-1', comando: { concluir: true } });
    const apontamento = await servico.registrar({ tipo: 'APONTAMENTO', idObra: 'o-1', idProgramacao: 'p-1', dependeDe: apr.id,
      comando: { idProgramacao: 'p-1', idPonto: 'pt-4', pontoInteiro: true } });
    const envio = servico.processarEnvio(await itemDa(apr.id));
    await new Promise(res => setTimeout(res, 20));
    http.expectOne(c => c.url.endsWith('/v1/sincronizacao/operacoes'))
      .flush({ status: 'EM_TRATAMENTO', motivo: 'A programação #12 foi cancelada.', idCaso: 'caso-1' });
    await envio;
    const recusada = await db.obrasRegistros.get(apr.id);
    expect(recusada?.envio).toBe('CONFLITO');
    expect(recusada?.motivo).toContain('cancelada');

    await servico.processarEnvio(await itemDa(apontamento.id));
    const espera = await db.obrasRegistros.get(apontamento.id);
    expect(espera?.envio).toBe('AGUARDANDO');
    expect(espera?.motivo).toContain('Aguardando a APR');
  });

  it('sem rede: o registro volta para o aparelho e a fila tenta de novo', async () => {
    const r = await servico.registrar({ tipo: 'PRESENCA', idObra: 'o-1', comando: { tipo: 'SAIDA' } });
    const envio = servico.processarEnvio(await itemDa(r.id));
    await new Promise(res => setTimeout(res, 20));
    http.expectOne(c => c.url.endsWith('/v1/sincronizacao/operacoes')).error(new ProgressEvent('error'), { status: 0 });
    await expect(envio).rejects.toBeInstanceOf(FalhaDeEnvioObras);
    expect((await db.obrasRegistros.get(r.id))?.envio).toBe('NO_APARELHO');
  });

  it('desfazer antes de sair do aparelho apaga o registro e o item da fila', async () => {
    const r = await servico.registrar({ tipo: 'PRESENCA', idObra: 'o-1', comando: { tipo: 'CHEGADA' } });
    expect(await servico.desfazer(r.id)).toBe(true);
    expect(await db.obrasRegistros.get(r.id)).toBeUndefined();
    expect(await itemDa(r.id)).toBeUndefined();
  });

  it('erro da fila é do tipo esperado pela fila do app', () => {
    expect(new FalhaDeEnvioObras(0, 'x')).toBeInstanceOf(Error);
  });
});
