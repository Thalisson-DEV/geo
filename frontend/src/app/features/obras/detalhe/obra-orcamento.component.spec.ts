import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ItemOrcamentoObraResponse, OrcamentoObraResponse } from '../../../core/models/obras.models';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { ContratoService } from '../../../core/services/contrato.service';
import { ObrasKitService } from '../../../core/services/obras-kit.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ObraOrcamentoComponent } from './obra-orcamento.component';
import { contarSituacoes, itensDoTipo, percentual, resumoAtencao, saldoQuantidade } from './obra-orcamento.logic';

const item = (parcial: Partial<ItemOrcamentoObraResponse>): ItemOrcamentoObraResponse => ({
  tipo: 'SERVICO',
  operacao: 'INSTALAR',
  codigo: 'S1',
  situacao: 'DENTRO',
  semReferencia: false,
  ...parcial
});

const orcamento = (parcial: Partial<OrcamentoObraResponse> = {}): OrcamentoObraResponse => ({
  idObra: 'obra-1',
  possuiOrcamento: true,
  revisao: { id: 'r2', numero: 2, origem: 'PLANEJAMENTO', valorServicos: 500, valorMateriais: 0, quantidadeItens: 3, dataCriacao: '2026-11-22T10:00:00-03:00', usuarioCriacao: 'ANA' },
  totais: { orcadoServicos: 500, orcadoMateriais: 0, planejadoServicos: 450, executadoServicos: 100, medidoServicos: 50, saldoServicos: 450, planejadoForaDoOrcamento: 80, planejadoMateriais: 0 },
  contagens: { acima: 1, foraDoOrcamento: 1, naoPlanejados: 0, semReferencia: 0 },
  itens: [
    item({ id: 'i1', codigo: 'LMI-1', descricao: 'Instalar poste', orcadoQuantidade: 2, orcadoValor: 400, planejadoQuantidade: 3, situacao: 'ACIMA', excedente: 1, idAcao: 'a1' }),
    item({ codigo: 'LMI-9', descricao: 'Cruzeta', planejadoQuantidade: 1, planejadoValor: 80, situacao: 'FORA_DO_ORCAMENTO', idAcao: 'a9' }),
    item({ id: 'i3', codigo: 'LMI-2', orcadoQuantidade: 1, orcadoValor: 100, planejadoQuantidade: 1, medidoQuantidade: 1, idAcao: 'a2' }),
    item({ id: 'i4', tipo: 'MATERIAL', codigo: 'MAT-1', orcadoQuantidade: 4, planejadoQuantidade: 4, idMaterial: 'm1' })
  ],
  ...parcial
});

describe('lógica do orçamento', () => {
  it('filtra por tipo e situação, conta e resume o que pede atenção', () => {
    const o = orcamento();
    expect(itensDoTipo(o, 'SERVICO', 'TODOS').map((i) => i.codigo)).toEqual(['LMI-1', 'LMI-9', 'LMI-2']);
    expect(itensDoTipo(o, 'SERVICO', 'ACIMA').map((i) => i.codigo)).toEqual(['LMI-1']);
    expect(contarSituacoes(o, 'SERVICO')).toEqual({ TODOS: 3, ACIMA: 1, FORA_DO_ORCAMENTO: 1, NAO_PLANEJADO: 0, DENTRO: 1, SEM_ORCADO: 0 });
    expect(contarSituacoes(o, 'MATERIAL').TODOS).toBe(1);
    expect(resumoAtencao(o)).toBe('1 item acima do orçado · 1 fora do orçamento');
    expect(resumoAtencao(orcamento({ contagens: { acima: 0, foraDoOrcamento: 0, naoPlanejados: 2, semReferencia: 0 } }))).toBeNull();
    expect(percentual(450, 500)).toBe(90);
    expect(percentual(10, 0)).toBe(0);
    expect(saldoQuantidade(o.itens[2])).toBe(0);
    expect(saldoQuantidade(o.itens[1])).toBeNull();
  });
});

