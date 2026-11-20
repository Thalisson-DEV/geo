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
});
