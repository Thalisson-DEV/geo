import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AtendimentoEquipe, AtendimentoResumo, PessoaBalcao } from '../../../core/almox/balcao.models';
import {
  LinhaDevolucao, QuantidadesRetirada, juntarFaltas, linhasDevolucao, montarDevolucao, montarRetirada, numeroBr,
  pendenciasComprovante, quantidadesIniciais, resumoRetirada,
} from '../../../core/almox/balcao.logic';
import { BalcaoService } from '../../../core/almox/balcao.service';
import { AlmoxService } from '../../../core/almox/almox.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { EvidenciaPreparada } from '../../../core/sst/evidencia-foto.util';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import {
  AssinaturaComponent, BarraTopoComponent, FotosComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, QuantidadeComponent, SeletorComponent, VazioComponent,
} from '../../../ui';
import { FotoExibida } from '../../../ui';

type Modo = 'retirada' | 'devolucao';
const PASSOS = ['Conferir', 'Quem', 'Assinar'];

/**
 * Atendimento do balcão no tablet, em três passos: conferir o material (já vem tudo o que falta da retirada, ou tudo
 * o que está no caminhão na devolução), identificar quem retira pela matrícula e colher assinatura e foto. As regras
 * (o que é obrigatório, entregar acima do pedido) são as do web, em Regras do balcão.
 */
