import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoIconButtonComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTone,
  NotificationService
} from '@geo/ui';
import { ComunicadoMuralResponse, TipoComunicado } from '../../../core/models/notificacao.models';
import { AuthService } from '../../../core/services/auth.service';
import { MuralStore } from '../../../core/services/mural-store.service';
import { ComunicadoDetalheDialogComponent } from '../../../shared/components/comunicado-detalhe-dialog/comunicado-detalhe-dialog.component';
import { HelpDialogComponent } from '../../../shared/components/help-dialog/help-dialog.component';
import { TIPO_COMUNICADO_ICONES, TIPO_COMUNICADO_OPTIONS, TOM_TIPO_COMUNICADO, formatarDataHora } from '../notificacoes-ui';

type Recorte = 'TODOS' | 'NAO_LIDOS' | 'CONFIRMAR';

/**
 * Mural: tudo o que está no ar para este usuário, na ordem do servidor. Os fixados abrem a página em
 * destaque; o restante vem em cartões, com recorte por leitura, confirmação e tipo.
 */
@Component({
  selector: 'app-mural',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoIconButtonComponent,
    GeoPageHeaderComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    ComunicadoDetalheDialogComponent,
    HelpDialogComponent
  ],
  styleUrl: './mural.component.css',
  template: `
    <div class="geo-page">
      <geo-page-header
        title="Mural de comunicados"
        icon="pi pi-megaphone"
        [breadcrumb]="[{ label: 'Comunicação' }, { label: 'Mural' }]"
        description="Avisos, novidades e orientações publicados para o seu acesso. Os que exigem confirmação ficam em destaque até você confirmar a leitura."
        helpLabel="Ajuda sobre o mural"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="ghost" icon="pi pi-refresh" label="Atualizar" [loading]="mural.carregando()" (pressed)="mural.carregar(true)"></geo-button>
        @if (podeGerenciar) {
          <geo-button actions variant="outline" icon="pi pi-cog" label="Gerenciar comunicados" (pressed)="gerenciar()"></geo-button>
        }
      </geo-page-header>

      <section class="geo-kpis mu-kpis" aria-label="Resumo do mural" aria-live="polite">
        <button type="button" class="geo-kpi" data-tone="info" [attr.aria-pressed]="recorte() === 'TODOS' && !tipo()" (click)="limpar()">
          <span class="geo-kpi__icon"><i class="pi pi-megaphone" aria-hidden="true"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">No ar para você</span>
            <span class="geo-kpi__value">{{ mural.itens().length }}</span>
            <span class="geo-kpi__detail">{{ fixados().length }} {{ fixados().length === 1 ? 'fixado' : 'fixados' }} no topo</span>
          </span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="naoLidos() ? 'info' : 'neutral'" [attr.aria-pressed]="recorte() === 'NAO_LIDOS'" (click)="alternar('NAO_LIDOS')">
          <span class="geo-kpi__icon"><i class="pi pi-envelope" aria-hidden="true"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Não lidos</span>
            <span class="geo-kpi__value">{{ naoLidos() }}</span>
            <span class="geo-kpi__detail">Mostra só os que você não abriu</span>
          </span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="mural.pendentesConfirmacao() ? 'warning' : 'success'" [attr.aria-pressed]="recorte() === 'CONFIRMAR'" (click)="alternar('CONFIRMAR')">
          <span class="geo-kpi__icon"><i [class]="mural.pendentesConfirmacao() ? 'pi pi-exclamation-circle' : 'pi pi-verified'" aria-hidden="true"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Aguardando sua confirmação</span>
            <span class="geo-kpi__value">{{ mural.pendentesConfirmacao() }}</span>
            <span class="geo-kpi__detail">{{ mural.pendentesConfirmacao() ? 'Leia e confirme com "Li e entendi"' : 'Nenhuma leitura pendente' }}</span>
          </span>
        </button>
      </section>

      <div class="mu-barra">
        <div class="mu-tipos" role="group" aria-label="Filtrar por tipo">
          <button type="button" class="mu-tipo" [attr.aria-pressed]="!tipo()" (click)="tipo.set(null)">
            Todos <span class="mu-tipo__n">{{ mural.itens().length }}</span>
          </button>
          @for (t of tiposPresentes(); track t.value) {
            <button type="button" class="mu-tipo" [attr.data-tone]="tom(t.value)" [attr.aria-pressed]="tipo() === t.value" (click)="tipo.set(tipo() === t.value ? null : t.value)">
              <i [class]="icone(t.value)" aria-hidden="true"></i>{{ t.label }} <span class="mu-tipo__n">{{ t.total }}</span>
            </button>
          }
        </div>
        <geo-text-input class="mu-busca" label="Buscar no mural" [labelVisible]="false" placeholder="Buscar por título ou resumo" [(value)]="busca"></geo-text-input>
      </div>

      @if (mural.carregando() && !mural.carregado()) {
        <div class="mu-grade" role="status" aria-label="Carregando o mural">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="mu-esqueleto"><span></span><span></span><span></span></div>
          }
        </div>
      } @else if (!mural.itens().length) {
        <geo-async-state state="empty" icon="pi pi-megaphone" title="Nenhum comunicado no ar"
          description="Quando um aviso for publicado para o seu acesso, ele aparece aqui e no sino."></geo-async-state>
      } @else if (!visiveis().length) {
        <geo-async-state state="empty" icon="pi pi-filter-slash" title="Nenhum comunicado neste recorte"
          description="Troque o filtro ou limpe a busca para ver todos os comunicados." actionLabel="Ver todos" actionIcon="pi pi-filter-slash" (action)="limpar()"></geo-async-state>
      } @else {
        @if (destaques().length) {
          <section class="mu-secao" aria-labelledby="mu-destaques">
            <h2 id="mu-destaques" class="mu-secao__titulo"><i class="pi pi-thumbtack" aria-hidden="true"></i>Em destaque</h2>
            <div class="mu-grade mu-grade--destaque">
              @for (item of destaques(); track item.id) {
                <ng-container *ngTemplateOutlet="cartao; context: { $implicit: item, destaque: true }"></ng-container>
              }
            </div>
          </section>
        }
        @if (demais().length) {
          <section class="mu-secao" aria-labelledby="mu-demais">
            <h2 id="mu-demais" class="mu-secao__titulo"><i class="pi pi-inbox" aria-hidden="true"></i>{{ destaques().length ? 'Demais comunicados' : 'Comunicados' }}
              <span class="mu-secao__n">{{ demais().length }}</span></h2>
            <div class="mu-grade">
              @for (item of demais(); track item.id) {
                <ng-container *ngTemplateOutlet="cartao; context: { $implicit: item, destaque: false }"></ng-container>
              }
            </div>
          </section>
        }
      }
    </div>

    <ng-template #cartao let-item let-destaque="destaque">
      <article class="mu-card" [class.mu-card--destaque]="destaque" [class.mu-card--novo]="!item.visualizado" [attr.data-tone]="tom(item.tipo)">
        <header class="mu-card__topo">
          <span class="mu-card__icone"><i [class]="icone(item.tipo)" aria-hidden="true"></i></span>
          <span class="mu-card__tipo">{{ item.tipoRotulo }}</span>
          <span class="mu-card__marcas">
            @if (!item.visualizado) {
              <geo-status tone="brand" emphasis="solid">Novo</geo-status>
            }
            @if (item.fixado) {
              <i class="pi pi-thumbtack mu-card__fixado" aria-label="Fixado no topo" title="Fixado no topo"></i>
            }
          </span>
        </header>
        <button type="button" class="mu-card__corpo" (click)="abrir(item)" [attr.aria-label]="'Ler o comunicado ' + item.titulo">
          <h3 class="mu-card__titulo">{{ item.titulo }}</h3>
          @if (item.resumo) {
            <p class="mu-card__resumo">{{ item.resumo }}</p>
          }
          <span class="mu-card__meta">
            <span><i class="pi pi-calendar" aria-hidden="true"></i>{{ publicado(item) }}</span>
            @if (item.dataFim) {
              <span><i class="pi pi-hourglass" aria-hidden="true"></i>até {{ dia(item.dataFim) }}</span>
            }
            @if (item.anexos.length) {
              <span><i class="pi pi-paperclip" aria-hidden="true"></i>{{ item.anexos.length }}</span>
            }
            @if (item.videoUrl) {
              <span><i class="pi pi-video" aria-hidden="true"></i>Vídeo</span>
            }
          </span>
        </button>
        <footer class="mu-card__rodape">
          @if (item.exigeConfirmacao) {
            @if (item.confirmado) {
              <geo-status tone="success" icon="pi pi-verified">Leitura confirmada</geo-status>
            } @else {
              <geo-status tone="warning" icon="pi pi-exclamation-circle">Confirmação pendente</geo-status>
            }
          } @else {
            <span class="mu-card__dica">{{ item.visualizado ? 'Lido' : 'Ainda não lido' }}</span>
          }
          <span class="mu-card__acoes">
            @if (item.exigeConfirmacao && !item.confirmado) {
              <geo-button size="sm" variant="success" icon="pi pi-check" label="Li e entendi" (pressed)="mural.confirmar(item)"></geo-button>
            } @else {
              <geo-icon-button icon="pi pi-eye-slash" size="icon-sm" [label]="'Não exibir mais ' + item.titulo" tooltip="Não exibir mais" (pressed)="mural.dispensar(item)"></geo-icon-button>
              <geo-button size="sm" variant="ghost" icon="pi pi-book" label="Ler" (pressed)="abrir(item)"></geo-button>
            }
          </span>
        </footer>
      </article>
    </ng-template>

    <app-comunicado-detalhe-dialog [(comunicado)]="selecionado"></app-comunicado-detalhe-dialog>

    <app-help-dialog #ajuda title="Guia da tela: Mural de comunicados">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-megaphone"></i> Como o mural funciona</h4>
        <div class="help-item">
          <div class="help-icon"><i class="pi pi-book"></i></div>
          <div class="help-text">
            <span class="help-text-title">Ler</span>
            <span class="help-text-desc">Mostra o comunicado completo, com vídeo e anexos quando houver. A abertura fica registrada para quem publicou.</span>
          </div>
        </div>
        <div class="help-item">
          <div class="help-icon"><i class="pi pi-check-circle"></i></div>
          <div class="help-text">
            <span class="help-text-title">Li e entendi</span>
            <span class="help-text-desc">Alguns comunicados exigem confirmação de leitura. Ela é a prova de comunicação usada em auditorias.</span>
          </div>
        </div>
        <div class="help-item">
          <div class="help-icon"><i class="pi pi-eye-slash"></i></div>
          <div class="help-text">
            <span class="help-text-title">Não exibir mais</span>
            <span class="help-text-desc">Remove o comunicado do seu mural. Os colegas continuam vendo.</span>
          </div>
        </div>
        <div class="help-item">
          <div class="help-icon"><i class="pi pi-filter"></i></div>
          <div class="help-text">
            <span class="help-text-title">Filtros</span>
            <span class="help-text-desc">Os cartões do topo e os tipos filtram a lista. A busca procura no título e no resumo.</span>
          </div>
        </div>
      </div>
    </app-help-dialog>
  `
})
export class MuralComponent {
  protected readonly mural = inject(MuralStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);

