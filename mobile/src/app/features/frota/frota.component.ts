import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { liveQuery } from 'dexie';
import { emAndamento, ordenarParaEquipe, podeRegistrarRealizado, situacaoParaEquipe } from '../../core/frota/abastecimento.models';
import { AbastecimentoService } from '../../core/frota/abastecimento.service';
import { AbastecimentoLocal } from '../../core/frota/abastecimento.models';
import { ChecklistVeiculoLocal, diaLocal, formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { MeuVeiculoService, TEXTO_ORIGEM, VeiculoAtual } from '../../core/frota/meu-veiculo';
import { TurnoService } from '../../core/turno/turno.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { AuthService } from '../../core/auth/auth.service';
import { AprovacaoAbastecimentoService } from '../../core/frota/aprovacao-abastecimento.service';
import { IconeComponent, IndicadorRedeComponent, TituloGrandeComponent } from '../../ui';

/**
 * Aba Frota: checklist, abastecimento, a ficha e os documentos do veículo são o mesmo assunto para quem
 * dirige, então ficam num destino só, como o Material. "Novo" lança; "Consultar" acompanha.
 */
@Component({
  selector: 'app-frota',
  standalone: true,
  imports: [RouterLink, TituloGrandeComponent, IconeComponent, IndicadorRedeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-titulo-grande titulo="Frota" subtitulo="Checklist, abastecimento e veículo">
      <ces-indicador-rede />
    </ces-titulo-grande>

    <section class="atual" aria-label="Seu veículo">
      @if (atual(); as a) {
        <div class="atual__topo">
          <span class="ces-selo ces-selo--destaque"><ces-icone nome="caminhao" /></span>
          <span class="atual__texto">
            <span class="atual__rotulo">Seu veículo</span>
            <span class="atual__placa ces-num">{{ placa(a.placa) }}</span>
            @if (a.descricao) { <span class="atual__apoio">{{ a.descricao }}</span> }
          </span>
        </div>
        <p class="atual__origem"><ces-icone nome="info" [tamanho]="16" />{{ a.origem }}{{ a.base ? ' · ' + a.base : '' }}</p>
        <p class="atual__checklist" [class.atual__checklist--ok]="!!a.checklistHoje" [class.atual__checklist--falta]="!a.checklistHoje">
          <ces-icone [nome]="a.checklistHoje ? 'check' : 'alerta'" [tamanho]="16" />{{ a.checklistHoje ?? 'Checklist de hoje ainda não feito neste celular' }}
        </p>
        <div class="atual__acoes">
          <a class="ces-btn ces-btn--tonal ces-btn--compacto" routerLink="/frota/veiculo" [queryParams]="{ veiculo: a.idVeiculo }"><ces-icone nome="caminhao" [tamanho]="16" />Ficha</a>
          <a class="ces-btn ces-btn--tonal ces-btn--compacto" routerLink="/frota/documentos" [queryParams]="{ veiculo: a.idVeiculo }"><ces-icone nome="documento" [tamanho]="16" />Documentos</a>
          @if (!a.checklistHoje) {
            <a class="ces-btn ces-btn--principal ces-btn--compacto" routerLink="/checklist/novo" [queryParams]="{ veiculo: a.idVeiculo }"><ces-icone nome="check" [tamanho]="16" />Fazer checklist</a>
          }
        </div>
      } @else {
        <div class="atual__topo">
          <span class="ces-selo"><ces-icone nome="caminhao" /></span>
          <span class="atual__texto">
            <span class="atual__rotulo">Seu veículo</span>
            <span class="atual__vazio">Nenhum veículo com você agora</span>
            <span class="atual__apoio">Aparece quando a equipe tem veículo ou abre o turno, ou quando o gestor da frota vincula um veículo a você. Ao fazer o checklist, escolha a placa.</span>
          </span>
        </div>
      }
    </section>

    @if (liberado(); as a) {
      <a class="destaque" [routerLink]="['/abastecimento', a.id, 'realizado']">
        <span class="ces-selo ces-selo--ok"><ces-icone nome="combustivel" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Abastecimento liberado</span>
          <span class="ces-linha__apoio">{{ placa(a.placa) }} no {{ a.servidor?.posto }} · registre depois de abastecer</span></span>
        <ces-icone nome="avancar" [tamanho]="18" />
      </a>
    }

    @if (podeAprovar()) {
      <a class="destaque" [class.destaque--aprovar]="(paraAprovar() ?? 0) > 0"
        [class.destaque--neutro]="!paraAprovar()" routerLink="/abastecimento/aprovacoes">
        <span class="ces-selo" [class.ces-selo--atencao]="(paraAprovar() ?? 0) > 0"><ces-icone nome="check" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Abastecimentos da carteira</span>
          <span class="ces-linha__apoio">{{ paraAprovar() === null ? (rede.isOnline() ? 'Pedidos das placas da sua carteira' : 'Precisa de internet') : paraAprovar() === 0 ? 'Nada para aprovar · acompanhe os pedidos' : paraAprovar() === 1 ? '1 pedido esperando você' : paraAprovar() + ' pedidos esperando você' }}</span></span>
        <ces-icone nome="avancar" [tamanho]="18" />
      </a>
    }

    <h2 class="ces-secao">Novo</h2>
    <ul class="ces-grupo">
      <li><a class="ces-linha ces-linha--acao" routerLink="/checklist/novo">
        <span class="ces-selo ces-selo--destaque"><ces-icone [nome]="rascunhoChecklist() ? 'retomar' : 'check'" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">{{ rascunhoChecklist() ? 'Continuar checklist' : 'Fazer checklist' }}</span>
          <span class="ces-linha__apoio">{{ rascunhoChecklist() ? 'Você parou no meio: retome de onde estava' : 'Antes de usar o veículo e ao receber de outra pessoa' }}</span></span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="ces-linha ces-linha--acao" routerLink="/abastecimento/novo">
        <span class="ces-selo ces-selo--destaque"><ces-icone nome="combustivel" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Pedir abastecimento</span>
          <span class="ces-linha__apoio">O que precisa e o destino; o gestor define a quantidade</span></span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>

    <h2 class="ces-secao">Consultar</h2>
    <ul class="ces-grupo">
      <li><a class="ces-linha ces-linha--acao" routerLink="/checklist">
        <span class="ces-selo" [class.ces-selo--ok]="!!checklistHoje()" [class.ces-selo--atencao]="!checklistHoje()">
          <ces-icone [nome]="checklistHoje() ? 'check' : 'caminhao'" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Checklists</span>
          <span class="ces-linha__apoio">{{ checklistHoje() ?? 'Nenhum hoje neste aparelho' }}</span>
          @if (checklistsNaFila()) { <span class="ces-linha__apoio ces-num">{{ checklistsNaFila() }} aguardando envio</span> }</span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="ces-linha ces-linha--acao" routerLink="/abastecimento">
        <span class="ces-selo" [class.ces-selo--ok]="abastecimento().tom === 'ok'" [class.ces-selo--atencao]="abastecimento().tom === 'atencao'"
          [class.ces-selo--erro]="abastecimento().tom === 'erro'"><ces-icone nome="combustivel" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Abastecimentos</span>
          <span class="ces-linha__apoio">{{ abastecimento().texto }}</span></span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="ces-linha ces-linha--acao" routerLink="/frota/veiculo">
        <span class="ces-selo"><ces-icone nome="caminhao" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Ficha do veículo</span>
          <span class="ces-linha__apoio">Se pode rodar, manutenção, problemas e revisões</span></span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="ces-linha ces-linha--acao" routerLink="/frota/documentos">
        <span class="ces-selo"><ces-icone nome="documento" /></span>
        <span class="ces-linha__texto"><span class="ces-linha__titulo">Documentos do veículo</span>
          <span class="ces-linha__apoio">CRLV, tacógrafo e laudos para a fiscalização</span></span>
        <ces-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>
  `,
  styles: [`
    :host { display: block; padding-bottom: var(--ces-e6); }
    .destaque { display: flex; align-items: center; gap: var(--ces-e3); margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4);
      min-height: 72px; border-radius: var(--ces-r-grupo); background: var(--ces-ok-suave); color: var(--ces-texto); text-decoration: none; }
    .destaque:active { transform: scale(.99); }
    .destaque--aprovar { background: var(--ces-atencao-suave, var(--ces-superficie)); }
    .destaque--neutro { background: var(--ces-superficie); }
    .destaque .ces-linha__texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .atual { margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e4); border-radius: var(--ces-r-grupo); background: var(--ces-superficie);
      display: grid; gap: var(--ces-e3); }
    .atual__topo { display: flex; align-items: center; gap: var(--ces-e3); }
    .atual__texto { display: grid; gap: 2px; min-width: 0; }
    .atual__rotulo { font: var(--ces-t-secao); color: var(--ces-texto-2); text-transform: uppercase; letter-spacing: .04em; }
    .atual__placa { font: var(--ces-t-numero); color: var(--ces-texto); }
    .atual__vazio { font: var(--ces-t-corpo-forte); color: var(--ces-texto); }
    .atual__apoio { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .atual__origem, .atual__checklist { display: flex; align-items: center; gap: var(--ces-e2); margin: 0; font: var(--ces-t-apoio); font-size: .875rem; color: var(--ces-texto-2); }
    .atual__checklist--ok { color: var(--ces-ok); font-weight: 600; }
    .atual__checklist--falta { color: var(--ces-atencao); font-weight: 600; }
    .atual__acoes { display: flex; flex-wrap: wrap; gap: var(--ces-e2); }
    .atual__acoes .ces-btn { flex: 1; min-width: 140px; text-decoration: none; }
  `],
})
export class FrotaComponent implements OnInit {
  private readonly checklists = inject(ChecklistVeiculoService);
  private readonly abastecimentos = inject(AbastecimentoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly meuVeiculo = inject(MeuVeiculoService);
  private readonly turnos = inject(TurnoService);
  protected readonly rede = inject(ConnectivityService);
  private readonly auth = inject(AuthService);
  private readonly aprovacoes = inject(AprovacaoAbastecimentoService);
  /** Administrativo que aprova abastecimento: a fila dele aparece aqui. O campo só pede. */
  protected readonly podeAprovar = this.auth.podeAprovarAbastecimento;
  protected readonly paraAprovar = signal<number | null>(null);

  private readonly veiculoAtual = signal<VeiculoAtual | null>(null);
  /** Veículo atual com o que a pessoa precisa ver de relance: placa, de onde veio e o checklist de hoje. */
  protected readonly atual = computed(() => {
    const a = this.veiculoAtual();
    const v = a ? this.checklists.catalogo()?.veiculos.find((x) => x.idVeiculo === a.idVeiculo) : null;
    if (!a || !v) return null;
    const hoje = diaLocal();
    const feito = this.todosChecklists()
      .filter((c) => c.idVeiculo === a.idVeiculo && c.statusSync !== 'RASCUNHO' && c.statusSync !== 'ERRO' && c.preenchidoEm
        && diaLocal(new Date(c.preenchidoEm)) === hoje)
      .sort((x, y) => (y.preenchidoEm ?? '').localeCompare(x.preenchidoEm ?? ''))[0];
    return {
      idVeiculo: a.idVeiculo,
      placa: v.placa,
      descricao: v.descricao,
      base: v.baseNome,
      origem: TEXTO_ORIGEM[a.origem],
      checklistHoje: feito
        ? `Checklist feito hoje às ${new Date(feito.preenchidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : null
    };
  });

  private readonly todosChecklists = signal<ChecklistVeiculoLocal[]>([]);
  private readonly todosAbastecimentos = signal<AbastecimentoLocal[]>([]);

  protected readonly rascunhoChecklist = computed(() => this.todosChecklists().some((c) => c.statusSync === 'RASCUNHO'));
  protected readonly checklistsNaFila = computed(() =>
    this.todosChecklists().filter((c) => c.statusSync === 'FILA' || c.statusSync === 'ENVIANDO').length);
  /** "Feito hoje às 07:12 · ABC1D23", ou nulo se ainda não houve checklist hoje neste aparelho. */
  protected readonly checklistHoje = computed(() => {
    const hoje = diaLocal();
    const feito = this.todosChecklists()
      .filter((c) => c.statusSync !== 'RASCUNHO' && c.preenchidoEm && diaLocal(new Date(c.preenchidoEm)) === hoje)
      .sort((a, b) => (b.preenchidoEm ?? '').localeCompare(a.preenchidoEm ?? ''))[0];
    return feito
      ? `Feito hoje às ${new Date(feito.preenchidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${formatarPlaca(feito.placa)}`
      : null;
  });

  private readonly abertos = computed(() =>
    ordenarParaEquipe(this.todosAbastecimentos().filter((a) => emAndamento(a) || (a.statusSync === 'ERRO' && !a.registrado))));
  protected readonly liberado = computed(() => this.abertos().find((a) => podeRegistrarRealizado(a)) ?? null);
  protected readonly abastecimento = computed<{ texto: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' }>(() => {
    const primeiro = this.abertos()[0];
    if (!primeiro) return { texto: 'Nenhum pedido em andamento', tom: 'neutro' };
    const s = situacaoParaEquipe(primeiro);
    const mais = this.abertos().length > 1 ? ` · +${this.abertos().length - 1}` : '';
    return { texto: `${s.rotulo} · ${formatarPlaca(primeiro.placa)}${mais}`, tom: s.tom === 'erro' ? 'erro' : podeRegistrarRealizado(primeiro) ? 'ok' : 'atencao' };
  });

  constructor() {
    // Turno aberto/fechado ou catálogo atualizado mudam o veículo atual.
    effect(() => {
      const veiculos = this.checklists.catalogo()?.veiculos ?? [];
      this.turnos.turnoAtivo();
      this.todosChecklists();
      untracked(() => void this.meuVeiculo.atual(veiculos).then((a) => this.veiculoAtual.set(a)));
    });
  }

  ngOnInit(): void {
    // A aba acompanha a fila e o servidor sem precisar reabrir.
    const a = liveQuery(() => this.checklists.listar()).subscribe({ next: (lista) => this.todosChecklists.set(lista) });
    const b = liveQuery(() => this.abastecimentos.listar()).subscribe({ next: (lista) => this.todosAbastecimentos.set(lista) });
    this.destroyRef.onDestroy(() => { a.unsubscribe(); b.unsubscribe(); });
    if (this.rede.isOnline()) void this.abastecimentos.atualizarDoServidor().catch(() => undefined);
    if (this.rede.isOnline() && this.podeAprovar()) {
      void this.aprovacoes.fila().then((f) => this.paraAprovar.set(f.length)).catch(() => undefined);
    }
  }

  protected placa(p: string | null | undefined): string {
    return formatarPlaca(p);
  }
}
