import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PainelOrdensServico } from '../../../core/models/frota.models';
import { OPCOES_VAZIAS, OS_BASE, abrirTelaFrota, chipsDoResumo, paginaDe } from '../shared/frota-teste';
import { FrotaOrdensServicoComponent } from './frota-ordens-servico.component';

const PAINEL: PainelOrdensServico = {
  pendentes: 3,
  pendentesPorCriticidade: { URGENTE: 1, ALTA: 2, MEDIA: 0, BAIXA: 0 },
  agendadas: 2,
  agendadasVencidas: 1,
  emAndamento: 4,
  atrasadas: 1,
  concluidasUltimos30Dias: 9,
  veiculosParados: 2,
  aguardandoAprovacao: 1
};

describe('FrotaOrdensServicoComponent', () => {
  let frota: Record<string, ReturnType<typeof vi.fn>>;
  let permissoes: string[];

  const abrir = (url = '/frota/ordens-servico') =>
    abrirTelaFrota(FrotaOrdensServicoComponent, 'frota/ordens-servico', url, frota, permissoes);

  beforeEach(() => {
    TestBed.resetTestingModule();
    permissoes = ['frota:os:read'];
    frota = {
      opcoes: vi.fn(() => of(OPCOES_VAZIAS)),
      itensManutencao: vi.fn(() => paginaDe([])),
      painelOrdensServico: vi.fn(() => of(PAINEL)),
      listarOrdensServico: vi.fn(() => paginaDe([OS_BASE]))
    };
  });

  afterEach(() => localStorage.clear());

  it('abre nas OS em aberto, com o painel por situação e os sinais da linha', async () => {
    const { el } = await abrir();
    expect(frota['listarOrdensServico']).toHaveBeenCalledWith(
      expect.objectContaining({ situacoes: ['PENDENTE', 'AGENDADA', 'EM_ANDAMENTO'], busca: null }),
      { page: 0, size: 25, sort: ['criticidade,desc'] }
    );
    expect(chipsDoResumo(el)).toEqual(['Situação: Em aberto']);
    const texto = el.textContent as string;
    expect(texto).toContain('1 urgente · 2 alta');
    expect(texto).toContain('1 com prazo estourado');
    expect(texto).toContain('OS 42 · ABC-1234');
    expect(texto).toContain('Prazo estourado');
    expect(texto).toContain('Veículo parado');
    expect(texto).toContain('Aguardando aprovação');
  });

  it('o indicador de em andamento filtra as atrasadas', async () => {
    const { el, harness } = await abrir();
    const botoes = Array.from(el.querySelectorAll<HTMLButtonElement>('button.ces-kpi'));
    botoes.find((b) => b.textContent?.includes('Em andamento'))!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(frota['listarOrdensServico']).toHaveBeenLastCalledWith(
      expect.objectContaining({ situacoes: ['EM_ANDAMENTO'], atrasadas: true }),
      expect.objectContaining({ page: 0 })
    );
  });

  it('o painel acompanha a base filtrada', async () => {
    await abrir('/frota/ordens-servico?base=b1');
    expect(frota['painelOrdensServico']).toHaveBeenLastCalledWith(['b1']);
  });

  it('só oferece abrir OS a quem pode escrever', async () => {
    let tela = await abrir();
    expect(tela.el.querySelector('ces-page-header')?.textContent).not.toContain('Abrir OS');

    TestBed.resetTestingModule();
    permissoes = ['frota:os:read', 'frota:os:write'];
    tela = await abrir();
    expect(tela.el.querySelector('ces-page-header')?.textContent).toContain('Abrir OS');
  });

  it('abre a ficha da OS ao ativar a linha', async () => {
    const { el } = await abrir();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('button[aria-label="Abrir OS: OS 42 do veículo ABC1234"]') as HTMLButtonElement).click();
    expect(navegar).toHaveBeenCalledWith(['/frota/ordens-servico', 'os1']);
  });
});
