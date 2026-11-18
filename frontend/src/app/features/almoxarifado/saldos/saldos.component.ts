import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoFormSectionComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoSurfaceComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';

import { EstoqueResponse } from '../../../core/models/almoxarifado.models';
import { EquipeResponse } from '../../../core/models/rh.models';
import { createUrlFilters, qp, rememberSelection } from '../../../core/navigation';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { RhService } from '../../../core/services/rh.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { HelpDialogComponent } from '../../../shared/components/help-dialog/help-dialog.component';

@Component({
  selector: 'app-saldos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoFormSectionComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoSurfaceComponent,
    GeoTextInputComponent,
    HelpDialogComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header
        title="Consulta de saldos"
        icon="pi pi-chart-bar"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Consulta de saldos' }]"
        description="Escolha o estoque (ou a equipe) e abra o relatório de saldos numa nova aba."
        helpLabel="Ajuda sobre a consulta de saldos"
        (help)="ajuda.show()"
      ></geo-page-header>

      <geo-surface variant="outlined">
        <form (submit)="$event.preventDefault(); consultar()">
          <geo-form-section title="Consulta" icon="pi pi-search">
            <div class="geo-form-grid">
              <geo-select label="Estoque" [required]="true" [options]="estoquesOpcoes()" [value]="idEstoque()" (valueChange)="escolherEstoque($event)"
                [filter]="true" [clearable]="true" placeholder="Selecione um estoque" [error]="erro()"></geo-select>
              <geo-select label="Equipe" [options]="equipesOpcoes()" [value]="idEquipe()" (valueChange)="escolherEquipe($event)" [filter]="true" [clearable]="true"
                [loading]="equipes.loading()" (opened)="equipes.open()" (search)="equipes.search($event)" placeholder="Pesquise pelo código"
                description="Escolher a equipe preenche o estoque dela."></geo-select>
            </div>
            <geo-text-input label="Material" [(value)]="busca" [showOptional]="true" placeholder="Código ou descrição"
              description="Deixe em branco para ver todos os materiais do estoque."></geo-text-input>
          </geo-form-section>
          <div class="geo-actions-row">
            <geo-button type="submit" icon="pi pi-external-link" label="Abrir relatório"></geo-button>
          </div>
        </form>
      </geo-surface>
    </div>

    <app-help-dialog #ajuda title="Ajuda: Consulta de saldos">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-box"></i> Estoque e equipe</h4>
        <p class="help-text-desc">Escolher o estoque preenche a equipe vinculada; escolher a equipe preenche o estoque dela. Equipes sem estoque vinculado não têm saldo.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-external-link"></i> Relatório</h4>
        <p class="help-text-desc">O relatório abre numa nova aba com código, descrição, quantidade e unidade de cada material, e pode ser exportado. Esta tela é só de consulta.</p>
      </div>
    </app-help-dialog>
  `
})
export class SaldosComponent implements OnInit {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly estoques = signal<EstoqueResponse[]>([]);
  protected readonly idEstoque = signal<string | null>(null);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly busca = signal('');
  protected readonly tentou = signal(false);
  protected readonly erro = computed(() => (this.tentou() && !this.idEstoque() ? 'Escolha um estoque ou uma equipe com estoque.' : undefined));
  protected readonly estoquesOpcoes = computed<GeoSelectOption<string>[]>(() => this.estoques().map((e) => ({ label: e.nomeIdentificador, value: e.id })));

  protected readonly equipes = new RemoteLookup<EquipeResponse>(
    {
      identify: (e) => e.id,
      selectedKeys: () => (this.idEquipe() ? [this.idEquipe()!] : []),
      load: ({ query, page, size }) => this.rh.listarEquipes({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'codigo,asc' })
    },
    inject(DestroyRef)
  );
  protected readonly equipesOpcoes = computed<GeoSelectOption<string>[]>(() => this.equipes.items().map((e) => ({ label: e.codigo, value: e.id })));

  /** Filtros da última consulta na URL (replace): F5 e Voltar reabrem a tela preenchida. */
  private readonly filtrosUrl = createUrlFilters<{ idEstoque: string | null; idEquipe: string | null; buscaGlobal: string }>({
    idEstoque: qp.text('estoque'),
    idEquipe: qp.text('equipe'),
    buscaGlobal: qp.text('busca')
  });
  private readonly equipesSelecionadas = rememberSelection('equipe', () => this.equipes.items().filter((e) => e.id === this.idEquipe()));

  ngOnInit(): void {
    this.almoxarifado.listarEstoquesAtivos().subscribe({ next: (r) => this.estoques.set(r.content ?? []), error: () => this.estoques.set([]) });
    const { idEstoque, idEquipe, buscaGlobal } = this.filtrosUrl.read();
    this.equipes.setSeed(this.equipesSelecionadas());
    this.idEstoque.set(idEstoque || null);
    this.idEquipe.set(idEquipe || null);
    this.busca.set(buscaGlobal ?? '');
  }

  protected escolherEstoque(id: string | null): void {
    this.idEstoque.set(id);
    if (!id) return;
    const equipe = this.estoques().find((e) => e.id === id)?.idEquipe ?? null;
    this.idEquipe.set(equipe);
    if (equipe) this.rh.buscarEquipePorId(equipe).subscribe({ next: (e) => this.equipes.setSeed([e]), error: () => undefined });
  }

  protected escolherEquipe(id: string | null): void {
    this.idEquipe.set(id);
    if (!id) return;
    const estoque = this.estoques().find((e) => e.idEquipe === id);
    this.idEstoque.set(estoque?.id ?? null);
    if (!estoque) this.notificacoes.warning('Esta equipe não tem estoque vinculado.');
  }

  protected consultar(): void {
    this.tentou.set(true);
    const idEstoque = this.idEstoque();
    if (!idEstoque) return;
    const idEquipe = this.idEquipe();
    const buscaGlobal = this.busca().trim();
    this.filtrosUrl.write({ idEstoque, idEquipe, buscaGlobal });
    const queryParams: Record<string, string> = { idEstoque };
    if (idEquipe) queryParams['idEquipe'] = idEquipe;
    if (buscaGlobal) queryParams['buscaGlobal'] = buscaGlobal;
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/saldos/relatorio'], { queryParams })), '_blank');
  }
}
