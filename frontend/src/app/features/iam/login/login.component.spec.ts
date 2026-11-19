import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { LoginComponent, mensagemDeErroDoLogin } from './login.component';

async function montar(online = true) {
  const login = vi.fn(() => throwError(() => ({ status: 401 })));
  await TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { login, currentUser: signal(null), reautenticacaoNecessaria: () => false } },
      { provide: ConnectivityService, useValue: { isOnline: signal(online) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, login };
}

function digitar(el: HTMLElement, id: string, valor: string) {
  const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

describe('LoginComponent', () => {
  it('mostra a marca GEO, o formulário e a explicação do uso sem sinal', async () => {
    const { el } = await montar();
    expect(el.querySelector('h1')!.textContent).toBe('Entrar');
    expect(el.textContent).toContain('Gestão de Equipes e Operações');
    expect(el.textContent).toContain('mesmo sem sinal');
    expect(el.querySelector('#login')).not.toBeNull();
    expect(el.querySelector('#senha')).not.toBeNull();
  });

  it('valida no envio e mostra o erro do servidor no formulário', async () => {
    const { fixture, el, login } = await montar();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Informe o usuário.');
    expect(login).not.toHaveBeenCalled();

    digitar(el, 'login', 'usr123456');
    digitar(el, 'senha', 'segredo');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(login).toHaveBeenCalledWith({ login: 'USR123456', senha: 'segredo' });
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Usuário ou senha não conferem');
  });

  it('sem conexão, avisa que o primeiro acesso precisa de internet', async () => {
    const { el } = await montar(false);
    expect(el.textContent).toContain('Sem conexão. Para entrar, o GEO precisa de internet');
  });
});

describe('mensagemDeErroDoLogin', () => {
  it('traduz os casos comuns', () => {
    expect(mensagemDeErroDoLogin({ status: 0 })).toContain('Sem conexão com o servidor');
    expect(mensagemDeErroDoLogin({ status: 503 })).toContain('O servidor não respondeu');
  });
});
