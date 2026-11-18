import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { liveQuery } from 'dexie';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ChecklistAppItem,
  ChecklistVeiculoLocal,
  diaLocal,
  formatarPlaca,
  quandoChecklist,
  resumoProblemas
} from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  BarraTopoComponent, EstadoEnvio, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SegmentadoComponent, SeletorComponent,
  StatusEnvioComponent, VazioComponent
} from '../../ui';

const ESTADO: Record<ChecklistVeiculoLocal['statusSync'], EstadoEnvio> = {
  RASCUNHO: 'committed',
  FILA: 'queued',
  ENVIANDO: 'syncing',
  ENVIADO: 'synced',
  ERRO: 'error'
};

type Visao = 'meus' | 'veiculo';

/** Linha de checklist já enviado: do servidor ou, sem sinal, o registro deste aparelho. */
interface Enviado {
  chave: string;
  /** Id que o detalhe abre: o do aparelho quando o registro está aqui; senão, o do servidor. */
  abrir: string;
  placa: string;
  preenchidoEm: string;
  problemas: number;
  condutor: string | null;
  preenchidoPor: string | null;
  passagem: boolean;
  fotosAChegar: number;
}

type CargaServidor = 'ocioso' | 'carregando' | 'pronto' | 'sem-sinal' | 'erro';

/**
 * Checklists do veículo. "Meus": o rascunho para retomar, o que ainda está na fila deste aparelho
 * e os que a pessoa enviou de qualquer aparelho. "Do veículo": os últimos checklists de uma placa,
 * de qualquer pessoa, para ver como o veículo foi entregue. Tocar abre o detalhe.
 */
