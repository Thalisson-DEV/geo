import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './shared.models';

describe('getErrorMessage', () => {
  it('usa a mensagem do primeiro erro do contrato errors[]', () => {
    const erro = { error: { detail: 'Campos inválidos', errors: [{ field: 'nome', message: 'Informe o nome.' }] } };
    expect(getErrorMessage(erro)).toBe('Informe o nome.');
  });

  it('avisa quantos outros campos têm erro', () => {
    const erro = {
      error: {
        errors: [
          { field: 'nome', message: 'Informe o nome.' },
          { field: 'cpf', message: 'CPF inválido.' },
          { field: 'email', message: 'E-mail inválido.' }
        ]
      }
    };
    expect(getErrorMessage(erro)).toBe('Informe o nome. (e mais 2 campos)');
  });

  it('mantém o formato antigo erros e o detail', () => {
    expect(getErrorMessage({ error: { erros: { placa: 'Placa repetida.' } } })).toBe('placa: Placa repetida.');
    expect(getErrorMessage({ error: { detail: 'Turno já encerrado.' } })).toBe('Turno já encerrado.');
  });

  it('sem resposta do servidor diz o que aconteceu em vez da mensagem técnica', () => {
    const erro = { status: 0, message: 'Http failure response for http://x/api: 0 Unknown Error', error: new ProgressEvent('error') };
    expect(getErrorMessage(erro)).toBe('Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
  });
});
