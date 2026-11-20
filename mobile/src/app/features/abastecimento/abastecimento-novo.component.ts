import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { db } from '../../core/db/app-db';
import {
  AbastecimentoLocal,
  CategoriaProduto,
  FotoAbastecimentoLocal,
  ItemPedidoLocal,
  ProdutoCatalogo,
  ROTULO_CATEGORIA,
  pendenciasPedido
} from '../../core/frota/abastecimento.models';
import { AbastecimentoService } from '../../core/frota/abastecimento.service';
import { VeiculoChecklist, diaLocal, erroTravaMedicao, formatarPlaca, intervaloAceito, situacaoCnh } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { MeuVeiculoService } from '../../core/frota/meu-veiculo';
import { prepararEvidencia } from '../../core/sst/evidencia-foto.util';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';

type Passo = 'veiculo' | 'inicio' | 'painel' | 'itens' | 'revisao';
const PASSOS: Passo[] = ['veiculo', 'inicio', 'painel', 'itens', 'revisao'];
const TITULOS: Record<Passo, string> = { veiculo: 'Veículo', inicio: 'Condutor e posto', painel: 'Painel', itens: 'Itens', revisao: 'Conferir' };
const CATEGORIAS: CategoriaProduto[] = ['COMBUSTIVEL', 'ARLA', 'OLEO', 'FLUIDO'];

/**
 * Pedido de abastecimento: veículo → condutor e posto → painel (medição e foto) → itens → conferir.
 * Rascunho contínuo como o checklist: cada toque grava no aparelho e a foto fica guardada na captura.
 * No fim, fica salvo no aparelho e vai pela fila; o gestor da placa recebe o aviso.
 */
