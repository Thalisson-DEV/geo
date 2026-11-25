import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoIconButtonComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectOption,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { CondicaoApr, EstruturaApr, MedidaApr, ModeloAprResponse, RiscoApr, VerificacaoApr } from '../../../core/models/sst-apr.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { SstAprService } from '../../../core/services/sst-apr.service';
import { LIMITE_TEXTO_APR, ListaApr, mover, problemaDaApr, removerMedida, riscosQueMarcam } from './apr.logic';

const VAZIA: EstruturaApr = { riscos: [], medidas: [], verificacoes: [] };

/**
 * Cadastro da APR do app de campo, mantido pelo SST: o que a equipe pode marcar antes de executar e o que já vem
 * marcado em cada condição do serviço. APRs lançadas guardam o texto como foi respondido; mudar aqui não altera o passado.
 */
@Component({
  selector: 'app-apr-cadastro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoIconButtonComponent,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextInputComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header
        title="APR do app de campo"
        icon="pi pi-shield"
        [breadcrumb]="[{ label: 'Segurança' }, { label: 'Cadastros' }, { label: 'APR do app de campo' }]"
        description="Riscos, medidas de controle e verificações que a equipe marca no app antes de executar, e o que vem sugerido em cada condição do serviço."
      >
        @if (podeEditar && estado() === 'pronto') {
          <geo-button actions variant="ghost" label="Descartar alterações" [disabled]="!alterado() || salvando()" (pressed)="descartar()"></geo-button>
        }
        @if (podeEditar && estado() === 'pronto') {
          <geo-button actions icon="pi pi-check" label="Salvar APR" [disabled]="!alterado()" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </geo-page-header>

      @switch (estado()) {
        @case ('carregando') {
          <geo-async-state state="loading" title="Carregando a APR"></geo-async-state>
        }
        @case ('erro') {
          <geo-async-state state="error" title="Não foi possível carregar a APR" [description]="erro() ?? undefined" actionLabel="Tentar de novo" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
        }
        @default {
          <geo-callout tone="info" icon="pi pi-info-circle" [dense]="true">
            A equipe recebe as mudanças na próxima sincronização do app. APRs já lançadas continuam como foram respondidas.
            @if (alteradoEm()) { <span class="apr-alterado">Última alteração em {{ alteradoEm() }}{{ alteradoPor() ? ' por ' + alteradoPor() : '' }}.</span> }
          </geo-callout>
          @if (tentou() && problema()) {
            <geo-callout tone="danger" icon="pi pi-exclamation-circle" title="Revise antes de salvar" [dense]="true">{{ problema() }}</geo-callout>
          }

          <geo-tabs [(value)]="aba" [tabs]="abas()" ariaLabel="Listas da APR" [lazy]="false">
            <ng-template geoTabPanel="riscos">
              <p class="apr-ajuda">A equipe marca os riscos do serviço. Os sugeridos já vêm marcados; as medidas ligadas ao risco são marcadas junto (dá para desmarcar no app).</p>
              <ol class="apr-lista">
                @for (r of estrutura().riscos; track r.id; let i = $index) {
                  <li class="apr-item">
                    <geo-text-input class="apr-item__texto" [label]="'Risco ' + (i + 1)" [required]="true" [maxlength]="limite" [value]="r.texto" [readonly]="!podeEditar"
                      placeholder="Ex.: Choque elétrico" (valueChange)="alterarRisco(i, { texto: $event })"></geo-text-input>
                    <geo-multiselect class="apr-item__campo" label="Sugerido quando" placeholder="Só quando a equipe marcar" [options]="condicoes()" [value]="r.sugeridoEm"
                      [readonly]="!podeEditar" display="comma" [maxSelectedLabels]="20" (valueChange)="alterarRisco(i, { sugeridoEm: $event })"></geo-multiselect>
                    <geo-multiselect class="apr-item__campo" label="Medidas marcadas junto" placeholder="Nenhuma" [options]="opcoesMedidas()" [value]="r.medidas"
                      [readonly]="!podeEditar" display="comma" [maxSelectedLabels]="20" (valueChange)="alterarRisco(i, { medidas: $event })"></geo-multiselect>
                    @if (podeEditar) {
                      <span class="apr-item__acoes">
                        <geo-icon-button icon="pi pi-chevron-up" [label]="'Subir risco ' + (i + 1)" size="icon-sm" [disabled]="i === 0" (pressed)="moverItem('riscos', i, -1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-chevron-down" [label]="'Descer risco ' + (i + 1)" size="icon-sm" [disabled]="i === estrutura().riscos.length - 1" (pressed)="moverItem('riscos', i, 1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-trash" [label]="'Remover risco ' + (i + 1)" size="icon-sm" (pressed)="remover('riscos', r.id)"></geo-icon-button>
                      </span>
                    }
                  </li>
                }
              </ol>
              @if (podeEditar) {
                <geo-button variant="outline" size="sm" icon="pi pi-plus" label="Adicionar risco" (pressed)="adicionarRisco()"></geo-button>
              }
            </ng-template>

            <ng-template geoTabPanel="medidas">
              <p class="apr-ajuda">Medidas de controle que a equipe confirma. Uma medida também vem marcada quando um risco ligado a ela é marcado.</p>
              <ol class="apr-lista">
                @for (m of estrutura().medidas; track m.id; let i = $index) {
                  <li class="apr-item">
                    <geo-text-input class="apr-item__texto" [label]="'Medida ' + (i + 1)" [required]="true" [maxlength]="limite" [value]="m.texto" [readonly]="!podeEditar"
                      placeholder="Ex.: Bloqueio e aterramento" [description]="ligadaA(m.id)" (valueChange)="alterarMedida(i, { texto: $event })"></geo-text-input>
                    <geo-multiselect class="apr-item__campo" label="Sugerida quando" placeholder="Só quando a equipe ou um risco marcar" [options]="condicoes()" [value]="m.sugeridaEm"
                      [readonly]="!podeEditar" display="comma" [maxSelectedLabels]="20" (valueChange)="alterarMedida(i, { sugeridaEm: $event })"></geo-multiselect>
                    @if (podeEditar) {
                      <span class="apr-item__acoes">
                        <geo-icon-button icon="pi pi-chevron-up" [label]="'Subir medida ' + (i + 1)" size="icon-sm" [disabled]="i === 0" (pressed)="moverItem('medidas', i, -1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-chevron-down" [label]="'Descer medida ' + (i + 1)" size="icon-sm" [disabled]="i === estrutura().medidas.length - 1" (pressed)="moverItem('medidas', i, 1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-trash" [label]="'Remover medida ' + (i + 1)" size="icon-sm" (pressed)="remover('medidas', m.id)"></geo-icon-button>
                      </span>
                    }
                  </li>
                }
              </ol>
              @if (podeEditar) {
                <geo-button variant="outline" size="sm" icon="pi pi-plus" label="Adicionar medida" (pressed)="adicionarMedida()"></geo-button>
              }
            </ng-template>

            <ng-template geoTabPanel="verificacoes">
              <p class="apr-ajuda">Perguntas de Sim ou Não respondidas antes de executar. Um "Não" impede concluir a APR: a equipe corrige ou registra "Sem condição de executar".</p>
              <ol class="apr-lista">
                @for (v of estrutura().verificacoes; track v.id; let i = $index) {
                  <li class="apr-item">
                    <geo-text-input class="apr-item__texto" [label]="'Verificação ' + (i + 1)" [required]="true" [maxlength]="limite" [value]="v.texto" [readonly]="!podeEditar"
                      placeholder="Ex.: Área sinalizada" (valueChange)="alterarVerificacao(i, { texto: $event })"></geo-text-input>
                    <geo-multiselect class="apr-item__campo" label="Aparece quando" placeholder="Em todo serviço" [options]="condicoes()" [value]="v.exigidaEm"
                      [readonly]="!podeEditar" display="comma" [maxSelectedLabels]="20" (valueChange)="alterarVerificacao(i, { exigidaEm: $event })"></geo-multiselect>
                    @if (podeEditar) {
                      <span class="apr-item__acoes">
                        <geo-icon-button icon="pi pi-chevron-up" [label]="'Subir verificação ' + (i + 1)" size="icon-sm" [disabled]="i === 0" (pressed)="moverItem('verificacoes', i, -1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-chevron-down" [label]="'Descer verificação ' + (i + 1)" size="icon-sm" [disabled]="i === estrutura().verificacoes.length - 1" (pressed)="moverItem('verificacoes', i, 1)"></geo-icon-button>
                        <geo-icon-button icon="pi pi-trash" [label]="'Remover verificação ' + (i + 1)" size="icon-sm" (pressed)="remover('verificacoes', v.id)"></geo-icon-button>
                      </span>
                    }
                  </li>
                }
              </ol>
              @if (podeEditar) {
                <geo-button variant="outline" size="sm" icon="pi pi-plus" label="Adicionar verificação" (pressed)="adicionarVerificacao()"></geo-button>
              }
            </ng-template>
          </geo-tabs>
        }
      }
    </div>
  `,
  styles: `
    .apr-alterado { display: block; margin-top: 0.125rem; color: var(--geo-foreground-muted); }
    .apr-ajuda { margin: 0.75rem 0; color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .apr-lista { list-style: none; margin: 0 0 0.75rem; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .apr-item { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .apr-item__texto { flex: 2 1 16rem; min-width: 0; }
    .apr-item__campo { flex: 1 1 14rem; min-width: 0; }
    .apr-item__acoes { display: inline-flex; gap: 0.125rem; margin-top: 1.5rem; }
  `
})
export class AprCadastroComponent {
  private readonly servico = inject(SstAprService);
  private readonly notificacoes = inject(NotificationService);

  protected readonly podeEditar = (inject(AuthService).currentUser()?.permissoes ?? []).includes('sst:formulario:write');
  protected readonly limite = LIMITE_TEXTO_APR;

  protected readonly estado = signal<'carregando' | 'erro' | 'pronto'>('carregando');
  protected readonly erro = signal<string | null>(null);
  protected readonly estrutura = signal<EstruturaApr>(VAZIA);
  protected readonly condicoes = signal<GeoSelectOption<CondicaoApr>[]>([]);
  protected readonly aba = signal<string | number | undefined>('riscos');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  private readonly original = signal(JSON.stringify(VAZIA));
  private readonly ultima = signal<ModeloAprResponse | null>(null);

  protected readonly alterado = computed(() => JSON.stringify(this.estrutura()) !== this.original());
  protected readonly problema = computed(() => problemaDaApr(this.estrutura()));
  protected readonly opcoesMedidas = computed<GeoSelectOption<string>[]>(() =>
    this.estrutura().medidas.filter(m => m.texto.trim()).map(m => ({ label: m.texto.trim(), value: m.id })));
  protected readonly abas = computed<GeoTabItem[]>(() => [
    { value: 'riscos', label: 'Riscos', badge: this.estrutura().riscos.length },
    { value: 'medidas', label: 'Medidas de controle', badge: this.estrutura().medidas.length },
    { value: 'verificacoes', label: 'Verificações', badge: this.estrutura().verificacoes.length }
  ]);
  protected readonly alteradoEm = computed(() => {
    const em = this.ultima()?.alteradoEm;
    return em ? new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  });
  protected readonly alteradoPor = computed(() => this.ultima()?.alteradoPor ?? null);

  constructor() {
    this.carregar();
  }

  /** Usado pelo guard de saída da rota. */
  hasUnsavedChanges(): boolean {
    return this.alterado();
  }

  protected carregar(): void {
    this.estado.set('carregando');
    this.servico.obter().subscribe({
      next: (m) => this.aplicar(m),
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.estado.set('erro');
      }
    });
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (this.problema()) return;
    this.salvando.set(true);
    this.servico.salvar(this.estrutura()).subscribe({
      next: (m) => {
        this.aplicar(m);
        this.salvando.set(false);
        this.tentou.set(false);
        this.notificacoes.success('APR salva. A equipe recebe na próxima sincronização.');
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected descartar(): void {
    this.estrutura.set(JSON.parse(this.original()));
    this.tentou.set(false);
  }

  protected ligadaA(idMedida: string): string | undefined {
    const riscos = riscosQueMarcam(this.estrutura(), idMedida);
    return riscos.length ? `Marcada junto com: ${riscos.join(', ')}` : undefined;
  }

  protected alterarRisco(i: number, parte: Partial<RiscoApr>): void {
    this.estrutura.update(e => ({ ...e, riscos: e.riscos.map((r, k) => (k === i ? { ...r, ...parte } : r)) }));
  }

  protected alterarMedida(i: number, parte: Partial<MedidaApr>): void {
    this.estrutura.update(e => ({ ...e, medidas: e.medidas.map((m, k) => (k === i ? { ...m, ...parte } : m)) }));
  }

  protected alterarVerificacao(i: number, parte: Partial<VerificacaoApr>): void {
    this.estrutura.update(e => ({ ...e, verificacoes: e.verificacoes.map((v, k) => (k === i ? { ...v, ...parte } : v)) }));
  }

  protected adicionarRisco(): void {
    this.estrutura.update(e => ({ ...e, riscos: [...e.riscos, { id: crypto.randomUUID(), texto: '', sugeridoEm: [], medidas: [] }] }));
  }

  protected adicionarMedida(): void {
    this.estrutura.update(e => ({ ...e, medidas: [...e.medidas, { id: crypto.randomUUID(), texto: '', sugeridaEm: [] }] }));
  }

  protected adicionarVerificacao(): void {
    this.estrutura.update(e => ({ ...e, verificacoes: [...e.verificacoes, { id: crypto.randomUUID(), texto: '', exigidaEm: [] }] }));
  }

  protected moverItem(lista: ListaApr, i: number, delta: number): void {
    this.estrutura.update(e => ({ ...e, [lista]: mover<unknown>(e[lista], i, delta) }) as EstruturaApr);
  }

  protected remover(lista: ListaApr, id: string): void {
    this.estrutura.update(e => (lista === 'medidas' ? removerMedida(e, id)
      : ({ ...e, [lista]: (e[lista] as { id: string }[]).filter(x => x.id !== id) }) as EstruturaApr));
  }

  private aplicar(m: ModeloAprResponse): void {
    this.ultima.set(m);
    this.condicoes.set(m.condicoes.map(c => ({ label: c.rotulo, value: c.valor })));
    this.estrutura.set(m.estrutura);
    this.original.set(JSON.stringify(m.estrutura));
    this.estado.set('pronto');
  }
}
