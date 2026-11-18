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
});
