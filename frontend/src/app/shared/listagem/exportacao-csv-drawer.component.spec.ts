import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService } from 'primeng/api';
import { describe, expect, it } from 'vitest';

import { ExportacaoCsvDrawerComponent, FormatoExportacao } from './exportacao-csv-drawer.component';

@Component({
  standalone: true,
  imports: [ExportacaoCsvDrawerComponent],
  template: `
    <app-exportacao-csv-drawer [(visible)]="aberto" [(formato)]="formato" titulo="Exportar notas (CSV)"
      [resumo]="{ rotulo: 'Resumido', dica: 'Uma linha por nota.' }" [detalhado]="{ rotulo: 'Detalhado', dica: 'Uma linha por item.' }"
      singular="nota" plural="notas" [feminino]="true" [total]="total()" [limite]="30000" (exportar)="pedido.set($event)">
      <span class="filtro-do-pai">filtros</span>
    </app-exportacao-csv-drawer>
  `
})
class Hospedeiro {
  readonly aberto = signal(true);
  readonly formato = signal<FormatoExportacao>('resumo');
  readonly total = signal<number | null>(1200);
  readonly pedido = signal<FormatoExportacao | null>(null);
}

async function montar() {
  TestBed.configureTestingModule({ imports: [Hospedeiro], providers: [provideNoopAnimations(), ConfirmationService] });
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, texto: () => document.body.textContent ?? '' };
}

function botao(rotulo: string): HTMLButtonElement {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent!.trim() === rotulo) as HTMLButtonElement;
}

describe('ExportacaoCsvDrawerComponent', () => {
  it('troca o formato, mostra os filtros do pai e a contagem no rodapé', async () => {
    const { fixture, host, texto } = await montar();
    expect(texto()).toContain('filtros');
    expect(texto()).toContain('Uma linha por nota.');
    expect(texto()).toMatch(/1\.200\s+notas no arquivo/);

    botao('Detalhado').click();
    fixture.detectChanges();
    expect(host.formato()).toBe('detalhado');
    expect(texto()).toContain('Uma linha por item.');

    botao('Baixar CSV').click();
    expect(host.pedido()).toBe('detalhado');
  });

  it('acima do limite avisa que só as mais recentes entram', async () => {
    const { fixture, host, texto } = await montar();
    host.total.set(45_210);
    fixture.detectChanges();
    expect(texto()).toContain('O recorte tem 45.210 notas');
    expect(texto()).toContain('as mais recentes');
    expect(texto()).toMatch(/30\.000\s+de 45\.210 notas/);
  });

  it('sem notas no recorte, não deixa baixar', async () => {
    const { fixture, host, texto } = await montar();
    host.total.set(0);
    fixture.detectChanges();
    expect(texto()).toContain('Nenhuma nota nesse recorte');
    expect(botao('Baixar CSV').disabled).toBe(true);
  });
});
