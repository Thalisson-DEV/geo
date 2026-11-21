import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconeComponent, LinhaArrastoComponent } from '../../ui';
import { TurnoService } from '../../core/turno/turno.service';
import { proximoPasso } from '../../core/obras/obras-regras';
import { ObrasContexto } from '../obras/obras-contexto';
import { ProgramacaoCampo } from '../../core/obras/obras.models';

/**
 * Hoje guiado da equipe de Obras: o próximo passo num botão só (checklist → turno → ir à obra → APR → executar → fechar
 * o dia), as obras do dia na ordem da programação com as condições, avisos de mudança e o que está pendente.
 */
@Component({
  selector: 'app-hoje-obras',
  standalone: true,
  imports: [IconeComponent, RouterLink, LinhaArrastoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.pacote.avisosNovos().length) {
      <section class="avisos" aria-label="Mudanças na agenda" role="status">
        <span class="geo-selo geo-selo--atencao"><geo-icone nome="aviso" /></span>
        <div class="avisos__texto">
          <strong>{{ ctx.pacote.avisosNovos().length === 1 ? 'Mudança na agenda' : ctx.pacote.avisosNovos().length + ' mudanças na agenda' }}</strong>
          @for (a of ctx.pacote.avisosNovos().slice(-3); track a.id) { <span>{{ a.texto }}</span> }
        </div>
        <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="ctx.pacote.marcarAvisosVistos()">Ok</button>
      </section>
    }

    <section class="passo" aria-label="Próximo passo">
      <span class="passo__rotulo">Próximo passo</span>
      <a class="geo-btn geo-btn--principal geo-btn--bloco" [routerLink]="passo().rota" data-testid="proximo-passo">
        <geo-icone [nome]="$any(passo().icone)" />{{ passo().rotulo }}</a>
      @if (passo().apoio) { <span class="passo__apoio">{{ passo().apoio }}</span> }
      <span class="pronto" [class.pronto--ok]="ctx.pacote.prontoSemSinal()">
        <geo-icone [nome]="ctx.pacote.prontoSemSinal() ? 'check' : 'sem_rede'" [tamanho]="16" />
        {{ ctx.pacote.prontoSemSinal() ? 'Pronto para trabalhar sem sinal' : !ctx.pacote.ultimaSync() ? 'Agenda ainda não baixada' : ctx.pacote.sincronizando() ? 'Baixando projetos das obras…'
          : 'Sem o projeto da obra ' + ctx.pacote.projetosFaltando().join(', ') + ': os pontos aparecem em lista' }}
      </span>
    </section>

    <h2 class="geo-secao"><span>Obras de hoje</span><a class="geo-btn geo-btn--texto geo-btn--compacto" routerLink="/obras">Agenda</a></h2>
    @if (ctx.doDia().length) {
      <ol class="geo-grupo" aria-label="Obras do dia na ordem da programação">
        @for (p of ctx.doDia(); track p.id; let i = $index) {
          <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id]" [attr.data-testid]="'hoje-obra-' + p.numero">
            <span class="geo-selo" [class.geo-selo--ok]="concluida(p)" [class.geo-selo--erro]="ctx.liberacao(p) === 'IMPEDIDA'"
              [class.geo-selo--destaque]="!concluida(p) && ctx.liberacao(p) !== 'IMPEDIDA'">
              @if (concluida(p)) { <geo-icone nome="check" /> } @else { <span class="geo-num">{{ i + 1 }}</span> }</span>
            <span class="geo-linha__texto">
              <span class="geo-linha__titulo">Obra {{ p.numeroObra }} · {{ ctx.ref(p) }}</span>
              <span class="geo-linha__apoio">{{ situacao(p) }}</span>
              @if (ctx.condicoes(p).length) { <span class="geo-linha__apoio">{{ ctx.condicoes(p).join(' · ') }}</span> }
            </span>
            <geo-icone nome="avancar" [tamanho]="18" /></a></li>
        }
      </ol>
    } @else {
      <p class="nada">Nenhuma obra na agenda de hoje.</p>
    }
    <ul class="geo-grupo avulsa">
      <li><a class="geo-linha geo-linha--acao" routerLink="/obras/nao-programada" data-testid="hoje-avulsa">
        <span class="geo-selo"><geo-icone nome="mais" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Execução avulsa</span>
          <span class="geo-linha__apoio">Obra fora da agenda: busque pelo número</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>
    @if (fotosPendentes() || ctx.registros.conflitos().length) {
      <h2 class="geo-secao">Pendências</h2>
      <ul class="geo-grupo">
        @if (fotosPendentes()) {
          <li><a class="geo-linha geo-linha--acao" routerLink="/obras"><span class="geo-selo geo-selo--atencao"><geo-icone nome="camera" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo geo-num">{{ fotosPendentes() }} {{ fotosPendentes() === 1 ? 'foto do modelo' : 'fotos do modelo' }}</span>
              <span class="geo-linha__apoio">Tire quando puder; não bloqueia nada</span></span>
            <geo-icone nome="avancar" [tamanho]="18" /></a></li>
        }
        @for (c of ctx.registros.conflitos(); track c.id) {
          <li><geo-linha-arrasto rotulo="Descartar" icone="lixeira" (acao)="ctx.registros.descartarConflito(c.id)">
            <div class="geo-linha" data-testid="conflito-obra"><span class="geo-selo geo-selo--erro"><geo-icone nome="alerta" /></span>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ rotuloTipo(c.tipo) }}: recusado pelo servidor</span>
                <span class="geo-linha__apoio">{{ c.motivo }}</span></span>
              <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="ctx.registros.descartarConflito(c.id)">Descartar</button>
              <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="ctx.registros.reenviarConflito(c.id)" data-testid="reenviar-conflito">Enviar de novo</button></div>
          </geo-linha-arrasto></li>
        }
      </ul>
    }
  `,
  styles: [`
    .avulsa { margin-top: var(--geo-e2); }
    .avisos { display: flex; gap: var(--geo-e3); align-items: flex-start; margin: var(--geo-e4) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); }
    .avisos__texto { flex: 1; display: grid; gap: 2px; font: var(--geo-t-apoio); }
    .avisos__texto strong { font: var(--geo-t-corpo-forte); }
    .passo { display: grid; gap: var(--geo-e2); margin: var(--geo-e4) var(--geo-margem) 0; padding: var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .passo__rotulo { font: 600 .75rem/1 var(--geo-fonte); text-transform: uppercase; letter-spacing: .04em; color: var(--geo-texto-2); }
    .passo__apoio { font: var(--geo-t-apoio); color: var(--geo-texto-2); text-align: center; }
    .pronto { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .pronto--ok { color: var(--geo-ok); }
    .nada { margin: var(--geo-e2) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
  `],
})
export class HojeObrasComponent {
  readonly ctx = inject(ObrasContexto);
  private readonly turno = inject(TurnoService);
  /** Checklist do veículo feito hoje neste aparelho. */
  readonly checklistFeito = input(false);

  readonly passo = computed(() => proximoPasso({
    turnoAberto: !!this.turno.turnoAtivo(),
    diaFechado: this.ctx.registros.registros().some(r => r.tipo === 'RELATORIO' && r.dia === this.ctx.hoje()),
    checklistFeito: this.checklistFeito(), programacoes: this.ctx.doDia(),
    registros: this.ctx.registrosDoDia(), dia: this.ctx.hoje(),
    concluida: p => this.concluida(p), temRascunhoApr: () => false,
  }));
  readonly fotosPendentes = computed(() => this.ctx.doDia().reduce((n, p) => n + this.ctx.pendencias(p).length, 0));

  concluida(p: ProgramacaoCampo): boolean {
    const pontos = this.ctx.pontos(p);
    return pontos.length > 0 && pontos.every(x => x.situacao === 'FEITO');
  }

  situacao(p: ProgramacaoCampo): string {
    const pontos = this.ctx.pontos(p);
    const feitos = pontos.filter(x => x.situacao === 'FEITO').length;
    const lib = this.ctx.liberacao(p);
    if (lib === 'IMPEDIDA') return 'Sem condição de executar registrada';
    if (feitos === pontos.length && pontos.length) return 'Tudo feito';
    const apr = lib === 'LIBERADA' ? 'APR ok' : 'APR pendente';
    return `${pontos.length ? `${feitos} de ${pontos.length} pontos` : 'Os pontos chegam com o sinal'} · ${apr}`;
  }

  rotuloTipo(tipo: string): string {
    return ({ APR: 'APR', APR_CONCLUSAO: 'Conclusão da APR', OCORRENCIA: 'Ocorrência', ATIVIDADE: 'Execução avulsa', APONTAMENTO: 'Apontamento',
      PRESENCA: 'Chegada/saída', EVIDENCIA: 'Foto', RELATORIO: 'Relatório' } as Record<string, string>)[tipo] ?? tipo;
  }
}
