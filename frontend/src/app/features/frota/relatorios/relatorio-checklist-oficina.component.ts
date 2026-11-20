import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GeoAsyncStateComponent, GeoStatusComponent } from '@geo/ui';
import { map } from 'rxjs/operators';
import {
  OrdemServicoDetalhe,
  ROTULO_CRITICIDADE,
  ROTULO_TIPO_MANUTENCAO,
  ROTULO_TIPO_OFICINA,
  TOM_CRITICIDADE,
  formatarMedicao,
  identificacaoOs,
  rotuloOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { FrotaRelatorioCabecalhoComponent } from './frota-relatorio-cabecalho.component';

/** Uma linha do roteiro: o plano de onde veio e a tarefa, sem a numeração copiada na abertura. */
interface TarefaRoteiro {
  plano: string;
  tarefa: string;
}

/**
 * Checklist da OS para a oficina, para imprimir e entregar ao mecânico: o roteiro dos planos
 * preventivos e os itens de manutenção, cada um com OK / Não OK / N/A e espaço para anotar, e as
 * assinaturas do mecânico e de quem confere. Depois de assinado, volta como anexo da OS.
 */
@Component({
  selector: 'app-relatorio-checklist-oficina',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoAsyncStateComponent, GeoStatusComponent, FrotaRelatorioCabecalhoComponent],
  styleUrls: ['./frota-relatorio.css'],
  styles: `
    .chk-tabela th.chk-col, .chk-tabela td.chk-col { width: 3.25rem; text-align: center; }
    .chk-tabela td.chk-num { width: 2rem; color: var(--geo-foreground-muted); font-variant-numeric: tabular-nums; }
    .chk-tabela td.chk-obs { min-width: 9rem; }
    .chk-tabela td { vertical-align: middle; }
    .chk-caixa {
      display: inline-block; width: 1.05rem; height: 1.05rem;
      border: 1.5px solid var(--geo-border-strong); border-radius: 0.2rem; background: var(--geo-surface);
    }
    .chk-linha { display: block; height: 1.25rem; border-bottom: 1px dotted var(--geo-border-strong); }
    .chk-campos { display: grid; gap: 0.75rem; }
    @media (min-width: 768px) { .chk-campos { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .chk-campo { display: grid; gap: 0.25rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .chk-campo .chk-linha { height: 1.5rem; }
    .chk-anotacoes { display: grid; gap: 0.25rem; }
    .chk-anotacoes .chk-linha { height: 1.75rem; }
    .chk-plano { font-weight: 600; color: var(--geo-foreground); }
    @media print {
      .chk-campos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .chk-tabela tr { break-inside: avoid; }
    }
  `,
  template: `
    @if (carregando()) {
      <div class="rel-estado">
        <geo-async-state state="loading" title="Montando o checklist da oficina..." description="Consultando o roteiro e os itens da OS."></geo-async-state>
      </div>
    } @else if (erro()) {
      <div class="rel-estado">
        <geo-async-state state="error" title="Checklist indisponível" [description]="erro()!" actionLabel="Tentar novamente" (action)="carregar(id())"></geo-async-state>
      </div>
    } @else if (detalhe(); as d) {
      <article class="rel">
        <app-frota-relatorio-cabecalho area="Oficina" [titulo]="'Checklist da ' + rotuloOs(d.ordem.numero)">
          <span><strong>{{ rotuloTipo[d.ordem.tipoManutencao] }}</strong></span>
          <span>·</span>
          <geo-status [tone]="tomCriticidade[d.ordem.criticidade]" emphasis="outline">{{ rotuloCriticidade[d.ordem.criticidade] }}</geo-status>
          <span>·</span>
          <span>Emitido em <strong>{{ emitidoEm | date: 'dd/MM/yyyy HH:mm' }}</strong></span>
        </app-frota-relatorio-cabecalho>

        <section class="rel-dados" aria-label="Dados da OS">
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-car" aria-hidden="true"></i>{{ d.ordem.veicular ? 'Veículo' : 'Equipamento' }}</div>
            <div class="kv"><span class="kv-l">Identificação</span><span class="kv-v">{{ identificacao() }}</span></div>
            <div class="kv"><span class="kv-l">Base</span><span class="kv-v">{{ d.ordem.base ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} na abertura</span>
              <span class="kv-v">{{ formatarMedicao(d.ordem.kmAbertura, d.ordem.unidadeMedicao) }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-wrench" aria-hidden="true"></i>Oficina</div>
            <div class="kv"><span class="kv-l">Oficina</span><span class="kv-v">{{ d.ordem.oficinaNome ? rotuloOficina[d.ordem.tipoOficina] + ' · ' + d.ordem.oficinaNome : d.ordem.oficina }}</span></div>
            <div class="kv"><span class="kv-l">Agendada para</span><span class="kv-v">{{ (d.ordem.agendadaPara | date: 'dd/MM/yyyy HH:mm') || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Local</span><span class="kv-v">{{ d.ordem.localAgendamento ?? '—' }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-list-check" aria-hidden="true"></i>Escopo</div>
            <div class="kv"><span class="kv-l">{{ d.preventivas.length === 1 ? 'Plano' : 'Planos' }}</span><span class="kv-v">{{ planos() || '—' }}</span></div>
            <div class="kv"><span class="kv-l">Tarefas</span><span class="kv-v">{{ tarefas().length }}</span></div>
            <div class="kv"><span class="kv-l">Itens</span><span class="kv-v">{{ d.itens.length }}</span></div>
          </div>
        </section>

        @if (!d.preventivas.length) {
          <section class="rel-secao">
            <div class="rel-secao__titulo"><h2>Problema relatado</h2></div>
            <div class="rel-caixa"><p class="rel-texto">{{ d.ordem.descricao }}</p></div>
          </section>
        }

        @if (tarefas().length) {
          <section class="rel-secao">
            <div class="rel-secao__titulo"><h2>Roteiro de verificação</h2><span>Marque uma opção por linha</span></div>
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela chk-tabela">
                <thead>
                  <tr><th>#</th><th>Verificação</th><th class="chk-col">OK</th><th class="chk-col">Não OK</th><th class="chk-col">N/A</th><th>Observação</th></tr>
                </thead>
                <tbody>
                  @for (t of tarefas(); track $index) {
                    <tr>
                      <td class="chk-num">{{ $index + 1 }}</td>
                      <td>
                        {{ t.tarefa }}
                        @if (d.preventivas.length > 1) {<span class="rel-tabela__sub">{{ t.plano }}</span>}
                      </td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-obs"><span class="chk-linha"></span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Itens de manutenção</h2><span>{{ d.itens.length }} {{ d.itens.length === 1 ? 'item' : 'itens' }}</span></div>
          @if (d.itens.length) {
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela chk-tabela">
                <thead>
                  <tr><th>Item</th><th class="chk-col">Verificado</th><th class="chk-col">Trocado</th><th class="chk-col">N/A</th><th>Peça usada / observação</th></tr>
                </thead>
                <tbody>
                  @for (i of d.itens; track i.idItem) {
                    <tr>
                      <td><strong>{{ i.nome }}</strong><span class="rel-tabela__sub">{{ i.naturezaRotulo }}</span></td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-col"><span class="chk-caixa" aria-hidden="true"></span></td>
                      <td class="chk-obs"><span class="chk-linha"></span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="rel-vazio">A OS não tem itens de manutenção.</p>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Execução</h2></div>
          <div class="rel-caixa" style="display: grid; gap: 1rem">
            <div class="chk-campos">
              <div class="chk-campo">{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} na entrada<span class="chk-linha"></span></div>
              <div class="chk-campo">Início (data e hora)<span class="chk-linha"></span></div>
              <div class="chk-campo">Término (data e hora)<span class="chk-linha"></span></div>
            </div>
            <div class="chk-anotacoes">
              <span class="chk-campo">Observações gerais e peças trocadas</span>
              <span class="chk-linha"></span>
              <span class="chk-linha"></span>
              <span class="chk-linha"></span>
            </div>
          </div>
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Assinaturas</h2></div>
          <div class="rel-caixa" style="display: grid; gap: 1rem">
            <p class="rel-texto">
              Declaro que as verificações marcadas acima foram feitas no {{ d.ordem.veicular ? 'veículo' : 'equipamento' }}
              {{ identificacao() }} e que os itens apontados como Não OK foram informados à gestão da frota.
            </p>
            <div class="rel-assinaturas">
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Mecânico responsável</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">Nome: ______________________________</span>
                <span class="rel-assinatura__data">Data: ____/____/________</span>
              </div>
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Conferido por (gestão da frota)</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">Nome: ______________________________</span>
                <span class="rel-assinatura__data">Data: ____/____/________</span>
              </div>
            </div>
          </div>
        </section>

        <footer class="rel-rodape">
          <span>Depois de assinado, anexe este checklist em <strong>Anexos e notas</strong> da {{ rotuloOs(d.ordem.numero) }} e conclua a OS.</span>
          <span class="rel-rodape__marca">Documento emitido eletronicamente via Sistema GEO · EMPRESA Frota</span>
        </footer>
      </article>

      <div class="rel-acoes" role="toolbar" aria-label="Ações do checklist">
        <div class="rel-acoes__linha">
          <button type="button" class="rel-acao rel-acao--so-desktop" (click)="voltar()"><i class="pi pi-arrow-left" aria-hidden="true"></i>Voltar</button>
          <button type="button" class="rel-acao rel-acao--forte" (click)="imprimir()"><i class="pi pi-print" aria-hidden="true"></i>Imprimir</button>
          <button type="button" class="rel-acao rel-acao--primaria" (click)="abrirFicha(d.ordem.id)"><i class="pi pi-external-link" aria-hidden="true"></i>Abrir a OS</button>
        </div>
      </div>
    }
  `
})
export class RelatorioChecklistOficinaComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  private readonly service = inject(FrotaService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detalhe = signal<OrdemServicoDetalhe | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly emitidoEm = new Date();

  protected readonly rotuloOs = rotuloOs;
  protected readonly rotuloTipo = ROTULO_TIPO_MANUTENCAO;
  protected readonly rotuloOficina = ROTULO_TIPO_OFICINA;
  protected readonly rotuloCriticidade = ROTULO_CRITICIDADE;
  protected readonly tomCriticidade = TOM_CRITICIDADE;
  protected readonly formatarMedicao = formatarMedicao;

  protected readonly identificacao = computed(() => {
    const d = this.detalhe();
    return d ? identificacaoOs(d.ordem) : '';
  });
  protected readonly planos = computed(() => (this.detalhe()?.preventivas ?? []).map((p) => p.plano).join(', '));
  /** Roteiro de todos os planos, na ordem em que foram copiados na abertura. */
  protected readonly tarefas = computed<TarefaRoteiro[]>(() =>
    (this.detalhe()?.preventivas ?? []).flatMap((p) =>
      (p.roteiro ?? '')
        .split('\n')
        .map((l) => l.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean)
        .map((tarefa) => ({ plano: p.plano, tarefa }))
    )
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => this.carregar(id));
    });
  }

  protected carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service
      .detalharOrdemServico(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalhe) => {
          this.detalhe.set(detalhe);
          this.carregando.set(false);
          document.title = `${rotuloOs(detalhe.ordem.numero)} · Checklist da oficina · GEO`;
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }

  protected voltar(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/frota', 'ordens-servico']);
  }

  protected abrirFicha(id: string): void {
    void this.router.navigate(['/frota', 'ordens-servico', id]);
  }

  protected imprimir(): void {
    window.print();
  }
}
