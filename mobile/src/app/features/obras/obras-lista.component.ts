import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconeComponent, IndicadorRedeComponent, ListaDetalheComponent, TituloGrandeComponent, VazioComponent } from '../../ui';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ObrasContexto, diaCurto } from './obras-contexto';
import { ProgramacaoCampo } from '../../core/obras/obras.models';
import { nomeLocais } from '../../core/obras/obras-regras';

/** Aba Obras: a agenda da equipe (hoje e próximos dias). No tablet deitado a ficha abre ao lado. */
@Component({
  selector: 'app-obras-lista',
  standalone: true,
  imports: [ListaDetalheComponent, TituloGrandeComponent, IndicadorRedeComponent, IconeComponent, VazioComponent, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-lista-detalhe tituloVazio="Escolha uma obra" textoVazio="A ficha da obra abre aqui, com endereço, programação, material e projeto." iconeVazio="obra">
      <geo-titulo-grande titulo="Obras" [subtitulo]="subtitulo()">
        <geo-indicador-rede />
      </geo-titulo-grande>

      <div class="estado" role="status">
        @if (ctx.pacote.sincronizando()) {
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="atualizar" /></span><span>Atualizando a agenda…</span>
        } @else if (ctx.pacote.prontoSemSinal() && ctx.pacote.idadeAgenda()?.antiga) {
          <span class="geo-selo geo-selo--atencao"><geo-icone nome="sem_rede" /></span><span>Agenda {{ ctx.pacote.idadeAgenda()!.quando }} no aparelho: conecte para ver se mudou.</span>
        } @else if (ctx.pacote.prontoSemSinal()) {
          <span class="geo-selo geo-selo--ok"><geo-icone nome="check" /></span><span>Pronto para trabalhar sem sinal{{ ctx.pacote.idadeAgenda() ? ' · agenda ' + ctx.pacote.idadeAgenda()!.quando : '' }}</span>
        } @else if (ctx.pacote.projetosFaltando().length) {
          <span class="geo-selo geo-selo--atencao"><geo-icone nome="alerta" /></span>
          <span>{{ ctx.pacote.projetosFaltando().length === 1 ? 'Falta 1 projeto' : 'Faltam ' + ctx.pacote.projetosFaltando().length + ' projetos' }} no aparelho. {{ rede.isOnline() ? 'Baixando…' : 'Conecte para baixar.' }}</span>
        } @else if (!ctx.pacote.ultimaSync()) {
          <span class="geo-selo geo-selo--atencao"><geo-icone nome="sem_rede" /></span><span>A agenda ainda não foi baixada. Conecte para baixar.</span>
        }
      </div>

      @if (ctx.doDia().length) {
        <h2 class="geo-secao">Hoje</h2>
        <ul class="geo-grupo">
          @for (p of ctx.doDia(); track p.id) {
            <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id]" routerLinkActive="ativa" [attr.data-testid]="'obra-' + p.numero">
              <span class="geo-selo" [class.geo-selo--ok]="resumo(p).feitos === resumo(p).total && resumo(p).total > 0"
                [class.geo-selo--destaque]="resumo(p).feitos < resumo(p).total"><geo-icone nome="obra" /></span>
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">Obra {{ p.numeroObra }} · {{ ctx.ref(p) }}</span>
                <span class="geo-linha__apoio">{{ p.descricao }}</span>
                <span class="geo-linha__apoio geo-num">{{ resumo(p).total ? resumo(p).feitos + ' de ' + resumo(p).total + ' ' + resumo(p).nome : 'Os pontos chegam com o sinal' }}{{ ctx.condicoes(p).length ? ' · ' + ctx.condicoes(p).join(' · ') : '' }}</span>
              </span>
              <geo-icone nome="avancar" [tamanho]="18" />
            </a></li>
          }
        </ul>
      }

      @if (ctx.proximas().length) {
        <h2 class="geo-secao">Próximos dias</h2>
        <ul class="geo-grupo">
          @for (p of ctx.proximas(); track p.id) {
            <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id]" routerLinkActive="ativa">
              <span class="geo-selo"><geo-icone nome="calendario" /></span>
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">Obra {{ p.numeroObra }} · {{ ctx.ref(p) }}</span>
                <span class="geo-linha__apoio geo-num">{{ dia(p.inicio) }}{{ p.fim !== p.inicio ? ' a ' + dia(p.fim) : '' }} · {{ p.descricao }}</span>
              </span>
              <geo-icone nome="avancar" [tamanho]="18" />
            </a></li>
          }
        </ul>
      }

      @if (!ctx.doDia().length && !ctx.proximas().length && ctx.pacote.carregado()) {
        <geo-vazio icone="obra" titulo="Nenhuma obra na agenda" texto="Quando a supervisão programar uma obra para a equipe, ela aparece aqui." />
      }

      <ul class="geo-grupo extra">
        <li><a class="geo-linha geo-linha--acao" routerLink="/obras/nao-programada">
          <span class="geo-selo"><geo-icone nome="mais" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Execução avulsa</span>
            <span class="geo-linha__apoio">Obra fora da agenda: busque pelo número e execute</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      </ul>
      <div class="geo-respiro"></div>
    </geo-lista-detalhe>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .estado { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-superficie); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .estado:empty { display: none; }
    .extra { margin-top: var(--geo-e5); }
    a.ativa { background: var(--geo-destaque-suave); }
  `],
})
export class ObrasListaComponent {
  readonly ctx = inject(ObrasContexto);
  readonly rede = inject(ConnectivityService);

  subtitulo(): string {
    const n = this.ctx.doDia().length;
    const equipe = this.ctx.pacote.codigoEquipe();
    return `${n ? `${n} ${n === 1 ? 'obra' : 'obras'} hoje` : 'Agenda da equipe'}${equipe ? ' · ' + equipe : ''}`;
  }

  resumo(p: ProgramacaoCampo) {
    const pontos = this.ctx.pontos(p);
    return { feitos: pontos.filter(x => x.situacao === 'FEITO').length, total: pontos.length, nome: nomeLocais(pontos) };
  }

  dia(data: string): string {
    return diaCurto(data);
  }
}
