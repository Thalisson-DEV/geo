import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BarraTopoComponent, IconeComponent } from '../../ui';
import { ToastService } from '../../core/ui/toast.service';
import { TurnoService } from '../../core/turno/turno.service';
import { relatorioDoDia } from '../../core/obras/obras-regras';
import { ObrasContexto } from './obras-contexto';
import { TokenService } from '../../core/auth/token.service';
import { DbService } from '../../core/db/db.service';
import { caminhaoPorObra, resumoCaminhao } from '../../core/saldo/caminhao-obra';

/**
 * Fechar o dia: o relatório diário vem montado com obras atendidas, pontos feitos, ocorrências e pendências; o
 * encarregado revisa, completa e fecha o turno. Foto e envio pendentes aparecem, mas não impedem fechar.
 */
@Component({
  selector: 'app-relatorio-dia',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="turno.turnoAtivo() ? 'Fechar o dia' : 'Relatório do dia'" subtitulo="Relatório diário" (voltar)="voltar()" />
    @if (pendenciasFoto() || ctx.registros.pendentes()) {
      <ul class="geo-grupo pendencias" aria-label="Pendências">
        @if (pendenciasFoto()) {
          <li><a class="geo-linha geo-linha--acao" routerLink="/obras">
            <span class="geo-selo geo-selo--atencao"><geo-icone nome="camera" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo geo-num">{{ pendenciasFoto() }} {{ pendenciasFoto() === 1 ? 'foto pendente' : 'fotos pendentes' }}</span>
              <span class="geo-linha__apoio">Pode fechar: {{ pendenciasFoto() === 1 ? 'ela fica visível' : 'elas ficam visíveis' }} para a equipe e para o escritório</span></span>
            <geo-icone nome="avancar" [tamanho]="18" /></a></li>
        }
        @if (ctx.registros.pendentes()) {
          <li class="geo-linha"><span class="geo-selo geo-selo--destaque"><geo-icone nome="nuvem" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo geo-num">{{ ctx.registros.pendentes() }} {{ ctx.registros.pendentes() === 1 ? 'registro no aparelho' : 'registros no aparelho' }}</span>
              <span class="geo-linha__apoio">Vão sozinhos quando houver sinal. Abra o app com sinal para enviar.</span></span></li>
        }
      </ul>
    }
    @if (levar(); as l) {
      <ul class="geo-grupo pendencias" aria-label="Material para devolver">
        <li><a class="geo-linha geo-linha--acao" routerLink="/material">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="almox" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Leve ao balcão do almoxarifado</span>
            <span class="geo-linha__apoio geo-num">{{ l }}</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      </ul>
    }
    <label class="geo-campo"><span>Relatório do dia</span>
      <textarea class="geo-input" rows="10" maxlength="4000" [value]="texto()" (input)="texto.set($any($event.target).value)" data-testid="texto-relatorio"></textarea></label>
    <p class="dica">Revise e complete. Ditado: toque no microfone do teclado.</p>
    <div class="geo-respiro"></div>
    <div class="geo-rodape-acoes" data-acao-fixa>
      <button type="button" class="geo-btn geo-btn--principal" [disabled]="!texto().trim() || salvando()" (click)="fechar()" data-testid="fechar-dia">
        {{ turno.turnoAtivo() ? 'Salvar e fechar o turno' : 'Salvar relatório' }}</button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .pendencias { margin-top: var(--geo-e3); }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem) 0; }
    .dica { margin: var(--geo-e2) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
  `],
})
export class RelatorioDiaComponent implements OnInit {
  readonly ctx = inject(ObrasContexto);
  readonly turno = inject(TurnoService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly tokens = inject(TokenService);
  private readonly dbService = inject(DbService);
  /** O que está no caminhão ao fechar o dia: sucata volta sempre; o resto, o que não vai ser usado amanhã. */
  readonly levar = signal<string | null>(null);

  readonly texto = signal('');
  readonly salvando = signal(false);
  readonly pendenciasFoto = computed(() => this.ctx.doDia().reduce((n, p) => n + this.ctx.pendencias(p).length, 0));

  async ngOnInit(): Promise<void> {
    // O app pode reabrir direto aqui (retomada): monta o texto só depois de ler a agenda e os registros do aparelho.
    await Promise.all([this.ctx.pacote.carregado() ? null : this.ctx.pacote.carregarLocal(), this.ctx.registros.carregar()]);
    void this.montarLevar();
    if (this.texto().trim()) return;
    this.texto.set(relatorioDoDia(this.ctx.doDia(), this.ctx.registros.registros(), this.ctx.hoje(),
      p => this.ctx.pontos(p).filter(x => x.situacao === 'FEITO').map(x => x.numero), this.pendenciasFoto(),
      p => this.ctx.pontos(p).filter(x => x.situacao === 'PARCIAL').map(x => x.numero)));
  }

  private async montarLevar(): Promise<void> {
    const idEstoque = this.tokens.estoqueId();
    if (!idEstoque) return;
    const r = resumoCaminhao(caminhaoPorObra(await this.dbService.getSaldosObra(idEstoque), new Set()));
    const partes: string[] = [];
    if (r.sucatas) partes.push(`${r.sucatas} ${r.sucatas === 1 ? 'sucata' : 'sucatas'}`);
    if (r.materiais) partes.push(`${r.materiais} ${r.materiais === 1 ? 'material' : 'materiais'} no caminhão${r.obras ? ` de ${r.obras} ${r.obras === 1 ? 'obra' : 'obras'}` : ''}`);
    this.levar.set(partes.length ? `${partes.join(' e ')}. Devolva o que não vai usar amanhã.` : null);
  }

  async fechar(): Promise<void> {
    if (!this.texto().trim()) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Sem turno aberto: abra o turno para enviar o relatório.');
      return;
    }
    this.salvando.set(true);
    try {
      await this.ctx.registros.registrar({ tipo: 'RELATORIO', comando: { observacao: this.texto().trim() } });
      await this.turno.fecharTurnoObras();
      this.toast.success('Dia fechado. Bom descanso!');
      void this.router.navigate(['/hoje'], { replaceUrl: true });
    } catch {
      this.toast.error('Não foi possível fechar agora. O relatório ficou salvo no aparelho.');
    } finally {
      this.salvando.set(false);
    }
  }

  voltar(): void {
    void this.router.navigate(['/hoje']);
  }
}
