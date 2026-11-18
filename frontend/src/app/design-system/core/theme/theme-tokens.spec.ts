import { TestBed } from '@angular/core/testing';
import { ThemeTokens } from './theme-tokens';

describe('ThemeTokens', () => {
  afterEach(() => {
    document.documentElement.classList.remove('app-dark');
    document.documentElement.style.removeProperty('--geo-chart-1');
  });

  it('lê os tokens e recalcula quando o tema muda', async () => {
    document.documentElement.style.setProperty('--geo-chart-1', '#112233');
    const tokens = TestBed.inject(ThemeTokens);
    expect(tokens.paleta().series[0]).toBe('#112233');
    expect(tokens.paleta().escuro).toBe(false);

    document.documentElement.style.setProperty('--geo-chart-1', '#445566');
    document.documentElement.classList.add('app-dark');
    await new Promise((resolve) => setTimeout(resolve));

    expect(tokens.paleta().escuro).toBe(true);
    expect(tokens.paleta().series[0]).toBe('#445566');
  });
});