@Component({
  selector: 'app-atendimento-balcao',
  standalone: true,
  imports: [AssinaturaComponent, BarraTopoComponent, FotosComponent, IconeComponent, IndicadorRedeComponent, QuantidadeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="(modo() === 'retirada' ? 'Retirada' : 'Devolução') + (a() ? ' · ' + a()!.codigo : '')"
      [subtitulo]="feito() ? 'Registrado' : PASSOS[passo() - 1] + ' · ' + passo() + ' de 3'" navegacao="fechar" rotuloFechar="Fechar" (voltar)="sair()">
      <geo-indicador-rede />
    </geo-barra-topo>

    @if (erro() && !a()) {
      <geo-vazio icone="alerta" titulo="Não foi possível abrir a equipe" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--principal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (!a()) {
      <div class="geo-esqueletos" role="status" aria-label="Abrindo a equipe">
        @for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 64px"></div> }
      </div>
    } @else if (feito(); as f) {
      <div class="registrado" role="status">
        <span class="geo-selo geo-selo--ok"><geo-icone nome="check" /></span>
        <div>
          <strong>{{ f.tipo === 'RETIRADA' ? 'Retirada registrada' : 'Devolução registrada' }}</strong>
          <span>{{ f.itens.length }} {{ f.itens.length === 1 ? 'material' : 'materiais' }}{{ f.nomeColaborador ? ', com ' + f.nomeColaborador : '' }}. O caminhão já está atualizado.</span>
        </div>
      </div>
      <ul class="geo-grupo">
        @for (i of f.itens; track $index) {
          <li class="geo-linha"><span class="geo-linha__texto"><span class="geo-linha__titulo">{{ i.descricao }}</span>
            <span class="geo-linha__apoio">{{ i.numeroObra ? 'Obra ' + i.numeroObra : 'Sem obra' }}</span></span>
            <strong class="geo-num">{{ num(i.quantidade) }} {{ i.unidade }}</strong></li>
        }
      </ul>
      <div class="geo-respiro"></div>
      <div class="geo-rodape-acoes" data-acao-fixa>
        <button type="button" class="geo-btn geo-btn--principal" (click)="sair()">Voltar ao quadro</button>
      </div>
    } @else {
      <div class="geo-passos" aria-hidden="true">@for (p of PASSOS; track p; let i = $index) { <i [class.feito]="passo() >= i + 1"></i> }</div>

      @switch (passo()) {
        @case (1) {
          @if (modo() === 'retirada') {
            @for (r of a()!.retiradas; track r.idSolicitacao) {
              <h2 class="geo-secao">Obra {{ r.numeroObra ?? 'sem número' }}
                @if (r.atrasada) { <span class="geo-etiqueta geo-etiqueta--atencao">Atrasada</span> }</h2>
              @if (!r.reserva) {
                <label class="geo-campo"><span>Reserva da obra</span>
                  <input class="geo-input" inputmode="numeric" [value]="reservas()[r.idSolicitacao] ?? ''" (input)="definirReserva(r.idSolicitacao, $any($event.target).value)"
                    placeholder="Número da reserva"></label>
              }
              <ul class="geo-grupo">
                @for (i of r.itens; track i.idItem) {
                  <li class="geo-linha item">
                    <span class="geo-linha__texto">
                      <span class="geo-linha__titulo">{{ i.descricao }}</span>
                      <span class="geo-linha__apoio">Falta {{ num(i.falta) }} {{ i.unidade }} · almoxarifado {{ num(i.saldoAlmoxarifado) }}</span>
                      @if ((quantidades()[i.idItem] ?? 0) > i.falta) {
                        <input class="geo-input motivo" [value]="motivos()[i.idItem] ?? ''" (input)="definirMotivo(i.idItem, $any($event.target).value)"
                          [placeholder]="'Por que sai ' + num((quantidades()[i.idItem] ?? 0) - i.falta) + ' a mais?'" [attr.aria-label]="'Motivo do excedente de ' + i.descricao">
                      }
                    </span>
                    <geo-quantidade [valor]="quantidades()[i.idItem] ?? 0" (valorChange)="definirQuantidade(i.idItem, $event)" [minimo]="0"
                      [unidade]="i.unidade" [rotulo]="'Sai agora: ' + i.descricao" />
                  </li>
                }
              </ul>
            } @empty {
              <geo-vazio icone="check" titulo="Nada para retirar" texto="Esta equipe não tem retirada pendente neste almoxarifado." />
            }
          } @else {
            <p class="dica">Já vem tudo o que está no caminhão. Zere o que a equipe vai usar amanhã.</p>
            <ul class="geo-grupo">
              @for (l of linhasDev(); track l.chave) {
                <li class="geo-linha item">
                  <span class="geo-linha__texto">
                    <span class="geo-linha__titulo">{{ l.descricao }}
                      @if (l.condicao === 'SUCATA') { <span class="geo-etiqueta geo-etiqueta--atencao">Sucata</span> }</span>
                    <span class="geo-linha__apoio">{{ l.numeroObra ? 'Obra ' + l.numeroObra : 'Sem obra' }} · no caminhão {{ num(l.noCaminhao) }} {{ l.unidade }}</span>
                    <span class="destino" role="radiogroup" [attr.aria-label]="'Destino de ' + l.descricao">
                      <button type="button" class="geo-chip" role="radio" [attr.aria-checked]="l.destino === 'GUARDAR'" (click)="definirDestino(l.chave, 'GUARDAR')">Estoque</button>
                      <button type="button" class="geo-chip" role="radio" [attr.aria-checked]="l.destino === 'DESCARTAR'" (click)="definirDestino(l.chave, 'DESCARTAR')">Descarte</button>
                    </span>
                  </span>
                  <geo-quantidade [valor]="l.quantidade ?? 0" (valorChange)="definirQuantidadeDev(l.chave, $event)" [minimo]="0"
                    [unidade]="l.unidade" [rotulo]="'Volta: ' + l.descricao" />
                </li>
              } @empty {
                <li class="geo-linha"><span class="geo-linha__texto">O caminhão está vazio.</span></li>
              }
            </ul>
          }
        }
        @case (2) {
          <h2 class="geo-secao">{{ modo() === 'retirada' ? 'Quem está retirando' : 'Quem está devolvendo' }}</h2>
          <ul class="geo-grupo" role="radiogroup" [attr.aria-label]="modo() === 'retirada' ? 'Quem está retirando' : 'Quem está devolvendo'">
            @for (p of a()!.pessoas; track p.idColaborador) {
              <li class="geo-linha geo-linha--acao" role="radio" tabindex="0" [attr.aria-checked]="pessoa()?.idColaborador === p.idColaborador"
                [attr.aria-current]="pessoa()?.idColaborador === p.idColaborador" (click)="escolher(p)" (keydown.enter)="escolher(p)">
                <span class="geo-selo" [class.geo-selo--destaque]="pessoa()?.idColaborador === p.idColaborador"><geo-icone nome="conta" /></span>
                <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ p.nome }}</span>
                  <span class="geo-linha__apoio" [class.falta]="!p.matricula">{{ p.encarregado ? 'Encarregado' : 'Parceiro' }} · {{ p.matricula ? 'matrícula ' + p.matricula : 'sem matrícula no cadastro' }}</span></span>
                @if (pessoa()?.idColaborador === p.idColaborador) { <geo-icone nome="check" /> }
              </li>
            }
          </ul>
          <div class="fora">
            <geo-seletor rotulo="Outra pessoa (fora da equipe)" [opcoes]="colaboradores()" [valor]="deFora()?.idColaborador ?? null"
              (valorChange)="escolherDeFora($event)" [placeholder]="colaboradores().length ? 'Escolher' : 'Carregando…'" />
          </div>
          @if (dicaMatricula(); as d) { <p class="dica dica--atencao">{{ d }}</p> }
        }
        @case (3) {
          <div class="assinar">
            @if (assinatura() !== 'FISICA') {
              <geo-assinatura [rotulo]="'Assinatura de ' + (pessoa()?.nome ?? 'quem retira')" [quem]="pessoa()?.nome ?? null"
                [valor]="assinatura()" (valorChange)="assinatura.set($event)" />
              <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="assinatura.set('FISICA')">Vai assinar no termo em papel</button>
            } @else {
              <p class="dica">Assinatura no termo em papel. <button type="button" class="link" (click)="assinatura.set(null)">Assinar na tela</button></p>
            }
            <geo-fotos [rotulo]="'Foto de ' + (pessoa()?.nome ?? 'quem retira')" rotuloCamera="Tirar a foto" [fotos]="fotosExibidas()" [maximo]="1"
              (adicionada)="adicionarFoto($event)" (removida)="removerFoto()" />
          </div>
        }
      }
      @if (erro()) { <p class="dica dica--erro" role="alert">{{ erro() }}</p> }

      <div class="geo-respiro"></div>
      <div class="geo-rodape-acoes" data-acao-fixa>
        @if (passo() > 1) { <button type="button" class="geo-btn geo-btn--neutro" (click)="passo.set(passo() - 1)">Voltar</button> }
        @if (passo() < 3) {
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="!!bloqueioDoPasso()" (click)="passo.set(passo() + 1)">
            {{ bloqueioDoPasso() ?? 'Continuar' }}</button>
        } @else {
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="!!bloqueio() || enviando() || !rede.isOnline()" (click)="registrar()">
            {{ enviando() ? 'Registrando…' : !rede.isOnline() ? 'Sem internet' : bloqueio() ?? ('Registrar ' + quantos() + (quantos() === 1 ? ' material' : ' materiais')) }}</button>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .item { align-items: center; }
    .motivo { margin-top: var(--geo-e2); }
    .destino { display: flex; gap: var(--geo-e2); margin-top: var(--geo-e2); }
    .dica { margin: var(--geo-e3) var(--geo-margem) 0; color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .dica--atencao { color: var(--geo-atencao); }
    .falta { color: var(--geo-atencao); }
    .fora { padding: var(--geo-e4) var(--geo-margem) 0; }
    .dica--erro { padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-erro-suave); color: var(--geo-texto); }
    .assinar { display: grid; gap: var(--geo-e4); padding: var(--geo-e4) var(--geo-margem) 0; }
    .assinar > .geo-btn { justify-self: start; }
    .link { padding: 0; border: 0; background: none; color: var(--geo-destaque); font: inherit; text-decoration: underline; }
    .registrado { display: flex; gap: var(--geo-e3); align-items: center; margin: var(--geo-e4) var(--geo-margem); padding: var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-ok-suave); }
    .registrado div { display: grid; gap: 2px; }
    .registrado span:not(.geo-selo) { font: var(--geo-t-apoio); }
  `],
})
export class AtendimentoBalcaoComponent {
  private readonly service = inject(BalcaoService);
  private readonly almox = inject(AlmoxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly rede = inject(ConnectivityService);
  protected readonly PASSOS = PASSOS;
  protected readonly num = numeroBr;

  private readonly idEquipe = this.route.snapshot.paramMap.get('idEquipe')!;
  // Sem o parâmetro (vindo do estoque das equipes), usa o almoxarifado escolhido por último no quadro.
  private readonly idAlmox = this.route.snapshot.queryParamMap.get('almoxarifado') ?? localStorage.getItem('geo_balcao_almoxarifado');
  protected readonly modo = signal<Modo>(this.route.snapshot.paramMap.get('modo') === 'devolucao' ? 'devolucao' : 'retirada');

  protected readonly a = signal<AtendimentoEquipe | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly passo = signal(1);
  protected readonly quantidades = signal<QuantidadesRetirada>({});
  protected readonly reservas = signal<Record<string, string>>({});
  protected readonly motivos = signal<Record<string, string>>({});
  protected readonly linhasDev = signal<LinhaDevolucao[]>([]);
  protected readonly deFora = signal<PessoaBalcao | null>(null);
  protected readonly colaboradores = signal<OpcaoSeletor[]>([]);
  private readonly idPessoa = signal<string | null>(null);
  protected readonly assinatura = signal<string | null>(null);
  private readonly foto = signal<{ dataUrl: string; url: string } | null>(null);
  protected readonly enviando = signal(false);
  protected readonly feito = signal<AtendimentoResumo | null>(null);

  protected readonly regras = computed(() => this.a()?.parametros ?? null);
  protected readonly fotosExibidas = computed<FotoExibida[]>(() => (this.foto() ? [{ id: 'foto', url: this.foto()!.url }] : []));
  protected readonly pessoa = computed<PessoaBalcao | null>(() => {
    const pessoas = this.a()?.pessoas ?? [];
    return pessoas.find(p => p.idColaborador === this.idPessoa()) ?? this.deFora();
  });
  protected readonly dicaMatricula = computed(() => {
    const p = this.pessoa();
    if (p && !p.deFora && !p.matricula && this.regras()?.exigeMatricula) return `${p.nome} não tem matrícula no cadastro. Peça ao escritório para cadastrar.`;
    return null;
  });
  private readonly resumo = computed(() => resumoRetirada(this.a()?.retiradas ?? [], this.quantidades(), this.reservas()));
  protected readonly quantos = computed(() => (this.modo() === 'retirada' ? this.resumo().itens : this.linhasDev().filter(l => (l.quantidade ?? 0) > 0).length));
  private readonly comprovante = computed(() => ({
    idColaborador: this.pessoa()?.idColaborador ?? null,
    matricula: null,
    assinatura: this.assinatura(),
    foto: this.foto()?.dataUrl ?? null,
    observacao: null,
  }));
  protected readonly bloqueioDoPasso = computed(() => {
    if (this.passo() === 1) {
      if (!this.quantos()) return this.modo() === 'retirada' ? 'Nada para entregar' : 'Nada voltando';
      if (this.modo() === 'retirada' && this.resumo().semReserva.length) return `Falta a reserva da obra ${this.resumo().semReserva.join(', ')}`;
      return null;
    }
    const r = this.regras();
    const faltas = r ? pendenciasComprovante(r, this.comprovante(), this.pessoa()).filter(f => f === 'a matrícula no cadastro' || f === 'quem retira') : [];
    return faltas.length ? `Falta ${juntarFaltas(faltas)}` : null;
  });
  protected readonly bloqueio = computed(() => {
    const r = this.regras();
    const faltas = r ? pendenciasComprovante(r, this.comprovante(), this.pessoa()) : [];
    return faltas.length ? `Falta ${juntarFaltas(faltas)}` : null;
  });

  constructor() {
    this.carregar();
    this.almox.colaboradores().subscribe({
      next: c => this.colaboradores.set(c.map(x => ({ valor: x.id, rotulo: x.nomeCompleto }))),
      error: () => this.colaboradores.set([]),
    });
  }

  protected carregar(): void {
    this.erro.set(null);
    if (!this.idAlmox) {
      this.erro.set('Volte ao quadro e escolha a equipe de novo.');
      return;
    }
    this.service.atendimento(this.idEquipe, this.idAlmox).subscribe({
      next: a => {
        this.a.set(a);
        this.quantidades.set(quantidadesIniciais(a.retiradas));
        this.linhasDev.set(linhasDevolucao(a.caminhao));
        this.assinatura.set(a.parametros.exigeAssinatura ? null : 'FISICA');
        const enc = a.pessoas.find(p => p.encarregado) ?? null;
        this.idPessoa.set(enc?.idColaborador ?? null);
      },
      error: (e: ApiError) => this.erro.set(e?.detail || 'Tente de novo em instantes.'),
    });
  }

  protected definirQuantidade(id: string, v: number): void { this.quantidades.update(q => ({ ...q, [id]: v })); }
  protected definirReserva(id: string, v: string): void { this.reservas.update(r => ({ ...r, [id]: v })); }
  protected definirMotivo(id: string, v: string): void { this.motivos.update(m => ({ ...m, [id]: v })); }
  protected definirQuantidadeDev(chave: string, v: number): void {
    this.linhasDev.update(ls => ls.map(l => (l.chave === chave ? { ...l, quantidade: v } : l)));
  }
  protected definirDestino(chave: string, destino: 'GUARDAR' | 'DESCARTAR'): void {
    this.linhasDev.update(ls => ls.map(l => (l.chave === chave ? { ...l, destino } : l)));
  }
  protected escolher(p: PessoaBalcao): void {
    this.idPessoa.set(p.idColaborador);
    this.deFora.set(null);
  }

  protected escolherDeFora(id: string | null): void {
    const daEquipe = (this.a()?.pessoas ?? []).find(p => p.idColaborador === id);
    if (!id || daEquipe) {
      if (daEquipe) this.escolher(daEquipe);
      else this.deFora.set(null);
      return;
    }
    const nome = this.colaboradores().find(c => c.valor === id)?.rotulo ?? 'Colaborador';
    this.idPessoa.set(null);
    this.deFora.set({ idColaborador: id, nome, matricula: null, encarregado: false, deFora: true });
  }

  protected async adicionarFoto(f: EvidenciaPreparada): Promise<void> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(f.arquivo);
    });
    this.removerFoto();
    this.foto.set({ dataUrl, url: URL.createObjectURL(f.arquivo) });
  }

  protected removerFoto(): void {
    const atual = this.foto();
    if (atual) URL.revokeObjectURL(atual.url);
    this.foto.set(null);
  }

  protected registrar(): void {
    const a = this.a();
    if (!a || this.bloqueio() || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);
    const chamada = this.modo() === 'retirada'
      ? this.service.registrarRetirada(a.idEquipe, montarRetirada(a, this.quantidades(), this.reservas(), this.motivos(), this.comprovante()))
      : this.service.registrarDevolucao(a.idEquipe, montarDevolucao(a.idAlmoxarifado, this.linhasDev(), this.comprovante()));
    chamada.subscribe({
      next: r => {
        this.enviando.set(false);
        this.removerFoto();
        this.feito.set(r);
        this.toast.success(`${r.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução'} de ${a.codigo} registrada`);
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.erro.set(e?.detail || 'Não foi possível registrar. Tente de novo.');
      },
    });
  }

  protected sair(): void {
    void this.router.navigate(['/almox/balcao']);
  }
}
