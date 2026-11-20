import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { db } from '../../core/db/app-db';
import {
  ChecklistVeiculoLocal,
  FotoChecklistLocal,
  GrupoPerguntas,
  PerguntaChecklist,
  RespostaLocal,
  VeiculoChecklist,
  diaLocal,
  formatarPlaca,
  gruposDePerguntas,
  modelosDoVeiculo,
  pendenciaDaPergunta,
  respostaComProblema,
  situacaoCnh,
  FinalidadeChecklist,
  ROTULO_FINALIDADE,
  erroTravaMedicao,
  fotoExigida,
  intervaloAceito,
  modoFoto
} from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { MeuVeiculoService } from '../../core/frota/meu-veiculo';
import { prepararEvidencia } from '../../core/sst/evidencia-foto.util';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';

type Passo = { tipo: 'veiculo' | 'inicio' | 'itens' | 'recebimento' | 'revisao' };

/**
 * Checklist do veículo: veículo → condutor e painel → itens (todos numa tela, por grupo) →
 * [fotos de recebimento] → conferir. É rascunho contínuo: cada toque grava no aparelho, e as
 * fotos ficam guardadas no instante da captura. No fim, fica salvo no aparelho e vai pela fila.
 */
@Component({
  selector: 'app-checklist-veiculo-novo',
  standalone: true,
  imports: [NgTemplateOutlet, BarraTopoComponent, IconeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Checklist do veículo" [subtitulo]="tituloPasso() + ' · ' + (indice() + 1) + ' de ' + passos().length"
        navegacao="fechar" (voltar)="fechar()">
        <span class="auto-salvo" role="status" aria-label="Salvo automaticamente"><geo-icone nome="check" [tamanho]="14" />Salvo</span>
      </geo-barra-topo>
      <div class="geo-passos" aria-hidden="true">
        @for (p of passos(); track $index) { <i [class.feito]="$index <= indice()"></i> }
      </div>

      @if (!catalogo()) {
        <geo-vazio icone="nuvem" titulo="Falta baixar os checklists"
          texto="Sincronize o app com internet para baixar os veículos e as perguntas. Depois funciona sem sinal." />
      } @else if (registro(); as r) {
        <section class="conteudo" [attr.aria-label]="tituloPasso()">
          @switch (passo().tipo) {
            @case ('veiculo') {
              @if (catalogo()!.veiculos.length > 6) {
                <div class="busca">
                  <geo-icone nome="busca" [tamanho]="20" />
                  <input type="search" placeholder="Buscar por placa ou descrição" enterkeyhint="search" aria-label="Buscar veículo"
                    [value]="busca()" (input)="busca.set($any($event.target).value)">
                </div>
              }
              @if (meusVeiculos().length) {
                <h2 class="geo-secao">Com você</h2>
                <ul class="geo-grupo" role="listbox" aria-label="Veículos com você">
                  @for (v of meusVeiculos(); track v.idVeiculo) {
                    <li><ng-container *ngTemplateOutlet="linhaVeiculo; context: { $implicit: v }" /></li>
                  }
                </ul>
              }
              @if (outrosVeiculos().length) {
                <h2 class="geo-secao">{{ meusVeiculos().length ? 'Outros veículos' : 'Veículos' }}</h2>
                <ul class="geo-grupo" role="listbox" aria-label="Veículos">
                  @for (v of outrosVeiculos(); track v.idVeiculo) {
                    <li><ng-container *ngTemplateOutlet="linhaVeiculo; context: { $implicit: v }" /></li>
                  }
                </ul>
              }
              @if (!meusVeiculos().length && !outrosVeiculos().length) {
                <geo-vazio icone="busca" titulo="Nenhum veículo encontrado" texto="Confira a placa digitada." />
              }
              @if (tentou() && !r.idVeiculo) {
                <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" /><span>Escolha o veículo que vai usar.</span></p>
              }
              @if (semModelo()) {
                <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />
                  <span>Este veículo ainda não tem checklist configurado. Avise o gestor da frota.</span></p>
              }
            }

            @case ('inicio') {
              <ng-container *ngTemplateOutlet="cartaoVeiculo" />

              @if (podeRegistrarSemCondutor()) {
                <h2 class="geo-secao">Para que é o checklist</h2>
                <div class="chips" role="radiogroup" aria-label="Para que é o checklist">
                  @for (f of finalidades; track f) {
                    <button type="button" role="radio" class="chip" [attr.aria-checked]="finalidade() === f" (click)="escolherFinalidade(f)">
                      {{ f === 'USO' ? 'Vou usar' : rotuloFinalidade[f] }}
                    </button>
                  }
                </div>
                @if (finalidade() !== 'USO') {
                  <p class="geo-faixa-estado"><geo-icone nome="documento" [tamanho]="18" />
                    <span>Registro sem condutor: não passa o veículo para ninguém nem conta como o checklist do dia. Os Não OK vão para o gestor.</span></p>
                }
              }

              @if (finalidade() === 'USO') {
              <h2 class="geo-secao">Condutor</h2>
              <div class="campos">
                <geo-seletor rotulo="Quem vai dirigir" [obrigatorio]="true" [opcoes]="opcoesCondutor()" [valor]="r.idCondutor"
                  (valorChange)="escolherCondutor($event)" [invalido]="tentou() && !r.idCondutor"
                  [aberto]="seletorAberto() === 'condutor'" (abertoChange)="seletorAberto.set($event ? 'condutor' : null)" />
                @if (cnh(); as c) {
                  @if (c.situacao === 'APTO') {
                    <p class="estado estado--ok"><geo-icone nome="check" [tamanho]="16" />CNH {{ categoriaCondutor() }} em dia para este veículo</p>
                  } @else if (c.liberado) {
                    <p class="geo-faixa-estado geo-faixa-estado--atencao"><geo-icone nome="info" [tamanho]="18" /><span>{{ c.mensagem }} O gestor liberou para hoje.</span></p>
                  } @else {
                    <!-- A CNH só avisa no checklist: o bloqueio fica no abastecimento (gestores, 23/10/2026). -->
                    <p class="geo-faixa-estado geo-faixa-estado--atencao" role="status"><geo-icone nome="alerta" [tamanho]="18" />
                      <span>{{ c.mensagem }} O checklist vale e o gestor é avisado. O abastecimento fica bloqueado até renovar a CNH ou o gestor liberar.</span></p>
                  }
                }
                @if (principais().length > 1) {
                  <geo-seletor rotulo="Checklist" [opcoes]="opcoesModelo()" [valor]="r.idModelo" (valorChange)="escolherModelo($event)"
                    [aberto]="seletorAberto() === 'modelo'" (abertoChange)="seletorAberto.set($event ? 'modelo' : null)" />
                }
              </div>
              }

              <h2 class="geo-secao">{{ horas() ? 'Horímetro' : 'Hodômetro' }}</h2>
              <div class="campos">
                <label class="medida" [class.medida--erro]="(tentou() && r.medicao === null) || !!erroMedicao()">
                  <span class="geo-sr-only">{{ horas() ? 'Horas no horímetro' : 'KM no painel' }}</span>
                  <input class="medida__valor geo-num" type="text" inputmode="numeric" autocomplete="off" placeholder="0"
                    [value]="r.medicao ?? ''" (input)="definirMedicao($any($event.target).value)"
                    [attr.aria-invalid]="(tentou() && r.medicao === null) || erroMedicao() ? 'true' : null">
                  <span class="medida__unidade">{{ horas() ? 'h' : 'km' }}</span>
                </label>
                @if (tentou() && r.medicao === null) {
                  <p class="falta" role="alert">{{ horas() ? 'Informe as horas que aparecem no horímetro.' : 'Informe o KM que aparece no painel.' }}</p>
                } @else if (erroMedicao(); as erro) {
                  <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />
                    <span>{{ erro }} {{ intervalo() }}.</span></p>
                } @else if (veiculo()?.medicaoAtual != null) {
                  <p class="apoio">Último registro: <b class="geo-num">{{ formatarMedicao(veiculo()!.medicaoAtual!) }}</b>{{ intervalo() ? ' · ' + intervalo() : '' }}</p>
                }
              </div>

              @if (finalidade() === 'USO' && r.idCondutor && troca()) {
                <p class="geo-faixa-estado"><geo-icone nome="camera" [tamanho]="18" />
                  <span>{{ veiculo()?.condutorAtualNome ? 'Você está recebendo o veículo de ' + veiculo()!.condutorAtualNome + '.' : 'Primeiro checklist deste condutor no veículo.' }}
                    No fim, o app pede as fotos de recebimento.</span></p>
              }
              @if (modelo()?.instrucoes) {
                <p class="geo-faixa-estado"><geo-icone nome="documento" [tamanho]="18" /><span>{{ modelo()!.instrucoes }}</span></p>
              }
            }

            @case ('itens') {
              <div class="progresso" role="status">
                <div class="progresso__texto">
                  <span><b class="geo-num">{{ respondidas() }}</b> de <span class="geo-num">{{ totalPerguntas() }}</span> conferidos</span>
                  @if (problemas().length) {
                    <span class="geo-etiqueta geo-etiqueta--atencao">{{ problemas().length }} {{ problemas().length === 1 ? 'problema' : 'problemas' }}</span>
                  }
                </div>
                <div class="progresso__barra" aria-hidden="true"><i [style.width.%]="percentual()"></i></div>
              </div>

              @for (g of grupos(); track g.titulo) {
                <div class="geo-secao grupo">
                  <h2>{{ g.titulo }}</h2>
                  @if (abertosOkNok(g) > 1) {
                    <button type="button" class="tudo-ok" (click)="marcarTudoOk(g)"><geo-icone nome="check" [tamanho]="16" />{{ abertosOkNok(g) === totalOkNok(g) ? 'Marcar todos OK' : 'Marcar o resto OK' }}</button>
                  }
                </div>
                <ul class="geo-grupo">
                  @for (p of g.perguntas; track p.id) {
                    <li class="pergunta" [id]="'pergunta-' + p.id" [class.pergunta--pendente]="tentou() && !!pendencia(p)">
                      <div class="pergunta__linha">
                        <span class="pergunta__texto">{{ p.texto }}</span>
                        @if (p.tipoResposta === 'OK_NOK') {
                          <span class="resp" role="radiogroup" [attr.aria-label]="p.texto">
                            <button type="button" role="radio" class="resp__btn resp__btn--ok" aria-label="OK"
                              [attr.aria-checked]="resposta(p.id)?.conforme === true" (click)="marcar(p, true)"><geo-icone nome="check" [tamanho]="22" /></button>
                            <button type="button" role="radio" class="resp__btn resp__btn--nok" aria-label="Não OK"
                              [attr.aria-checked]="resposta(p.id)?.conforme === false" (click)="marcar(p, false)"><geo-icone nome="fechar" [tamanho]="20" /></button>
                          </span>
                        }
                      </div>
                      @if (p.tipoResposta === 'OPCOES') {
                        <div class="opcoes" role="radiogroup" [attr.aria-label]="p.texto">
                          @for (o of p.opcoes; track o.id) {
                            <button type="button" role="radio" class="opcao" [class.opcao--problema]="o.indicaProblema"
                              [attr.aria-checked]="resposta(p.id)?.idAlternativa === o.id" (click)="escolherOpcao(p, o.id)">
                              @if (resposta(p.id)?.idAlternativa === o.id) { <geo-icone nome="check" [tamanho]="16" /> }{{ o.texto }}</button>
                          }
                        </div>
                      } @else if (p.tipoResposta === 'TEXTO') {
                        <textarea class="geo-input texto" rows="2" [value]="resposta(p.id)?.texto ?? ''" (input)="escrever(p, $any($event.target).value)"
                          [attr.aria-label]="p.texto" placeholder="Escreva aqui"></textarea>
                      }

                      @if (problema(p)) {
                        <div class="detalhe">
                          @if (p.tipoResposta === 'OK_NOK' && p.motivos.length) {
                            <div class="detalhe__bloco">
                              <span class="detalhe__rotulo">Qual o problema?</span>
                              <div class="opcoes" role="radiogroup" aria-label="Qual o problema">
                                @for (m of p.motivos; track m.id) {
                                  <button type="button" role="radio" class="opcao opcao--problema" [attr.aria-checked]="resposta(p.id)?.idAlternativa === m.id"
                                    (click)="escolherMotivo(p, m.id)">
                                    @if (resposta(p.id)?.idAlternativa === m.id) { <geo-icone nome="check" [tamanho]="16" /> }{{ m.texto }}</button>
                                }
                              </div>
                            </div>
                          }
                          <div class="detalhe__bloco">
                            <span class="detalhe__rotulo">Fotos
                              @if (fotoExigida(p, resposta(p.id)) && !(resposta(p.id)?.fotos?.length)) { <span class="detalhe__obrig">· obrigatória</span> }
                            </span>
                            <div class="fotos">
                              @for (f of resposta(p.id)?.fotos ?? []; track f.idFoto) {
                                <span class="mini">
                                  @if (previa(f); as url) { <img [src]="url" alt="Foto do problema"> }
                                  <button type="button" class="mini__tirar" (click)="removerFoto(p, f.idFoto)" aria-label="Tirar a foto"><geo-icone nome="fechar" [tamanho]="12" /></button>
                                </span>
                              }
                              <label class="add-foto" [class.add-foto--pedida]="fotoExigida(p, resposta(p.id)) && !(resposta(p.id)?.fotos?.length)">
                                <geo-icone nome="camera" [tamanho]="22" />
                                <span>{{ (resposta(p.id)?.fotos?.length) ? 'Outra' : 'Tirar' }}</span>
                                <input type="file" accept="image/*" capture="environment" class="geo-sr-only" aria-label="Tirar foto do problema" (change)="fotografar($event, p)">
                              </label>
                            </div>
                          </div>
                          <input class="geo-input detalhe__comentario" type="text" [value]="resposta(p.id)?.comentario ?? ''" maxlength="500"
                            (input)="comentar(p, $any($event.target).value)" placeholder="Comentário (opcional)" aria-label="Comentário">
                        </div>
                      } @else if (modoFoto(p) === 'SEMPRE' && !pendenciaSemFoto(p)) {
                        <!-- Foto pedida em todo checklist (ex.: extintor, macaco, triângulo), mesmo com OK. -->
                        <div class="detalhe detalhe--foto">
                          <div class="detalhe__bloco">
                            <span class="detalhe__rotulo">Foto do item
                              @if (!(resposta(p.id)?.fotos?.length)) { <span class="detalhe__obrig">· obrigatória</span> }
                            </span>
                            <div class="fotos">
                              @for (f of resposta(p.id)?.fotos ?? []; track f.idFoto) {
                                <span class="mini">
                                  @if (previa(f); as url) { <img [src]="url" [alt]="'Foto de ' + p.texto"> }
                                  <button type="button" class="mini__tirar" (click)="removerFoto(p, f.idFoto)" aria-label="Tirar a foto"><geo-icone nome="fechar" [tamanho]="12" /></button>
                                </span>
                              }
                              <label class="add-foto" [class.add-foto--pedida]="!(resposta(p.id)?.fotos?.length)">
                                <geo-icone nome="camera" [tamanho]="22" />
                                <span>{{ (resposta(p.id)?.fotos?.length) ? 'Outra' : 'Tirar' }}</span>
                                <input type="file" accept="image/*" capture="environment" class="geo-sr-only" [attr.aria-label]="'Tirar foto de ' + p.texto" (change)="fotografar($event, p)">
                              </label>
                            </div>
                          </div>
                        </div>
                      }
                      @if (tentou() && pendencia(p); as falta) { <p class="falta" role="alert"><geo-icone nome="alerta" [tamanho]="14" />{{ falta }}</p> }
                    </li>
                  }
                </ul>
              }
            }

            @case ('recebimento') {
              <p class="geo-faixa-estado"><geo-icone nome="camera" [tamanho]="18" />
                <span>Você está recebendo o veículo. As fotos mostram como ele estava; toque em cada uma para fotografar.</span></p>
              <h2 class="geo-secao"><span>Fotos</span><span class="geo-num">{{ fotosRecebidas() }} de {{ modelo()?.fotosRecebimento?.length ?? 0 }}</span></h2>
              <ul class="receb">
                @for (pedida of modelo()?.fotosRecebimento ?? []; track pedida.id) {
                  <li>
                    <label class="receb__foto" [class.receb__foto--feita]="!!fotoRecebimento(pedida.id)" [class.receb__foto--pendente]="tentou() && !fotoRecebimento(pedida.id)">
                      @if (fotoRecebimento(pedida.id); as f) {
                        @if (previa(f); as url) { <img [src]="url" [alt]="pedida.descricao"> }
                        <span class="receb__ok" aria-hidden="true"><geo-icone nome="check" [tamanho]="14" /></span>
                        <span class="receb__refazer">Refazer</span>
                      } @else {
                        <geo-icone nome="camera" [tamanho]="26" />
                        <span class="receb__tirar">Tirar foto</span>
                      }
                      <input type="file" accept="image/*" capture="environment" class="geo-sr-only" [attr.aria-label]="'Foto: ' + pedida.descricao"
                        (change)="fotografarRecebimento($event, pedida.id)">
                    </label>
                    <span class="receb__rotulo">{{ pedida.descricao }}</span>
                  </li>
                }
              </ul>
            }

            @case ('revisao') {
              <ng-container *ngTemplateOutlet="cartaoVeiculo" />
              <dl class="resumo">
                <div><dt>{{ finalidade() === 'USO' ? 'Condutor' : 'Checklist' }}</dt><dd>{{ finalidade() === 'USO' ? r.condutorNome : rotuloFinalidade[finalidade()] + ', sem condutor' }}</dd></div>
                <div><dt>{{ horas() ? 'Horímetro' : 'Hodômetro' }}</dt><dd class="geo-num">{{ r.medicao != null ? formatarMedicao(r.medicao) : '—' }}</dd></div>
                <div><dt>Itens conferidos</dt><dd class="geo-num">{{ totalPerguntas() }}</dd></div>
                @if (troca()) { <div><dt>Fotos de recebimento</dt><dd class="geo-num">{{ fotosRecebidas() }}</dd></div> }
              </dl>

              @if (problemas().length) {
                <h2 class="geo-secao"><span>Vão para o gestor</span><span class="geo-num">{{ problemas().length }}</span></h2>
                <ul class="geo-grupo">
                  @for (p of problemas(); track p.id) {
                    <li>
                      <button type="button" class="geo-linha geo-linha--acao" (click)="irPara(p)">
                        @if (primeiraFoto(p); as url) { <img class="miniatura" [src]="url" alt=""> }
                        @else { <span class="geo-selo geo-selo--atencao"><geo-icone nome="alerta" /></span> }
                        <span class="geo-linha__texto">
                          <span class="geo-linha__titulo">{{ p.texto }}</span>
                          <span class="geo-linha__apoio">{{ detalheProblema(p) }}</span>
                        </span>
                        <geo-icone nome="editar" [tamanho]="18" />
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="estado estado--ok estado--bloco"><geo-icone nome="check" [tamanho]="18" />Tudo OK. Nenhum problema para o gestor.</p>
              }

              <h2 class="geo-secao">Observação geral</h2>
              <div class="campos">
                <textarea id="comentario" class="geo-input texto" rows="3" [value]="r.comentario" (input)="atualizar({ comentario: $any($event.target).value })"
                  placeholder="Opcional" aria-label="Observação geral"></textarea>
                @if (modelo()?.exigeAssinatura) {
                  <button type="button" role="switch" class="interruptor" [attr.aria-checked]="r.assinado" (click)="atualizar({ assinado: !r.assinado })">
                    <span class="txt"><b>Confirmo que conferi o veículo</b><span>Fica registrado com o seu login.</span></span>
                    <span class="geo-interruptor" aria-hidden="true"><span></span></span>
                  </button>
                  @if (tentou() && !r.assinado) { <p class="falta" role="alert">Confirme para enviar.</p> }
                }
              </div>
              <p class="dica"><geo-icone nome="nuvem" [tamanho]="18" />Sem internet, fica salvo no aparelho com as fotos e vai sozinho quando o sinal voltar.</p>
            }
          }
        </section>
      }
    </div>

    @if (catalogo() && registro()) {
      <footer class="rodape" data-acao-fixa>
        @if (indice() > 0) { <button type="button" class="geo-btn geo-btn--neutro" (click)="voltar()">Voltar</button> }
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="avancar()" [disabled]="salvando() || preparandoFoto()">
          @if (passo().tipo === 'revisao') { {{ salvando() ? 'Salvando…' : 'Enviar checklist' }} }
          @else if (preparandoFoto()) { Preparando a foto… }
          @else if (passo().tipo === 'itens' && faltam() > 0) { {{ faltam() === 1 ? 'Falta 1 item' : 'Faltam ' + faltam() + ' itens' }} }
          @else if (passo().tipo === 'recebimento' && fotosFaltando() > 0) { {{ fotosFaltando() === 1 ? 'Falta 1 foto' : 'Faltam ' + fotosFaltando() + ' fotos' }} }
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
          @if (modelo(); as m) { <span class="geo-etiqueta">{{ m.nome }}</span> }
        </div>
      }
    </ng-template>
  `,
  // Estilos por etapa do fluxo (cada arquivo fica dentro do limite de CSS por componente).
  styleUrls: ['./checklist-veiculo-novo.scss', './checklist-veiculo-novo.itens.scss', './checklist-veiculo-novo.conferir.scss']
})
export class ChecklistVeiculoNovoComponent implements OnInit, OnDestroy {
  private readonly servico = inject(ChecklistVeiculoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  private readonly meuVeiculo = inject(MeuVeiculoService);
  /** Para onde voltar ao enviar ou fechar (ex.: a abertura do turno, que pede o checklist do veículo). */
  private readonly volta = rotaInterna(this.rota.snapshot.queryParamMap.get('volta')) ?? '/checklist';

  protected readonly catalogo = this.servico.catalogo;
  protected readonly registro = signal<ChecklistVeiculoLocal | null>(null);
  protected readonly busca = signal('');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly preparandoFoto = signal(false);
  protected readonly atualizandoCatalogo = signal(false);
  protected readonly seletorAberto = signal<string | null>(null);
  protected readonly meuColaborador = signal<string | null>(null);
  private readonly previas = new Map<string, string>();

  protected readonly veiculo = computed(() => this.catalogo()?.veiculos.find((v) => v.idVeiculo === this.registro()?.idVeiculo) ?? null);
  protected readonly principais = computed(() => {
    const c = this.catalogo();
    const v = this.veiculo();
    return c && v ? modelosDoVeiculo(c, v).principais : [];
  });
  protected readonly modelos = computed(() => {
    const c = this.catalogo();
    const v = this.veiculo();
    return c && v ? modelosDoVeiculo(c, v, this.registro()?.idModelo) : null;
  });
  protected readonly modelo = computed(() => this.modelos()?.principal ?? null);
  protected readonly semModelo = computed(() => !!this.veiculo() && !this.modelo());
  protected readonly grupos = computed(() => {
    const m = this.modelos();
    return m?.principal ? gruposDePerguntas(m.principal, m.adicionais) : [];
  });
  protected readonly todasPerguntas = computed(() => this.grupos().flatMap((g) => g.perguntas));
  protected readonly totalPerguntas = computed(() => this.todasPerguntas().length);
  protected readonly problemas = computed(() => this.todasPerguntas().filter((p) => this.problema(p)));
  protected readonly horas = computed(() => this.veiculo()?.unidadeMedicao === 'HORAS');
  /** Troca de condutor: o servidor exige as fotos quando o condutor muda (ou não havia ninguém com o veículo). */
  protected readonly troca = computed(() => {
    const v = this.veiculo();
    const r = this.registro();
    return this.finalidade() === 'USO' && !!v && !!r?.idCondutor && v.idCondutorAtual !== r.idCondutor && !!this.modelo()?.fotosRecebimento.length;
  });
  /** Recebimento e devolução sem condutor: só administrativo com a permissão. */
  protected readonly podeRegistrarSemCondutor = computed(() => this.auth.isAdministrativo() && this.auth.temPermissao('frota:checklist:registrar'));
  protected readonly finalidade = computed<FinalidadeChecklist>(() => this.registro()?.finalidade ?? 'USO');
  protected readonly finalidades: FinalidadeChecklist[] = ['USO', 'RECEBIMENTO', 'DEVOLUCAO'];
  protected readonly rotuloFinalidade = ROTULO_FINALIDADE;
  protected readonly fotoExigida = fotoExigida;
  protected readonly modoFoto = modoFoto;
  /** A pergunta ainda não foi respondida (a foto vem depois da resposta). */
  protected pendenciaSemFoto(p: PerguntaChecklist): boolean {
    const r = this.resposta(p.id);
    return p.tipoResposta === 'OK_NOK' ? r?.conforme === undefined : p.tipoResposta === 'OPCOES' ? !r?.idAlternativa : !r?.texto?.trim();
  }
  protected readonly cnh = computed(() => {
    const c = this.catalogo();
    const v = this.veiculo();
    const r = this.registro();
    if (!c || !v || !r?.idCondutor) return null;
    return situacaoCnh(c.condutores.find((x) => x.idColaborador === r.idCondutor), v, c.liberacoesCnh, diaLocal());
  });
  /** Trava do campo: valor menor que o último ou salto acima do limite não segue. */
  protected readonly erroMedicao = computed(() => {
    const v = this.veiculo();
    return v ? erroTravaMedicao(this.registro()?.medicao ?? null, v.medicaoAtual, v.limiteSalto, v.unidadeMedicao) : null;
  });
  protected readonly intervalo = computed(() => {
    const v = this.veiculo();
    return v ? intervaloAceito(v.medicaoAtual, v.limiteSalto, v.unidadeMedicao) : null;
  });

  protected readonly passos = computed<Passo[]>(() => [
    { tipo: 'veiculo' },
    { tipo: 'inicio' },
    { tipo: 'itens' },
    ...(this.troca() ? [{ tipo: 'recebimento' as const }] : []),
    { tipo: 'revisao' }
  ]);
  protected readonly indice = computed(() => Math.min((this.registro()?.passo ?? 1) - 1, this.passos().length - 1));
  protected readonly passo = computed(() => this.passos()[this.indice()]);
  protected readonly tituloPasso = computed(() => {
    const p = this.passo();
    switch (p.tipo) {
      case 'veiculo': return 'Veículo';
      case 'inicio': return 'Condutor e painel';
      case 'itens': return 'Itens';
      case 'recebimento': return 'Fotos de recebimento';
      default: return 'Conferir';
    }
  });

  private readonly veiculosFiltrados = computed(() => {
    const termo = this.busca().trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const todos = [...(this.catalogo()?.veiculos ?? [])].sort((a, b) => a.placa.localeCompare(b.placa));
    if (!termo) return todos;
    return todos.filter((v) => `${v.placa} ${v.descricao ?? ''} ${v.baseNome ?? ''}`.toLowerCase().includes(termo));
  });
  protected readonly meusVeiculos = computed(() =>
    this.veiculosFiltrados().filter((v) => !!this.meuColaborador() && v.idCondutorAtual === this.meuColaborador()));
  protected readonly outrosVeiculos = computed(() =>
    this.veiculosFiltrados().filter((v) => !this.meuColaborador() || v.idCondutorAtual !== this.meuColaborador()));

  protected readonly respondidas = computed(() => this.todasPerguntas().filter((p) => !this.pendencia(p)).length);
  protected readonly faltam = computed(() => this.totalPerguntas() - this.respondidas());
  protected readonly percentual = computed(() => (this.totalPerguntas() ? (this.respondidas() / this.totalPerguntas()) * 100 : 0));
  protected readonly fotosRecebidas = computed(() =>
    (this.modelo()?.fotosRecebimento ?? []).filter((f) => !!this.fotoRecebimento(f.id)).length);
  protected readonly fotosFaltando = computed(() => (this.modelo()?.fotosRecebimento.length ?? 0) - this.fotosRecebidas());
  protected readonly categoriaCondutor = computed(() =>
    this.catalogo()?.condutores.find((x) => x.idColaborador === this.registro()?.idCondutor)?.categoriaCnh ?? '');
  protected readonly opcoesCondutor = computed<OpcaoSeletor[]>(() => {
    const c = this.catalogo();
    const v = this.veiculo();
    if (!c) return [];
    return c.condutores.map((x) => {
      const s = v ? situacaoCnh(x, v, c.liberacoesCnh, diaLocal()) : null;
      const apoio = x.idColaborador === this.meuColaborador() ? 'Você' : s && s.situacao !== 'APTO' ? (s.liberado ? 'Liberado pelo gestor hoje' : s.mensagem) : `CNH ${x.categoriaCnh ?? ''}`;
      return { valor: x.idColaborador, rotulo: x.nome, apoio };
    });
  });
  protected readonly opcoesModelo = computed<OpcaoSeletor[]>(() => this.principais().map((m) => ({ valor: m.id, rotulo: m.nome })));

  async ngOnInit(): Promise<void> {
    if (!this.catalogo()) await this.servico.carregarCatalogoLocal();
    const usuario = this.auth.currentUser()?.id;
    if (usuario) {
      const colaborador = await db.colaboradores.where('idUsuario').equals(usuario).first();
      this.meuColaborador.set(colaborador?.id ?? null);
    }
    const rascunho = await this.servico.rascunhoAtual();
    this.registro.set(rascunho ?? this.servico.novoRascunho());
    // Placa pedida por quem abriu o checklist (ex.: abertura do turno): vale se o rascunho ainda não começou outro veículo.
    const pedido = (this.catalogo()?.veiculos ?? []).find((v) => v.idVeiculo === this.rota.snapshot.queryParamMap.get('veiculo'));
    if (pedido && (!rascunho?.idVeiculo || (rascunho.idVeiculo !== pedido.idVeiculo && !rascunho.respostas.length))) {
      this.escolherVeiculo(pedido, !!rascunho);
    } else if (!rascunho) {
      await this.sugerirMeuVeiculo();
    }
  }

  /** O veículo que está com a pessoa já vem marcado; só fica no aparelho quando ela mexer em algo. */
  private async sugerirMeuVeiculo(): Promise<void> {
    const veiculos = this.catalogo()?.veiculos ?? [];
    const id = await this.meuVeiculo.sugerido(veiculos);
    const v = veiculos.find((x) => x.idVeiculo === id);
    if (v && !this.registro()?.idVeiculo) this.escolherVeiculo(v, false);
  }

  ngOnDestroy(): void {
    this.previas.forEach((url) => URL.revokeObjectURL(url));
  }

  protected placa(placa: string): string {
    return formatarPlaca(placa);
  }

  /** Perguntas OK/Não OK ainda sem resposta no grupo (o atalho só aparece com mais de uma). */
  protected abertosOkNok(g: GrupoPerguntas): number {
    return g.perguntas.filter((p) => p.tipoResposta === 'OK_NOK' && this.resposta(p.id)?.conforme === undefined).length;
  }

  protected totalOkNok(g: GrupoPerguntas): number {
    return g.perguntas.filter((p) => p.tipoResposta === 'OK_NOK').length;
  }

  /** Marca como OK só o que ainda não foi respondido; o que já é Não OK continua como está. */
  protected marcarTudoOk(g: GrupoPerguntas): void {
    const abertas = g.perguntas.filter((p) => p.tipoResposta === 'OK_NOK' && this.resposta(p.id)?.conforme === undefined);
    const atual = this.registro()!;
    const novas = abertas.map((p) => ({ idPergunta: p.id, conforme: true, fotos: [] }));
    this.atualizar({ respostas: [...atual.respostas.filter((r) => !abertas.some((p) => p.id === r.idPergunta)), ...novas] });
  }

  protected primeiraFoto(p: PerguntaChecklist): string | null {
    const foto = this.resposta(p.id)?.fotos[0];
    return foto ? this.previa(foto) : null;
  }

  protected detalheProblema(p: PerguntaChecklist): string {
    const r = this.resposta(p.id);
    const alternativa = [...p.motivos, ...p.opcoes].find((a) => a.id === r?.idAlternativa)?.texto;
    const fotos = r?.fotos.length ? `${r.fotos.length} ${r.fotos.length === 1 ? 'foto' : 'fotos'}` : null;
    return [alternativa ?? (p.tipoResposta === 'OK_NOK' ? 'Não OK' : null), r?.comentario?.trim() || null, fotos].filter(Boolean).join(' · ');
  }

  /** Da conferência volta para o item, já rolado até ele. */
  protected irPara(p: PerguntaChecklist): void {
    this.atualizar({ passo: this.passos().findIndex((x) => x.tipo === 'itens') + 1 });
    this.rolarAte(p.id);
  }

  private rolarAte(idPergunta: string): void {
    setTimeout(() => document.getElementById('pergunta-' + idPergunta)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  protected resposta(idPergunta: string): RespostaLocal | undefined {
    return this.registro()?.respostas.find((r) => r.idPergunta === idPergunta);
  }

  protected pendencia(p: PerguntaChecklist): string | null {
    return pendenciaDaPergunta(p, this.resposta(p.id));
  }

  protected problema(p: PerguntaChecklist): boolean {
    return respostaComProblema(p, this.resposta(p.id));
  }

  protected formatarMedicao(valor: number): string {
    return `${valor.toLocaleString('pt-BR')} ${this.horas() ? 'h' : 'km'}`;
  }

  protected previa(f: FotoChecklistLocal): string | null {
    if (!f.arquivo.size) return null;
    let url = this.previas.get(f.idFoto);
    if (!url) {
      url = URL.createObjectURL(f.arquivo);
      this.previas.set(f.idFoto, url);
    }
    return url;
  }

  protected fotoRecebimento(idFotoRecebimento: string): FotoChecklistLocal | null {
    return this.registro()?.fotosRecebimento.find((f) => f.idFotoRecebimento === idFotoRecebimento)?.foto ?? null;
  }

  /** Toda mudança vai para o aparelho na hora. */
  protected atualizar(mudanca: Partial<ChecklistVeiculoLocal>, salvar = true): void {
    const atual = this.registro();
    if (!atual) return;
    const novo = { ...atual, ...mudanca };
    this.registro.set(novo);
    if (salvar) void this.servico.salvarRascunho(novo);
  }

  protected escolherVeiculo(v: VeiculoChecklist, salvar = true): void {
    const c = this.catalogo()!;
    const { principal, adicionais } = modelosDoVeiculo(c, v);
    const atual = this.registro()!;
    const sugerido = atual.idCondutor ?? (this.meuColaborador() && c.condutores.some((x) => x.idColaborador === this.meuColaborador())
      ? this.meuColaborador() : v.idCondutorAtual);
    this.atualizar({
      idVeiculo: v.idVeiculo,
      placa: v.placa,
      idModelo: principal?.id ?? null,
      idsModelosAdicionais: adicionais.map((m) => m.id),
      respostas: atual.idVeiculo === v.idVeiculo ? atual.respostas : [],
      fotosRecebimento: atual.idVeiculo === v.idVeiculo ? atual.fotosRecebimento : [],
      idCondutor: sugerido,
      condutorNome: c.condutores.find((x) => x.idColaborador === sugerido)?.nome ?? null
    }, salvar);
    this.tentou.set(false);
  }

  /** O gestor liberou o condutor: baixa o catálogo de novo sem sair do checklist. */
  protected async atualizarCatalogo(): Promise<void> {
    if (!this.rede.isOnline()) {
      this.toast.warning('Sem internet. A liberação chega quando o app sincronizar.');
      return;
    }
    this.atualizandoCatalogo.set(true);
    try {
      await this.servico.sincronizarCatalogo();
      if (this.cnh()?.liberado) this.toast.success('Liberação recebida. Pode seguir.');
      else this.toast.warning('A liberação ainda não chegou. Confirme com o gestor.');
    } catch {
      this.toast.error('Não foi possível atualizar agora. Tente de novo.');
    } finally {
      this.atualizandoCatalogo.set(false);
    }
  }

  protected escolherFinalidade(finalidade: FinalidadeChecklist): void {
    // Sem condutor no recebimento e na devolução: nada de passagem nem fotos de troca.
    this.atualizar(finalidade === 'USO' ? { finalidade } : { finalidade, idCondutor: null, condutorNome: null, fotosRecebimento: [] });
  }

  protected escolherCondutor(id: string | null): void {
    const nome = this.catalogo()?.condutores.find((x) => x.idColaborador === id)?.nome ?? null;
    this.atualizar({ idCondutor: id, condutorNome: nome });
  }

  protected escolherModelo(id: string | null): void {
    this.atualizar({ idModelo: id, respostas: [] });
  }

  protected definirMedicao(texto: string): void {
    const digitos = texto.replace(/\D/g, '');
    this.atualizar({ medicao: digitos ? Number(digitos) : null });
  }

  private alterarResposta(p: PerguntaChecklist, mudanca: Partial<RespostaLocal>): void {
    const atual = this.registro()!;
    const existente = atual.respostas.find((r) => r.idPergunta === p.id) ?? { idPergunta: p.id, fotos: [] };
    const nova = { ...existente, ...mudanca };
    this.atualizar({ respostas: [...atual.respostas.filter((r) => r.idPergunta !== p.id), nova] });
  }

  protected marcar(p: PerguntaChecklist, conforme: boolean): void {
    // Foto "sempre" (ex.: extintor) fica ao marcar OK; a do Não OK sai junto com o problema.
    const fotos = modoFoto(p) === 'SEMPRE' ? (this.resposta(p.id)?.fotos ?? []) : [];
    this.alterarResposta(p, conforme ? { conforme, idAlternativa: null, comentario: '', fotos } : { conforme });
  }

  protected escolherOpcao(p: PerguntaChecklist, idAlternativa: string): void {
    this.alterarResposta(p, { idAlternativa });
  }

  protected escolherMotivo(p: PerguntaChecklist, idAlternativa: string): void {
    this.alterarResposta(p, { idAlternativa: this.resposta(p.id)?.idAlternativa === idAlternativa ? null : idAlternativa });
  }

  protected escrever(p: PerguntaChecklist, texto: string): void {
    this.alterarResposta(p, { texto });
  }

  protected comentar(p: PerguntaChecklist, comentario: string): void {
    this.alterarResposta(p, { comentario });
  }

  protected async fotografar(evento: Event, p: PerguntaChecklist): Promise<void> {
    const foto = await this.lerFoto(evento);
    if (foto) this.alterarResposta(p, { fotos: [...(this.resposta(p.id)?.fotos ?? []), foto] });
  }

  protected removerFoto(p: PerguntaChecklist, idFoto: string): void {
    this.alterarResposta(p, { fotos: (this.resposta(p.id)?.fotos ?? []).filter((f) => f.idFoto !== idFoto) });
  }

  protected async fotografarRecebimento(evento: Event, idFotoRecebimento: string): Promise<void> {
    const foto = await this.lerFoto(evento);
    if (!foto) return;
    const atuais = this.registro()!.fotosRecebimento.filter((f) => f.idFotoRecebimento !== idFotoRecebimento);
    this.atualizar({ fotosRecebimento: [...atuais, { idFotoRecebimento, foto }] });
  }

  /** A foto é comprimida e gravada no aparelho logo que volta da câmera. */
  private async lerFoto(evento: Event): Promise<FotoChecklistLocal | null> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return null;
    this.preparandoFoto.set(true);
    try {
      const preparada = await prepararEvidencia(arquivo);
      return { idFoto: crypto.randomUUID(), arquivo: preparada.arquivo, nomeArquivo: preparada.nomeArquivo, enviada: false };
    } catch {
      this.toast.error('Não foi possível ler a foto. Tente de novo.');
      return null;
    } finally {
      this.preparandoFoto.set(false);
    }
  }

  protected voltar(): void {
    this.tentou.set(false);
    this.atualizar({ passo: Math.max(1, this.indice()) });
  }

  protected async avancar(): Promise<void> {
    this.tentou.set(true);
    const r = this.registro()!;
    const p = this.passo();
    const ok =
      p.tipo === 'veiculo' ? !!r.idVeiculo && !this.semModelo()
        : p.tipo === 'inicio' ? (this.finalidade() !== 'USO' || !!r.idCondutor) && r.medicao !== null && !this.erroMedicao()
          : p.tipo === 'itens' ? !this.faltam()
            : p.tipo === 'recebimento' ? this.fotosRecebidas() === (this.modelo()?.fotosRecebimento.length ?? 0)
              : !this.modelo()?.exigeAssinatura || r.assinado;
    if (!ok) {
      const primeira = p.tipo === 'itens' ? this.todasPerguntas().find((x) => !!this.pendencia(x)) : null;
      if (primeira) this.rolarAte(primeira.id);
      return;
    }
    this.tentou.set(false);
    if (p.tipo !== 'revisao') {
      this.atualizar({ passo: this.indice() + 2 });
      window.scrollTo({ top: 0 });
      return;
    }
    await this.enviar();
  }

  private async enviar(): Promise<void> {
    const r = this.registro()!;
    const ativas = new Set(this.todasPerguntas().map((p) => p.id));
    this.salvando.set(true);
    try {
      await this.servico.enfileirar({
        ...r,
        // Os modelos que a tela usou (o catálogo pode ter mudado desde que o rascunho começou).
        idModelo: this.modelo()!.id,
        idsModelosAdicionais: this.modelos()!.adicionais.map((m) => m.id),
        problemas: this.problemas().length,
        // Só as respostas das perguntas do modelo atual (troca de modelo deixa respostas órfãs).
        respostas: r.respostas.filter((x) => ativas.has(x.idPergunta)),
        fotosRecebimento: this.troca() ? r.fotosRecebimento : [],
        preenchidoEm: new Date().toISOString()
      });
      this.toast.success(this.rede.isOnline() ? 'Checklist salvo. Enviando…' : 'Checklist salvo no aparelho. Vai sozinho quando o sinal voltar.');
      if (this.rede.isOnline()) void this.sync.syncOutbox();
      await this.router.navigateByUrl(this.volta);
    } finally {
      this.salvando.set(false);
    }
  }

  protected fechar(): void {
    void this.router.navigateByUrl(this.volta);
  }
}

/** Só aceita caminho do próprio app (nada de endereço externo vindo da URL). */
function rotaInterna(valor: string | null): string | null {
  return valor && /^\/[a-z]/.test(valor) && !valor.startsWith('//') ? valor : null;
}
