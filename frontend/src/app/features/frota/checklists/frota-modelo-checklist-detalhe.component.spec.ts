import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModeloChecklist, PerguntaChecklist } from '../../../core/models/frota-checklist.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { abrirTelaFrota, paginaDe } from '../shared/frota-teste';
import { FrotaModeloChecklistDetalheComponent } from './frota-modelo-checklist-detalhe.component';
import { inserirNoGrupo, perguntaNova, requestDe, resumoResposta } from './frota-modelo-checklist.util';

// As abas medem o espaço com ResizeObserver, que o jsdom não implementa.
class ResizeObserverFalso {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverFalso as unknown as typeof ResizeObserver;

const farois: PerguntaChecklist = {
  id: 'p1', grupo: 'Iluminação', texto: 'Faróis', tipoResposta: 'OK_NOK', fotoNoNaoOk: true, modoFoto: 'NAO_OK', opcoes: [],
  motivos: [{ id: 'a1', texto: 'Queimado', indicaProblema: false }]
};
const pneus: PerguntaChecklist = {
  id: 'p2', grupo: 'Rodagem', texto: 'Pneus', tipoResposta: 'OPCOES', fotoNoNaoOk: false, modoFoto: 'NUNCA', motivos: [],
  opcoes: [{ id: 'a2', texto: 'Bom', indicaProblema: false }, { id: 'a3', texto: 'Careca', indicaProblema: true }]
};
const modelo: ModeloChecklist = {
  id: 'm1', nome: 'Caminhonete', tipo: 'PRINCIPAL', tipoRotulo: 'Principal', instrucoes: 'Veículo parado.', exigeAssinatura: false,
  tiposVeiculo: [{ valor: 't1', rotulo: 'CAMINHONETE' }], tiposImplemento: [],
  perguntas: [farois, pneus], fotosRecebimento: [{ id: 'f1', descricao: 'Frente' }], ativo: true
};

describe('Utilitários do modelo de checklist', () => {
  it('resume a resposta e insere a pergunta junto do seu grupo', () => {
    expect(resumoResposta(farois)).toBe('OK / Não OK · motivos: Queimado');
    expect(resumoResposta(pneus)).toBe('Opções: Bom, Careca (problema)');
    const lista = inserirNoGrupo([farois, pneus], perguntaNova('Setas', 'Iluminação'));
    expect(lista.map((p) => p.texto)).toEqual(['Faróis', 'Setas', 'Pneus']);
    expect(inserirNoGrupo([farois], perguntaNova('Extintor')).map((p) => p.texto)).toEqual(['Faróis', 'Extintor']);
  });

  it('monta o modelo inteiro para o PUT, sem foto em pergunta de opções', () => {
    const r = requestDe(modelo, [{ ...pneus, fotoNoNaoOk: true, modoFoto: 'NAO_OK' }]);
    expect(r.idsTiposVeiculo).toEqual(['t1']);
    expect(r.perguntas).toEqual([expect.objectContaining({ id: 'p2', fotoNoNaoOk: false, modoFoto: 'NUNCA', motivos: [] })]);
    expect(r.fotosRecebimento).toEqual([{ id: 'f1', descricao: 'Frente' }]);
  });
});

describe('FrotaModeloChecklistDetalheComponent', () => {
  let checklist: Record<string, ReturnType<typeof vi.fn>>;
  let permissoes: string[];
  const abrir = (url = '/frota/checklists/modelos/m1') =>
    abrirTelaFrota(FrotaModeloChecklistDetalheComponent, 'frota/checklists/modelos/:id', url,
      { tiposVeiculo: vi.fn(() => paginaDe([])), tiposImplemento: vi.fn(() => paginaDe([])) },
      permissoes, [{ provide: FrotaChecklistService, useValue: checklist }]);

  beforeEach(() => {
    TestBed.resetTestingModule();
    permissoes = ['frota:checklist:read', 'frota:checklist:configurar'];
    checklist = {
      modelo: vi.fn(() => of(modelo)),
      salvarModelo: vi.fn((r, id) => of({ ...modelo, id, perguntas: r.perguntas }))
    };
  });

  afterEach(() => localStorage.clear());

  it('mostra cabeçalho, instruções e as perguntas na ordem com a resposta resumida', async () => {
    const { el } = await abrir();
    expect(el.querySelector('h1')?.textContent).toContain('Caminhonete');
    expect(el.textContent).toContain('Veículos: CAMINHONETE · 2 perguntas');
    expect(el.textContent).toContain('Veículo parado.');
    expect(el.textContent).toContain('OK / Não OK · motivos: Queimado');
    expect(el.textContent).toContain('Opções: Bom, Careca (problema)');
    expect(el.textContent).toContain('Adicionar pergunta');
  });

  it('subir uma pergunta grava o modelo com a nova ordem', async () => {
    const { el, harness } = await abrir();
    const subir = el.querySelector<HTMLButtonElement>('[aria-label="Subir Pneus"]')!;
    subir.click();
    harness.detectChanges();
    expect(checklist['salvarModelo']).toHaveBeenCalledWith(
      expect.objectContaining({ perguntas: [expect.objectContaining({ id: 'p2' }), expect.objectContaining({ id: 'p1' })] }),
      'm1'
    );
  });

  it('quem só consulta não vê as ações de edição', async () => {
    permissoes = ['frota:checklist:read'];
    const { el } = await abrir();
    expect(el.textContent).not.toContain('Adicionar pergunta');
    expect(el.textContent).not.toContain('Editar dados');
    expect(el.querySelector('[aria-label="Subir Pneus"]')).toBeNull();
  });
});
