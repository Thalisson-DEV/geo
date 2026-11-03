import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@ces/ui';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EventoTelemetria,
  RastreadorTelemetria,
  SituacaoTelemetria,
  TelemetriaVeiculo,
  UsoVeiculo,
  formatarConsumo,
  formatarRodado,
  haQuanto
} from '../../../core/models/frota-telemetria.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { abrirTelaFrota, paginaDe } from '../shared/frota-teste';
import { FrotaTelemetriaEventosComponent } from './frota-telemetria-eventos.component';
import { FrotaTelemetriaComponent } from './frota-telemetria.component';
import { FrotaVeiculoTelemetriaComponent } from './frota-veiculo-telemetria.component';

const agoraMenos = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const ROTINA_OK = { situacao: 'OK' as const, situacaoRotulo: 'Sincronizado', ultimaExecucao: agoraMenos(3), ultimoSucesso: agoraMenos(3),
  mensagem: null, falhasSeguidas: 0, itens: 42 };

const SITUACAO: SituacaoTelemetria = {
  provedores: [
    { provedor: 'UBICALY', rotulo: 'Vivo (Ubicaly)', configurado: true, veiculos: ROTINA_OK,
      eventos: { ...ROTINA_OK, situacao: 'ERRO', situacaoRotulo: 'Com erro', mensagem: 'O provedor recusou a chave (HTTP 401).', itens: 0 } },
    { provedor: 'ZUQ', rotulo: 'Zuq', configurado: false,
      veiculos: { ...ROTINA_OK, situacao: 'NAO_CONFIGURADO', ultimoSucesso: null, ultimaExecucao: null },
      eventos: { ...ROTINA_OK, situacao: 'NAO_CONFIGURADO', ultimoSucesso: null, ultimaExecucao: null } }
  ],
  resumo: { vinculados: 38, semVeiculo: 3, ignorados: 1, semComunicacao: 2, eventos24h: 7 }
};

const RASTREADOR: RastreadorTelemetria = {
  id: 'r1', provedor: 'UBICALY', provedorRotulo: 'Vivo (Ubicaly)', idExterno: '17', placaProvedor: 'XYZ-9Z99', nomeProvedor: 'Picape 03',
  situacao: 'SEM_VEICULO', situacaoRotulo: 'Sem veículo', vinculoManual: false, idVeiculo: null, placa: null, base: null,
  ultimaComunicacao: agoraMenos(30), latitude: -12.9, longitude: -38.5, velocidadeKmh: 0, ignicao: false, odometroKm: 120045.3,
  horimetroHoras: null, motoristaNome: null, idColaboradorMotorista: null, condutor: null, semComunicacao: false
};

const EVENTO: EventoTelemetria = {
  id: 'e1', provedor: 'ZUQ', provedorRotulo: 'Zuq', tipo: 'EXCESSO_VELOCIDADE', tipoRotulo: 'Excesso de velocidade',
  ocorridoEm: agoraMenos(60), idVeiculo: 'v1', placa: 'ABC1D23', base: 'BASE SALVADOR', latitude: -12.9, longitude: -38.5,
  endereco: 'BR-324', velocidadeKmh: 98, limiteKmh: 80, duracaoSegundos: null, descricao: null, detalhe: '98 km/h (limite 80)',
  motoristaNome: 'MARIA SOUZA', idColaborador: 'c1', condutor: 'Maria Souza', origemCondutor: 'PROVEDOR', origemCondutorRotulo: 'Informado pelo rastreador'
};


const USO: UsoVeiculo = {
  dias: 30, de: '2026-09-27', ate: '2026-10-26', expediente: 'seg. a sex., das 06:00 às 19:00', rastreado: true, medido: true,
  km: 210, kmPorDiaUtil: 9.5, diasComUso: 12, diasUteisMedidos: 22, rodaPouco: true, kmDiaRodaPouco: 20, minutosAndando: 600,
  minutosLigadoParado: 150, litrosOciosos: 2.5, kmForaExpediente: 34.2, diasForaExpediente: 2,
  saidas: [{ inicio: '2026-10-25T21:10:00-03:00', fim: '2026-10-25T21:50:00-03:00', km: 18.4, minutos: 40, diaSemana: 'dom.',
    trajeto: [[-12.9, -38.5], [-12.95, -38.5]] }],
  saidasRecortadas: false,
  custo: { desde: '2026-09-27', combustivel: 900, litros: 150, manutencao: 300, despesas: 0, locacao: 2400, total: 3600, porKm: 17.14,
    kmPorLitro: 1.4, custoOcioso: 15 }
};

