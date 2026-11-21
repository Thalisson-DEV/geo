import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BarraTopoComponent, IconeComponent } from '../../ui';
import { TurnoService } from '../../core/turno/turno.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ObraAvulsa, idAvulsa } from '../../core/obras/pacote-obras.service';
import { ObrasContexto } from './obras-contexto';

/** Motivos mais comuns, num toque; o texto pode ser completado. */
const MOTIVOS = ['Além do programado', 'Emergência', 'Pedido da supervisão', 'Adiantar serviço da obra', 'Retrabalho'];

/**
 * Execução avulsa: a equipe atua numa obra que não estava na agenda. Busca a obra pelo número (precisa de sinal só
 * nessa hora), vê o que há para fazer e começa a execução; a partir daí a obra funciona como as programadas — ficha,
 * APR do dia, pontos e projeto, fotos e relatório —, também sem sinal. O servidor monta a programação avulsa com o que
 * for apontado, para o valor entrar na medição.
 */
@Component({
  selector: 'app-obra-nao-programada',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="alem() ? 'Ir além do programado' : 'Execução avulsa'" [subtitulo]="alem() ? 'Pontos desta obra ainda sem programação' : 'Obra fora da agenda de hoje'" (voltar)="voltar()" />
    @if (!achada()) {
    <ol class="passos-ajuda">
      <li><span class="n">1</span>Busque a obra pelo número.</li>
      <li><span class="n">2</span>Diga por que a equipe vai atuar nela.</li>
      <li><span class="n">3</span>Execute como numa obra da agenda: APR do dia, pontos, fotos.</li>
    </ol>
    }

    <form class="busca" (submit)="$event.preventDefault(); buscar()">
      <label class="geo-campo"><span>Número da obra</span>
        <input class="geo-input geo-num" inputmode="numeric" [value]="numero()" (input)="numero.set($any($event.target).value)"
          placeholder="Ex.: 7000001" data-testid="busca-obra" autocomplete="off"></label>
      <button type="submit" class="geo-btn geo-btn--principal" [disabled]="!numero().trim() || buscando()" data-testid="buscar-obra">
        <geo-icone nome="busca" />{{ buscando() ? 'Buscando…' : 'Buscar' }}</button>
    </form>

    @if (!rede.isOnline() && !achada()) {
      <p class="aviso" role="status"><geo-icone nome="sem_rede" [tamanho]="18" />Sem sinal: a busca usa as obras da sua base guardadas no aparelho.</p>
    }
    @if (erro(); as e) { <p class="aviso aviso--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />{{ e }}</p> }

    @if (achada(); as a) {
      <section class="obra" aria-label="Obra encontrada" data-testid="obra-avulsa">
        <div class="obra__topo">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="obra" /></span>
          <span class="obra__texto"><strong>Obra {{ a.obra.numero }}</strong><span>{{ a.obra.titulo }}</span>
            @if (endereco(); as end) { <span class="apoio">{{ end }}</span> }</span>
        </div>
        @if (!semDados()) {
        <ul class="resumo">
          <li><strong class="geo-num">{{ pontosComServico() }}</strong> {{ pontosComServico() === 1 ? 'ponto ou vão' : 'pontos e vãos' }} com serviço a fazer</li>
          <li><strong class="geo-num">{{ servicos() }}</strong> {{ servicos() === 1 ? 'serviço' : 'serviços' }} · <strong class="geo-num">{{ materiais() }}</strong> {{ materiais() === 1 ? 'material' : 'materiais' }}</li>
          @if (a.programadosEmOutra) {
            <li class="apoio">{{ a.programadosEmOutra === 1 ? '1 item já está programado para outra equipe e não aparece aqui.' : a.programadosEmOutra + ' itens já estão programados para outra equipe e não aparecem aqui.' }}</li>
          }
          @if (!a.obra.projeto) { <li class="apoio">Esta obra não tem projeto em PDF: os pontos aparecem só em lista.</li> }
        </ul>
        }
        @if (semDados()) {
          <p class="aviso" role="status"><geo-icone nome="sem_rede" [tamanho]="18" />Sem sinal: os pontos e o projeto desta obra chegam sozinhos quando houver sinal. Já dá para começar: chegada, APR e ocorrências.</p>
        } @else if (!a.itens.length) {
          <p class="aviso aviso--erro"><geo-icone nome="alerta" [tamanho]="18" />Não há serviço pendente nesta obra para a equipe executar. Fale com a supervisão.</p>
        }
      </section>

      @if (a.itens.length || semDados()) {
        <fieldset class="motivos">
          <legend>Por que a equipe vai atuar nesta obra?</legend>
          <div class="chips" role="radiogroup" aria-label="Motivo">
            @for (m of motivos; track m) {
              <button type="button" class="geo-chip" role="radio" [attr.aria-checked]="motivo() === m" (click)="motivo.set(m)">
                @if (motivo() === m) { <geo-icone nome="check" [tamanho]="16" /> }{{ m }}</button>
            }
          </div>
          <label class="geo-campo"><span>Detalhe (opcional)</span>
            <textarea class="geo-input" rows="2" maxlength="800" [value]="detalhe()" (input)="detalhe.set($any($event.target).value)"
              placeholder="Ex.: poste caído após a chuva, pedido do supervisor" data-testid="motivo-obra"></textarea></label>
        </fieldset>
      }
    }

    @if (achada()?.itens?.length && !turno.turnoAtivo()) {
      <p class="aviso" role="status"><geo-icone nome="relogio" [tamanho]="18" />Abra o turno antes de começar a execução.</p>
    }
    <div class="geo-respiro"></div>
    <div class="geo-rodape-acoes" data-acao-fixa>
      <button type="button" class="geo-btn geo-btn--principal" [disabled]="!podeComecar() || salvando()" (click)="comecar()" data-testid="comecar-avulsa">
        <geo-icone nome="ferramenta" />Começar execução</button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .passos-ajuda { list-style: none; margin: var(--geo-e3) var(--geo-margem) 0; padding: 0; display: grid; gap: var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .passos-ajuda li { display: flex; align-items: center; gap: var(--geo-e2); }
    .n { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; flex: none;
      background: var(--geo-destaque-suave); color: var(--geo-destaque); font: 600 .75rem/1 var(--geo-fonte); }
    .busca { display: flex; gap: var(--geo-e2); align-items: end; margin: var(--geo-e4) var(--geo-margem) 0; }
    .busca .geo-campo { flex: 1; margin: 0; }
    .busca .geo-btn { flex: none; min-height: var(--geo-alvo-principal); }
    .aviso { display: flex; gap: var(--geo-e2); align-items: flex-start; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); font: var(--geo-t-apoio); }
    .aviso--erro { background: var(--geo-erro-suave); }
    .obra { margin: var(--geo-e4) var(--geo-margem) 0; padding: var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie);
      box-shadow: var(--geo-sombra-cartao); }
    .obra__topo { display: flex; gap: var(--geo-e3); align-items: flex-start; }
    .obra__texto { display: grid; gap: 2px; font: var(--geo-t-corpo); }
    .obra__texto strong { font: var(--geo-t-secao); }
    .apoio { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .resumo { list-style: none; margin: var(--geo-e3) 0 0; padding: var(--geo-e3) 0 0; border-top: 1px solid var(--geo-linha); display: grid; gap: var(--geo-e2);
      font: var(--geo-t-corpo); }
    .motivos { border: 0; margin: var(--geo-e4) var(--geo-margem) 0; padding: 0; }
    .motivos legend { font: var(--geo-t-corpo-forte); margin-bottom: var(--geo-e2); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--geo-e2); margin-bottom: var(--geo-e3); }
    .motivos .geo-campo { margin: 0; }
  `],
})
export class ObraNaoProgramadaComponent {
  private readonly ctx = inject(ObrasContexto);
  private readonly router = inject(Router);
  readonly turno = inject(TurnoService);
  readonly rede = inject(ConnectivityService);

  readonly motivos = MOTIVOS;
  readonly numero = signal('');
  readonly motivo = signal('');
  readonly detalhe = signal('');
  readonly achada = signal<ObraAvulsa | null>(null);
  readonly buscando = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly semDados = signal(false);
  readonly alem = computed(() => this.motivo() === 'Além do programado');
  private readonly rota = inject(ActivatedRoute);

  readonly servicos = computed(() => this.achada()?.itens.filter(i => i.tipo === 'SERVICO').length ?? 0);
  readonly materiais = computed(() => this.achada()?.itens.filter(i => i.tipo === 'MATERIAL').length ?? 0);
  readonly pontosComServico = computed(() => new Set(this.achada()?.itens.filter(i => i.tipo === 'SERVICO').map(i => i.idPonto ?? i.idVao)).size);
  readonly endereco = computed(() => {
    const o = this.achada()?.obra;
    return o ? [o.endereco, o.municipio].filter(Boolean).join(' · ') : '';
  });
  readonly podeComecar = computed(() => (!!this.achada()?.itens.length || this.semDados()) && !!this.motivo() && !!this.turno.turnoAtivo());

  constructor() {
    // Vindo de "Ir além do programado": a obra já vem escolhida (do aparelho, também sem sinal).
    const obra = this.rota.snapshot.queryParamMap.get('obra');
    const motivo = this.rota.snapshot.queryParamMap.get('motivo');
    if (motivo && MOTIVOS.includes(motivo)) this.motivo.set(motivo);
    if (obra) {
      this.numero.set(obra);
      void this.buscar();
    }
  }

  async buscar(): Promise<void> {
    const numero = this.numero().trim();
    if (!numero) return;
    // Avulsa já começada hoje nesta obra: abre direto.
    const jaComecada = this.ctx.doDia().find(p => p.avulsa && p.numeroObra === numero);
    if (jaComecada) {
      void this.router.navigate(['/obras', jaComecada.id], { replaceUrl: true });
      return;
    }
    this.buscando.set(true);
    this.erro.set(null);
    this.achada.set(null);
    this.semDados.set(false);
    // Primeiro o aparelho (obra da agenda, ou obra da base sem sinal); com sinal, o servidor completa.
    const local = this.ctx.pacote.avulsaNoAparelho(numero);
    try {
      if (local && (!local.semDados || !this.rede.isOnline())) {
        this.achada.set(local);
        this.semDados.set(!!local.semDados);
        return;
      }
      if (!this.rede.isOnline()) {
        this.erro.set(`Sem sinal e a obra ${numero} não está entre as obras da sua base no aparelho. Confira o número ou espere o sinal.`);
        return;
      }
      const r = await this.ctx.pacote.buscarAvulsa(numero);
      if (!r) this.erro.set(`Obra ${numero} não encontrada ou já encerrada. Confira o número com a supervisão.`);
      this.achada.set(r);
    } catch {
      if (local) {
        this.achada.set(local);
        this.semDados.set(!!local.semDados);
      } else {
        this.erro.set('Não foi possível buscar agora. Confira o sinal e tente de novo.');
      }
    } finally {
      this.buscando.set(false);
    }
  }

  async comecar(): Promise<void> {
    const a = this.achada();
    const detalhe = this.detalhe().trim();
    const motivo = this.motivo() ? `${this.motivo()}${detalhe ? ' — ' + detalhe : ''}` : '';
    if (!a || !motivo || !this.turno.turnoAtivo()) return;
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const p = await this.ctx.pacote.iniciarAvulsa(a, motivo, this.ctx.hoje());
      await this.ctx.registros.registrar({ tipo: 'ATIVIDADE', idObra: a.obra.id, idProgramacao: p.id, comando: { idObra: a.obra.id, motivo } });
      void this.router.navigate(['/obras', idAvulsa(a.obra.id)], { replaceUrl: true });
    } catch {
      this.erro.set('Não foi possível começar a execução. Tente de novo; se continuar, fale com a supervisão.');
    } finally {
      this.salvando.set(false);
    }
  }

  voltar(): void {
    void this.router.navigate(['/obras']);
  }
}
