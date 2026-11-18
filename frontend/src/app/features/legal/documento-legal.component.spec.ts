import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DocumentoLegalComponent } from './documento-legal.component';
import { DOCUMENTOS_LEGAIS, DocumentoLegalId, trechosLegais } from './documentos-legais.data';

function montar(documento: DocumentoLegalId) {
  TestBed.configureTestingModule({
    imports: [DocumentoLegalComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { data: of({ documento }), snapshot: { data: { documento } } } }
    ]
  });
  const fixture = TestBed.createComponent(DocumentoLegalComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DocumentoLegalComponent', () => {
  it('mostra a Política de Privacidade com todas as seções no sumário', () => {
    const el = montar('privacidade');
    expect(el.querySelector('h1')?.textContent).toContain('Política de Privacidade');
    const secoes = DOCUMENTOS_LEGAIS.privacidade.secoes;
    expect(el.querySelectorAll('.legal-sumario li').length).toBe(secoes.length);
    expect(el.querySelectorAll('section.legal-secao').length).toBe(secoes.length);
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('Privacidade');
  });

  it('mostra os Termos de Uso e aponta para a política', () => {
    const el = montar('termos');
    expect(el.querySelector('h1')?.textContent).toContain('Termos de Uso');
    expect(el.querySelector('.legal-rodape a')?.textContent).toContain('Política de Privacidade');
  });

  it('destaca os dados ainda a preencher', () => {
    const el = montar('privacidade');
    const marcas = Array.from(el.querySelectorAll('mark')).map(m => m.textContent?.trim());
    expect(marcas).toContain('[RAZÃO SOCIAL DO FORNECEDOR]');
    expect(marcas).toContain('[E-MAIL DO ENCARREGADO]');
  });
});

describe('trechosLegais', () => {
  it('separa o texto dos marcadores', () => {
    expect(trechosLegais('Foro de [COMARCA].')).toEqual([
      { texto: 'Foro de ', pendente: false },
      { texto: '[COMARCA]', pendente: true },
      { texto: '.', pendente: false }
    ]);
  });

  it('não marca texto sem colchetes', () => {
    expect(trechosLegais('Sem pendência')).toEqual([{ texto: 'Sem pendência', pendente: false }]);
  });
});

describe('documentos legais', () => {
  it('não citam nome de empresa fora dos marcadores (white label)', () => {
    const texto = JSON.stringify(DOCUMENTOS_LEGAIS).toLowerCase();
    for (const proibido of ['sipel', 'coelba', 'neoenergia', 'equatorial', 'nexo']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('têm ids de seção únicos', () => {
    for (const doc of Object.values(DOCUMENTOS_LEGAIS)) {
      const ids = doc.secoes.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
