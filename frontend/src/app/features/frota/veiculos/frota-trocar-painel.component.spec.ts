import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FrotaService } from '../../../core/services/frota.service';
import { FrotaLancarKmComponent } from './frota-lancar-km.component';
import { FrotaTrocarPainelComponent } from './frota-trocar-painel.component';

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

function montar<T>(tipo: Type<T>, frota: object, entradas: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [tipo],
    providers: [provideNoopAnimations(), MessageService, ConfirmationService, { provide: FrotaService, useValue: frota }]
  });
  const fixture = TestBed.createComponent(tipo) as ComponentFixture<T>;
  for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
  fixture.componentRef.setInput('visivel', true);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela };
}

describe('FrotaTrocarPainelComponent', () => {
  let frota: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    frota = {
      trocarPainel: vi.fn(() => of({ id: 't1', tipo: 'TROCA_PAINEL', km: 0, unidade: 'HORAS' }))
    };
  });

  const abrir = () =>
    montar(FrotaTrocarPainelComponent, frota, {
      idVeiculo: 'v1',
      placa: 'RET-0004',
      unidadeAtual: 'HORAS',
      valorAtual: 4009,
      acumuladoAtual: 4009
    });

  it('abre com o valor atual como fechamento, a unidade do veículo e a data de hoje', () => {
    const { tela } = abrir();
    const hoje = new Date();

    expect(tela['fechamento']()).toBe(4009);
    expect(tela['inicial']()).toBe(0);
    expect(tela['unidadeNova']()).toBe('HORAS');
    // Só o dia: o datepicker descarta instante posterior ao maxDate.
    expect(tela['data']()).toEqual(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    expect(tela['acumuladoPrevisto']()).toBe(4009);
  });

  it('não envia fechamento menor que a última leitura válida', () => {
    const { tela } = abrir();
    tela['fechamento'].set(4000);

    tela['salvar']();

    expect(tela['erroFechamento']()).toContain('Não pode ser menor que a última leitura válida (4.009 h)');
    expect(tela['acumuladoPrevisto']()).toBeNull();
    expect(frota['trocarPainel']).not.toHaveBeenCalled();
  });

  it('registra a troca com fechamento, inicial, unidade e observação', () => {
    const { tela } = abrir();
    const registrado = vi.fn();
    tela['registrado'].subscribe(registrado);
    tela['fechamento'].set(4100);
    tela['hora'].set('08:30');
    tela['observacao'].set('  Painel queimado  ');

    expect(tela['acumuladoPrevisto']()).toBe(4100);
    tela['salvar']();

    expect(frota['trocarPainel']).toHaveBeenCalledWith('v1', expect.objectContaining({
      valorFechamento: 4100,
      valorInicial: 0,
      unidade: 'HORAS',
      observacao: 'Painel queimado'
    }));
    expect(frota['trocarPainel'].mock.calls[0][1].lidoEm).toMatch(/T08:30:00[+-]\d{2}:\d{2}$/);
    expect(registrado).toHaveBeenCalled();
    expect(tela['visivel']()).toBe(false);
  });

  it('mudar a unidade recomeça o acumulado e libera inicial acima do fechamento', () => {
    const { tela } = abrir();
    tela['unidadeNova'].set('KM');
    tela['inicial'].set(80000);

    expect(tela['mudaUnidade']()).toBe(true);
    expect(tela['erroInicial']()).toBeUndefined();
    expect(tela['acumuladoPrevisto']()).toBe(80000);
  });

  it('mostra no campo o erro devolvido pelo servidor', () => {
    frota['trocarPainel'].mockReturnValue(throwError(() => ({ error: { detail: 'A troca precisa ser depois da última leitura válida.' } })));
    const { tela } = abrir();

    tela['salvar']();

    expect(tela['erroFechamento']()).toContain('depois da última leitura válida');
    expect(tela['salvando']()).toBe(false);
  });
});

describe('FrotaLancarKmComponent em horas', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('pede as horas do horímetro com o sufixo h', () => {
    const frota = { registrarLeitura: vi.fn(() => of({})) };
    const { tela } = montar(FrotaLancarKmComponent, frota, {
      idVeiculo: 'v1',
      placa: 'RET-0004',
      kmAtual: 4009,
      unidade: 'HORAS'
    });

    expect(tela['horas']()).toBe(true);
    tela['salvar']();
    expect(tela['erroKm']()).toBe('Informe as horas do horímetro.');
    expect(frota.registrarLeitura).not.toHaveBeenCalled();
  });
});
