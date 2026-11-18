import { TestBed } from '@angular/core/testing';

import { GeoFieldComponent } from './geo-field.component';

describe('GeoFieldComponent', () => {
  it('associa rótulo, descrição e erro por identificadores estáveis', async () => {
    await TestBed.configureTestingModule({ imports: [GeoFieldComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoFieldComponent);
    fixture.componentRef.setInput('label', 'Município');
    fixture.componentRef.setInput('inputId', 'municipio');
    fixture.componentRef.setInput('error', 'Selecione um município.');
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    const error = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(label.id).toBe('municipio-label');
    expect(label.htmlFor).toBe('municipio');
    expect(error.id).toBe('municipio-error');
    expect(fixture.componentInstance.describedBy()).toBe('municipio-error');
  });
});
