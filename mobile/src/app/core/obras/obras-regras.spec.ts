import {
  aprVazia, condicoesDaProgramacao, faltasDaApr, aprQueLibera, liberacaoLocal, linkComoChegar, materialPrevisto, pendenciasDeFoto,
  pontosDaExecucao, programacoesDoDia, proximoPasso, relatorioDoDia, sugestoesApr, verificacoesDaApr, EstadoDoDia,
} from './obras-regras';
import { ModeloApr, ObraCampo, ProgramacaoCampo, RegistroObraLocal } from './obras.models';

const MODELO: ModeloApr = {
  riscos: ['Choque elétrico', 'Arco elétrico', 'Queda de altura', 'Queda de materiais ou ferramentas'],
  medidas: ['Desenergização', 'Bloqueio e aterramento', 'Sinalização e isolamento da área', 'EPI e EPC'],
  verificacoes: ['Área sinalizada', 'Desligamento confirmado'],
  sugestoes: {
    SEMPRE: { riscos: ['Queda de materiais ou ferramentas'], medidas: ['Sinalização e isolamento da área', 'EPI e EPC'] },
    DESLIGAMENTO: { riscos: ['Choque elétrico', 'Arco elétrico'], medidas: ['Desenergização', 'Bloqueio e aterramento'] },
  },
};

function programacao(extra: Partial<ProgramacaoCampo> = {}): ProgramacaoCampo {
  return {
    id: 'p-1', numero: 12, idObra: 'o-1', numeroObra: '7000001', inicio: '20/11/2026', fim: '20/11/2026', descricao: 'Implantar rede',
    turno: 'DIA_TODO', linhaViva: false, desligamento: true, finalizaObra: false, situacao: 'PROGRAMADA',
    itens: [
      { idItem: 'i-1', idPonto: 'pt-4', tipo: 'SERVICO', descricao: 'Instalar poste', quantidade: 1, executada: 0, status: 'PROGRAMADO' },
      { idItem: 'i-2', idPonto: 'pt-4', tipo: 'MATERIAL', idMaterial: 'm-cruzeta', descricao: 'Cruzeta', quantidade: 4, executada: 0, status: 'PROGRAMADO' },
      { idItem: 'i-3', idPonto: 'pt-5', tipo: 'SERVICO', descricao: 'Lançar cabo', quantidade: 30, executada: 10, status: 'EM_ANDAMENTO' },
    ],
    ...extra,
  };
}

const OBRA: ObraCampo = {
  id: 'o-1', numero: '7000001', pontos: [
    { id: 'pt-4', numero: '4', pagina: 1, x: 0.2, y: 0.3, temPoda: true, temAterramento: false },
    { id: 'pt-5', numero: '5', pagina: 1, x: 0.4, y: 0.3, temPoda: false, temAterramento: false },
  ], vaos: [], fotos: [], pendenciasFoto: [],
};

function registro(tipo: RegistroObraLocal['tipo'], comando: Record<string, unknown>, instante: string, extra: Partial<RegistroObraLocal> = {}): RegistroObraLocal {
  return {
    id: crypto.randomUUID(), tipo, idObra: 'o-1', idProgramacao: 'p-1', comando: { ...comando, campo: { idLocal: 'x', instante } } as RegistroObraLocal['comando'],
    envio: 'NO_APARELHO', criadoEm: instante, dia: '2026-11-20', ...extra,
  };
}

