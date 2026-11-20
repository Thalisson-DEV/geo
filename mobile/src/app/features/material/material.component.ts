import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { db } from '../../core/db/app-db';
import { TokenService } from '../../core/auth/token.service';
import { IconeComponent, IndicadorRedeComponent, TituloGrandeComponent } from '../../ui';
import { DbService } from '../../core/db/db.service';
import { DIAS_PARADO, diasDesde } from '../../core/saldo/tempo-saldo';

/**
 * Aba Material: saldo do caminhão e transferências. A equipe de campo não pede material:
 * ele vem da programação dos pontos ou de solicitação manual feita no web.
 */
@Component({
  selector: 'app-material',
  standalone: true,
  imports: [RouterLink, TituloGrandeComponent, IconeComponent, IndicadorRedeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Material" subtitulo="Saldo do caminhão e transferências">
      <geo-indicador-rede />
    </geo-titulo-grande>

    <h2 class="geo-secao">Novo</h2>
    <ul class="geo-grupo">
      <li><a class="geo-linha geo-linha--acao" routerLink="/transferencias/nova">
        <span class="geo-selo geo-selo--destaque"><geo-icone nome="transferencia" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Transferir</span>
          <span class="geo-linha__apoio">Para outro estoque, com assinatura</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>

    <h2 class="geo-secao">Consultar</h2>
    <ul class="geo-grupo">
      <li><a class="geo-linha geo-linha--acao" routerLink="/transferencias">
        <span class="geo-selo"><geo-icone nome="transferencia" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Transferências</span>
          <span class="geo-linha__apoio">Feitas por este aparelho</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      <li><a class="geo-linha geo-linha--acao" routerLink="/material/saldo">
        <span class="geo-selo"><geo-icone nome="caminhao" /></span>
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Saldo do caminhão</span>
          <span class="geo-linha__apoio geo-num">{{ itensSaldo() }} {{ itensSaldo() === 1 ? 'material' : 'materiais' }} com saldo
            @if (parados()) { · <span class="parados">{{ parados() }} {{ parados() === 1 ? 'parado' : 'parados' }} há {{ diasParado }}+ dias</span> }</span></span>
        <geo-icone nome="avancar" [tamanho]="18" /></a></li>
    </ul>
  `,
  styles: [`:host { display: block; padding-bottom: var(--geo-e6); } .parados { font-weight: 600; color: var(--geo-atencao); }`],
})
export class MaterialComponent implements OnInit {
  private readonly tokens = inject(TokenService);
  readonly itensSaldo = signal(0);
  readonly parados = signal(0);
  readonly diasParado = DIAS_PARADO;
  private readonly dbService = inject(DbService);

  async ngOnInit(): Promise<void> {
    const idEstoque = this.tokens.estoqueId();
    const saldo = idEstoque ? await db.saldos.where('idEstoque').equals(idEstoque).filter(s => s.quantidade > 0).count() : 0;
    this.itensSaldo.set(saldo);
    if (idEstoque) {
      const linhas = await this.dbService.getSaldosComMateriais(idEstoque);
      this.parados.set(linhas.filter(l => (diasDesde(l.detalhaSerie && l.serieMaisAntiga ? l.serieMaisAntiga : l.ultimaMovimentacao) ?? 0) >= DIAS_PARADO).length);
    }
  }
}