@Component({
  selector: 'app-abastecimento-novo',
  standalone: true,
  imports: [NgTemplateOutlet, BarraTopoComponent, IconeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Pedir abastecimento" [subtitulo]="titulos[passo()] + ' · ' + (indice() + 1) + ' de ' + passos.length"
        navegacao="fechar" (voltar)="fechar()">
        @if (catalogo() && frota()) {
          <span class="auto-salvo" role="status" aria-label="Salvo automaticamente"><geo-icone nome="check" [tamanho]="14" />Salvo</span>
        }
      </geo-barra-topo>
      @if (catalogo() && frota()) {
        <div class="passos" aria-hidden="true">
          @for (p of passos; track p) { <i [class.feito]="$index <= indice()"></i> }
        </div>
      }

      @if (!catalogo() || !frota()) {
        <geo-vazio icone="nuvem" titulo="Falta baixar os dados do abastecimento"
          texto="Os veículos, os postos e os produtos ficam no aparelho para pedir mesmo sem sinal. Baixe uma vez com internet.">
          <button type="button" class="geo-btn geo-btn--principal baixar" [disabled]="baixando()" (click)="baixar()">
            <geo-icone nome="baixar" [tamanho]="18" />{{ baixando() ? 'Baixando…' : 'Baixar agora' }}</button>
        </geo-vazio>
      } @else if (registro(); as r) {
        <section class="conteudo" [attr.aria-label]="titulos[passo()]">
          @switch (passo()) {
            @case ('veiculo') {
              @if (frota()!.veiculos.length > 6) {
                <div class="busca">
                  <geo-icone nome="busca" [tamanho]="20" />
                  <input type="search" placeholder="Buscar por placa ou descrição" enterkeyhint="search" aria-label="Buscar veículo"
                    [value]="busca()" (input)="busca.set($any($event.target).value)">
                </div>
              }
              @if (aberto(); as a) {
                <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />
                  <span>O {{ placa(a.placa) }} já tem um pedido {{ a.servidor?.situacaoRotulo?.toLowerCase() ?? 'na fila' }}. Conclua ou cancele esse antes de pedir outro.</span></p>
              } @else if (r.idVeiculo && !checklistHoje()) {
                <div class="geo-faixa-estado geo-faixa-estado--atencao aviso-checklist">
                  <geo-icone nome="alerta" [tamanho]="18" />
                  <div class="aviso-checklist__texto">
                    <p>O {{ placa(r.placa) }} ainda não tem checklist hoje neste aparelho. O pedido só é aceito com o checklist do dia.</p>
                    <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="fazerChecklist()"><geo-icone nome="inspecao" [tamanho]="16" />Fazer o checklist</button>
                  </div>
                </div>
              }
              @if (meusVeiculos().length) {
                <h2 class="geo-secao">Com você</h2>
                <ul class="geo-grupo" role="listbox" aria-label="Veículos com você">
                  @for (v of meusVeiculos(); track v.idVeiculo) { <li><ng-container *ngTemplateOutlet="linhaVeiculo; context: { $implicit: v }" /></li> }
                </ul>
              }
              @if (outrosVeiculos().length) {
                <h2 class="geo-secao">{{ meusVeiculos().length ? 'Outros veículos' : 'Veículos' }}</h2>
                <ul class="geo-grupo" role="listbox" aria-label="Veículos">
                  @for (v of outrosVeiculos(); track v.idVeiculo) { <li><ng-container *ngTemplateOutlet="linhaVeiculo; context: { $implicit: v }" /></li> }
                </ul>
              }
              @if (!meusVeiculos().length && !outrosVeiculos().length) {
                <geo-vazio icone="busca" titulo="Nenhum veículo encontrado" texto="Confira a placa digitada." />
              }
              @if (tentou() && pendencias().veiculo; as falta) {
                <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" /><span>{{ falta }}</span></p>
              }
            }

            @case ('inicio') {
              <ng-container *ngTemplateOutlet="cartaoVeiculo" />
              <h2 class="geo-secao">Condutor</h2>
              <div class="campos">
                <geo-seletor rotulo="Quem vai dirigir" [obrigatorio]="true" [opcoes]="opcoesCondutor()" [valor]="r.idCondutor"
                  (valorChange)="escolherCondutor($event)" [invalido]="tentou() && !r.idCondutor"
                  [aberto]="seletorAberto() === 'condutor'" (abertoChange)="seletorAberto.set($event ? 'condutor' : null)" />
                @if (cnh(); as c) {
                  @if (c.situacao === 'APTO') {
                    <p class="estado estado--ok"><geo-icone nome="check" [tamanho]="16" />CNH em dia para este veículo</p>
                  } @else if (c.liberado) {
                    <p class="geo-faixa-estado geo-faixa-estado--atencao"><geo-icone nome="info" [tamanho]="18" /><span>{{ c.mensagem }} O gestor liberou para hoje.</span></p>
                  } @else {
                    <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" /><span>{{ c.mensagem }} Peça ao gestor da frota a liberação para hoje.</span></p>
                  }
                }
              </div>
              <h2 class="geo-secao">Posto</h2>
              <div class="campos">
                <geo-seletor rotulo="Onde vai abastecer" [obrigatorio]="true" [opcoes]="opcoesPosto()" [valor]="r.idPosto"
                  [buscavel]="true" placeholderBusca="Nome do posto ou base"
                  (valorChange)="escolherPosto($event)" [invalido]="tentou() && !r.idPosto"
                  [aberto]="seletorAberto() === 'posto'" (abertoChange)="seletorAberto.set($event ? 'posto' : null)" />
                @if (!opcoesPosto().length) {
                  <p class="geo-faixa-estado geo-faixa-estado--erro"><geo-icone nome="alerta" [tamanho]="18" /><span>Nenhum posto cadastrado. Avise o administrativo.</span></p>
                } @else {
                  <p class="apoio">O administrativo pode trocar o posto na liberação, se este não puder atender.</p>
                }
              </div>
              <h2 class="geo-secao">Destino</h2>
              <div class="campos">
                <input class="geo-input" type="text" maxlength="200" enterkeyhint="done" [value]="r.destino ?? ''"
                  (input)="atualizar({ destino: $any($event.target).value })" placeholder="Ex.: Juazeiro → Sobradinho"
                  aria-label="Destino" [attr.aria-invalid]="tentou() && !r.destino?.trim() ? 'true' : null">
                @if (tentou() && !r.destino?.trim()) {
                  <p class="falta" role="alert">Informe para onde o veículo vai: o gestor define a quantidade pelo destino.</p>
                } @else {
                  <p class="apoio">Para onde o veículo vai. É por ele que o gestor define quanto abastecer.</p>
                }
              </div>
            }

            @case ('painel') {
              <ng-container *ngTemplateOutlet="cartaoVeiculo" />
              <h2 class="geo-secao">{{ horas() ? 'Horímetro' : 'Hodômetro' }}</h2>
              <div class="campos">
                <label class="medida" [class.medida--erro]="(tentou() && r.medicao === null) || !!erroMedicao()">
                  <span class="geo-sr-only">{{ horas() ? 'Horas no horímetro' : 'KM no painel' }}</span>
                  <input class="medida__valor geo-num" type="text" inputmode="numeric" autocomplete="off" placeholder="0"
                    [value]="r.medicao ?? ''" (input)="definirMedicao($any($event.target).value)">
                  <span class="medida__unidade">{{ horas() ? 'h' : 'km' }}</span>
                </label>
                @if (tentou() && r.medicao === null) {
                  <p class="falta" role="alert">{{ horas() ? 'Informe as horas do horímetro.' : 'Informe o KM do painel.' }}</p>
                } @else if (erroMedicao(); as erro) {
                  <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />
                    <span>{{ erro }} {{ intervalo() }}.</span></p>
                } @else if (veiculo()?.medicaoAtual != null) {
                  <p class="apoio">Último registro: <b class="geo-num">{{ medicaoTexto(veiculo()!.medicaoAtual!) }}</b>{{ intervalo() ? ' · ' + intervalo() : '' }}</p>
                }
              </div>
              <h2 class="geo-secao">Foto do painel</h2>
              <div class="campos">
                <label class="foto-grande" [class.foto-grande--feita]="!!r.fotoPainel" [class.foto-grande--pendente]="tentou() && !r.fotoPainel">
                  @if (r.fotoPainel && previa(r.fotoPainel); as url) {
                    <img [src]="url" alt="Foto do painel">
                    <span class="foto-grande__ok" aria-hidden="true"><geo-icone nome="check" [tamanho]="14" /></span>
                    <span class="foto-grande__refazer">Refazer</span>
                  } @else {
                    <geo-icone nome="camera" [tamanho]="30" />
                    <span class="foto-grande__tirar">{{ preparandoFoto() ? 'Preparando a foto…' : 'Tirar a foto do painel' }}</span>
                    <span class="foto-grande__dica">Mostre o {{ horas() ? 'horímetro' : 'KM' }} e o ponteiro do tanque na mesma foto</span>
                  }
                  <input type="file" accept="image/*" capture="environment" class="geo-sr-only" aria-label="Foto do painel" (change)="fotografarPainel($event)">
                </label>
                @if (tentou() && !r.fotoPainel) { <p class="falta" role="alert">Tire a foto do painel: o gestor confere o KM e o tanque por ela.</p> }
              </div>
            }

            @case ('itens') {
              @if (r.itens.length) {
                <h2 class="geo-secao"><span>O que vai abastecer</span><span class="geo-num">{{ r.itens.length }}</span></h2>
                <ul class="geo-grupo">
                  @for (i of r.itens; track i.idProduto) {
                    <li class="item">
                      <span class="geo-selo" [class.geo-selo--destaque]="i.categoria === 'COMBUSTIVEL'"><geo-icone [nome]="i.categoria === 'COMBUSTIVEL' ? 'combustivel' : 'material'" /></span>
                      <span class="item__texto">
                        <strong>{{ i.nome }}</strong>
                        <span>{{ rotuloCategoria[i.categoria] }}{{ i.idProduto === preferido() ? ' · da ficha do veículo' : '' }}</span>
                      </span>

                      <button type="button" class="geo-btn-icone tirar" (click)="tirarItem(i.idProduto)" [attr.aria-label]="'Tirar ' + i.nome"><geo-icone nome="fechar" [tamanho]="18" /></button>
                    </li>
                  }
                </ul>
                @if (tentou() && pendencias().itens; as falta) { <p class="falta falta--secao" role="alert"><geo-icone nome="alerta" [tamanho]="14" />{{ falta }}</p> }
                <p class="dica"><geo-icone nome="info" [tamanho]="18" />Você diz só o que precisa. Quem aprova define a quantidade pelo destino.</p>
              } @else {
                <geo-vazio icone="combustivel" titulo="Escolha o que vai abastecer" texto="Combustível, ARLA, óleo ou fluido. Cada um vai como um item separado no pedido." />
              }

              @for (cat of categorias; track cat) {
                @if (disponiveis(cat).length) {
                  <h2 class="geo-secao">{{ cat !== 'COMBUSTIVEL' ? 'Adicionar ' + rotuloCategoria[cat] : temCombustivel() ? 'Trocar o combustível' : 'Combustível' }}</h2>
                  <div class="chips">
                    @for (p of disponiveis(cat); track p.id) {
                      <button type="button" class="chip" [class.chip--sugerido]="p.id === preferido()" (click)="adicionarItem(p)">
                        <geo-icone nome="mais" [tamanho]="16" />{{ p.nome }}@if (p.id === preferido()) { <span class="chip__selo">da ficha</span> }
                      </button>
                    }
                  </div>
                }
              }
            }

            @case ('revisao') {
              <ng-container *ngTemplateOutlet="cartaoVeiculo" />
              <dl class="resumo">
                <div><dt>Condutor</dt><dd>{{ r.condutorNome }}</dd></div>
                <div><dt>Posto</dt><dd>{{ r.postoNome }}</dd></div>
                <div><dt>Destino</dt><dd>{{ r.destino }}</dd></div>
                <div><dt>{{ horas() ? 'Horímetro' : 'Hodômetro' }}</dt><dd class="geo-num">{{ r.medicao != null ? medicaoTexto(r.medicao) : '—' }}</dd></div>
                @for (i of r.itens; track i.idProduto) {
                  <div><dt>{{ i.nome }}</dt><dd>Quantidade pelo gestor</dd></div>
                }
              </dl>
              @if (r.fotoPainel && previa(r.fotoPainel); as url) {
                <div class="revisao-foto"><img [src]="url" alt="Foto do painel"><span>Foto do painel</span></div>
              }

              <h2 class="geo-secao">Observação</h2>
              <div class="campos">
                <textarea class="geo-input texto" rows="3" maxlength="500" [value]="r.observacao" (input)="atualizar({ observacao: $any($event.target).value })"
                  placeholder="Opcional. Ex.: tanque na reserva, viagem longa amanhã" aria-label="Observação"></textarea>
              </div>
              <p class="dica"><geo-icone nome="nuvem" [tamanho]="18" />Sem internet, fica salvo no aparelho com a foto e vai sozinho quando o sinal voltar.</p>
            }
          }
        </section>
      }
    </div>

    @if (catalogo() && frota() && registro()) {
      <footer class="rodape">
        @if (indice() > 0) { <button type="button" class="geo-btn geo-btn--neutro" (click)="voltar()">Voltar</button> }
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="avancar()" [disabled]="salvando() || preparandoFoto() || bloqueado()">
          @if (passo() === 'revisao') { {{ salvando() ? 'Salvando…' : 'Enviar pedido' }} }
          @else if (preparandoFoto()) { Preparando a foto… }
          @else { Continuar <geo-icone nome="seta" [tamanho]="18" /> }
        </button>
      </footer>
    }

    <ng-template #linhaVeiculo let-v>
      <button type="button" role="option" class="geo-linha geo-linha--acao veiculo" [attr.aria-selected]="registro()?.idVeiculo === v.idVeiculo" (click)="escolherVeiculo(v)">
        <span class="geo-selo" [class.geo-selo--destaque]="registro()?.idVeiculo === v.idVeiculo"><geo-icone nome="caminhao" /></span>
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo geo-num">{{ placa(v.placa) }}</span>
          <span class="geo-linha__resumo">{{ v.descricao ?? 'Sem descrição' }}</span>
          <span class="geo-linha__apoio">{{ v.baseNome ?? 'Sem base' }}{{ v.idCondutorAtual !== meuColaborador() && v.condutorAtualNome ? ' · com ' + v.condutorAtualNome : '' }}</span>
        </span>
        <span class="marca" aria-hidden="true"><geo-icone nome="check" [tamanho]="16" /></span>
      </button>
    </ng-template>

    <ng-template #cartaoVeiculo>
      @if (veiculo(); as v) {
        <div class="cartao">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="caminhao" /></span>
          <span class="cartao__texto">
            <strong class="geo-num">{{ placa(v.placa) }}</strong>
            <span>{{ v.descricao ?? 'Sem descrição' }}{{ v.baseNome ? ' · ' + v.baseNome : '' }}</span>
          </span>
        </div>
      }
    </ng-template>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .baixar { margin-top: var(--geo-e3); min-height: var(--geo-alvo-principal); padding: 0 var(--geo-e6); }
    .auto-salvo { display: inline-flex; align-items: center; gap: 4px; font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-ok); white-space: nowrap; }
    .passos { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 0 var(--geo-e5) var(--geo-e3); }
    .passos i { height: 4px; border-radius: var(--geo-r-pilula); background: var(--geo-linha); transition: background-color var(--geo-m-entrar); }
    .passos i.feito { background: var(--geo-destaque); }
    .conteudo { animation: entrar var(--geo-m-entrar) var(--geo-curva); }
    @keyframes entrar { from { opacity: 0; transform: translateY(6px); } }
    .campos { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--geo-e2); padding: 0 var(--geo-e3); }
    .geo-faixa-estado { margin: var(--geo-e3) var(--geo-e3) 0; }
    .campos .geo-faixa-estado { margin: 0; }
    .geo-faixa-estado span { flex: 1; font: var(--geo-t-apoio); font-size: .875rem; }
    .aviso-checklist { align-items: flex-start; }
    .aviso-checklist__texto { flex: 1; display: grid; justify-items: start; gap: 2px; }
    .aviso-checklist__texto .geo-btn { margin-left: -12px; color: var(--geo-atencao); }
    .apoio, .dica { margin: 0; padding: 0 var(--geo-e1); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .dica { display: flex; gap: var(--geo-e2); margin: var(--geo-e5) var(--geo-e5) 0; padding: 0; }
    .falta { display: flex; align-items: center; gap: 4px; margin: 0; padding: 0 var(--geo-e1); color: var(--geo-erro); font: var(--geo-t-apoio); font-weight: 600; }
    .falta--secao { padding: var(--geo-e2) var(--geo-e5) 0; }
    .estado { display: flex; align-items: center; gap: 6px; margin: 0; padding: 0 var(--geo-e1); font: var(--geo-t-apoio); font-weight: 500; }
    .estado--ok { color: var(--geo-ok); }
    .busca { display: flex; align-items: center; gap: var(--geo-e2); margin: var(--geo-e2) var(--geo-e3) 0; padding: 0 var(--geo-e4); min-height: 52px;
      background: var(--geo-superficie); border-radius: var(--geo-r-campo); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .veiculo { min-height: 72px; }
    .veiculo .geo-linha__titulo { font-size: 1rem; font-weight: 600; letter-spacing: .02em; }
    .veiculo[aria-selected='true'] { background: var(--geo-destaque-suave); }
    .marca { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex: none; border: 2px solid var(--geo-linha-forte); color: transparent; }
    .veiculo[aria-selected='true'] .marca { background: var(--geo-destaque); border-color: var(--geo-destaque); color: var(--geo-destaque-texto); }
    .cartao { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4);
      background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .cartao__texto { flex: 1; min-width: 0; display: grid; gap: 1px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .cartao__texto strong { font: 600 1.0625rem/1.3 var(--geo-fonte); letter-spacing: .02em; color: var(--geo-texto); }
    .medida { display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 64px; background: var(--geo-superficie);
      border: 1.5px solid var(--geo-linha); border-radius: var(--geo-r-campo); cursor: text; }
    .medida:focus-within { border-color: var(--geo-destaque); box-shadow: 0 0 0 3px var(--geo-destaque-suave); }
    .medida--erro { border-color: var(--geo-erro); }
    .medida--atencao { border-color: var(--geo-atencao); }
    .medida__valor { flex: 1; min-width: 0; width: 100%; align-self: stretch; padding: 0; border: 0; background: transparent; color: var(--geo-texto); font: 600 1.75rem/1 var(--geo-fonte); }
    .medida__valor:focus { outline: none; }
    .medida__valor::placeholder { color: var(--geo-texto-3); }
    .medida__unidade { font: 500 1rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .foto-grande { position: relative; display: grid; place-content: center; justify-items: center; gap: 6px; aspect-ratio: 4 / 3; overflow: hidden;
      border-radius: var(--geo-r-grupo); border: 1.5px dashed var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-destaque);
      cursor: pointer; text-align: center; padding: var(--geo-e4); }
    .foto-grande:active { transform: scale(.99); }
    .foto-grande--feita { border: 0; padding: 0; }
    .foto-grande--pendente { border-color: var(--geo-erro); border-style: solid; background: var(--geo-erro-suave); }
    .foto-grande img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto-grande__tirar { font: 600 1rem/1.2 var(--geo-fonte); }
    .foto-grande__dica { font: var(--geo-t-apoio); color: var(--geo-texto-2); max-width: 22rem; }
    .foto-grande__ok { position: absolute; top: 8px; left: 8px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--geo-ok); color: var(--geo-fundo); }
    .foto-grande__refazer { position: absolute; right: 8px; bottom: 8px; padding: 6px 10px; border-radius: var(--geo-r-pilula); background: rgba(0, 0, 0, .6); color: #fff; font: 600 .75rem/1 var(--geo-fonte); }
    .item { display: flex; align-items: center; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e2) var(--geo-e3) var(--geo-e4); min-height: 72px; }
    .item + .item { border-top: 1px solid var(--geo-linha); }
    .item__texto { flex: 1; min-width: 0; display: grid; gap: 2px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .item__texto strong { font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    .qtd { display: inline-flex; align-items: center; gap: 4px; min-height: 48px; padding: 0 var(--geo-e3); border-radius: var(--geo-r-campo);
      border: 1.5px solid var(--geo-linha-forte); background: var(--geo-fundo); cursor: text; }
    .qtd:focus-within { border-color: var(--geo-destaque); box-shadow: 0 0 0 3px var(--geo-destaque-suave); }
    .qtd--erro { border-color: var(--geo-erro); }
    .qtd input { width: 4.5ch; border: 0; background: transparent; color: var(--geo-texto); text-align: right; font: 600 1.125rem/1 var(--geo-fonte); }
    .qtd input:focus { outline: none; }
    .qtd span { font: 500 .875rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .tirar { color: var(--geo-texto-3); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--geo-e2); padding: 0 var(--geo-e3); }
    .chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: var(--geo-r-pilula);
      border: 1px solid var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-texto); font: 500 .9375rem/1 var(--geo-fonte); cursor: pointer; }
    .chip:active { transform: scale(.97); }
    .chip--sugerido { border-color: var(--geo-destaque); color: var(--geo-destaque); font-weight: 600; }
    .chip__selo { padding: 2px 6px; border-radius: var(--geo-r-pilula); background: var(--geo-destaque-suave); font: 600 .6875rem/1.2 var(--geo-fonte); }
    .resumo { margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e1) var(--geo-e4); background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .resumo > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--geo-e3); padding: var(--geo-e3) 0; border-bottom: 1px solid var(--geo-linha); }
    .resumo > div:last-child { border-bottom: 0; }
    .resumo dt { font: var(--geo-t-corpo); color: var(--geo-texto-2); }
    .resumo dd { margin: 0; font: var(--geo-t-corpo-forte); text-align: right; overflow-wrap: anywhere; }
    .revisao-foto { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e3) var(--geo-e3) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .revisao-foto img { width: 72px; height: 54px; border-radius: 10px; object-fit: cover; }
    .texto { min-height: 72px; padding-top: var(--geo-e3); resize: vertical; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .principal { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
  `]
})
export class AbastecimentoNovoComponent implements OnInit, OnDestroy {
  private readonly servico = inject(AbastecimentoService);
  private readonly checklist = inject(ChecklistVeiculoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  private readonly meuVeiculo = inject(MeuVeiculoService);

  protected readonly passos = PASSOS;
  protected readonly titulos = TITULOS;
  protected readonly categorias = CATEGORIAS;
  protected readonly rotuloCategoria = ROTULO_CATEGORIA;
  protected readonly catalogo = this.servico.catalogo;
  /** Veículos, condutores e liberações de CNH vêm do catálogo do checklist (o mesmo do aparelho). */
  protected readonly frota = this.checklist.catalogo;
  protected readonly registro = signal<AbastecimentoLocal | null>(null);
  protected readonly busca = signal('');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly preparandoFoto = signal(false);
  protected readonly seletorAberto = signal<string | null>(null);
  protected readonly baixando = signal(false);
  protected readonly meuColaborador = signal<string | null>(null);
  protected readonly aberto = signal<AbastecimentoLocal | null>(null);
  private readonly checklistsHoje = signal<Set<string>>(new Set());
  private readonly previas = new Map<string, string>();

  protected readonly indice = computed(() => Math.min((this.registro()?.passo ?? 1) - 1, PASSOS.length - 1));
  protected readonly passo = computed(() => PASSOS[this.indice()]);
  protected readonly veiculo = computed(() => this.frota()?.veiculos.find((v) => v.idVeiculo === this.registro()?.idVeiculo) ?? null);
  protected readonly horas = computed(() => this.veiculo()?.unidadeMedicao === 'HORAS');
  protected readonly pendencias = computed(() => pendenciasPedido(this.registro()!));
  protected readonly checklistHoje = computed(() => !!this.registro()?.idVeiculo && this.checklistsHoje().has(this.registro()!.idVeiculo!));
  protected readonly temCombustivel = computed(() => !!this.registro()?.itens.some((i) => i.categoria === 'COMBUSTIVEL'));
  protected readonly preferido = computed(() =>
    this.catalogo()?.preferidos.find((p) => p.idVeiculo === this.registro()?.idVeiculo)?.idProduto ?? null);
  protected readonly cnh = computed(() => {
    const c = this.frota();
    const v = this.veiculo();
    const r = this.registro();
    if (!c || !v || !r?.idCondutor) return null;
    return situacaoCnh(c.condutores.find((x) => x.idColaborador === r.idCondutor), v, c.liberacoesCnh, diaLocal());
  });
  protected readonly bloqueado = computed(() =>
    (this.passo() === 'veiculo' && !!this.aberto())
    || (this.passo() === 'inicio' && !!this.cnh() && this.cnh()!.situacao !== 'APTO' && !this.cnh()!.liberado));
  /** Trava do campo: valor menor que o último ou salto acima do limite não segue. */
  protected readonly erroMedicao = computed(() => {
    const v = this.veiculo();
    return v ? erroTravaMedicao(this.registro()?.medicao ?? null, v.medicaoAtual, v.limiteSalto, v.unidadeMedicao) : null;
  });
  protected readonly intervalo = computed(() => {
    const v = this.veiculo();
    return v ? intervaloAceito(v.medicaoAtual, v.limiteSalto, v.unidadeMedicao) : null;
  });

  private readonly veiculosFiltrados = computed(() => {
    const termo = this.busca().trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const todos = [...(this.frota()?.veiculos ?? [])].sort((a, b) => a.placa.localeCompare(b.placa));
    if (!termo) return todos;
    return todos.filter((v) => `${v.placa} ${v.descricao ?? ''} ${v.baseNome ?? ''}`.toLowerCase().includes(termo));
  });
  protected readonly meusVeiculos = computed(() => this.veiculosFiltrados().filter((v) => !!this.meuColaborador() && v.idCondutorAtual === this.meuColaborador()));
  protected readonly outrosVeiculos = computed(() => this.veiculosFiltrados().filter((v) => !this.meuColaborador() || v.idCondutorAtual !== this.meuColaborador()));

  protected readonly opcoesCondutor = computed<OpcaoSeletor[]>(() => {
    const c = this.frota();
    const v = this.veiculo();
    if (!c) return [];
    return c.condutores.map((x) => {
      const s = v ? situacaoCnh(x, v, c.liberacoesCnh, diaLocal()) : null;
      const apoio = x.idColaborador === this.meuColaborador() ? 'Você' : s && s.situacao !== 'APTO' ? (s.liberado ? 'Liberado pelo gestor hoje' : s.mensagem) : `CNH ${x.categoriaCnh ?? ''}`;
      return { valor: x.idColaborador, rotulo: x.nome, apoio };
    });
  });
  /** Postos da base do veículo primeiro. */
  protected readonly opcoesPosto = computed<OpcaoSeletor[]>(() => {
    const base = this.veiculo()?.idBaseOperacional;
    return [...(this.catalogo()?.postos ?? [])]
      .sort((a, b) => Number(b.idBaseOperacional === base) - Number(a.idBaseOperacional === base) || a.nome.localeCompare(b.nome))
      .map((p) => ({ valor: p.id, rotulo: p.nome, apoio: p.idBaseOperacional === base ? `${p.baseNome} · base do veículo` : p.baseNome ?? 'Sem base' }));
  });

  async ngOnInit(): Promise<void> {
    if (!this.catalogo()) await this.servico.carregarCatalogoLocal();
    if (!this.frota()) await this.checklist.carregarCatalogoLocal();
    const usuario = this.auth.currentUser()?.id;
    if (usuario) {
      const colaborador = await db.colaboradores.where('idUsuario').equals(usuario).first();
      this.meuColaborador.set(colaborador?.id ?? null);
    }
    const hoje = diaLocal();
    const feitos = (await this.checklist.listar()).filter((c) => c.statusSync !== 'RASCUNHO' && c.preenchidoEm && diaLocal(new Date(c.preenchidoEm)) === hoje);
    this.checklistsHoje.set(new Set(feitos.map((c) => c.idVeiculo!).filter(Boolean)));
    const rascunho = await this.servico.rascunhoAtual();
    this.registro.set(rascunho ?? this.servico.novoRascunho());
    if (rascunho?.idVeiculo) await this.verificarAberto(rascunho.idVeiculo);
    if (!rascunho) await this.sugerirMeuVeiculo();
    void this.atualizarEmSegundoPlano();
  }

  /**
   * Com sinal, renova os dados sem a pessoa esperar: o último KM do veículo e o combustível da ficha
   * podem ter mudado desde a última sincronização. Sem sinal, segue com o que está no aparelho.
   */
  private async atualizarEmSegundoPlano(): Promise<void> {
    if (!this.rede.isOnline() || !this.catalogo() || !this.frota()) return;
    try {
      await Promise.all([this.checklist.sincronizarCatalogo(), this.servico.sincronizarCatalogo()]);
    } catch {
      return;
    }
    const r = this.registro();
    if (!r) return;
    if (!r.idVeiculo) {
      await this.sugerirMeuVeiculo();
      return;
    }
    // Veículo já escolhido e nenhum item ainda: entra o combustível da ficha atualizada.
    const produto = this.catalogo()?.produtos.find((p) => p.id === this.preferido());
    if (!r.itens.length && produto) this.adicionarItem(produto);
  }

  ngOnDestroy(): void {
    this.previas.forEach((url) => URL.revokeObjectURL(url));
  }

  /** O veículo que está com a pessoa já vem marcado; só fica no aparelho quando ela mexer em algo. */
  private async sugerirMeuVeiculo(): Promise<void> {
    const veiculos = this.frota()?.veiculos ?? [];
    const id = await this.meuVeiculo.sugerido(veiculos);
    const v = veiculos.find((x) => x.idVeiculo === id);
    if (v && !this.registro()?.idVeiculo) await this.escolherVeiculo(v, false);
  }

  protected placa(placa: string | null): string {
    return formatarPlaca(placa);
  }

  protected medicaoTexto(valor: number): string {
    return `${valor.toLocaleString('pt-BR')} ${this.horas() ? 'h' : 'km'}`;
  }

  protected disponiveis(cat: CategoriaProduto): ProdutoCatalogo[] {
    const escolhidos = new Set(this.registro()?.itens.map((i) => i.idProduto));
    return (this.catalogo()?.produtos ?? [])
      .filter((p) => p.categoria === cat && !escolhidos.has(p.id))
      .sort((a, b) => Number(b.id === this.preferido()) - Number(a.id === this.preferido()) || a.nome.localeCompare(b.nome));
  }

  protected previa(f: FotoAbastecimentoLocal): string | null {
    if (!f.arquivo.size) return null;
    let url = this.previas.get(f.idFoto);
    if (!url) {
      url = URL.createObjectURL(f.arquivo);
      this.previas.set(f.idFoto, url);
    }
    return url;
  }

  /** Toda mudança vai para o aparelho na hora. */
  protected atualizar(mudanca: Partial<AbastecimentoLocal>, salvar = true): void {
    const atual = this.registro();
    if (!atual) return;
    const novo = { ...atual, ...mudanca };
    this.registro.set(novo);
    if (salvar) void this.servico.salvar(novo);
  }

  protected async escolherVeiculo(v: VeiculoChecklist, salvar = true): Promise<void> {
    const c = this.frota()!;
    const atual = this.registro()!;
    const condutor = atual.idCondutor ?? (this.meuColaborador() && c.condutores.some((x) => x.idColaborador === this.meuColaborador())
      ? this.meuColaborador() : v.idCondutorAtual);
    const postoDaBase = this.catalogo()?.postos.filter((p) => p.idBaseOperacional === v.idBaseOperacional) ?? [];
    const posto = atual.idPosto ?? (postoDaBase.length === 1 ? postoDaBase[0] : null)?.id ?? null;
    // O combustível da ficha já entra no pedido; a quantidade fica com quem aprova.
    const preferido = this.catalogo()?.preferidos.find((p) => p.idVeiculo === v.idVeiculo)?.idProduto;
    const produto = this.catalogo()?.produtos.find((p) => p.id === preferido);
    const itens = atual.idVeiculo === v.idVeiculo ? atual.itens
      : produto ? [{ idProduto: produto.id, nome: produto.nome, categoria: produto.categoria, unidade: produto.unidade }] : [];
    this.atualizar({
      idVeiculo: v.idVeiculo,
      placa: v.placa,
      idCondutor: condutor,
      condutorNome: c.condutores.find((x) => x.idColaborador === condutor)?.nome ?? null,
      idPosto: posto,
      postoNome: this.catalogo()?.postos.find((p) => p.id === posto)?.nome ?? null,
      medicao: atual.idVeiculo === v.idVeiculo ? atual.medicao : null,
      itens
    }, salvar);
    this.tentou.set(false);
    await this.verificarAberto(v.idVeiculo);
  }

  private async verificarAberto(idVeiculo: string): Promise<void> {
    this.aberto.set((await this.servico.abertoDoVeiculo(idVeiculo, this.registro()?.id)) ?? null);
  }

  protected escolherCondutor(id: string | null): void {
    this.atualizar({ idCondutor: id, condutorNome: this.frota()?.condutores.find((x) => x.idColaborador === id)?.nome ?? null });
  }

  protected escolherPosto(id: string | null): void {
    this.atualizar({ idPosto: id, postoNome: this.catalogo()?.postos.find((p) => p.id === id)?.nome ?? null });
  }

  protected definirMedicao(texto: string): void {
    const digitos = texto.replace(/\D/g, '');
    this.atualizar({ medicao: digitos ? Number(digitos) : null });
  }

  protected adicionarItem(p: ProdutoCatalogo): void {
    const itens = this.registro()!.itens;
    // Um combustível por pedido: escolher outro troca o anterior.
    const semOutroCombustivel = p.categoria === 'COMBUSTIVEL' ? itens.filter((i) => i.categoria !== 'COMBUSTIVEL') : itens;
    const novo: ItemPedidoLocal = { idProduto: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade };
    const ordem = (i: ItemPedidoLocal) => CATEGORIAS.indexOf(i.categoria);
    this.atualizar({ itens: [...semOutroCombustivel, novo].sort((a, b) => ordem(a) - ordem(b)) });
  }

  protected tirarItem(idProduto: string): void {
    this.atualizar({ itens: this.registro()!.itens.filter((i) => i.idProduto !== idProduto) });
  }


  protected async fotografarPainel(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    this.preparandoFoto.set(true);
    try {
      const preparada = await prepararEvidencia(arquivo);
      this.atualizar({ fotoPainel: { idFoto: crypto.randomUUID(), arquivo: preparada.arquivo, nomeArquivo: preparada.nomeArquivo, enviada: false } });
    } catch {
      this.toast.error('Não foi possível ler a foto. Tente de novo.');
    } finally {
      this.preparandoFoto.set(false);
    }
  }

  /** Baixa os dados sem sair do pedido (catálogo do checklist e do abastecimento). */
  protected async baixar(): Promise<void> {
    if (!this.rede.isOnline()) {
      this.toast.warning('Sem internet. Conecte e tente de novo.');
      return;
    }
    this.baixando.set(true);
    try {
      if (!this.frota()) await this.checklist.sincronizarCatalogo();
      await this.servico.sincronizarCatalogo();
      if (!this.registro()?.idVeiculo) await this.sugerirMeuVeiculo();
    } catch {
      this.toast.error('Não foi possível baixar agora. Tente de novo.');
    } finally {
      this.baixando.set(false);
    }
  }

  protected fazerChecklist(): void {
    void this.router.navigate(['/checklist/novo']);
  }

  protected voltar(): void {
    this.tentou.set(false);
    this.atualizar({ passo: Math.max(1, this.indice()) });
  }

  protected async avancar(): Promise<void> {
    this.tentou.set(true);
    const pend = this.pendencias();
    const p = this.passo();
    const ok = p === 'veiculo' ? !pend.veiculo && !this.aberto()
      : p === 'inicio' ? !!this.registro()!.idCondutor && !!this.registro()!.idPosto && !!this.registro()!.destino?.trim() && !this.bloqueado()
        : p === 'painel' ? this.registro()!.medicao !== null && !this.erroMedicao() && !pend.foto
          : p === 'itens' ? !pend.itens
            : true;
    if (!ok) return;
    this.tentou.set(false);
    if (p !== 'revisao') {
      this.atualizar({ passo: this.indice() + 2 });
      window.scrollTo({ top: 0 });
      return;
    }
    await this.enviar();
  }

  private async enviar(): Promise<void> {
    this.salvando.set(true);
    try {
      await this.servico.enfileirarPedido({ ...this.registro()!, solicitadoEm: new Date().toISOString() });
      this.toast.success(this.rede.isOnline() ? 'Pedido salvo. Enviando ao gestor…' : 'Pedido salvo no aparelho. Vai sozinho quando o sinal voltar.');
      if (this.rede.isOnline()) void this.sync.syncOutbox().catch(() => undefined);
      await this.router.navigate(['/abastecimento']);
    } finally {
      this.salvando.set(false);
    }
  }

  protected fechar(): void {
    void this.router.navigate(['/abastecimento']);
  }
}