describe('regras de Obras no app', () => {
  it('agenda do dia na ordem da programação, sem canceladas', () => {
    const lista = [programacao({ id: 'b', numero: 20 }), programacao({ id: 'a', numero: 3 }), programacao({ id: 'c', numero: 1, situacao: 'CANCELADA' }),
      programacao({ id: 'd', inicio: '21/11/2026', fim: '21/11/2026' })];
    expect(programacoesDoDia(lista, '2026-11-20').map(p => p.id)).toEqual(['a', 'b']);
  });

  it('"Tudo feito" no aparelho pinta o ponto de verde antes de enviar', () => {
    const p = programacao();
    const antes = pontosDaExecucao(p, OBRA, []);
    expect(antes.map(x => x.situacao)).toEqual(['A_FAZER', 'PARCIAL']);
    const depois = pontosDaExecucao(p, OBRA, [registro('APONTAMENTO', { pontoInteiro: true, idPonto: 'pt-4' }, '2026-11-20T10:30:00-03:00')]);
    expect(depois[0].situacao).toBe('FEITO');
    expect(depois[0].rotulo).toBe('Ponto 4');
  });

  it('"Tudo feito" enviado com sinal continua verde até o próximo pacote trazer a execução', () => {
    const p = programacao();
    const enviado = registro('APONTAMENTO', { pontoInteiro: true, idPonto: 'pt-4' }, '2026-11-21T10:30:00-03:00',
      { envio: 'ENVIADO', enviadoEm: '2026-11-21T13:30:05.000Z' });
    expect(pontosDaExecucao(p, OBRA, [enviado], [], '2026-11-21T13:00:00.000Z')[0].situacao).toBe('FEITO');
    // Pacote chegou depois do envio: a execução já vem nele e o registro não conta duas vezes.
    expect(pontosDaExecucao(p, OBRA, [enviado], [], '2026-11-21T13:31:00.000Z')[0].situacao).toBe('A_FAZER');
  });

  it('APR sugere choque e arco com desligamento e exige "Desligamento confirmado"', () => {
    const condicoes = condicoesDaProgramacao(programacao(), OBRA);
    expect(condicoes).toEqual(['SEMPRE', 'DESLIGAMENTO', 'PODA']);
    const s = sugestoesApr(MODELO, condicoes);
    expect(s.riscos).toEqual(['Choque elétrico', 'Arco elétrico', 'Queda de materiais ou ferramentas']);
    expect(s.medidas).toContain('Bloqueio e aterramento');
    expect(verificacoesDaApr(MODELO, ['SEMPRE'])).toEqual(['Área sinalizada']);
  });

  it('verificação "Não" e assinatura faltando impedem concluir', () => {
    const r = aprVazia({ riscos: ['Choque elétrico'], medidas: ['Desenergização'] }, ['c-1']);
    r.verificacoes['Área sinalizada'] = 'NAO';
    const faltas = faltasDaApr(r, ['Área sinalizada']);
    expect(faltas.some(f => f.includes('Não'))).toBe(true);
    expect(faltas.some(f => f.includes('assinatura'))).toBe(true);
    r.verificacoes['Área sinalizada'] = 'SIM';
    r.assinaturas['c-1'] = 'data:image/png;base64,AAA';
    expect(faltasDaApr(r, ['Área sinalizada'])).toEqual([]);
  });

  it('liberação no aparelho: APR concluída libera; "sem condição" depois dela impede', () => {
    const apr = registro('APR', { concluir: true }, '2026-11-20T08:10:00-03:00');
    const obra = { idObra: 'o-1' };
    expect(liberacaoLocal(obra, '2026-11-20', [])).toBe('PENDENTE');
    expect(liberacaoLocal(obra, '2026-11-20', [apr])).toBe('LIBERADA');
    const chuva = registro('OCORRENCIA', { impedeExecucao: true }, '2026-11-20T09:00:00-03:00');
    expect(liberacaoLocal(obra, '2026-11-20', [apr, chuva])).toBe('IMPEDIDA');
  });

  it('uma APR no dia libera todas as obras; o impedimento só sai com APR da própria obra', () => {
    const daManha = registro('APR', { concluir: true }, '2026-11-20T07:30:00-03:00');
    const outraObra = { idObra: 'o-2' };
    expect(liberacaoLocal(outraObra, '2026-11-20', [daManha])).toBe('LIBERADA');
    expect(aprQueLibera(outraObra, '2026-11-20', [daManha])?.id).toBe(daManha.id);

    const chuva = registro('OCORRENCIA', { impedeExecucao: true }, '2026-11-20T09:00:00-03:00', { idObra: 'o-2' });
    const aprOutraObra = registro('APR', { concluir: true }, '2026-11-20T10:00:00-03:00', { idObra: 'o-3' });
    expect(liberacaoLocal(outraObra, '2026-11-20', [daManha, chuva, aprOutraObra])).toBe('IMPEDIDA');
    expect(liberacaoLocal({ idObra: 'o-1' }, '2026-11-20', [daManha, chuva, aprOutraObra])).toBe('LIBERADA');
    const novaApr = registro('APR', { concluir: true }, '2026-11-20T11:00:00-03:00', { idObra: 'o-2' });
    expect(liberacaoLocal(outraObra, '2026-11-20', [daManha, chuva, novaApr])).toBe('LIBERADA');
  });

  it('depois de fechar o dia, o próximo passo não convida a abrir outro turno', () => {
    const e: EstadoDoDia = { turnoAberto: false, diaFechado: true, checklistFeito: true, programacoes: [programacao()], registros: [], dia: '2026-11-20',
      concluida: () => false, temRascunhoApr: () => false };
    expect(proximoPasso(e).rotulo).toBe('Ver a agenda');
  });

  it('próximo passo segue o dia da equipe', () => {
    const base: EstadoDoDia = { turnoAberto: false, checklistFeito: false, programacoes: [programacao()], registros: [], dia: '2026-11-20',
      concluida: () => false, temRascunhoApr: () => false };
    expect(proximoPasso(base).rota).toBe('/turno/abrir');
    expect(proximoPasso(base).apoio).toContain('checklist');
    expect(proximoPasso({ ...base, checklistFeito: true }).apoio).toBeUndefined();
    expect(proximoPasso({ ...base, turnoAberto: true }).rota).toBe('/obras/p-1');
    const chegada = registro('PRESENCA', { tipo: 'CHEGADA' }, '2026-11-20T07:50:00-03:00');
    expect(proximoPasso({ ...base, turnoAberto: true, registros: [chegada] }).rota).toBe('/obras/p-1/apr');
    const apr = registro('APR', { concluir: true }, '2026-11-20T08:10:00-03:00');
    expect(proximoPasso({ ...base, turnoAberto: true, registros: [chegada, apr] }).rota).toBe('/obras/p-1/execucao');
    expect(proximoPasso({ ...base, turnoAberto: true, concluida: () => true }).rota).toBe('/obras/relatorio');
  });

  it('material previsto contra o saldo do caminhão mostra o que falta', () => {
    const m = materialPrevisto([programacao()], new Map([['m-cruzeta', 2]]));
    expect(m).toEqual([expect.objectContaining({ descricao: 'Cruzeta', previsto: 4, saldo: 2, falta: 2 })]);
  });

  it('pendência de foto: ponto feito sem a foto obrigatória do modelo; some quando a foto é tirada', () => {
    const itens = [{ id: 'depois', titulo: 'Poste instalado', obrigatoria: true }, { id: 'extra', titulo: 'Detalhe', obrigatoria: false }];
    const pend = pendenciasDeFoto(OBRA, itens, [{ id: 'pt-4', rotulo: 'Ponto 4' }], []);
    expect(pend).toEqual([{ idPonto: 'pt-4', rotuloPonto: 'Ponto 4', idItem: 'depois', titulo: 'Poste instalado' }]);
    const foto = registro('EVIDENCIA', { idItem: 'depois' }, '2026-11-20T11:00:00-03:00', { idPonto: 'pt-4' });
    expect(pendenciasDeFoto(OBRA, itens, [{ id: 'pt-4', rotulo: 'Ponto 4' }], [foto])).toEqual([]);
  });

  it('relatório montado lista obra, pontos e ocorrências', () => {
    const texto = relatorioDoDia([programacao()], [registro('OCORRENCIA', { tipo: 'MATERIAL', descricao: 'Faltaram 2 cruzetas', impedeExecucao: false }, '2026-11-20T09:00:00-03:00')],
      '2026-11-20', () => ['4'], 1);
    expect(texto).toContain('Obra 7000001 (programação #12): pontos feitos 4.');
    expect(texto).toContain('Faltaram 2 cruzetas');
    expect(texto).toContain('Fotos pendentes: 1.');
  });

  it('"Como chegar" usa a coordenada; sem ela, o endereço; sem nada, nulo', () => {
    expect(linkComoChegar({ latitude: -3.7, longitude: -38.5 })).toContain('destination=-3.7,-38.5');
    expect(linkComoChegar({ endereco: 'Rua A, 10', municipio: 'Fortaleza' }, true)).toContain('maps.apple.com/?daddr=Rua%20A%2C%2010%2C%20Fortaleza');
    expect(linkComoChegar({})).toBeNull();
  });
});
