import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RhService } from './rh.service';

describe('RhService.aguardarAcessoColaborador', () => {
  const servicoCom = (buscar: ReturnType<typeof vi.fn>) =>
    Object.assign(Object.create(RhService.prototype), { buscarColaboradorPorId: buscar }) as RhService;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('confirma assim que o colaborador aponta para o usuário e para de consultar', async () => {
    const buscar = vi
      .fn()
      .mockReturnValueOnce(of({ idUsuario: null }))
      .mockReturnValue(of({ idUsuario: 'u7' }));

    const resultado = firstValueFrom(servicoCom(buscar).aguardarAcessoColaborador('c1', 'u7'));
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultado).resolves.toBe(true);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('sem usuário informado, qualquer acesso confirma', async () => {
    const buscar = vi.fn(() => of({ idUsuario: 'novo' }));

    const resultado = firstValueFrom(servicoCom(buscar).aguardarAcessoColaborador('c1'));
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultado).resolves.toBe(true);
  });

  it('não confunde com outro usuário e desiste depois das tentativas', async () => {
    const buscar = vi.fn(() => of({ idUsuario: 'outro' }));

    const resultado = firstValueFrom(servicoCom(buscar).aguardarAcessoColaborador('c1', 'u7'));
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultado).resolves.toBe(false);
    expect(buscar).toHaveBeenCalledTimes(8);
  });

  it('uma consulta com erro não interrompe a espera', async () => {
    const buscar = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('rede')))
      .mockReturnValue(of({ idUsuario: 'u7' }));

    const resultado = firstValueFrom(servicoCom(buscar).aguardarAcessoColaborador('c1', 'u7'));
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultado).resolves.toBe(true);
  });
});

describe('RhService.listarPerfisAcessoAtivos', () => {
  it('pede só os ativos e devolve a lista de dentro da página', async () => {
    const getList = vi.fn(() => of({ content: [{ id: 'p1', nome: 'CAMPO', ativo: true }], page: {} }));
    const servico = Object.assign(Object.create(RhService.prototype), { apiUrl: '/api', getList }) as RhService;

    await expect(firstValueFrom(servico.listarPerfisAcessoAtivos())).resolves.toEqual([{ id: 'p1', nome: 'CAMPO', ativo: true }]);
    expect(getList).toHaveBeenCalledWith('/api/v1/iam/perfis', { ativo: true, size: 1000 });
  });
});
