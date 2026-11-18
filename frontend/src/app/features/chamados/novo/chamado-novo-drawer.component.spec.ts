import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChamadosService } from '../../../core/services/chamados.service';
import { ChamadoNovoDrawerComponent, validarArquivo } from './chamado-novo-drawer.component';

const topico = {
  id: 't1',
  codigo: 'ACESSO',
  nome: 'Acesso ao sistema',
  descricao: 'Senha, login e permissões',
  prioridadePadrao: 'NORMAL',
  equipePadrao: { id: 'q1', nome: 'TI' },
  slaPrimeiraRespostaHoras: 4,
  slaResolucaoHoras: 24
};

const arquivo = (nome: string, bytes = 10) => new File([new Uint8Array(bytes)], nome);

describe('ChamadoNovoDrawerComponent', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;

  const montar = async () => {
    TestBed.configureTestingModule({
      imports: [ChamadoNovoDrawerComponent],
      providers: [provideNoopAnimations(), provideRouter([]), MessageService, ConfirmationService, { provide: ChamadosService, useValue: servico }]
    });
    const fixture = TestBed.createComponent(ChamadoNovoDrawerComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Acesso ao estado protegido para preencher o formulário como a pessoa faria.
    const tela = fixture.componentInstance as unknown as Record<string, any>;
    // O drawer é anexado ao body.
    const el = document.body;
    const atualizar = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, tela, el, atualizar };
  };

  const preencher = (tela: Record<string, any>) => {
    tela['topicoId'].set('t1');
    tela['assunto'].set('  Sem acesso ao sistema  ');
    tela['descricao'].set('  Não consigo entrar desde ontem.  ');
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    servico = {
      listarTopicosAtivos: vi.fn(() => of([topico])),
      criar: vi.fn(() => of({ id: 'c1', protocolo: 'CH-20261112-0001' })),
      anexar: vi.fn(() => of({ id: 'a1' }))
    };
  });

  it('carrega os tópicos e mostra equipe e prazos do tópico escolhido', async () => {
    const { tela, el, atualizar } = await montar();
    expect(servico['listarTopicosAtivos']).toHaveBeenCalledTimes(1);
    tela['topicoId'].set('t1');
    await atualizar();
    expect(el.querySelector('.chamado-topico')?.textContent).toContain('TI');
    expect(el.textContent).toContain('até 24 h');
    expect(el.textContent).toContain('Padrão do tópico (Normal)');
  });

  it('falha na carga dos tópicos mostra o erro com "Tentar novamente"', async () => {
    servico['listarTopicosAtivos'].mockReturnValueOnce(throwError(() => new Error('offline')));
    const { el, atualizar } = await montar();
    expect(el.textContent).toContain('Não foi possível carregar os tópicos');
    expect(el.querySelector('geo-form-actions')).toBeNull();
    const repetir = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Tentar novamente'))!;
    repetir.click();
    await atualizar();
    expect(servico['listarTopicosAtivos']).toHaveBeenCalledTimes(2);
    expect(el.querySelector('geo-form-actions')).not.toBeNull();
  });

  it('não envia com campos inválidos e mostra os erros só depois da tentativa', async () => {
    const { tela, el, atualizar } = await montar();
    expect(el.textContent).not.toContain('Selecione um tópico.');
    tela['descricao'].set('curta');
    await tela['salvar']();
    await atualizar();
    expect(servico['criar']).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Selecione um tópico.');
    expect(el.textContent).toContain('Informe o assunto.');
    expect(el.textContent).toContain('Use pelo menos 10 caracteres.');
  });

  it('abre o chamado com os textos aparados, sem prioridade quando usa a do tópico, e envia os anexos', async () => {
    const { tela, el, atualizar } = await montar();
    preencher(tela);
    tela['arquivos'].set([{ file: arquivo('print.png'), status: 'pendente' }]);
    await tela['salvar']();
    await atualizar();
    expect(servico['criar']).toHaveBeenCalledWith({ topicoId: 't1', assunto: 'Sem acesso ao sistema', descricao: 'Não consigo entrar desde ontem.' });
    expect(servico['anexar']).toHaveBeenCalledWith('c1', expect.any(File));
    expect(el.textContent).toContain('CH-20261112-0001');
    expect(el.textContent).toContain('Enviado');

    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    tela['irParaChamado']();
    expect(navegar).toHaveBeenCalledWith(['/chamados/meus', 'c1'], { replaceUrl: true });
  });

  it('não carrega tópicos enquanto fechado e recomeça o formulário a cada abertura', async () => {
    TestBed.configureTestingModule({
      imports: [ChamadoNovoDrawerComponent],
      providers: [provideNoopAnimations(), provideRouter([]), MessageService, ConfirmationService, { provide: ChamadosService, useValue: servico }]
    });
    const fixture = TestBed.createComponent(ChamadoNovoDrawerComponent);
    fixture.detectChanges();
    expect(servico['listarTopicosAtivos']).not.toHaveBeenCalled();
    const tela = fixture.componentInstance as unknown as Record<string, any>;
    const abertos: unknown[] = [];
    fixture.componentInstance.chamadoAberto.subscribe((c) => abertos.push(c));

    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    preencher(tela);
    expect(tela['alterado']()).toBe(true);
    await tela['salvar']();
    expect(abertos).toEqual([expect.objectContaining({ protocolo: 'CH-20261112-0001' })]);
    expect(tela['alterado']()).toBe(false);

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    expect(tela['criado']()).toBeNull();
    expect(tela['assunto']()).toBe('');
    expect(servico['listarTopicosAtivos']).toHaveBeenCalledTimes(1);
  });

  it('envia a prioridade escolhida', async () => {
    const { tela } = await montar();
    preencher(tela);
    tela['prioridade'].set('ALTA');
    await tela['salvar']();
    expect(servico['criar']).toHaveBeenCalledWith(expect.objectContaining({ prioridade: 'ALTA' }));
  });

  it('mantém o formulário quando a criação falha', async () => {
    servico['criar'].mockReturnValueOnce(throwError(() => new Error('500')));
    const { tela, el, atualizar } = await montar();
    preencher(tela);
    await tela['salvar']();
    await atualizar();
    expect(tela['criado']()).toBeNull();
    expect(tela['salvando']()).toBe(false);
    expect(el.querySelector('geo-form-actions')).not.toBeNull();
  });

  it('anexo com falha mostra o motivo e pode ser reenviado sozinho', async () => {
    servico['anexar'].mockReturnValueOnce(throwError(() => ({ error: { detail: 'Arquivo corrompido' } })));
    const { tela, el, atualizar } = await montar();
    preencher(tela);
    tela['arquivos'].set([{ file: arquivo('log.txt'), status: 'pendente' }]);
    await tela['salvar']();
    await atualizar();
    expect(el.textContent).toContain('Falha no envio');
    expect(tela['temFalhas']()).toBe(true);

    await tela['tentarNovamente'](0);
    await atualizar();
    expect(servico['anexar']).toHaveBeenCalledTimes(2);
    expect(tela['temFalhas']()).toBe(false);
    expect(el.textContent).toContain('Enviado');
  });

  it('seleção de arquivos recusa formato, tamanho, excesso e duplicados', async () => {
    const { tela } = await montar();
    const selecionar = (files: File[]) => tela['selecionarArquivos']({ target: { files, value: 'x' } } as unknown as Event);
    selecionar([arquivo('a.pdf'), arquivo('a.pdf'), arquivo('virus.exe')]);
    expect(tela['arquivos']().map((a: { file: File }) => a.file.name)).toEqual(['a.pdf']);
    selecionar(Array.from({ length: 10 }, (_, i) => arquivo(`f${i}.png`)));
    expect(tela['arquivos']()).toHaveLength(1);
    tela['removerArquivo'](0);
    expect(tela['arquivos']()).toHaveLength(0);
  });

  it('validarArquivo', () => {
    expect(validarArquivo(arquivo('nota.PDF'))).toBeNull();
    expect(validarArquivo(arquivo('script.sh'))).toBe('formato não permitido');
    expect(validarArquivo({ name: 'grande.png', size: 16 * 1024 * 1024 } as File)).toBe('o tamanho máximo é 15 MB');
  });
});
