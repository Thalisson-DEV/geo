import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoConfirmationService } from '../../overlays/confirmation/confirmation.service';
import { GeoFormDrawerComponent } from './geo-form-drawer.component';
import { GEO_FORM_KIT } from './index';
import { geoErrorMessage, geoValidateForm } from './form-kit.utils';
import { geoUnsavedChangesGuard } from './unsaved-changes.guard';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function mockMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ...GEO_FORM_KIT],
  template: `
    <geo-form-page title="Novo contrato" icon="pi pi-file" backFallback="/contratos" [sectionNav]="true" [loading]="carregando()">
      <form [formGroup]="form">
        <geo-form-section title="Identificação" id="identificacao">
          <geo-form-field label="Número do contrato" size="md" hint="Como aparece no contrato">
            <input formControlName="numero" />
          </geo-form-field>
          <geo-form-field label="Cliente" size="lg">
            <input formControlName="cliente" />
          </geo-form-field>
        </geo-form-section>
        <geo-form-section title="Vigência" id="vigencia">
          <geo-form-field label="Coeficiente" size="sm" disabledReason="Definido pelo contrato-mãe">
            <input formControlName="coeficiente" />
          </geo-form-field>
        </geo-form-section>
      </form>
      <geo-form-summary form-aside />
      <geo-form-actions form-actions [saving]="salvando()" (save)="salvar()" (cancel)="cancelou = true" />
    </geo-form-page>
  `,
})
class PaginaHost {
  readonly form = new FormGroup({
    numero: new FormControl('', [Validators.required, Validators.minLength(3)]),
    cliente: new FormControl(''),
    coeficiente: new FormControl({ value: '1', disabled: true }),
  });
  readonly salvando = signal(false);
  readonly carregando = signal(false);
  salvos = 0;
  cancelou = false;
  salvar() {
    this.salvos++;
  }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ...GEO_FORM_KIT],
  template: `
    <geo-form-drawer #drawer [(visible)]="aberto" title="Novo contrato" [dirty]="form.dirty">
      <form [formGroup]="form">
        <geo-form-section>
          <geo-form-field label="Número"><input formControlName="numero" /></geo-form-field>
        </geo-form-section>
      </form>
      <geo-form-actions drawer-footer [saveAndNew]="true" (save)="salvos = salvos + 1" (cancel)="drawer.requestClose()" />
    </geo-form-drawer>
  `,
})
class DrawerHost {
  readonly aberto = signal(true);
  readonly form = new FormGroup({ numero: new FormControl('') });
  readonly drawer = viewChild.required(GeoFormDrawerComponent);
  salvos = 0;
}

