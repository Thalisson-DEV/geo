import { describe, expect, it } from 'vitest';
import { FormControl, FormGroup } from '@angular/forms';
import { geoApplyServerErrors, geoErrorMessage, geoServerFieldErrors } from './form-kit.utils';

describe('erros do servidor no formulário', () => {
  it('lê errors[], fieldErrors e erros', () => {
    expect(geoServerFieldErrors({ error: { errors: [{ field: 'a', message: 'm', code: 'C' }] } })).toEqual([
      { field: 'a', message: 'm', code: 'C' }
    ]);
    expect(geoServerFieldErrors({ error: { fieldErrors: { b: { message: 'n', code: 'D' } } } })).toEqual([
      { field: 'b', message: 'n', code: 'D' }
    ]);
    expect(geoServerFieldErrors({ error: { erros: { c: 'o' } } })).toEqual([{ field: 'c', message: 'o' }]);
    expect(geoServerFieldErrors({ error: { detail: 'x' } })).toEqual([]);
  });

  it('marca os campos pelo caminho do FormControl e devolve quantos marcou', () => {
    const form = new FormGroup({
      nome: new FormControl(''),
      endereco: new FormGroup({ cep: new FormControl('') })
    });
    const marcados = geoApplyServerErrors(form, {
      error: {
        errors: [
          { field: 'endereco.cep', message: 'CEP inexistente.' },
          { field: 'naoExiste', message: 'ignorado' }
        ]
      }
    });
    expect(marcados).toBe(1);
    const cep = form.get('endereco.cep')!;
    expect(cep.touched).toBe(true);
    expect(geoErrorMessage(cep.errors)).toBe('CEP inexistente.');
  });
});