describe('Telemetria da frota', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;
  let notificacoes: Record<string, ReturnType<typeof vi.fn>>;
  let permissoes: string[];

  const extras = () => [
    { provide: FrotaTelemetriaService, useValue: servico },
    { provide: NotificationService, useValue: notificacoes }
  ];

  beforeEach(() => {
    TestBed.resetTestingModule();
    permissoes = ['frota:telemetria:read', 'frota:telemetria:write'];
    notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    servico = {
      situacao: vi.fn(() => of(SITUACAO)),
      saude: vi.fn(() => of({ duplicados: [], geradoEm: agoraMenos(0) })),
      listarRastreadores: vi.fn(() => paginaDe([RASTREADOR])),
      listarEventos: vi.fn(() => paginaDe([EVENTO])),
      detalharEvento: vi.fn(() => of(EVENTO)),
      detalharRastreador: vi.fn(() => of(RASTREADOR)),
      veiculo: vi.fn(),
      uso: vi.fn(() => of(USO)),
      trajeto: vi.fn(() => of({ pontos: [], truncado: false }))
    };
  });

  afterEach(() => localStorage.clear());

  async function abrirAba() {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations(), provideRouter([]), ...extras(),
        { provide: AuthService, useValue: { currentUser: () => ({ permissoes }) } }]
    });
    const fixture = TestBed.createComponent(FrotaVeiculoTelemetriaComponent);
    fixture.componentRef.setInput('idVeiculo', 'v1');
    fixture.componentRef.setInput('placa', 'ABC1D23');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement };
  }

  it('rastreadores: sem provedor, chave ou sincronização na tela quando tudo está em dia', async () => {
    const { el } = await abrirTelaFrota(FrotaTelemetriaComponent, 'frota/telemetria', '/frota/telemetria', {}, permissoes, extras());
    const texto = el.textContent!;
    expect(texto).toContain('Rastreadores');
    expect(texto).toContain('XYZ-9Z99');
    expect(texto).not.toContain('ZUQ_API_TOKEN');
    expect(texto).not.toContain('Sincronizar');
    expect(texto).not.toContain('Posições atrasadas');
    expect(texto).not.toContain('dois rastreadores');
  });

  it('rastreadores: avisa uma vez quando as posições atrasam e quando há placa em dobro', async () => {
    servico['situacao'].mockReturnValue(of({ ...SITUACAO, provedores: [{ ...SITUACAO.provedores[0], veiculos: { ...ROTINA_OK, ultimoSucesso: agoraMenos(90) } }] }));
    servico['saude'].mockReturnValue(of({ duplicados: [{ placa: 'ABC1D23', idVeiculo: 'v1', modelo: 'Strada', base: 'FEIRA', rastreadores: [
      { idRastreador: 'r1', provedor: 'ZUQ', provedorRotulo: 'Zuq', ultimaComunicacao: agoraMenos(2), comOdometro: true, manter: true },
      { idRastreador: 'r2', provedor: 'UBICALY', provedorRotulo: 'Vivo (Ubicaly)', ultimaComunicacao: null, comOdometro: false, manter: false }
    ] }], geradoEm: agoraMenos(0) }));
    const { el } = await abrirTelaFrota(FrotaTelemetriaComponent, 'frota/telemetria', '/frota/telemetria', {}, permissoes, extras());
    const texto = el.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('Posições atrasadas');
    expect(texto).not.toContain('Vivo (Ubicaly) respondeu');
    expect(texto).toContain('1 placa com dois rastreadores');
  });

  it('rastreadores: o atalho "Sem veículo" filtra a lista', async () => {
    const { el, harness } = await abrirTelaFrota(FrotaTelemetriaComponent, 'frota/telemetria', '/frota/telemetria', {}, permissoes, extras());
    const sem = Array.from(el.querySelectorAll<HTMLButtonElement>('button.ces-quick-filter')).find((b) => b.textContent!.includes('Sem veículo'))!;
    sem.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(servico['listarRastreadores']).toHaveBeenLastCalledWith(
      expect.objectContaining({ situacoes: ['SEM_VEICULO'], busca: null }), expect.anything());
  });

  it('eventos: o período vira instante de início do dia e o condutor aparece sem a origem técnica', async () => {
    const { el } = await abrirTelaFrota(FrotaTelemetriaEventosComponent, 'frota/telemetria/eventos',
      '/frota/telemetria/eventos?periodo=2026-10-20~2026-10-26&tipo=EXCESSO_VELOCIDADE', {}, permissoes, extras());
    const filtro = servico['listarEventos'].mock.calls.at(-1)![0];
    expect(filtro.tipos).toEqual(['EXCESSO_VELOCIDADE']);
    expect(new Date(filtro.de).getDate()).toBe(20);
    expect(new Date(filtro.ate).getDate()).toBe(27);
    expect(filtro).not.toHaveProperty('periodo');
    expect(filtro).not.toHaveProperty('provedores');
    expect(el.textContent).toContain('98 km/h (limite 80)');
    expect(el.textContent).toContain('Maria Souza');
    expect(el.textContent).not.toContain('Pelo rastreador');
  });

  it('uso: veículo sem rastreador explica sem jargão', async () => {
    servico['veiculo'].mockReturnValue(of({ rastreado: false, rastreador: null, outros: [], unidade: 'KM', rodado7d: null, rodado30d: null,
      litros30d: null, consumo30d: null, eventos30d: [], ultimosEventos: [] } satisfies TelemetriaVeiculo));
    servico['uso'].mockReturnValue(of({ ...USO, rastreado: false, medido: false }));
    const { el } = await abrirAba();
    expect(el.textContent).toContain('Veículo sem rastreador');
    expect(el.textContent).not.toMatch(/Ubicaly|Zuq|provedor/);
  });

  it('uso: resume o período, avisa quando roda pouco e mostra as saídas fora do expediente', async () => {
    servico['veiculo'].mockReturnValue(of({
      rastreado: true, rastreador: { ...RASTREADOR, situacao: 'VINCULADO', idVeiculo: 'v1', placa: 'ABC1D23', condutor: 'Maria Souza' },
      outros: [], unidade: 'KM', rodado7d: 412, rodado30d: 1830, litros30d: 210, consumo30d: 8.7,
      eventos30d: [{ tipo: 'EXCESSO_VELOCIDADE', rotulo: 'Excesso de velocidade', total: 3 }], ultimosEventos: [EVENTO]
    } satisfies TelemetriaVeiculo));
    const { el } = await abrirAba();
    const texto = el.textContent!.replace(/\s+/g, ' ');
    expect(servico['uso']).toHaveBeenCalledWith('v1', 30);
    expect(texto).toContain('210 km');
    expect(texto).toContain('Roda pouco');
    expect(texto).toContain('O aluguel no período foi');
    expect(texto).toContain('Usado fora do expediente');
    expect(texto).toContain('dom. 25/10, 21:10 às 21:50');
    expect(texto).toContain('R$ 17,14');
    expect(texto).toContain('3 · Excesso de velocidade');
    expect(texto).not.toMatch(/Ubicaly|Zuq/);
  });

  it('formata tempo, rodado e consumo', () => {
    expect(haQuanto(null)).toBe('nunca');
    expect(haQuanto(agoraMenos(5))).toBe('há 5 min');
    expect(haQuanto(agoraMenos(180))).toBe('há 3 h');
    expect(formatarRodado(1234.4, 'KM')).toBe('1.234 km');
    expect(formatarRodado(12.5, 'HORAS')).toBe('12,5 h');
    expect(formatarConsumo(3.14, 'HORAS')).toBe('3,1 l/h');
  });
});
