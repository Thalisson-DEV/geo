import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconeComponent, IndicadorRedeComponent, TituloGrandeComponent, VazioComponent } from '../../ui';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { LayoutService } from '../../core/plataforma/layout.service';
import { ObraResumo, StatusEquipeObra, SupervisaoService } from '../../core/obras/supervisao.service';

/**
 * Supervisor de Obras no app: situação de cada equipe agora (status, obra atual, APR pendente, ocorrências que impedem)
 * e acesso à documentação da obra (visita prévia, As Built e book).
 */
@Component({
  selector: 'app-supervisao',
  standalone: true,
  imports: [TituloGrandeComponent, IndicadorRedeComponent, IconeComponent, VazioComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Obras" [subtitulo]="subtitulo()"><geo-indicador-rede /></geo-titulo-grande>
    @if (servico.erro()) { <p class="aviso" role="status">{{ servico.erro() }}</p> }

    <div class="colunas" [class.duas]="layout.expandido()"><section>
    <h2 class="geo-secao"><span>Equipes agora</span>
      <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="atualizar()" [disabled]="!rede.isOnline()"><geo-icone nome="atualizar" [tamanho]="16" />Atualizar</button></h2>
    @if (servico.equipes().length) {
      <ul class="geo-grupo" aria-label="Equipes de Obras">
        @for (e of servico.equipes(); track e.idEquipe) {
          <li class="geo-linha" [attr.data-testid]="'equipe-' + e.codigo">
            <span class="geo-selo" [class.geo-selo--ok]="e.status === 'EM_EXECUCAO' || e.status === 'NA_OBRA'"
              [class.geo-selo--atencao]="e.status === 'PARADA' || e.status === 'A_CAMINHO'" [class.geo-selo--erro]="e.status === 'IMPEDIDA'">
              <geo-icone [nome]="icone(e)" /></span>
            <span class="geo-linha__texto">
              <span class="geo-linha__titulo">{{ e.codigo }} · {{ e.rotulo }}</span>
              <span class="geo-linha__apoio">{{ detalhe(e) }}</span>
            </span>
            @if (e.status !== 'IMPEDIDA' && (e.aprsPendentes || e.ocorrenciasImpeditivas)) {
              <span class="geo-etiqueta" [class.geo-etiqueta--erro]="e.ocorrenciasImpeditivas > 0" [class.geo-etiqueta--atencao]="!e.ocorrenciasImpeditivas">
                {{ e.ocorrenciasImpeditivas ? e.ocorrenciasImpeditivas + ' sem condição' : e.aprsPendentes + (e.aprsPendentes === 1 ? ' APR pendente' : ' APRs pendentes') }}</span>
            }
          </li>
        }
      </ul>
    } @else {
      <geo-vazio icone="pessoas" titulo="Sem leitura das equipes" texto="Conecte para ver a situação das equipes agora." />
    }

    </section><section>
    <h2 class="geo-secao">Documentação da obra</h2>
    <div class="buscar">
      <input class="geo-input geo-num" inputmode="numeric" aria-label="Número da obra" [value]="busca()" (input)="busca.set($any($event.target).value)" (keyup.enter)="buscar()" placeholder="Ex.: 7000001">
      <button type="button" class="geo-btn geo-btn--tonal" (click)="buscar()" [disabled]="!busca().trim() || !rede.isOnline()">Buscar</button>
    </div>
    <ul class="geo-grupo">
      @for (o of obras(); track o.id) {
        <li><a class="geo-linha geo-linha--acao" [routerLink]="['/supervisao/obras', o.id]" [queryParams]="{ numero: o.numero, titulo: o.titulo, municipio: o.municipioNome }">
          <span class="geo-selo"><geo-icone nome="obra" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Obra {{ o.numero }}</span><span class="geo-linha__apoio">{{ o.titulo }}</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      }
    </ul>
    </section></div>
    <div class="geo-respiro"></div>
  `,
  styles: [`
    :host { display: block; }
    .colunas.duas { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); column-gap: var(--geo-e5); align-items: start; }
    .aviso { margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .buscar { display: flex; gap: var(--geo-e2); align-items: center; padding: 0 var(--geo-margem) var(--geo-e2); }
    .buscar .geo-input { flex: 1; }
    .buscar .geo-btn { flex: none; min-height: var(--geo-alvo-principal); }
  `],
})
export class SupervisaoComponent implements OnInit {
  readonly servico = inject(SupervisaoService);
  readonly rede = inject(ConnectivityService);
  readonly layout = inject(LayoutService);
  readonly busca = signal('');
  readonly obras = signal<ObraResumo[]>([]);
  readonly subtitulo = computed(() => {
    const em = this.servico.atualizadoEm();
    return em ? `Atualizado às ${new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Acompanhamento das equipes';
  });

  ngOnInit(): void {
    void this.servico.carregarEquipes();
  }

  atualizar(): void {
    void this.servico.carregarEquipes();
  }

  async buscar(): Promise<void> {
    if (!this.busca().trim()) return;
    try {
      this.obras.set(await this.servico.buscarObras(this.busca().trim()));
    } catch {
      this.obras.set([]);
    }
  }

  icone(e: StatusEquipeObra) {
    return ({ EM_EXECUCAO: 'ferramenta', NA_OBRA: 'obra', A_CAMINHO: 'navegar', PARADA: 'relogio', IMPEDIDA: 'impedido', SEM_TURNO: 'relogio', ENCERRADO: 'check', SEM_OBRA: 'obra' } as const)[e.status];
  }

  detalhe(e: StatusEquipeObra): string {
    const partes = [
      e.numeroObraAtual ? `Obra ${e.numeroObraAtual}` : null,
      e.programacoesHoje ? `${e.concluidas} de ${e.programacoesHoje} na agenda` : 'Sem agenda hoje',
      e.lider,
      e.ultimaAtividade ? `última atividade ${new Date(e.ultimaAtividade).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : null,
    ];
    return partes.filter(Boolean).join(' · ');
  }
}
