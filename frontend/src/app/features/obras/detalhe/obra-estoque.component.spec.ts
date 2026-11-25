import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from '@geo/ui';
import { MaterialDaObra } from '../../../core/models/estoque-obra.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { EstoqueObraService } from '../../../core/services/estoque-obra.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ObraEstoqueComponent } from './obra-estoque.component';

const linha = (codigo: string, extra: Partial<MaterialDaObra['materiais'][number]> = {}) => ({
  idMaterial: 'm-' + codigo,
  codigo,
  descricao: 'Material ' + codigo,
  unidade: 'UN',
  previsto: 3,
  entregue: 3,
  aplicado: 0,
  comEquipes: 3,
  devolvido: 0,
  retirado: 0,
  recebido: 0,
  cedido: 0,
  semMaterialDaObra: 0,
  aplicadoSemSaldo: 0,
  onde: [{ idEstoque: 'cam-1', nome: 'CON-TMN-01', tipo: 'CAMPO', idEquipe: 'eq-1', condicao: 'NOVO' as const, quantidade: 3 }],
  ...extra,
});

function abrir(dados: MaterialDaObra, podeMovimentar = true) {
  const estoque = {
    materialDaObra: vi.fn(() => of(dados)),
    devolverSobra: vi.fn(() => of({ id: 'x' })),
    remanejar: vi.fn(() => of({ id: 'y' })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: EstoqueObraService, useValue: estoque },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AlmoxarifadoService, useValue: { listarEstoquesAtivos: () => of({ content: [{ id: 'alm', nomeIdentificador: 'ALMOX', tipoEstoque: { nome: 'FISICO' } }] }) } },
      { provide: ObrasService, useValue: { listarObras: () => of({ content: [{ id: 'o2', numero: '2', titulo: 'Outra' }] }) } },
    ],
  });
  const fixture = TestBed.createComponent(ObraEstoqueComponent);
  fixture.componentRef.setInput('idObra', 'o1');
  fixture.componentRef.setInput('podeMovimentar', podeMovimentar);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, estoque };
}

describe('ObraEstoqueComponent', () => {
  it('mostra o material da obra e onde ele está, com a ação por caminhão', () => {
    const { el } = abrir({ idObra: 'o1', materiais: [linha('300117')], rastros: [] });

    expect(el.textContent).toContain('300117');
    expect(el.textContent).toContain('CON-TMN-01 · 3');
    expect(el.textContent).toContain('Com as equipes e nos canteiros');
    expect(el.textContent).toContain('Devolver no balcão');
    expect(el.textContent).toContain('Passar para outra obra');
  });

  it('avisa e mostra no rastro quem aplicou sem saldo', () => {
    const { el } = abrir({
      idObra: 'o1',
      materiais: [linha('300172', { aplicado: 2, aplicadoSemSaldo: 2, semMaterialDaObra: 2, onde: [], comEquipes: 0 })],
      rastros: [{ id: 'r1', dataHora: '2026-11-23T20:48:00-03:00', tipo: 'APLICACAO', sentido: 'SEM_SALDO' as const, codigo: '300172',
        descricao: 'Armação', unidade: 'UN', quantidade: 2, local: 'CON-PDR-01' }],
    });

    expect(el.textContent).toContain('foi aplicado sem constar no caminhão');
    expect(el.textContent).toContain('CON-PDR-01 aplicou sem ter o material no caminhão');
  });

  it('caminhão de equipe abre já em passar para outra obra (a devolução é no balcão)', () => {
    const { fixture } = abrir({ idObra: 'o1', materiais: [linha('300117')], rastros: [] });
    const comp = fixture.componentInstance as unknown as { locais: () => unknown[]; abrirAcao: (l: unknown) => void; modo: () => string };

    comp.abrirAcao(comp.locais()[0]);

    expect(comp.modo()).toBe('REMANEJAR');
  });

  it('devolve a sobra de um canteiro ao almoxarifado escolhido', () => {
    const canteiro = [{ idEstoque: 'cam-1', nome: 'CANTEIRO NORTE', tipo: 'CANTEIRO', idEquipe: null, condicao: 'NOVO' as const, quantidade: 3 }];
    const { fixture, estoque } = abrir({ idObra: 'o1', materiais: [linha('300117', { onde: canteiro })], rastros: [] });
    const comp = fixture.componentInstance as unknown as {
      locais: () => { idEstoque: string }[];
      abrirAcao: (l: unknown) => void;
      idAlmox: { set: (v: string) => void };
      confirmar: () => void;
    };

    comp.abrirAcao(comp.locais()[0]);
    comp.idAlmox.set('alm');
    comp.confirmar();

    expect(estoque.devolverSobra).toHaveBeenCalledWith(expect.objectContaining({
      idOrigem: 'cam-1',
      idAlmoxarifado: 'alm',
      itens: [{ idMaterial: 'm-300117', condicao: 'NOVO', idObra: 'o1', quantidade: 3 }],
    }));
  });

  it('não oferece devolver sem permissão de movimentar', () => {
    const { el } = abrir({ idObra: 'o1', materiais: [linha('300117')], rastros: [] }, false);

    expect(el.textContent).not.toContain('Passar para outra obra');
  });
});
