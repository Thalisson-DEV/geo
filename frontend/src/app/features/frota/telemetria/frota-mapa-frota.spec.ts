import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@ces/ui';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import { VeiculoMapa } from '../../../core/models/frota-telemetria.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { FrotaMapaFrotaComponent } from './frota-mapa-frota.component';
import { signal } from '@angular/core';

const veiculo = (placa: string, estado: VeiculoMapa['estado'], extra: Partial<VeiculoMapa> = {}): VeiculoMapa => ({
  idVeiculo: 'v-' + placa, placa, modelo: 'Strada', fabricante: 'Fiat', tipoVeiculo: 'Picape',
  idBaseOperacional: 'b1', base: 'FEIRA', situacaoOperacional: 'ATIVO', situacaoOperacionalRotulo: 'Ativo',
  latitude: -12.2, longitude: -38.9, velocidadeKmh: estado === 'EM_MOVIMENTO' ? 62 : 0, ignicao: estado !== 'DESLIGADO',
  ultimaComunicacao: new Date().toISOString(), estado, estadoRotulo: estado, condutor: null,
  condutorVinculado: 'Maria Souza', kmAtual: 120085, unidade: 'KM', eventos24h: 0, documentosVencidos: 0, atencao: null, ...extra
});

describe('FrotaMapaFrotaComponent', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;

  async function abrir() {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: FrotaTelemetriaService, useValue: servico },
        { provide: NotificationService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
        { provide: LookupStore, useValue: { operationalBases: signal([]), loadBootstrap: () => of({}) } }
      ]
    });
    const fixture = TestBed.createComponent(FrotaMapaFrotaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    localStorage.clear();
    servico = {
      mapa: vi.fn(() => of({
        veiculos: [
          veiculo('ABC1D23', 'EM_MOVIMENTO', { eventos24h: 2 }),
          veiculo('XYZ9A87', 'DESLIGADO'),
          veiculo('OUF5424', 'SEM_SINAL', { condutorVinculado: null })
        ],
        semPosicao: 4,
        geradoEm: new Date().toISOString(),
        posicoesAtrasadasDesde: null as string | null
      })),
      listarEventos: vi.fn(() => of({ content: [], page: { totalElements: 0 } })),
      trajeto: vi.fn(() => of({ pontos: [], truncado: false }))
    };
  });

  afterEach(() => localStorage.clear());

  it('conta por estado, lista os veículos e avisa os sem posição', async () => {
    const { el } = await abrir();
    const estados = Array.from(el.querySelectorAll('.mf-estado')).map((b) => b.textContent!.replace(/\s+/g, ''));
    expect(estados).toContain('Emmovimento1');
    expect(estados).toContain('Semsinal1');
    expect(el.querySelectorAll('.mf-item')).toHaveLength(3);
    expect(el.querySelector('.mf-rodape[aria-live]')!.textContent).toContain('4 sem posição');
  });

  it('esconder um estado tira os veículos da lista e guarda a escolha', async () => {
    const { el, fixture } = await abrir();
    const parado = Array.from(el.querySelectorAll<HTMLButtonElement>('.mf-estado')).find((b) => b.textContent!.includes('Desligado'))!;
    parado.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.mf-item')).toHaveLength(2);
    expect(localStorage.getItem('ces_mapa_frota_preferencias')).toContain('"estados"');
  });

  it('busca por placa sem hífen e por condutor', async () => {
    const { el, fixture } = await abrir();
    const comp = fixture.componentInstance as unknown as { busca: { set(v: string): void } };
    comp.busca.set('abc-1d23');
    fixture.detectChanges();
    expect(el.querySelectorAll('.mf-item')).toHaveLength(1);
    comp.busca.set('maria');
    fixture.detectChanges();
    expect(el.querySelectorAll('.mf-item')).toHaveLength(2);
  });

  it('o cartão do veículo mostra km, condutor, eventos e os atalhos, sem dado técnico do rastreador', async () => {
    const { el, fixture } = await abrir();
    el.querySelectorAll<HTMLButtonElement>('.mf-item')[0].click();
    fixture.detectChanges();
    const cartao = el.querySelector('.mf-cartao')!.textContent!.replace(/\s+/g, ' ');
    expect(cartao).toContain('ABC1D23');
    expect(cartao).toContain('Maria Souza');
    expect(cartao).toContain('2 eventos em 24 h');
    expect(cartao).toContain('Trajeto de hoje');
    expect(cartao).toContain('Ficha do veículo');
    expect(cartao).toContain('Ver deste veículo');
    expect(cartao).toContain('Documentos');
    expect(cartao).not.toContain('Rastreador');
  });

  it('recolhe a busca e a lista, deixa o mapa na largura toda e guarda a escolha', async () => {
    const { el, fixture } = await abrir();
    el.querySelector<HTMLButtonElement>('.mf-painel__topo button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.mf-painel')).toBeNull();
    expect(el.querySelector('.mf')!.classList).toContain('mf--recolhido');
    expect(localStorage.getItem('ces_mapa_frota_preferencias')).toContain('"painelRecolhido":true');
    const abrirLista = el.querySelector<HTMLButtonElement>('.mf-abrir button')!;
    expect(abrirLista.textContent).toContain('Veículos (3)');
    abrirLista.click();
    fixture.detectChanges();
    expect(el.querySelector('.mf-painel')).not.toBeNull();
  });

  it('o cartão separa o estado do rastreador da situação na ficha e aponta o que pede decisão', async () => {
    servico['mapa'] = vi.fn(() => of({
      veiculos: [veiculo('SKR4E42', 'EM_MOVIMENTO', {
        situacaoOperacional: 'PARADO', situacaoOperacionalRotulo: 'Parado',
        atencao: { idCondutor: 'c1', cnhVencida: true, os: null, osAbertas: 0, pendenciasChecklist: 0, semChecklistHoje: false,
          abastecimento: null, foraDoExpediente: false }
      })],
      semPosicao: 0, geradoEm: new Date().toISOString(), posicoesAtrasadasDesde: null
    }));
    const { el, fixture } = await abrir();
    el.querySelector<HTMLButtonElement>('.mf-item')!.click();
    fixture.detectChanges();
    const cartao = el.querySelector('.mf-cartao')!.textContent!.replace(/\s+/g, ' ');
    expect(cartao).toContain('Na ficha: parado');
    expect(cartao).toContain('Rodando, mas a ficha diz que está parado');
    expect(cartao).toContain('CNH do condutor vencida');
    expect(el.querySelector('.mf-alertas a')!.textContent).toContain('Ver manutenções');
  });

  it('avisa uma vez, sem provedor, quando as posições param de chegar', async () => {
    const semAtraso = await abrir();
    expect(semAtraso.el.querySelector('.mf-aviso')).toBeNull();
    TestBed.resetTestingModule();

    servico['mapa'] = vi.fn(() => of({ veiculos: [veiculo('ABC1D23', 'DESLIGADO')], semPosicao: 0, geradoEm: new Date().toISOString(),
      posicoesAtrasadasDesde: '2026-10-26T14:20:00-03:00' }));
    const { el } = await abrir();
    const aviso = el.querySelector('.mf-aviso')!.textContent!;
    expect(aviso).toContain('Posições atrasadas desde 26/10');
    expect(aviso).not.toMatch(/Zuq|Ubicaly|Vivo/);
  });
});
