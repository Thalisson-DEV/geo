import { ApiError } from '../http/error.interceptor';
import { ItemFechamento } from './fechamento.models';
import {
  atalhoFechamento, diaAgenda, erroPorItem, falhaDeConexao, iconeTipo, marcaAgenda, mensagemFalha, movimentacoesRecentes, nomePessoa, reservaValida, rotaFechamento, rotuloObra, situacaoItem, textoPrazo,
} from './fechamento-ui';

const item = (extra: Partial<ItemFechamento>): ItemFechamento => ({
  id: 'i', idMaterial: 'm', codigoMaterial: '100', descricaoMaterial: 'Cabo', unidade: 'MT', quantidade: 10, quantidadeMovimentada: 0, quantidadePendente: 10, pendencia: null, removivel: true, ...extra,
});
const erro = (extra: Partial<ApiError>): ApiError => ({ title: 'Erro', status: 422, detail: '', ...extra });

describe('fechamento-ui', () => {
  it('usa carrinho na adição e lixeira na devolução', () => {
    expect(iconeTipo('221')).toBe('carrinho');
    expect(iconeTipo('921')).toBe('carrinho');
    expect(iconeTipo('222')).toBe('lixeira');
    expect(iconeTipo('922')).toBe('lixeira');
  });

  it('mostra o colaborador e nunca o login', () => {
    expect(nomePessoa({ nome: 'Ana Souza' })).toBe('Ana Souza');
    expect(nomePessoa({ nome: null })).toBe('Sem colaborador vinculado');
    expect(nomePessoa(null)).toBe('Não informado');
  });

  it('monta o rótulo da obra sem separador sobrando', () => {
    expect(rotuloObra({ numero: '283712', titulo: 'Rede BT' })).toBe('283712 · Rede BT');
    expect(rotuloObra({ numero: '283712', titulo: null })).toBe('283712');
    expect(rotuloObra({ numero: null, titulo: null })).toBe('Obra não informada');
  });

  it('diz o que falta no prazo em curso', () => {
    const limite = '2026-11-10T15:00:00-03:00';
    expect(textoPrazo('AGUARDANDO_RESERVA', { limite, situacao: 'NO_PRAZO' })).toContain('Reserva até');
    expect(textoPrazo('MOVIMENTADA_PARCIALMENTE', { limite, situacao: 'ATRASADO' })).toContain('Movimentar até');
    expect(textoPrazo('MOVIMENTADA', { limite: null, situacao: null })).toBe('Concluído');
    expect(textoPrazo('CANCELADA', null)).toBe('');
  });

  it('o recorte desconhecido cai em aberto', () => {
    expect(atalhoFechamento('nada').valor).toBe('ABERTO');
    expect(atalhoFechamento('ATRASADA').filtro.prazo).toBe('ATRASADO');
  });

  it('a pendência do material vem antes do andamento', () => {
    const pendencia = { idMotivo: 'x', motivo: 'Falta nota', justificativa: null };
    expect(situacaoItem(item({ pendencia, quantidadeMovimentada: 2, quantidadePendente: 8 })).rotulo).toBe('Falta nota');
    expect(situacaoItem(item({ pendencia, quantidadeMovimentada: 10, quantidadePendente: 0 })).rotulo).toBe('Movimentado');
    expect(situacaoItem(item({ quantidadeMovimentada: 2, quantidadePendente: 8 })).rotulo).toBe('Em parte');
    expect(situacaoItem(item({})).rotulo).toBe('A movimentar');
  });

  it('o material sai do almoxarifado na adição e da obra na devolução', () => {
    const base = { obra: { id: 'o', numero: '283712', titulo: 'Rede' }, almoxarifadoAtendimento: { id: 'a', nome: 'ALMOX' }, estoqueObra: { id: 'e', nome: 'OBRA 283712' } };
    expect(rotaFechamento({ ...base, tipo: '221' })).toEqual({ de: 'ALMOX', para: 'OBRA 283712' });
    expect(rotaFechamento({ ...base, tipo: '922' })).toEqual({ de: 'OBRA 283712', para: 'ALMOX' });
  });

  it('ordena as movimentações da mais recente para a mais antiga', () => {
    const m = (realizadaEm: string) => ({ realizadaEm }) as never;
    expect(movimentacoesRecentes([m('2026-11-01T10:00:00Z'), m('2026-11-03T10:00:00Z')]).map((x: { realizadaEm: string }) => x.realizadaEm)[0]).toBe('2026-11-03T10:00:00Z');
  });

  it('põe no calendário o dia do prazo em curso ou o da conclusão', () => {
    const prazo = { limite: '2026-11-10T15:00:00-03:00', situacao: 'NO_PRAZO' as const };
    expect(diaAgenda({ prazoVigente: prazo, movimentacaoConcluidaEm: null })).toBe('2026-11-10');
    expect(diaAgenda({ prazoVigente: { limite: null, situacao: null }, movimentacaoConcluidaEm: '2026-11-03T15:00:00-03:00' })).toBe('2026-11-03');
    expect(diaAgenda({ prazoVigente: { limite: null, situacao: null }, movimentacaoConcluidaEm: null })).toBeNull();
  });

  it('marca o atraso só no que ainda está em aberto', () => {
    const atrasado = { limite: 'x', situacao: 'ATRASADO' as const };
    expect(marcaAgenda({ situacao: 'AGUARDANDO_RESERVA', prazoVigente: atrasado })).toBe('atraso');
    expect(marcaAgenda({ situacao: 'MOVIMENTADA', prazoVigente: atrasado })).toBe('encerrada');
    expect(marcaAgenda({ situacao: 'MOVIMENTADA_PARCIALMENTE', prazoVigente: { limite: 'x', situacao: 'NO_PRAZO' } })).toBe('aberta');
  });

  it('aceita reserva só com números, até 20 dígitos', () => {
    expect(reservaValida('12345')).toBeTrue();
    expect(reservaValida('12a45')).toBeFalse();
    expect(reservaValida('')).toBeFalse();
    expect(reservaValida('1'.repeat(21))).toBeFalse();
  });

  it('só repete a chave quando a conexão caiu antes da resposta', () => {
    expect(falhaDeConexao(erro({ status: 0 }))).toBeTrue();
    expect(falhaDeConexao(erro({ status: 504 }))).toBeTrue();
    expect(falhaDeConexao(erro({ status: 422 }))).toBeFalse();
  });

  it('prefere a mensagem do campo e explica o conflito de versão', () => {
    expect(mensagemFalha(erro({ erros: { numero: 'Reserva inválida.' }, detail: 'Geral' }), 'Padrão')).toBe('Reserva inválida.');
    expect(mensagemFalha(erro({ status: 409 }), 'Padrão')).toContain('Outra pessoa');
    expect(mensagemFalha(erro({}), 'Padrão')).toBe('Padrão');
  });

  it('leva a recusa do backend para o material certo', () => {
    expect(erroPorItem(erro({ erros: { 'itens[1].quantidade': 'Informe uma quantidade positiva.' } }), [1, 0]).get(1)).toBe('Informe uma quantidade positiva.');
    const abaixo = erroPorItem(erro({ detail: 'Já foram movimentados 4 deste material. A quantidade mínima é 4.' }), [10, 2]);
    expect(abaixo.has(0)).toBeFalse();
    expect(abaixo.get(1)).toContain('mínima é 4');
  });
});
