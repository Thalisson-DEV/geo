import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AssinaturaComponent, BarraTopoComponent, IconeComponent, SegmentadoComponent, VazioComponent } from '../../ui';
import { db } from '../../core/db/app-db';
import { TurnoService } from '../../core/turno/turno.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  aprVazia, condicoesDaProgramacao, medidasDoRisco, faltasDaApr, formularioDaApr, sugestoesApr, verificacoesDaApr,
} from '../../core/obras/obras-regras';
import { AprRascunho } from '../../core/obras/obras.models';
import { ObrasContexto } from './obras-contexto';

type Resposta = 'SIM' | 'NAO' | 'NAO_SE_APLICA' | '';

const PASSOS = ['Equipe', 'Riscos', 'Medidas', 'Verificações', 'Assinaturas', 'Concluir'] as const;

/**
 * APR em passos curtos, pré-preenchida: obra, serviço, data, responsável e participantes do turno; riscos e medidas
 * sugeridos pelas condições já vêm marcados para conferir. Os participantes assinam na tela do encarregado. O rascunho
 * fica no aparelho: o app pode fechar no meio e volta no mesmo passo.
 */
@Component({
  selector: 'app-apr',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, SegmentadoComponent, AssinaturaComponent, VazioComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (programacao(); as p) {
      <geo-barra-topo [titulo]="'APR · ' + passos[passo()]" [subtitulo]="'Passo ' + (passo() + 1) + ' de ' + passos.length + ' · Obra ' + (p.numeroObra ?? '') + ' · ' + ctx.ref(p)" (voltar)="voltar()" />
      <div class="geo-passos" aria-hidden="true">@for (x of passos; track x; let i = $index) { <i [class.feito]="i <= passo()"></i> }</div>
      <p class="geo-sr-only" aria-live="polite">Passo {{ passo() + 1 }} de {{ passos.length }}: {{ passos[passo()] }}</p>

      @if (r(); as r) {
        <div class="corpo">
          @switch (passo()) {
            @case (0) {
              <dl class="geo-dados resumo">
                <div><dt>Serviço</dt><dd>{{ p.descricao }}</dd></div>
                <div><dt>Data</dt><dd class="geo-num">{{ hoje }}</dd></div>
                <div><dt>Responsável</dt><dd>{{ responsavel()?.nome ?? 'Encarregado' }}</dd></div>
                @if (condicoes().length > 1) { <div><dt>Condições</dt><dd>{{ ctx.condicoes(p).join(' · ') }}</dd></div> }
              </dl>
              <h2 class="geo-secao">Quem participa</h2>
              <ul class="geo-grupo">
                @for (m of membros(); track m.idColaborador) {
                  <li><button type="button" class="geo-linha geo-linha--acao" role="checkbox" [attr.aria-checked]="r.participantes.includes(m.idColaborador)"
                    (click)="alternar('participantes', m.idColaborador)">
                    <span class="geo-selo geo-selo--caixa" [class.marcada]="r.participantes.includes(m.idColaborador)" aria-hidden="true"><geo-icone nome="check" [tamanho]="18" /></span>
                    <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ m.nome }}</span><span class="geo-linha__apoio">{{ m.funcao ?? '' }}</span></span>
                  </button></li>
                }
              </ul>
            }
            @case (1) {
              <p class="dica">Os riscos das condições do serviço já vêm marcados. Confira e marque o que mais houver.</p>
              <ul class="geo-grupo">
                @for (x of modelo()?.riscos ?? []; track x) {
                  <li><button type="button" class="geo-linha geo-linha--acao" role="checkbox" [attr.aria-checked]="r.riscos.includes(x)" (click)="alternar('riscos', x)">
                    <span class="geo-selo geo-selo--caixa" [class.marcada]="r.riscos.includes(x)" aria-hidden="true"><geo-icone nome="check" [tamanho]="18" /></span>
                    <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ x }}</span>
                      @if (sugestao().riscos.includes(x)) { <span class="geo-linha__apoio">Sugerido pelas condições</span> }</span>
                  </button></li>
                }
              </ul>
              <label class="geo-campo"><span>Outro risco</span>
                <input class="geo-input" [value]="r.outroRisco" (input)="campo('outroRisco', $any($event.target).value)" maxlength="300"></label>
            }
            @case (2) {
              <ul class="geo-grupo">
                @for (x of modelo()?.medidas ?? []; track x) {
                  <li><button type="button" class="geo-linha geo-linha--acao" role="checkbox" [attr.aria-checked]="r.medidas.includes(x)" (click)="alternar('medidas', x)">
                    <span class="geo-selo geo-selo--caixa" [class.marcada]="r.medidas.includes(x)" aria-hidden="true"><geo-icone nome="check" [tamanho]="18" /></span>
                    <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ x }}</span>
                      @if (sugestao().medidas.includes(x)) { <span class="geo-linha__apoio">Sugerida pelas condições</span> }
                      @else if (pedidaPelosRiscos(x)) { <span class="geo-linha__apoio">Pedida pelos riscos marcados</span> }</span>
                  </button></li>
                }
              </ul>
              <label class="geo-campo"><span>Medidas adicionais</span>
                <textarea class="geo-input" rows="2" [value]="r.medidasAdicionais" (input)="campo('medidasAdicionais', $any($event.target).value)" maxlength="1000"></textarea></label>
            }
            @case (3) {
              <ul class="verificacoes">
                @for (v of verificacoes(); track v) {
                  <li class="geo-grupo verificacao" [class.sem-resposta]="tentouAvancar() && !r.verificacoes[v]" [attr.aria-invalid]="tentouAvancar() && !r.verificacoes[v] ? true : null">
                    <span class="pergunta">{{ v }}</span>
                    <geo-segmentado [rotulo]="v" [opcoes]="respostas" [valor]="$any(r.verificacoes[v] ?? '')" (valorChange)="responder(v, $any($event))" />
                    @if (tentouAvancar() && !r.verificacoes[v]) { <span class="nao">Responda.</span> }
                    @if (r.verificacoes[v] === 'NAO') { <span class="nao" role="alert">Corrija antes de executar ou registre "Sem condição de executar".</span> }
                  </li>
                }
              </ul>
            }
            @case (4) {
              @for (id of r.participantes; track id) {
                <div class="assinatura">
                  <geo-assinatura [rotulo]="'Assinatura de ' + nome(id)" [quem]="nome(id)" [valor]="r.assinaturas[id] ?? null" (valorChange)="assinar(id, $event)" />
                </div>
              }
              @if (!r.participantes.length) { <geo-vazio icone="pessoas" titulo="Ninguém marcado" texto="Volte ao primeiro passo e marque quem participa." /> }
            }
            @case (5) {
              @if (faltas().length) {
                <div class="faltas" role="alert">
                  <strong>Falta para concluir</strong>
                  <ul>@for (f of faltas(); track f) { <li>{{ f }}</li> }</ul>
                </div>
              } @else {
                <div class="pronta"><geo-icone nome="check" /> APR pronta. Ao concluir, os serviços do dia ficam liberados, mesmo sem sinal.</div>
              }
              <dl class="geo-dados resumo">
                <div><dt>Riscos</dt><dd>{{ juntar(r.riscos.join(', '), r.outroRisco) || '—' }}</dd></div>
                <div><dt>Medidas</dt><dd>{{ juntar(r.medidas.join(', '), r.medidasAdicionais) || '—' }}</dd></div>
                <div><dt>Participantes</dt><dd>{{ r.participantes.map(nome).join(', ') || '—' }}</dd></div>
              </dl>
            }
          }
          <a class="sem-condicao" [routerLink]="['/obras', p.id, 'ocorrencia']" [queryParams]="{ impede: 1 }" data-testid="sem-condicao">
            <geo-icone nome="impedido" /> Sem condição de executar
          </a>
        </div>

        <div class="geo-rodape-acoes" data-acao-fixa>
          @if (passo() > 0) { <button type="button" class="geo-btn geo-btn--neutro" (click)="irPara(passo() - 1)">Anterior</button> }
          @if (passo() < passos.length - 1) {
            <button type="button" class="geo-btn geo-btn--principal" (click)="irPara(passo() + 1)" data-testid="apr-avancar">Continuar</button>
          } @else {
            <button type="button" class="geo-btn geo-btn--principal" (click)="concluir()" [disabled]="faltas().length > 0 || salvando()" data-testid="apr-concluir">Concluir APR</button>
          }
        </div>
      }
    } @else {
      <geo-barra-topo titulo="APR" (voltar)="voltar()" />
      <geo-vazio icone="escudo" titulo="Programação não está no aparelho" />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .corpo { flex: 1; padding-bottom: var(--geo-e6); }
    .dica { margin: var(--geo-e3) var(--geo-margem); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .resumo { margin: var(--geo-e3) var(--geo-margem) 0; }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem) 0; }
    .verificacoes { list-style: none; margin: var(--geo-e3) 0 0; padding: 0; display: grid; gap: var(--geo-e3); }
    .verificacao { display: grid; gap: var(--geo-e2); padding: var(--geo-e3) var(--geo-e4); margin-top: 0; }
    .verificacao.sem-resposta { outline: 1.5px solid var(--geo-erro); }
    .pergunta { font: var(--geo-t-corpo-forte); }
    .nao { font: var(--geo-t-apoio); color: var(--geo-erro); }
    .assinatura { margin: var(--geo-e3) var(--geo-margem) 0; }
    .faltas { margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-erro-suave); }
    .faltas ul { margin: var(--geo-e2) 0 0; padding-left: 1.2em; font: var(--geo-t-apoio); }
    .pronta { display: flex; gap: var(--geo-e2); align-items: center; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-ok-suave); font: var(--geo-t-apoio); }
    .sem-condicao { display: flex; align-items: center; justify-content: center; gap: var(--geo-e2); min-height: var(--geo-alvo);
      margin: var(--geo-e5) var(--geo-margem) 0; color: var(--geo-erro); font: var(--geo-t-corpo-forte); text-decoration: none; }
  `],
})
export class AprComponent implements OnInit {
  readonly ctx = inject(ObrasContexto);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly turno = inject(TurnoService);
  private readonly toast = inject(ToastService);

  readonly passos = PASSOS;
  readonly respostas = [
    { valor: 'SIM' as Resposta, rotulo: 'Sim' }, { valor: 'NAO' as Resposta, rotulo: 'Não' }, { valor: 'NAO_SE_APLICA' as Resposta, rotulo: 'N/A' },
  ];
  readonly hoje = new Date().toLocaleDateString('pt-BR');

  readonly id = toSignal(this.rota.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly programacao = computed(() => this.ctx.pacote.programacao(this.id()));
  readonly modelo = computed(() => this.ctx.pacote.modeloApr());
  readonly condicoes = computed(() => (this.programacao() ? condicoesDaProgramacao(this.programacao()!, this.ctx.pacote.obra(this.programacao()!.idObra)) : []));
  readonly sugestao = computed(() => (this.modelo() ? sugestoesApr(this.modelo()!, this.condicoes()) : { riscos: [], medidas: [] }));
  readonly verificacoes = computed(() => (this.modelo() ? verificacoesDaApr(this.modelo()!, this.condicoes()) : []));
  readonly membros = computed(() => this.turno.composicao()?.membros ?? []);
  readonly responsavel = computed(() => this.membros().find(m => m.responsavel) ?? this.membros()[0]);

  readonly r = signal<AprRascunho | null>(null);
  readonly passo = computed(() => this.r()?.passo ?? 0);
  readonly faltas = computed(() => (this.r() ? faltasDaApr(this.r()!, this.verificacoes()) : []));
  readonly salvando = signal(false);

  private chave = '';

  async ngOnInit(): Promise<void> {
    if (!this.turno.composicao()) await this.turno.loadComposicaoLocal();
    this.chave = `${this.id()}|${this.ctx.hoje()}`;
    const salvo = await db.obrasAprRascunhos.get(this.chave);
    this.r.set(salvo ?? aprVazia(this.sugestao(), this.membros().map(m => m.idColaborador)));
    if (!salvo) await this.gravar();
  }

  nome = (id: string): string => this.membros().find(m => m.idColaborador === id)?.nome ?? 'Participante';

  alternar(campo: 'riscos' | 'medidas' | 'participantes', valor: string): void {
    this.mudar(r => {
      const marcando = !r[campo].includes(valor);
      const novo = { ...r, [campo]: marcando ? [...r[campo], valor] : r[campo].filter(x => x !== valor) };
      // Marcar um risco já traz a medida que ele pede (ex.: queda de altura → inspeção de escada e cinto).
      if (campo === 'riscos' && marcando && this.modelo()) {
        const extras = medidasDoRisco(this.modelo()!, valor).filter(m => !novo.medidas.includes(m));
        if (extras.length) novo.medidas = [...novo.medidas, ...extras];
      }
      return novo;
    });
  }

  pedidaPelosRiscos(medida: string): boolean {
    const m = this.modelo();
    return !!m && (this.r()?.riscos ?? []).some(risco => medidasDoRisco(m, risco).includes(medida));
  }

  campo(campo: 'outroRisco' | 'medidasAdicionais', valor: string): void {
    this.mudar(r => ({ ...r, [campo]: valor }));
  }

  responder(pergunta: string, resposta: Resposta): void {
    this.mudar(r => ({ ...r, verificacoes: { ...r.verificacoes, [pergunta]: resposta || undefined } }));
  }

  assinar(id: string, imagem: string | null): void {
    this.mudar(r => {
      const assinaturas = { ...r.assinaturas };
      if (imagem) assinaturas[id] = imagem; else delete assinaturas[id];
      return { ...r, assinaturas };
    });
  }

  readonly tentouAvancar = signal(false);

  irPara(passo: number): void {
    // Verificações: sem todas respondidas, mostra o que falta (pode seguir; a conclusão é que exige).
    if (this.passo() === 3 && passo > 3 && this.verificacoes().some(v => !this.r()?.verificacoes[v])) {
      this.tentouAvancar.set(true);
      return;
    }
    this.tentouAvancar.set(false);
    this.mudar(r => ({ ...r, passo: Math.max(0, Math.min(PASSOS.length - 1, passo)) }));
    document.querySelector('.geo-rolagem, main')?.scrollTo?.({ top: 0 });
  }

  async concluir(): Promise<void> {
    const p = this.programacao();
    const r = this.r();
    if (!p || !r || this.faltas().length) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de concluir a APR.');
      return;
    }
    this.salvando.set(true);
    try {
      const agora = new Date().toISOString();
      await this.ctx.registros.registrar({
        tipo: 'APR', idObra: p.idObra, idProgramacao: p.id,
        comando: {
          idObra: p.idObra, idProgramacao: p.id, atividade: p.descricao, idResponsavel: this.responsavel()?.idColaborador ?? null,
          formulario: formularioDaApr(r, this.verificacoes(), null),
          assinaturas: r.participantes.map(id => ({ idColaborador: id, nome: this.nome(id), assinadaEm: agora,
            imagemPng: (r.assinaturas[id] ?? '').replace(/^data:image\/png;base64,/, '') })),
          concluir: true,
        },
      });
      await db.obrasAprRascunhos.delete(this.chave);
      this.toast.success('APR concluída: serviços do dia liberados');
      void this.router.navigate(['/obras', p.id, 'execucao'], { replaceUrl: true });
    } finally {
      this.salvando.set(false);
    }
  }

  juntar(...partes: (string | null | undefined)[]): string {
    return partes.filter(p => !!p).join(' · ');
  }

  voltar(): void {
    void this.router.navigate(['/obras', this.id()]);
  }

  private mudar(f: (r: AprRascunho) => AprRascunho): void {
    const atual = this.r();
    if (!atual) return;
    this.r.set(f(atual));
    void this.gravar();
  }

  private async gravar(): Promise<void> {
    const r = this.r();
    if (r) await db.obrasAprRascunhos.put({ ...r, chave: this.chave });
  }
}
