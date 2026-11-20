import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AppShellComponent } from './app-shell.component';
import { AuthService } from '../../core/auth/auth.service';
import { OutboxService } from '../../core/sync/outbox.service';
import { SessaoService } from '../../core/sessao/sessao.service';
import { AvaliacaoFolhaComponent } from '../avaliacao/avaliacao-folha.component';

describe('AppShellComponent', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let admin = false;
  let almox = false;
  let criaFechamento = false;

  beforeEach(async () => {
    admin = false;
    almox = false;
    criaFechamento = false;
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAdministrativo: () => admin, podeAcessarAlmoxarifado: () => almox, podeCriarFechamento: () => criaFechamento, reautenticacaoNecessaria: () => false, entrarNovamente: () => {} } },
        { provide: OutboxService, useValue: { pendingCount: signal(3) } },
        { provide: SessaoService, useValue: { estadoTela: () => ({}), definirEstadoTela: () => {} } },
      ],
    })
      // A folha da avaliação do app tem testes próprios; aqui só a barra de abas importa.
      .overrideComponent(AppShellComponent, { remove: { imports: [AvaliacaoFolhaComponent] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  function criar() {
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('encarregado: Hoje · Material · Frota · Conta (sem inspeções nem serviços comerciais)', () => {
    const c = criar();
    expect(c.rotas()).toEqual(['/hoje', '/material', '/frota', '/perfil']);
    expect(c.rotas()).not.toContain('/inspecoes');
  });

  it('técnico de SST: Hoje · Inspeções · Desvios · Frota · Conta (sem logística)', () => {
    admin = true;
    const c = criar();
    expect(c.rotas()).toEqual(['/hoje', '/inspecoes', '/desvios', '/frota', '/perfil']);
    expect(c.rotas()).not.toContain('/material');
    expect(c.rotas()).not.toContain('/campo');
  });

  it('administrativo com almoxarifado: Hoje · Almoxarifado · Segurança · Frota · Conta', () => {
    admin = true;
    almox = true;
    const c = criar();
    expect(c.rotas()).toEqual(['/hoje', '/almox', '/inspecoes', '/frota', '/perfil']);
    const seguranca = c.abas().find(a => a.rota === '/inspecoes');
    expect(seguranca?.rotulo).toBe('Segurança');
    expect(seguranca?.ativaEm).toEqual(['/desvios']);
  });

  it('técnico de fechamento: Hoje · Fechamento · Segurança · Conta', () => {
    admin = true;
    criaFechamento = true;
    const c = criar();
    expect(c.rotas()).toEqual(['/hoje', '/fechamento', '/inspecoes', '/perfil']);
    expect(c.abas().find(a => a.rota === '/inspecoes')?.rotulo).toBe('Segurança');
  });

  it('com almoxarifado, o fechamento fica na aba de lá e a barra segue com Frota e Conta', () => {
    admin = true;
    almox = true;
    criaFechamento = true;
    expect(criar().rotas()).toEqual(['/hoje', '/almox', '/inspecoes', '/frota', '/perfil']);
  });

  it('equipe de campo nunca vê o fechamento, mesmo com a permissão no perfil', () => {
    criaFechamento = true;
    expect(criar().rotas()).toEqual(['/hoje', '/material', '/frota', '/perfil']);
  });

  it('pendências da fila aparecem no marcador da aba Hoje', () => {
    expect(criar().abas()[0].marcador).toBe(3);
  });

  it('Material também fica ativa em pedidos e transferências', () => {
    const material = criar().abas().find(a => a.rota === '/material');
    expect(material?.ativaEm).toEqual(['/solicitacoes', '/transferencias']);
  });

  it('Frota fica ativa no checklist e no abastecimento, em todos os perfis', () => {
    for (const [a, x] of [[false, false], [true, false], [true, true]]) {
      admin = a;
      almox = x;
      const frota = criar().abas().find(aba => aba.rota === '/frota');
      expect(frota?.ativaEm).toEqual(['/checklist', '/abastecimento']);
    }
  });
});
