import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/services/auth.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';
import { RhService } from '../../../core/services/rh.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { abrirListagem, chipsDoPainel, paginaTeste, tecla } from '../../../shared/listagem/listagem-teste';
import { ColaboradoresComponent, formatarCpf } from './colaboradores.component';

const colaborador = {
  id: 'c1',
  primeiroNome: 'MARIA',
  ultimoNome: 'SOUZA',
  nomeCompleto: 'MARIA DE SOUZA',
  cpf: '12345678901',
  dataContratacao: '2024-03-01',
  baseOperacional: { id: 'b1', nome: 'JUAZEIRO' },
  processo: { id: 'p1', nome: 'MANUTENÇÃO' },
  funcao: { id: 'f1', nome: 'ELETRICISTA' },
  ativo: true
};

describe('ColaboradoresComponent', () => {
  let rh: Record<string, ReturnType<typeof vi.fn>>;
  let usuarios: Record<string, ReturnType<typeof vi.fn>>;
  const abrir = (url = '/lista') =>
    abrirListagem(ColaboradoresComponent, 'lista', url, [
      { provide: RhService, useValue: rh },
      { provide: UsuariosService, useValue: usuarios },
      { provide: ImportacaoService, useValue: { baixarModeloCsv: vi.fn() } }
    ]);

  beforeEach(() => {
    TestBed.resetTestingModule();
    usuarios = {
      listarUsuarios: vi.fn(() => paginaTeste([{ id: 'u7', login: 'USR000007', email: 'ze@exemplo.com.br' }])),
      vincularColaborador: vi.fn(() => of({})),
      buscarUsuarioPorId: vi.fn(() => of({ id: 'u9', login: 'USR000009', email: 'maria@exemplo.com.br', perfil: { id: 'perfil1', nome: 'CAMPO' }, ativo: true }))
    };
    rh = {
      listarBasesOperacionaisAtivas: vi.fn(() => paginaTeste([{ id: 'b1', nome: 'JUAZEIRO' }])),
      listarProcessosAtivos: vi.fn(() => paginaTeste([{ id: 'p1', nome: 'MANUTENÇÃO' }])),
      listarFuncoesAtivas: vi.fn(() => paginaTeste([{ id: 'f1', nome: 'ELETRICISTA' }])),
      listarPerfisAcessoAtivos: vi.fn(() => of([{ id: 'perfil1', nome: 'CAMPO', ativo: true }])),
      listarColaboradores: vi.fn(() => paginaTeste([colaborador])),
      criarColaborador: vi.fn(() => of({ ...colaborador, id: 'novo' })),
      atualizarColaborador: vi.fn(() => of(colaborador)),
      ativarColaborador: vi.fn(() => of(null)),
      desativarColaborador: vi.fn(() => of(null)),
      aguardarAcessoColaborador: vi.fn(() => of(true)),
      gerarAcesso: vi.fn(() => of(colaborador))
    };
  });

  afterEach(() => localStorage.clear());

  it('abre já nos dados, ordenado pelo nome no servidor, com o CPF formatado', async () => {
    const { el } = await abrir();
    expect(rh['listarColaboradores']).toHaveBeenCalledWith(
      expect.objectContaining({ nomeCompleto: undefined, cpf: undefined, idBaseOperacional: null, ativo: null, page: 0, size: 25, sort: 'nomeCompleto,asc' })
    );
    expect(el.textContent).toContain('MARIA DE SOUZA');
    expect(el.textContent).toContain('123.456.789-01');
    expect(chipsDoPainel(el)).toEqual([]);
  });

  it('restaura base, função e período de contratação da URL', async () => {
    const { el } = await abrir('/lista?base=b1&funcao=f1&contratacao=2024-01-01~2024-06-30');
    expect(rh['listarColaboradores']).toHaveBeenLastCalledWith(
      expect.objectContaining({ idBaseOperacional: 'b1', idFuncao: 'f1', dataContratacao: '2024-01-01', dataContratacaoFim: '2024-06-30' })
    );
    expect(chipsDoPainel(el)).toEqual(['Base: JUAZEIRO', 'Função: ELETRICISTA', 'Contratação: 01/01/2024 a 30/06/2024']);
  });

  it('o CPF filtra só com dígitos e não vai para a URL', async () => {
    const { componente } = await abrir();
    const router = TestBed.inject(Router);
    const tela = componente as unknown as { lista: { filters: { cpf: { set(v: string): void } }; apply(): void } };
    tela.lista.filters.cpf.set('123.456.789-01');
    tela.lista.apply();
    await new Promise((r) => setTimeout(r));
    expect(rh['listarColaboradores']).toHaveBeenLastCalledWith(expect.objectContaining({ cpf: '12345678901' }));
    expect(router.url).not.toContain('cpf');
    expect(router.url).not.toContain('123');
  });

  it('"n" cadastra o colaborador e depois gera o acesso', async () => {
    const { componente } = await abrir();
    tecla('n');
    const tela = componente as unknown as Record<string, { set(v: unknown): void }> & { formularioAberto(): boolean; salvar(): void };
    expect(tela.formularioAberto()).toBe(true);
    tela['primeiroNome'].set('João');
    tela['ultimoNome'].set('Lima');
    tela['nomeCompleto'].set('João Lima');
    tela['cpf'].set(formatarCpf('98765432100'));
    tela['dataContratacao'].set(new Date(2025, 0, 15));
    tela['idBase'].set('b1');
    tela['idProcesso'].set('p1');
    tela['idFuncao'].set('f1');
    tela['acesso'].set('NOVO');
    tela['login'].set('usr123');
    tela.salvar();
    expect(rh['criarColaborador']).not.toHaveBeenCalled();

    tela['login'].set('usr123456');
    tela['senha'].set('segredo');
    tela['idPerfil'].set('perfil1');
    tela.salvar();
    expect(rh['criarColaborador']).toHaveBeenCalledWith(expect.objectContaining({ cpf: '98765432100', dataContratacao: '2025-01-15', idBaseOperacional: 'b1' }));
    expect(rh['gerarAcesso']).toHaveBeenCalledWith({ colaboradorId: 'novo', usuario: { login: 'USR123456', senha: 'segredo', idPerfil: 'perfil1', tipo: 'CAMPO' } });
  });

  it('vincula um colaborador sem acesso a um usuário existente sem colaborador', async () => {
    const { componente } = await abrir();
    const tela = componente as unknown as Record<string, { set(v: unknown): void }> & { editar(c: unknown): void; salvar(): void };
    tela.editar(colaborador);
    tela['acesso'].set('EXISTENTE');
    tela.salvar();
    expect(rh['atualizarColaborador']).not.toHaveBeenCalled();

    tela['idUsuarioExistente'].set('u7');
    tela.salvar();
    expect(rh['atualizarColaborador']).toHaveBeenCalled();
    expect(usuarios['vincularColaborador']).toHaveBeenCalledWith('u7', 'c1');
    expect(rh['gerarAcesso']).not.toHaveBeenCalled();
  });

  it('consulta de novo os usuários livres a cada abertura do formulário', async () => {
    const { componente } = await abrir();
    const tela = componente as unknown as {
      editar(c: unknown): void;
      usuariosSemColaborador: { open(): void; items(): unknown[] };
    };
    tela.editar(colaborador);
    tela.usuariosSemColaborador.open();
    await vi.waitFor(() => expect(tela.usuariosSemColaborador.items()).toHaveLength(1));
    expect(usuarios['listarUsuarios']).toHaveBeenCalledTimes(1);
    expect(usuarios['listarUsuarios']).toHaveBeenCalledWith(expect.objectContaining({ vinculadoAColaborador: false, ativo: true }));

    tela.editar(colaborador);
    expect(tela.usuariosSemColaborador.items()).toEqual([]);
    tela.usuariosSemColaborador.open();
    await vi.waitFor(() => expect(usuarios['listarUsuarios']).toHaveBeenCalledTimes(2));
  });

  it('na edição mostra o usuário vinculado ao colaborador', async () => {
    const { componente, harness } = await abrir();
    const tela = componente as unknown as { editar(c: unknown): void; usuarioVinculadoRotulo(): string };
    tela.editar({ ...colaborador, idUsuario: 'u9' });
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(usuarios['buscarUsuarioPorId']).toHaveBeenCalledWith('u9');
    expect(tela.usuarioVinculadoRotulo()).toBe('USR000009 · maria@exemplo.com.br');
    expect(document.body.textContent).toContain('Usuário vinculado');
    expect(document.body.textContent).toContain('Perfil CAMPO');

    tela.editar(colaborador);
    expect(tela.usuarioVinculadoRotulo()).toBe('');
    expect(usuarios['buscarUsuarioPorId']).toHaveBeenCalledTimes(1);
  });

  describe('aba Medidas disciplinares', () => {
    // As abas observam o próprio tamanho; o jsdom não tem ResizeObserver.
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };

    const abrirCom = (permissoes: string[]) =>
      abrirListagem(ColaboradoresComponent, 'lista', '/lista', [
        { provide: RhService, useValue: rh },
        { provide: UsuariosService, useValue: usuarios },
        { provide: ImportacaoService, useValue: { baixarModeloCsv: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({ permissoes }) } },
        {
          provide: RhMedidaDisciplinarService,
          useValue: { listar: vi.fn(() => paginaTeste([])), tipos: vi.fn(() => of([])), motivos: vi.fn(() => of([])), parametros: vi.fn(() => of({ diasImediatidade: 30 })) }
        }
      ]);
    const abas = () => Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim());

    it('quem só lê o cadastro não vê a aba', async () => {
      const { componente, harness } = await abrirCom(['rh:colaborador:read', 'rh:colaborador:write']);
      (componente as unknown as { editar(c: unknown): void }).editar(colaborador);
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(abas()).not.toContain('Medidas disciplinares');
      expect(document.body.textContent).toContain('Dados pessoais');
    });

    it('com a permissão das medidas, a aba aparece na edição', async () => {
      const { componente, harness } = await abrirCom(['rh:colaborador:read', 'rh:medida-disciplinar:read']);
      (componente as unknown as { editar(c: unknown): void }).editar(colaborador);
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(abas()).toContain('Medidas disciplinares');
    });
  });
});