describe('ObraOrcamentoComponent', () => {
  function abrir(dados: OrcamentoObraResponse, podeEditar = true) {
    const obras = {
      adicionarItemOrcamento: vi.fn(() => of(dados)),
      alterarItemOrcamento: vi.fn(() => of(dados)),
      removerItemOrcamento: vi.fn(() => of(dados)),
      gerarOrcamentoDoPlanejamento: vi.fn(() => of(dados)),
      listarRevisoesOrcamento: vi.fn(() => of([dados.revisao]))
    };
    TestBed.configureTestingModule({ providers: [
        provideHttpClient(),
        MessageService,
        ConfirmationService,
        { provide: ObrasService, useValue: obras },
        { provide: AlmoxarifadoService, useValue: {} },
        { provide: ContratoService, useValue: {} },
        { provide: ObrasKitService, useValue: {} }
      ] });
    const fixture = TestBed.createComponent(ObraOrcamentoComponent);
    fixture.componentRef.setInput('idObra', 'obra-1');
    fixture.componentRef.setInput('carga', { estado: 'ready', dados });
    fixture.componentRef.setInput('podeEditar', podeEditar);
    fixture.detectChanges();
    return { fixture, obras, el: fixture.nativeElement as HTMLElement, tela: fixture.componentInstance as unknown as Record<string, any> };
  }

  it('mostra a revisão, o resumo, o aviso e a situação de cada serviço', () => {
    const { el } = abrir(orcamento());
    const texto = el.textContent!;
    expect(texto).toContain('Revisão 2');
    expect(texto).toContain('Gerado do planejamento');
    expect(texto).toContain('90% do orçado');
    expect(texto).toContain('1 item acima do orçado');
    expect(texto).toContain('É só um aviso');
    expect(texto).toContain('Acima do orçado');
    expect(texto).toContain('Fora do orçamento');
  });

  it('filtra a tabela pela situação', () => {
    const { el, fixture } = abrir(orcamento());
    const acima = Array.from(el.querySelectorAll<HTMLButtonElement>('.orc-filtro')).find((b) => b.textContent!.includes('Acima do orçado'))!;
    acima.click();
    fixture.detectChanges();
    expect(acima.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('geo-data-table')!.textContent).toContain('LMI-1');
    expect(el.querySelector('geo-data-table')!.textContent).not.toContain('LMI-2');
  });

  it('item fora do orçamento abre o lançamento com o serviço e a quantidade planejada', () => {
    const { tela, obras } = abrir(orcamento());
    tela['incluir'](orcamento().itens[1]);
    expect(tela['itemAberto']()).toBe(true);
    expect(tela['referencia']()).toBe('a9');
    expect(tela['quantidade']()).toBe(1);
    tela['salvarItem']();
    expect(obras.adicionarItemOrcamento).toHaveBeenCalledWith('obra-1', expect.objectContaining({ tipo: 'SERVICO', idReferencia: 'a9', quantidade: 1 }));
  });

  it('sem orçamento oferece gerar do planejamento quando ele já tem kits', () => {
    const sem = orcamento({ possuiOrcamento: false, revisao: null, contagens: { acima: 0, foraDoOrcamento: 2, naoPlanejados: 0, semReferencia: 0 } });
    const { el } = abrir(sem);
    expect(el.textContent).toContain('A obra ainda não tem orçamento');
    expect(el.textContent).toContain('O planejamento já prevê 3 serviços e 1 material');
    expect(el.querySelector('.orc-vazio__acoes')!.textContent).toContain('Gerar do planejamento');
  });

  it('sem permissão de escrita não mostra as ações', () => {
    const { el } = abrir(orcamento(), false);
    expect(el.textContent).not.toContain('Lançar item');
    expect(el.textContent).not.toContain('Importar planilha');
  });
});