async function montar<T>(host: new () => T, confirmar?: boolean) {
  mockMatchMedia();
  const confirm = vi.fn(async () => confirmar ?? true);
  await TestBed.configureTestingModule({
    imports: [host],
    providers: [
      provideRouter([]),
      ConfirmationService,
      { provide: GeoConfirmationService, useValue: { confirm } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, confirm };
}

function ctrlS() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
}

describe('kit de formulário', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.querySelectorAll('.p-drawer, .p-drawer-mask').forEach((el) => el.remove());
    TestBed.resetTestingModule();
  });

  describe('geo-form-field', () => {
    it('associa rótulo, mostra obrigatório pelo validador e a ajuda', async () => {
      const { fixture } = await montar(PaginaHost);
      const el: HTMLElement = fixture.nativeElement;
      const [numero, cliente] = Array.from(el.querySelectorAll('geo-form-field')) as HTMLElement[];
      const input = numero.querySelector('input')!;
      const label = numero.querySelector('label')!;

      expect(label.getAttribute('for')).toBe(input.id);
      expect(numero.querySelector('.geo-form-field__required')).not.toBeNull();
      expect(cliente.querySelector('.geo-form-field__required')).toBeNull();
      expect(input.getAttribute('aria-required')).toBe('true');
      expect(numero.querySelector('.geo-form-field__message')!.textContent).toContain('Como aparece no contrato');
      expect(numero.style.getPropertyValue('--geo-form-span')).toBe('4');
    });

    it('mostra o erro só depois de tocado, com aria-invalid e aria-describedby', async () => {
      const { fixture } = await montar(PaginaHost);
      const host = fixture.componentInstance;
      const campo = fixture.nativeElement.querySelector('geo-form-field') as HTMLElement;
      const input = campo.querySelector('input')!;

      expect(campo.querySelector('.geo-form-field__message--error')).toBeNull();
      host.form.controls.numero.markAsTouched();
      fixture.detectChanges();

      const erro = campo.querySelector('.geo-form-field__message--error')!;
      expect(erro.textContent).toContain('Campo obrigatório.');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(erro.id);

      host.form.controls.numero.setValue('ab');
      fixture.detectChanges();
      expect(campo.textContent).toContain('Informe pelo menos 3 caracteres.');
    });

    it('campo desabilitado mostra o motivo', async () => {
      const { fixture } = await montar(PaginaHost);
      const campo = fixture.nativeElement.querySelectorAll('geo-form-field')[2] as HTMLElement;
      expect(campo.classList).toContain('geo-form-field--disabled');
      expect(campo.textContent).toContain('Definido pelo contrato-mãe');
    });
  });

  describe('geo-form-page', () => {
    it('título único, seções sem numeração e índice de âncoras', async () => {
      const { fixture } = await montar(PaginaHost);
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('h1')!.textContent).toContain('Novo contrato');
      const titulos = Array.from(el.querySelectorAll('.geo-form-section__title')).map((t) => t.textContent!.trim());
      expect(titulos).toEqual(['Identificação', 'Vigência']);
      const links = Array.from(el.querySelectorAll('.geo-form-nav a')).map((a) => a.getAttribute('href'));
      expect(links).toEqual(['#identificacao', '#vigencia']);
    });

    it('foca o primeiro campo ao abrir', async () => {
      const { fixture } = await montar(PaginaHost);
      await tick();
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input[formcontrolname="numero"]'));
    });

    it('mostra skeleton durante o carregamento', async () => {
      const { fixture } = await montar(PaginaHost);
      fixture.componentInstance.carregando.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.geo-form-skeleton')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.geo-form-card__body').getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('envio e pendências', () => {
    it('validação no envio foca o primeiro erro e lista as pendências no resumo', async () => {
      const { fixture } = await montar(PaginaHost);
      const host = fixture.componentInstance;
      const root: HTMLElement = fixture.nativeElement;
      (root.querySelector('input[formcontrolname="cliente"]') as HTMLElement).focus();

      const promessa = geoValidateForm(host.form, root);
      fixture.detectChanges();
      expect(await promessa).toBe(false);

      expect(document.activeElement).toBe(root.querySelector('input[formcontrolname="numero"]'));
      const pendencias = Array.from(root.querySelectorAll('.geo-form-summary__pending button'));
      expect(pendencias).toHaveLength(1);
      expect(pendencias[0].textContent).toContain('Número do contrato');
      expect(pendencias[0].textContent).toContain('Identificação');
    });

    it('formulário válido passa', async () => {
      const { fixture } = await montar(PaginaHost);
      fixture.componentInstance.form.controls.numero.setValue('CT-001');
      expect(await geoValidateForm(fixture.componentInstance.form, fixture.nativeElement)).toBe(true);
    });

    it('mensagem de validador próprio', () => {
      expect(geoErrorMessage({ periodo: 'A data final deve ser posterior à inicial.' })).toBe(
        'A data final deve ser posterior à inicial.',
      );
      expect(geoErrorMessage({ max: { max: 10 } })).toBe('O valor máximo é 10.');
    });
  });

  describe('geo-form-actions', () => {
    it('Ctrl+S salva; durante o salvamento ignora e mostra carregando', async () => {
      const { fixture } = await montar(PaginaHost);
      const host = fixture.componentInstance;
      ctrlS();
      expect(host.salvos).toBe(1);

      host.salvando.set(true);
      fixture.detectChanges();
      ctrlS();
      expect(host.salvos).toBe(1);
      const botoes = Array.from(fixture.nativeElement.querySelectorAll('.geo-form-actions button')) as HTMLButtonElement[];
      expect(botoes.some((b) => b.textContent!.includes('Salvando'))).toBe(true);
      expect(botoes.every((b) => b.disabled)).toBe(true);
    });
  });

  describe('geo-form-drawer', () => {
    it('Ctrl+S vai para o drawer aberto, que tem "Salvar e novo"', async () => {
      const { fixture } = await montar(DrawerHost);
      const drawer = document.body.querySelector('.p-drawer') as HTMLElement;
      expect(drawer.querySelector('h2')!.textContent).toContain('Novo contrato');
      expect(drawer.textContent).toContain('Salvar e novo');
      ctrlS();
      expect(fixture.componentInstance.salvos).toBe(1);
    });

    it('fecha sem perguntar quando não há alterações', async () => {
      const { fixture, confirm } = await montar(DrawerHost);
      expect(await fixture.componentInstance.drawer().requestClose()).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
      expect(fixture.componentInstance.aberto()).toBe(false);
    });

    it('com alterações pede confirmação; recusar mantém aberto', async () => {
      const { fixture, confirm } = await montar(DrawerHost, false);
      fixture.componentInstance.form.markAsDirty();
      fixture.detectChanges();

      expect(await fixture.componentInstance.drawer().requestClose()).toBe(false);
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Descartar alterações?' }));
      expect(fixture.componentInstance.aberto()).toBe(true);
    });

    it('focusFirstError rola até o primeiro campo inválido e o foca', async () => {
      const { fixture } = await montar(DrawerHost);
      const input = document.body.querySelector('.p-drawer input') as HTMLInputElement;
      input.setAttribute('aria-invalid', 'true');
      const rolar = vi.fn();
      input.scrollIntoView = rolar;
      fixture.componentInstance.drawer().focusFirstError();
      await tick();
      expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
      expect(document.activeElement).toBe(input);
    });

    it('Esc dentro do drawer pede para fechar', async () => {
      const { fixture, confirm } = await montar(DrawerHost, true);
      fixture.componentInstance.form.markAsDirty();
      fixture.detectChanges();
      const input = document.body.querySelector('.p-drawer input') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();
      expect(confirm).toHaveBeenCalled();
      expect(fixture.componentInstance.aberto()).toBe(false);
    });
  });

  describe('geoUnsavedChangesGuard', () => {
    it('só pergunta quando há alterações não salvas', async () => {
      const confirm = vi.fn(async () => false);
      TestBed.configureTestingModule({ providers: [{ provide: GeoConfirmationService, useValue: { confirm } }] });
      const rodar = (sujo: boolean) =>
        TestBed.runInInjectionContext(() =>
          geoUnsavedChangesGuard({ hasUnsavedChanges: () => sujo }, null as any, null as any, null as any),
        );
      expect(rodar(false)).toBe(true);
      expect(await rodar(true)).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
    });
  });
});
