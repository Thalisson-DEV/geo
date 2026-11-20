import { TestBed } from '@angular/core/testing';

import { GeoRowAction, GeoRowActionsComponent } from './geo-row-actions.component';

interface Row {
  id: number;
  locked: boolean;
}

describe('GeoRowActionsComponent', () => {
  it('emite a ação e a linha selecionadas', async () => {
    await TestBed.configureTestingModule({ imports: [GeoRowActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoRowActionsComponent<Row>);
    const row: Row = { id: 7, locked: false };
    const actions: GeoRowAction<Row>[] = [
      { id: 'edit', label: 'Editar registro', icon: 'pi pi-pencil' }
    ];
    const selected = vi.fn();
    fixture.componentRef.setInput('row', row);
    fixture.componentRef.setInput('actions', actions);
    fixture.componentInstance.actionSelected.subscribe(selected);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(selected).toHaveBeenCalledWith({ action: actions[0], row });
  });

  it('avalia visibilidade e bloqueio com a linha atual', async () => {
    await TestBed.configureTestingModule({ imports: [GeoRowActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoRowActionsComponent<Row>);
    fixture.componentRef.setInput('row', { id: 7, locked: true });
    fixture.componentRef.setInput('actions', [
      {
        id: 'edit',
        label: 'Editar registro',
        icon: 'pi pi-pencil',
        disabled: (row: Row) => row.locked
      },
      {
        id: 'delete',
        label: 'Excluir registro',
        icon: 'pi pi-trash',
        visible: (row: Row) => !row.locked
      }
    ] satisfies GeoRowAction<Row>[]);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('com maxVisible, mantém as primeiras ações como ícone e manda o resto para "Mais ações"', async () => {
    await TestBed.configureTestingModule({ imports: [GeoRowActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoRowActionsComponent<Row>);
    const selected = vi.fn();
    fixture.componentRef.setInput('row', { id: 1, locked: false });
    fixture.componentRef.setInput('maxVisible', 1);
    fixture.componentRef.setInput('actions', [
      { id: 'edit', label: 'Editar', icon: 'pi pi-pencil' },
      { id: 'log', label: 'Histórico', icon: 'pi pi-history' },
      { id: 'off', label: 'Desativar', icon: 'pi pi-ban', variant: 'destructive' }
    ] satisfies GeoRowAction<Row>[]);
    fixture.componentInstance.actionSelected.subscribe(selected);
    fixture.detectChanges();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('button')).map((b) => (b as HTMLButtonElement).getAttribute('aria-label'));
    expect(labels).toEqual(['Editar', 'Mais ações']);
    const menu = (fixture.componentInstance as unknown as { overflow: () => { label: string; command: () => void }[] }).overflow();
    expect(menu.map((i) => i.label)).toEqual(['Histórico', 'Desativar']);
    menu[1].command();
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ id: 'off' }) }));
  });

  it('uma única ação excedente fica inline, sem menu', async () => {
    await TestBed.configureTestingModule({ imports: [GeoRowActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoRowActionsComponent<Row>);
    fixture.componentRef.setInput('row', { id: 1, locked: false });
    fixture.componentRef.setInput('maxVisible', 1);
    fixture.componentRef.setInput('actions', [
      { id: 'edit', label: 'Editar', icon: 'pi pi-pencil' },
      { id: 'log', label: 'Histórico', icon: 'pi pi-history' }
    ] satisfies GeoRowAction<Row>[]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('Mais ações');
  });
});
