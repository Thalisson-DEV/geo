import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { EstrelasAvaliacaoComponent } from './estrelas-avaliacao.component';

async function montar(valor: number | null = null) {
  await TestBed.configureTestingModule({ imports: [EstrelasAvaliacaoComponent] }).compileComponents();
  const fixture = TestBed.createComponent(EstrelasAvaliacaoComponent);
  fixture.componentRef.setInput('valor', valor);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const estrelas = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const rotulo = () => el.querySelector('.ea-rotulo')!.textContent!.trim();
  const acesas = () => estrelas.filter((b) => b.classList.contains('ea-estrela--acesa')).length;
  return { fixture, el, estrelas, rotulo, acesas };
}

describe('EstrelasAvaliacaoComponent', () => {
  it('mostra cinco estrelas como radiogroup e a dica enquanto não há nota', async () => {
    const { estrelas, rotulo, acesas } = await montar();
    expect(estrelas).toHaveLength(5);
    expect(estrelas[3].getAttribute('aria-label')).toBe('4 estrelas, Bom');
    expect(rotulo()).toBe('Toque numa estrela');
    expect(acesas()).toBe(0);
  });

  it('a prévia do hover só some ao sair do grupo, não entre uma estrela e outra', async () => {
    const { fixture, el, estrelas, rotulo, acesas } = await montar(2);
    estrelas[3].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(acesas()).toBe(4);
    expect(rotulo()).toBe('Bom');

    // Sair de uma estrela (passar pelo vão) não apaga nada: o rótulo não pisca.
    estrelas[3].dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(rotulo()).toBe('Bom');

    el.querySelector('.ea-linha')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(acesas()).toBe(2);
    expect(rotulo()).toBe('Ruim');
  });

  it('emite a nota tocada e marca a estrela escolhida', async () => {
    const { fixture, estrelas } = await montar();
    const emitidas: number[] = [];
    fixture.componentInstance.escolher.subscribe((n) => emitidas.push(n));
    estrelas[4].click();
    expect(emitidas).toEqual([5]);

    fixture.componentRef.setInput('valor', 5);
    fixture.detectChanges();
    expect(estrelas[4].getAttribute('aria-checked')).toBe('true');
    expect(estrelas[0].getAttribute('aria-checked')).toBe('false');
  });
});
