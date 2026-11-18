import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import { FechamentoDetalhe, ItemFechamento } from '../../../core/models/fechamento-obra.models';
import { SupervisorMinResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { RhService } from '../../../core/services/rh.service';
import {
  LinhaMaterial,
  NovaSolicitacaoMateriaisComponent
} from '../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao-materiais.component';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { quantidade, tipoFechamento } from './fechamento-ui';

interface LinhaExistente {
  item: ItemFechamento;
  quantidade: number | null;
  remover: boolean;
}

/** Edita a solicitação enquanto não estiver toda movimentada: o movimentado é o mínimo de cada material. */
@Component({
  selector: 'app-fechamento-editar-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoTextareaComponent,
    NovaSolicitacaoMateriaisComponent
  ],
  styleUrl: './fechamento.css',
  template: `
    <geo-form-drawer [visible]="visible()" (visibleChange)="visible.set($event)" title="Editar solicitação" size="lg" [resizable]="true"
      [description]="descricao()" [dirty]="true">
      @if (solicitacao(); as s) {
        <div class="fx-form">
          <section aria-labelledby="fed-itens">
            <h3 id="fed-itens" class="fx-form__titulo">Materiais</h3>
            <ul class="fx-linhas">
              @for (l of existentes(); track l.item.id; let i = $index) {
                <li class="fx-linha" [style.opacity]="l.remover ? 0.55 : 1">
                  <span class="fx-linha__material">
                    <strong>{{ l.item.codigoMaterial }}</strong>
                    <span class="fx-linha__desc" [title]="l.item.descricaoMaterial">{{ l.item.descricaoMaterial }}</span>
                    <span class="fx-linha__meta">
                      @if (l.remover) { Sai da solicitação } @else if (l.item.quantidadeMovimentada > 0) { Movimentado: {{ quantidade(l.item.quantidadeMovimentada) }} (mínimo) } @else { Nada movimentado }
                    </span>
                  </span>
                  <span class="fx-linha__acoes">
                    <geo-number-input [label]="'Quantidade de ' + l.item.codigoMaterial" [labelVisible]="false" [min]="0" [maxFractionDigits]="3"
                      [suffix]="' ' + (l.item.unidade || 'UN')" [value]="l.quantidade" (valueChange)="alterar(i, { quantidade: $event })"
                      [disabled]="l.remover" [error]="erroQuantidade(l)" />
                    @if (l.item.removivel) {
                      <geo-icon-button [icon]="l.remover ? 'pi pi-undo' : 'pi pi-trash'" size="icon-sm"
                        [label]="(l.remover ? 'Manter ' : 'Tirar ') + l.item.codigoMaterial" (pressed)="alterar(i, { remover: !l.remover })" />
                    }
                  </span>
                </li>
              }
            </ul>
          </section>
          <section aria-labelledby="fed-novos">
            <h3 id="fed-novos" class="fx-form__titulo">Incluir materiais</h3>
            <app-nova-solicitacao-materiais processo="OBRAS" [(linhas)]="novos" [idEstoque]="tipo(s.tipo).adicao ? s.almoxarifadoAtendimento.id : null"
              [nomeEstoque]="almoxarifado(s.almoxarifadoAtendimento.nome)" rotuloOrigem="o almoxarifado" [mostrarSaldo]="tipo(s.tipo).adicao" />
          </section>
          <section aria-labelledby="fed-resp">
            <h3 id="fed-resp" class="fx-form__titulo">Responsáveis e observação</h3>
            <geo-select label="Encarregado" placeholder="Buscar colaborador" [options]="opcoesColaborador()" [(value)]="idEncarregado"
              [filter]="true" [loading]="buscandoColaborador()" (search)="buscaColaborador.search($event)" (opened)="abrirBusca()" [clearable]="true" />
            <geo-select label="Supervisor" [options]="opcoesSupervisor()" [(value)]="idSupervisor" [filter]="true" [clearable]="true"
              [description]="coordenador() ? 'Coordenador: ' + coordenador() : 'O coordenador vem do supervisor.'" />
            <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" />
          </section>
        </div>
      }
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visible.set(false)" />
        <geo-button icon="pi pi-check" label="Salvar" [loading]="salvando()" (pressed)="salvar()" />
      </div>
    </geo-form-drawer>
  `,
  styles: `
    .fx-linha__acoes { display: flex; gap: 0.5rem; align-items: center; }
  `
})
export class FechamentoEditarDrawerComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly rh = inject(RhService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly solicitacao = input<FechamentoDetalhe | null>(null);
  readonly salva = output<FechamentoDetalhe>();
  readonly conflito = output<void>();

  protected readonly tipo = tipoFechamento;
  protected readonly almoxarifado = formatarAlmoxarifado;
  protected readonly quantidade = quantidade;
  protected readonly existentes = signal<LinhaExistente[]>([]);
  protected readonly novos = signal<LinhaMaterial[]>([]);
  protected readonly idEncarregado = signal<string | null>(null);
  protected readonly idSupervisor = signal<string | null>(null);
  protected readonly observacao = signal('');
  protected readonly salvando = signal(false);
  private readonly supervisores = signal<SupervisorMinResponse[]>([]);

  protected readonly buscaColaborador = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => (this.idEncarregado() ? [this.idEncarregado()!] : []),
    destroyRef: this.destroyRef
  });
  protected readonly buscandoColaborador = this.buscaColaborador.loading;
  protected readonly opcoesColaborador = computed<GeoSelectOption<string>[]>(() => {
    const s = this.solicitacao();
    const itens = this.buscaColaborador.items();
    const atual = s?.encarregado;
    return atual && atual.id === this.idEncarregado() && !itens.some((i) => i.value === atual.id)
      ? [{ label: atual.nome ?? 'Encarregado atual', value: atual.id }, ...itens]
      : itens;
  });
  protected readonly opcoesSupervisor = computed<GeoSelectOption<string>[]>(() =>
    this.supervisores().map((s) => ({ label: s.nomeColaborador, value: s.id }))
  );
  protected readonly coordenador = computed(() => this.supervisores().find((s) => s.id === this.idSupervisor())?.nomeCoordenador ?? null);
  protected readonly descricao = computed(() => {
    const s = this.solicitacao();
    return s ? `${s.tipo} · obra ${s.obra.numero ?? ''}. O tipo não muda depois de criada.` : undefined;
  });

  constructor() {
    this.rh.listarSupervisoresAtivosMin().subscribe({ next: (r) => this.supervisores.set(r ?? []), error: () => undefined });
    effect(() => {
      if (!this.visible()) return;
      const s = this.solicitacao();
      untracked(() => {
        this.existentes.set((s?.itens ?? []).map((item) => ({ item, quantidade: item.quantidade, remover: false })));
        this.novos.set([]);
        this.idEncarregado.set(s?.encarregado?.id ?? null);
        this.idSupervisor.set(s?.supervisor?.id ?? null);
        this.observacao.set(s?.observacao ?? '');
      });
    });
  }

  protected abrirBusca(): void {
    if (!this.buscaColaborador.items().length) this.buscaColaborador.search('');
  }

  protected alterar(indice: number, mudanca: Partial<LinhaExistente>): void {
    this.existentes.update((ls) => ls.map((l, i) => (i === indice ? { ...l, ...mudanca } : l)));
  }

  protected erroQuantidade(l: LinhaExistente): string | undefined {
    if (l.remover) return undefined;
    if (!((l.quantidade ?? 0) > 0)) return 'Informe a quantidade.';
    if ((l.quantidade ?? 0) < l.item.quantidadeMovimentada) return `O mínimo é ${quantidade(l.item.quantidadeMovimentada)}.`;
    return undefined;
  }

  protected salvar(): void {
    const s = this.solicitacao();
    if (!s || this.salvando()) return;
    const mantidos = this.existentes().filter((l) => !l.remover);
    if (mantidos.some((l) => this.erroQuantidade(l)) || this.novos().some((l) => !((l.quantidade ?? 0) > 0))) {
      this.notificacoes.warning('Confira as quantidades destacadas.');
      return;
    }
    if (!mantidos.length && !this.novos().length) {
      this.notificacoes.warning('A solicitação precisa de ao menos um material. Para desistir, cancele a solicitação.');
      return;
    }
    const repetido = this.novos().find((n) => mantidos.some((l) => l.item.idMaterial === n.material.id));
    if (repetido) {
      this.notificacoes.warning(`${repetido.material.codigo} já está na solicitação: ajuste a quantidade na linha dele.`);
      return;
    }
    this.salvando.set(true);
    this.service
      .editar(s.id, {
        versaoEsperada: s.versao,
        idEncarregado: this.idEncarregado(),
        idSupervisor: this.idSupervisor(),
        observacao: this.observacao().trim() || null,
        itens: [
          ...mantidos.map((l) => ({ idItem: l.item.id, idMaterial: l.item.idMaterial, quantidade: l.quantidade ?? 0 })),
          ...this.novos().map((n) => ({ idItem: null, idMaterial: n.material.id, quantidade: n.quantidade ?? 0 }))
        ]
      })
      .subscribe({
        next: (detalhe) => {
          this.salvando.set(false);
          this.notificacoes.success('Solicitação atualizada.');
          this.visible.set(false);
          this.salva.emit(detalhe);
        },
        error: (e) => {
          this.salvando.set(false);
          if (e?.status === 409) {
            this.notificacoes.warning('Alguém alterou esta solicitação. Os dados foram atualizados; refaça a edição.');
            this.conflito.emit();
            return;
          }
          this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível salvar' });
        }
      });
  }
}