  protected readonly podeGerenciar = (inject(AuthService).currentUser()?.permissoes ?? []).includes('notificacao:comunicado:manage');
  protected readonly selecionado = signal<ComunicadoMuralResponse | null>(null);
  protected readonly recorte = signal<Recorte>('TODOS');
  protected readonly tipo = signal<TipoComunicado | null>(null);
  protected readonly busca = signal('');

  protected readonly naoLidos = computed(() => this.mural.itens().filter((i) => !i.visualizado).length);
  protected readonly fixados = computed(() => this.mural.itens().filter((i) => i.fixado));
  protected readonly tiposPresentes = computed(() =>
    TIPO_COMUNICADO_OPTIONS.map((o) => ({ ...o, total: this.mural.itens().filter((i) => i.tipo === o.value).length })).filter((o) => o.total > 0)
  );

  protected readonly visiveis = computed(() => {
    const recorte = this.recorte();
    const tipo = this.tipo();
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    return this.mural.itens().filter(
      (i) =>
        (recorte !== 'NAO_LIDOS' || !i.visualizado) &&
        (recorte !== 'CONFIRMAR' || (i.exigeConfirmacao && !i.confirmado)) &&
        (!tipo || i.tipo === tipo) &&
        (!termo || `${i.titulo} ${i.resumo ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    );
  });
  /** Fixados e confirmações pendentes abrem a página. */
  protected readonly destaques = computed(() => this.visiveis().filter((i) => i.fixado || (i.exigeConfirmacao && !i.confirmado)));
  protected readonly demais = computed(() => this.visiveis().filter((i) => !(i.fixado || (i.exigeConfirmacao && !i.confirmado))));

  /** `/mural/{id}` é o destino que o backend renderiza nos deeplinks de comunicado. */
  private readonly idSolicitado = signal<string | null>(null);
  private idJaTratado: string | null = null;

  constructor() {
    this.mural.carregar();

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.idJaTratado = null;
      this.idSolicitado.set(parametros.get('id'));
    });

    // Só dá para abrir depois que o mural chegou: o deeplink pode ser aberto de fora do app.
    effect(() => {
      const id = this.idSolicitado();
      const carregado = this.mural.carregado();
      const itens = this.mural.itens();
      if (!id || !carregado || this.idJaTratado === id) return;

      untracked(() => {
        this.idJaTratado = id;
        const item = itens.find((comunicado) => comunicado.id === id);
        if (item) {
          this.abrir(item);
          return;
        }
        this.notificacoes.info('Este comunicado não está mais no seu mural.');
      });
    });
  }

  protected abrir(item: ComunicadoMuralResponse): void {
    // Comunicado de apresentação MODAL já é aberto pelo mural-host no shell. Abrir o painel
    // daqui empilharia o mesmo comunicado duas vezes.
    if (this.mural.modais().some((modal) => modal.id === item.id)) return;
    this.mural.registrarVisualizacao(item);
    this.selecionado.set(item);
  }

  protected alternar(recorte: Recorte): void {
    this.recorte.set(this.recorte() === recorte ? 'TODOS' : recorte);
  }

  protected limpar(): void {
    this.recorte.set('TODOS');
    this.tipo.set(null);
    this.busca.set('');
  }

  protected gerenciar(): void {
    void this.router.navigate(['/notificacoes/admin/comunicados']);
  }

  protected publicado(item: ComunicadoMuralResponse): string {
    if (!item.dataInicio) return 'Publicado';
    const dias = Math.floor((Date.now() - new Date(item.dataInicio).getTime()) / 86_400_000);
    if (dias <= 0) return 'Publicado hoje';
    if (dias === 1) return 'Publicado ontem';
    if (dias < 7) return `Publicado há ${dias} dias`;
    return `Publicado em ${this.dia(item.dataInicio)}`;
  }

  protected dia(valor: string | null): string {
    return formatarDataHora(valor).split(' ')[0];
  }

  protected icone(tipo: TipoComunicado): string {
    return TIPO_COMUNICADO_ICONES[tipo] ?? 'pi pi-megaphone';
  }

  protected tom(tipo: TipoComunicado): GeoTone {
    return TOM_TIPO_COMUNICADO[tipo] ?? 'neutral';
  }
}