@Component({
  selector: 'app-checklist-veiculo-lista',
  standalone: true,
  imports: [
    NgTemplateOutlet, BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, SegmentadoComponent, SeletorComponent, StatusEnvioComponent, VazioComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-barra-topo titulo="Checklist do veículo" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="ces-btn-icone" [disabled]="cargaAtual() === 'carregando'" (click)="atualizar()" aria-label="Atualizar a lista">
        <ces-icone nome="atualizar" />
      </button>
      <ces-indicador-rede />
    </ces-barra-topo>

    <div class="visao">
      <ces-segmentado rotulo="Quais checklists" [opcoes]="opcoesVisao" [valor]="visao()" (valorChange)="trocarVisao($event)" />
    </div>

    <div class="conteudo">
      @if (visao() === 'meus') {
        @if (rascunho(); as r) {
          <section class="retomar" aria-label="Checklist não terminado">
            <span class="ces-selo ces-selo--destaque"><ces-icone nome="retomar" /></span>
            <span class="retomar__texto">
              <strong>Checklist não terminado</strong>
              <span>{{ r.placa ?? 'Veículo ainda não escolhido' }}{{ r.condutorNome ? ' · ' + r.condutorNome : '' }}</span>
            </span>
            <span class="retomar__acoes">
              <button type="button" class="ces-btn ces-btn--principal ces-btn--compacto" (click)="continuar()">Continuar</button>
              <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="confirmarDescarte.set(true)">Descartar</button>
            </span>
          </section>
        }

        @if (naFila().length) {
          <h2 class="ces-secao"><span>Neste aparelho, a enviar</span><span class="ces-num">{{ naFila().length }}</span></h2>
          <ul class="ces-grupo">
            @for (c of naFila(); track c.id) {
              <li>
                <button type="button" class="ces-linha ces-linha--acao" (click)="abrir(c.id)" [attr.aria-label]="'Abrir o checklist do ' + placa(c.placa)">
                  <span class="ces-selo" [class.ces-selo--atencao]="problemas(c) > 0" [class.ces-selo--ok]="!problemas(c)">
                    <ces-icone [nome]="problemas(c) ? 'alerta' : 'check'" />
                  </span>
                  <span class="ces-linha__texto">
                    <span class="ces-linha__titulo ces-num">{{ placa(c.placa) }}</span>
                    <span class="ces-linha__resumo">{{ resumo(problemas(c)) }}</span>
                    <span class="ces-linha__apoio">{{ quando(c.preenchidoEm) }}{{ c.condutorNome ? ' · ' + c.condutorNome : '' }}</span>
                    @if (c.erro) { <span class="erro">{{ c.erro }}</span> }
                    @else if (c.aviso) { <span class="aviso">{{ c.aviso }}</span> }
                  </span>
                  <ces-status-envio [estado]="estado(c)" />
                </button>
                @if (c.statusSync === 'ERRO' && c.registrado) {
                  <div class="corrigir">
                    <button type="button" class="ces-btn ces-btn--tonal ces-btn--compacto" (click)="tentarDeNovo(c)"><ces-icone nome="atualizar" [tamanho]="16" />Tentar de novo</button>
                  </div>
                }
                @if (c.statusSync === 'ERRO' && !c.registrado) {
                  <div class="corrigir">
                    <button type="button" class="ces-btn ces-btn--tonal ces-btn--compacto" (click)="corrigir(c)"><ces-icone nome="editar" [tamanho]="16" />Corrigir e enviar</button>
                    <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="descartarRecusado.set(c)">Descartar</button>
                  </div>
                }
              </li>
            }
          </ul>
        }

        @if (enviados().length) {
          <h2 class="ces-secao"><span>Enviados</span><span class="ces-num">{{ enviados().length }}</span></h2>
          @if (cargaMeus() === 'sem-sinal') { <p class="nota"><ces-icone nome="nuvem" [tamanho]="16" />Sem sinal: aparecem só os deste aparelho.</p> }
          @if (cargaMeus() === 'erro') { <p class="nota"><ces-icone nome="alerta" [tamanho]="16" />Não deu para buscar no servidor: aparecem só os deste aparelho.</p> }
          <ul class="ces-grupo">
            @for (e of enviados(); track e.chave) {
              <li><ng-container [ngTemplateOutlet]="linhaEnviado" [ngTemplateOutletContext]="{ $implicit: e, titulo: placa(e.placa), comPlaca: true }" /></li>
            }
          </ul>
        } @else if (cargaMeus() === 'carregando' && !naFila().length) {
          <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando"><div class="ces-esqueleto" style="height: 72px"></div><div class="ces-esqueleto" style="height: 72px"></div></div>
        }

        @if (carregado() && cargaMeus() !== 'carregando' && !enviados().length && !naFila().length && !rascunho()) {
          <ces-vazio icone="caminhao" titulo="Nenhum checklist seu nos últimos 30 dias"
            texto="Faça o checklist antes de usar o veículo pela primeira vez no dia e sempre que receber o veículo de outra pessoa." />
        }
      } @else {
        <div class="escolha">
          <ces-seletor rotulo="Veículo" placeholder="Escolher a placa" [opcoes]="opcoesVeiculo()" [valor]="idVeiculo()" (valorChange)="escolherVeiculo($event)" />
        </div>
        @if (!idVeiculo()) {
          <ces-vazio icone="caminhao" titulo="Escolha um veículo" texto="Aparecem os últimos checklists da placa, de qualquer pessoa: como o veículo foi entregue." />
        } @else {
          @switch (cargaVeiculo()) {
            @case ('carregando') {
              <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando"><div class="ces-esqueleto" style="height: 72px"></div><div class="ces-esqueleto" style="height: 72px"></div><div class="ces-esqueleto" style="height: 72px"></div></div>
            }
            @case ('sem-sinal') {
              <ces-vazio icone="nuvem" titulo="Precisa de internet" texto="O histórico do veículo vem do servidor. Conecte e toque em atualizar." />
            }
            @case ('erro') {
              <ces-vazio icone="alerta" titulo="Não foi possível buscar os checklists" texto="Confira a internet e tente de novo.">
                <button type="button" class="ces-btn ces-btn--tonal" (click)="carregarVeiculo()">Tentar de novo</button>
              </ces-vazio>
            }
            @default {
              @if (doVeiculo().length) {
                <h2 class="ces-secao"><span>Últimos checklists</span><span class="ces-num">{{ doVeiculo().length }}</span></h2>
                <ul class="ces-grupo">
                  @for (e of doVeiculo(); track e.chave) {
                    <li><ng-container [ngTemplateOutlet]="linhaEnviado" [ngTemplateOutletContext]="{ $implicit: e, titulo: quando(e.preenchidoEm), comPlaca: false }" /></li>
                  }
                </ul>
              } @else {
                <ces-vazio icone="caminhao" titulo="Nenhum checklist deste veículo" texto="Quando alguém fizer o checklist desta placa, ele aparece aqui." />
              }
            }
          }
        }
      }
      <div class="respiro"></div>
    </div>

    <ng-template #linhaEnviado let-e let-titulo="titulo" let-comPlaca="comPlaca">
      <button type="button" class="ces-linha ces-linha--acao" (click)="abrir(e.abrir)" [attr.aria-label]="'Abrir o checklist do ' + placa(e.placa) + ' de ' + quando(e.preenchidoEm)">
        <span class="ces-selo" [class.ces-selo--atencao]="e.problemas > 0" [class.ces-selo--ok]="!e.problemas">
          <ces-icone [nome]="e.problemas ? 'alerta' : 'check'" />
        </span>
        <span class="ces-linha__texto">
          <span class="linha__topo">
            <span class="ces-linha__titulo" [class.ces-num]="comPlaca">{{ titulo }}</span>
            @if (e.passagem) { <span class="ces-etiqueta ces-etiqueta--destaque">Recebeu o veículo</span> }
          </span>
          <span class="ces-linha__resumo">{{ resumo(e.problemas) }}</span>
          <span class="ces-linha__apoio">{{ apoio(e, comPlaca) }}</span>
          @if (e.fotosAChegar) { <span class="aviso">{{ e.fotosAChegar === 1 ? '1 foto ainda no celular de quem preencheu' : e.fotosAChegar + ' fotos ainda no celular de quem preencheu' }}</span> }
        </span>
        <ces-icone class="abrir" nome="avancar" [tamanho]="18" />
      </button>
    </ng-template>

    <div class="doca">
      @if (rascunho()) {
        <button type="button" class="ces-btn ces-btn--principal ces-btn--bloco" (click)="continuar()"><ces-icone nome="retomar" />Continuar checklist</button>
      } @else {
        <button type="button" class="ces-btn ces-btn--principal ces-btn--bloco" (click)="novo()"><ces-icone nome="mais" />Fazer checklist</button>
      }
    </div>

    <ces-folha [aberta]="!!descartarRecusado()" (fechar)="descartarRecusado.set(null)" titulo="Descartar o checklist recusado?"
      descricao="Ele sai do aparelho e não vai para o servidor. Se o veículo ainda vai ser usado, faça um novo.">
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="descartarRecusado.set(null)">Manter</button>
        <button type="button" class="ces-btn ces-btn--perigo" (click)="descartarErro()">Descartar</button>
      </div>
    </ces-folha>

    <ces-folha [aberta]="confirmarDescarte()" (fechar)="confirmarDescarte.set(false)" titulo="Descartar o checklist?"
      descricao="As respostas e fotos deste checklist saem do aparelho.">
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="confirmarDescarte.set(false)">Manter</button>
        <button type="button" class="ces-btn ces-btn--perigo" (click)="descartar()">Descartar</button>
      </div>
    </ces-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .conteudo { flex: 1; }
    .visao { padding: var(--ces-e2) var(--ces-e3) 0; }
    .escolha { margin: var(--ces-e3) var(--ces-e3) 0; background: var(--ces-superficie); border-radius: var(--ces-r-grupo); overflow: hidden; }
    .retomar { display: flex; align-items: center; gap: var(--ces-e3); margin: var(--ces-e3) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4);
      background: var(--ces-superficie); border-radius: var(--ces-r-grupo); box-shadow: inset 4px 0 0 var(--ces-destaque); flex-wrap: wrap; }
    .retomar__texto { flex: 1; min-width: 12rem; display: grid; gap: 2px; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .retomar__texto strong { font: var(--ces-t-corpo-forte); color: var(--ces-texto); }
    .retomar__acoes { display: flex; gap: var(--ces-e2); }
    .linha__topo { display: flex; align-items: center; gap: var(--ces-e2); flex-wrap: wrap; }
    .abrir { color: var(--ces-texto-2); }
    .erro { color: var(--ces-erro); font: var(--ces-t-apoio); font-weight: 600; }
    .aviso { color: var(--ces-atencao); font: var(--ces-t-apoio); }
    .nota { display: flex; align-items: flex-start; gap: 6px; margin: 0 var(--ces-e5) var(--ces-e2); font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .nota ces-icone { flex: none; margin-top: 2px; }
    .corrigir { display: flex; gap: var(--ces-e2); padding: 0 var(--ces-e4) var(--ces-e3) calc(var(--ces-e4) + 40px + var(--ces-e3)); }
    .respiro { height: 96px; }
    .doca { position: sticky; bottom: 0; padding: var(--ces-e3) var(--ces-e4) calc(var(--ces-e3) + var(--ces-safe-base)); background: var(--ces-fundo); }
  `]
})
export class ChecklistVeiculoListaComponent implements OnInit {
  private readonly servico = inject(ChecklistVeiculoService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly opcoesVisao = [
    { valor: 'meus' as Visao, rotulo: 'Meus' },
    { valor: 'veiculo' as Visao, rotulo: 'Do veículo' }
  ];
  protected readonly placa = formatarPlaca;
  protected readonly quando = quandoChecklist;
  protected readonly resumo = resumoProblemas;

  /** Visão e placa ficam na URL: voltar do detalhe abre no mesmo lugar. */
  protected readonly visao = signal<Visao>(this.rota.snapshot.queryParamMap.get('ver') === 'veiculo' ? 'veiculo' : 'meus');
  protected readonly idVeiculo = signal<string | null>(this.rota.snapshot.queryParamMap.get('veiculo'));

  protected readonly todos = signal<ChecklistVeiculoLocal[]>([]);
  protected readonly carregado = signal(false);
  protected readonly confirmarDescarte = signal(false);
  protected readonly descartarRecusado = signal<ChecklistVeiculoLocal | null>(null);
  private readonly meusServidor = signal<ChecklistAppItem[]>([]);
  protected readonly cargaMeus = signal<CargaServidor>('ocioso');
  private readonly veiculoServidor = signal<ChecklistAppItem[]>([]);
  protected readonly cargaVeiculo = signal<CargaServidor>('ocioso');

  protected readonly rascunho = computed(() => this.todos().find((c) => c.statusSync === 'RASCUNHO') ?? null);
  protected readonly naFila = computed(() => this.todos().filter((c) => c.statusSync === 'FILA' || c.statusSync === 'ENVIANDO' || c.statusSync === 'ERRO'));
  private readonly porIdAparelho = computed(() => new Map(this.todos().map((c) => [c.id, c])));

  /** Enviados: os do servidor e, sem sinal (ou mais antigos), os deste aparelho que ele não trouxe. */
  protected readonly enviados = computed<Enviado[]>(() => {
    const locais = this.porIdAparelho();
    const naFila = new Set(this.naFila().map((c) => c.id));
    const doServidor = this.meusServidor().filter((i) => !naFila.has(i.idAparelho)).map((i) => this.deServidor(i, locais));
    const vistos = new Set(this.meusServidor().map((i) => i.idAparelho));
    const soLocais = this.todos()
      .filter((c) => c.statusSync === 'ENVIADO' && !vistos.has(c.id))
      .map<Enviado>((c) => ({
        chave: c.id, abrir: c.id, placa: c.placa ?? '', preenchidoEm: c.preenchidoEm ?? c.criadoEm, problemas: this.problemas(c),
        condutor: c.condutorNome, preenchidoPor: null, passagem: false, fotosAChegar: 0
      }));
    return [...doServidor, ...soLocais].sort((a, b) => b.preenchidoEm.localeCompare(a.preenchidoEm));
  });
  protected readonly doVeiculo = computed(() => this.veiculoServidor().map((i) => this.deServidor(i, this.porIdAparelho())));
  protected readonly cargaAtual = computed(() => (this.visao() === 'meus' ? this.cargaMeus() : this.cargaVeiculo()));

  protected readonly opcoesVeiculo = computed<OpcaoSeletor[]>(() =>
    (this.servico.catalogo()?.veiculos ?? []).map((v) => ({
      valor: v.idVeiculo,
      rotulo: formatarPlaca(v.placa),
      apoio: [v.descricao, v.baseNome].filter(Boolean).join(' · ') || null
    })));

  protected readonly subtitulo = computed(() => {
    const hoje = diaLocal();
    const feitos = [...this.naFila().map((c) => c.preenchidoEm), ...this.enviados().map((e) => e.preenchidoEm)]
      .filter((iso): iso is string => !!iso && diaLocal(new Date(iso)) === hoje)
      .sort((a, b) => b.localeCompare(a));
    if (!feitos.length) return 'Nenhum seu hoje';
    const hora = new Date(feitos[0]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${feitos.length} seu${feitos.length > 1 ? 's' : ''} hoje · último às ${hora}`;
  });

  constructor() {
    // Ao abrir "Do veículo" sem placa, sugere a do último checklist da pessoa.
    effect(() => {
      if (this.visao() !== 'veiculo' || this.idVeiculo()) return;
      const ultimo = untracked(() => this.ultimoVeiculo());
      if (ultimo) untracked(() => this.escolherVeiculo(ultimo));
    });
  }

  ngOnInit(): void {
    // A tela acompanha a fila: na fila → enviando → enviado (ou recusado) sem precisar reabrir.
    const assinatura = liveQuery(() => this.servico.listar()).subscribe({
      next: (todos) => {
        const enviouAgora = todos.some((c) => c.statusSync === 'ENVIADO' && this.todos().find((a) => a.id === c.id)?.statusSync !== 'ENVIADO');
        this.todos.set(todos);
        this.carregado.set(true);
        if (enviouAgora && this.carregado()) this.carregarMeus();
      }
    });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
    void this.sync.syncOutbox().catch(() => undefined);
    this.carregarMeus();
    if (this.idVeiculo()) this.carregarVeiculo();
  }

  protected estado(c: ChecklistVeiculoLocal): EstadoEnvio {
    return ESTADO[c.statusSync];
  }

  protected problemas(c: ChecklistVeiculoLocal): number {
    return c.problemas ?? c.respostas.filter((r) => r.conforme === false).length;
  }

  protected apoio(e: Enviado, comPlaca: boolean): string {
    const partes = comPlaca ? [quandoChecklist(e.preenchidoEm)] : [];
    if (e.condutor) partes.push(e.condutor);
    // Em "Meus" quem preencheu é a própria pessoa; no histórico do veículo, interessa saber.
    if (!comPlaca && e.preenchidoPor && e.preenchidoPor !== e.condutor) partes.push(`por ${e.preenchidoPor}`);
    return partes.join(' · ');
  }

  protected trocarVisao(visao: Visao): void {
    this.visao.set(visao);
    this.guardarNaUrl();
  }

  protected escolherVeiculo(id: string | null): void {
    this.idVeiculo.set(id);
    this.guardarNaUrl();
    this.carregarVeiculo();
  }

  protected atualizar(): void {
    if (!this.rede.isOnline()) {
      this.toast.warning('Sem sinal agora. A lista atualiza quando a internet voltar.');
      return;
    }
    if (this.visao() === 'meus') this.carregarMeus();
    else this.carregarVeiculo();
  }

  protected carregarMeus(): void {
    if (!this.rede.isOnline()) {
      this.cargaMeus.set('sem-sinal');
      return;
    }
    this.cargaMeus.set('carregando');
    this.servico.meusNoServidor().then(
      (itens) => {
        this.meusServidor.set(itens);
        this.cargaMeus.set('pronto');
      },
      () => this.cargaMeus.set('erro')
    );
  }

  protected carregarVeiculo(): void {
    const id = this.idVeiculo();
    if (!id) return;
    if (!this.rede.isOnline()) {
      this.cargaVeiculo.set('sem-sinal');
      return;
    }
    this.cargaVeiculo.set('carregando');
    this.servico.doVeiculo(id).then(
      (itens) => {
        if (this.idVeiculo() !== id) return;
        this.veiculoServidor.set(itens);
        this.cargaVeiculo.set('pronto');
      },
      () => this.cargaVeiculo.set('erro')
    );
  }

  protected abrir(id: string): void {
    void this.router.navigate(['/checklist', id]);
  }

  protected voltar(): void {
    void this.router.navigateByUrl('/frota');
  }

  protected novo(): void {
    void this.router.navigate(['/checklist/novo']);
  }

  protected continuar(): void {
    void this.router.navigate(['/checklist/novo']);
  }

  protected async descartar(): Promise<void> {
    const r = this.rascunho();
    if (r) await this.servico.descartar(r.id);
    this.confirmarDescarte.set(false);
  }

  protected async corrigir(c: ChecklistVeiculoLocal): Promise<void> {
    if (await this.servico.reabrir(c.id)) {
      void this.router.navigate(['/checklist/novo']);
      return;
    }
    this.toast.warning('Termine ou descarte o checklist não terminado antes de corrigir este.');
  }

  /** O checklist já está no servidor; falta só a foto que falhou. */
  protected async tentarDeNovo(c: ChecklistVeiculoLocal): Promise<void> {
    await this.servico.tentarDeNovo(c.id);
    void this.sync.syncOutbox().catch(() => undefined);
  }

  protected async descartarErro(): Promise<void> {
    const c = this.descartarRecusado();
    if (c) await this.servico.descartarRecusado(c.id);
    this.descartarRecusado.set(null);
  }

  private deServidor(i: ChecklistAppItem, locais: Map<string, ChecklistVeiculoLocal>): Enviado {
    const c = i.checklist;
    return {
      chave: c.id,
      abrir: locais.has(i.idAparelho) ? i.idAparelho : c.id,
      placa: c.placa,
      preenchidoEm: c.preenchidoEm,
      problemas: c.problemas,
      condutor: c.condutorNome,
      preenchidoPor: c.preenchidoPor,
      passagem: c.passagemVeiculo,
      fotosAChegar: c.fotosAChegar
    };
  }

  private ultimoVeiculo(): string | null {
    const local = this.todos().find((c) => c.idVeiculo && c.statusSync !== 'RASCUNHO');
    const doServidor = this.meusServidor()[0]?.checklist;
    if (local && doServidor) return (local.preenchidoEm ?? '') > doServidor.preenchidoEm ? local.idVeiculo : doServidor.idVeiculo;
    return local?.idVeiculo ?? doServidor?.idVeiculo ?? null;
  }

  private guardarNaUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.rota,
      queryParams: { ver: this.visao() === 'veiculo' ? 'veiculo' : null, veiculo: this.visao() === 'veiculo' ? this.idVeiculo() : null },
      replaceUrl: true
    });
  }
}
