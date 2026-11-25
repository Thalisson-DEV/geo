import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { TokenService } from '../../core/auth/token.service';
import { SaldoObraLocal } from '../../core/db/models';
import { DbService } from '../../core/db/db.service';
import { caminhaoPorObra, resumoCaminhao } from '../../core/saldo/caminhao-obra';
import { SyncService } from '../../core/sync/sync.service';
import { IconeComponent, IndicadorRedeComponent, TituloGrandeComponent, VazioComponent, dataCurta, hora, numeroBr } from '../../ui';
import { ObrasContexto } from '../obras/obras-contexto';

/**
 * Aba Material = o caminhão. Abre direto no que a equipe tem agora, separado por obra (as de hoje primeiro), com o
 * material livre e a sucata que volta no fim do dia. Canteiro e transferência ficam como ações. A equipe não pede
 * material: ele vem da programação e sai no balcão do almoxarifado.
 */
@Component({
  selector: 'app-material',
  standalone: true,
  imports: [RouterLink, TituloGrandeComponent, IconeComponent, IndicadorRedeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Caminhão" [subtitulo]="subtitulo()">
      <geo-indicador-rede />
    </geo-titulo-grande>

    @if (saldos() === undefined) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        @for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 72px"></div> }
      </div>
    } @else if (grupos().length) {
      <p class="resumo geo-num">{{ resumo().materiais }} {{ resumo().materiais === 1 ? 'material' : 'materiais' }}@if (resumo().obras) { de {{ resumo().obras }} {{ resumo().obras === 1 ? 'obra' : 'obras' }} }@if (resumo().sucatas) {, mais {{ resumo().sucatas }} de sucata }</p>
      @if (resumo().sucatas || temLivreOuOutras()) {
        <p class="aviso"><geo-icone nome="almox" [tamanho]="18" />No fim do dia, leve ao balcão a sucata e o que não vai usar amanhã. O almoxarife já recebe tudo preenchido.</p>
      }

      @for (g of grupos(); track g.chave) {
        <h2 class="geo-secao titulo-grupo">
          <span>{{ g.titulo }}</span>
          @if (g.hoje) { <span class="selo-hoje">Hoje</span> }
          @if (g.tipo === 'SUCATA') { <span class="selo-sucata">Devolver</span> }
        </h2>
        <ul class="geo-grupo" [attr.aria-label]="g.titulo">
          @for (i of g.itens; track i.idMaterial) {
            <li class="geo-linha">
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">{{ i.descricao }}</span>
                <span class="geo-linha__apoio geo-num">Cód. {{ i.codigo }}</span>
              </span>
              <span class="geo-qtd">{{ num(i.quantidade) }}<small>{{ i.unidade }}</small></span>
            </li>
          }
        </ul>
      }
    } @else {
      <geo-vazio icone="estoque" titulo="Caminhão sem material" texto="O que o almoxarifado entregar no balcão aparece aqui, separado por obra." />
    }

    <h2 class="geo-secao">Ações</h2>
    <ul class="geo-grupo">
      <li><a class="geo-linha geo-linha--acao" routerLink="/material/canteiro">
        <span class="geo-selo geo-selo--destaque"><geo-icone nome="almox" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Canteiro</span>
          <span class="geo-linha__apoio">Deixar ou pegar material perto da obra</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="geo-linha geo-linha--acao" routerLink="/transferencias/nova">
        <span class="geo-selo"><geo-icone nome="transferencia" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Transferir</span>
          <span class="geo-linha__apoio">Para outro estoque, com assinatura</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="geo-linha geo-linha--acao" routerLink="/material/saldo">
        <span class="geo-selo"><geo-icone nome="caminhao" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Saldo detalhado</span>
          <span class="geo-linha__apoio">Busca, séries e material parado</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="geo-linha geo-linha--acao" routerLink="/transferencias">
        <span class="geo-selo"><geo-icone nome="transferencia" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Transferências</span>
          <span class="geo-linha__apoio">Feitas por este aparelho</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>
    <div class="geo-respiro"></div>
  `,
  styles: [`
    :host { display: block; padding-bottom: var(--geo-e6); }
    .resumo { margin: var(--geo-e1) var(--geo-margem) 0; font: 600 1.0625rem/1.4 var(--geo-fonte); color: var(--geo-texto); }
    .aviso { display: flex; gap: var(--geo-e2); align-items: flex-start; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); color: var(--geo-texto); font: var(--geo-t-apoio); }
    .aviso geo-icone { color: var(--geo-atencao); flex: none; margin-top: 1px; }
    .titulo-grupo { display: flex; align-items: center; gap: var(--geo-e2); }
    .selo-hoje, .selo-sucata { padding: 0 var(--geo-e2); border-radius: var(--geo-r-pilula); font: 600 .75rem/1.6 var(--geo-fonte); text-transform: none; letter-spacing: 0; }
    .selo-hoje { background: var(--geo-destaque-suave); color: var(--geo-destaque-texto); }
    .selo-sucata { background: var(--geo-atencao-suave); color: var(--geo-atencao); }
  `],
})
export class MaterialComponent {
  private readonly tokens = inject(TokenService);
  private readonly dbService = inject(DbService);
  private readonly sync = inject(SyncService);
  private readonly ctx = inject(ObrasContexto);

  protected readonly num = numeroBr;

  /** O caminhão por obra, ao vivo: muda na hora ao deixar ou pegar no canteiro e a cada sincronização. */
  protected readonly saldos = toSignal(from(liveQuery(() => {
    const idEstoque = this.tokens.estoqueId();
    return idEstoque ? this.dbService.getSaldosObra(idEstoque) : Promise.resolve([] as SaldoObraLocal[]);
  })), { initialValue: undefined }) as () => SaldoObraLocal[] | undefined;

  private readonly obrasDeHoje = computed(() => new Set(this.ctx.doDia().map(p => p.idObra)));
  protected readonly grupos = computed(() => caminhaoPorObra(this.saldos() ?? [], this.obrasDeHoje()));
  protected readonly resumo = computed(() => resumoCaminhao(this.grupos()));
  protected readonly temLivreOuOutras = computed(() => this.grupos().some(g => g.tipo === 'LIVRE' || (g.tipo === 'OBRA' && !g.hoje)));
  protected readonly subtitulo = computed(() => {
    const em = this.sync.lastSyncAt();
    return em ? `O que está com a equipe agora · atualizado ${dataCurta(em)} ${hora(em)}` : 'O que está com a equipe agora, por obra';
  });

  constructor() {
    if (!this.ctx.pacote.carregado()) void this.ctx.pacote.carregarLocal();
  }
}
