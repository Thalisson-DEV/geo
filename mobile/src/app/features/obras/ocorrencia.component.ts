import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { BarraTopoComponent, FotoExibida, FotosComponent, IconeComponent } from '../../ui';
import { ToastService } from '../../core/ui/toast.service';
import { TurnoService } from '../../core/turno/turno.service';
import { linhasDoCarimbo } from '../../core/fotos/carimbo';
import { EvidenciaPreparada } from '../../core/sst/evidencia-foto.util';
import { TIPOS_OCORRENCIA, TipoOcorrencia } from '../../core/obras/obras.models';
import { ObrasContexto } from './obras-contexto';

/**
 * Ocorrência da obra (clima, falta de material, acesso…) com fotos. Com `?impede=1` é o "Sem condição de executar":
 * dispensa a APR, bloqueia o apontamento até uma APR nova e o Hoje passa para o próximo serviço.
 * A descrição aceita o ditado pelo microfone do teclado do aparelho.
 */
@Component({
  selector: 'app-ocorrencia-obra',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, FotosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="impede() ? 'Sem condição de executar' : 'Ocorrência'" [subtitulo]="subtitulo()" (voltar)="voltar()" />
    @if (impede()) {
      <p class="explica">O serviço fica registrado como não executado hoje. Para voltar a executar, conclua uma nova APR.</p>
    }
    <h2 class="geo-secao">Tipo</h2>
    <div class="tipos" role="radiogroup" aria-label="Tipo da ocorrência">
      @for (t of tipos; track t.valor) {
        <button type="button" role="radio" class="tipo" [attr.aria-checked]="tipo() === t.valor" (click)="tipo.set(t.valor)">
          @if (tipo() === t.valor) { <geo-icone nome="check" [tamanho]="18" /> }{{ t.rotulo }}
        </button>
      }
    </div>
    <label class="geo-campo"><span>O que aconteceu</span>
      <textarea class="geo-input" rows="4" maxlength="2000" [value]="descricao()" (input)="descricao.set($any($event.target).value)"
        [placeholder]="tipo() === 'MATERIAL' ? 'Ex.: faltaram 2 cruzetas no caminhão' : 'Descreva, ou toque no microfone do teclado para ditar'"
        data-testid="descricao-ocorrencia"></textarea></label>
    <geo-fotos rotulo="Fotos" [fotos]="fotosExibidas()" [carimbo]="carimbo()" (adicionada)="adicionar($event)" (removida)="remover($event)" [galeria]="true" />
    <div class="geo-respiro"></div>
    <div class="geo-rodape-acoes" data-acao-fixa>
      <button type="button" class="geo-btn" [class.geo-btn--perigo]="impede()" [class.geo-btn--principal]="!impede()"
        [disabled]="!tipo() || !descricao().trim() || salvando()" (click)="salvar()" data-testid="salvar-ocorrencia">
        {{ impede() ? 'Registrar sem condição' : 'Registrar ocorrência' }}
      </button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .explica { margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-erro-suave); font: var(--geo-t-apoio); }
    .tipos { display: flex; flex-wrap: wrap; gap: var(--geo-e2); padding: 0 var(--geo-margem); }
    .tipo { min-height: var(--geo-alvo); padding: 0 var(--geo-e4); border-radius: var(--geo-r-pilula); border: 1px solid var(--geo-borda-campo);
      background: var(--geo-superficie); color: var(--geo-texto); font: 500 .9375rem/1 var(--geo-fonte); display: inline-flex; align-items: center; gap: 6px; }
    .tipo[aria-checked='true'] { background: var(--geo-destaque-suave); color: var(--geo-destaque); border-color: transparent; font-weight: 600; }
    .geo-campo { margin: var(--geo-e4) var(--geo-margem); }
  `],
})
export class OcorrenciaObraComponent {
  readonly ctx = inject(ObrasContexto);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly turno = inject(TurnoService);

  readonly tipos = TIPOS_OCORRENCIA;
  readonly id = toSignal(this.rota.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly impede = toSignal(this.rota.queryParamMap.pipe(map(q => q.get('impede') === '1')), { initialValue: false });
  readonly tipoInicial = this.rota.snapshot.queryParamMap.get('tipo') as TipoOcorrencia | null;
  readonly programacao = computed(() => this.ctx.pacote.programacao(this.id()));
  readonly tipo = signal<TipoOcorrencia | null>(this.tipoInicial);
  readonly descricao = signal('');
  readonly fotos = signal<{ id: string; foto: EvidenciaPreparada; url: string }[]>([]);
  readonly fotosExibidas = computed<FotoExibida[]>(() => this.fotos().map(f => ({ id: f.id, url: f.url })));
  readonly salvando = signal(false);
  readonly subtitulo = computed(() => { const p = this.programacao(); return p ? `Obra ${p.numeroObra ?? ''} · #${p.numero}` : null; });
  readonly carimbo = computed(() => linhasDoCarimbo({ contexto: [this.subtitulo() ?? 'Ocorrência', 'Ocorrência'], data: new Date() }));

  adicionar(foto: EvidenciaPreparada): void {
    this.fotos.update(f => [...f, { id: crypto.randomUUID(), foto, url: URL.createObjectURL(foto.arquivo) }]);
  }

  remover(id: string): void {
    this.fotos.update(f => f.filter(x => {
      if (x.id === id) URL.revokeObjectURL(x.url);
      return x.id !== id;
    }));
  }

  async salvar(): Promise<void> {
    const p = this.programacao();
    const tipo = this.tipo();
    if (!p || !tipo || !this.descricao().trim()) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de registrar.');
      return;
    }
    this.salvando.set(true);
    try {
      const ocorrencia = await this.ctx.registros.registrar({
        tipo: 'OCORRENCIA', idObra: p.idObra, idProgramacao: p.id,
        comando: { idObra: p.idObra, idProgramacao: p.id, tipo, descricao: this.descricao().trim(), impedeExecucao: this.impede() },
      });
      // As fotos vão como evidências do primeiro ponto da programação, ligadas à ocorrência pela legenda.
      const ponto = p.itens.find(i => i.idPonto)?.idPonto ?? null;
      for (const f of this.fotos()) {
        if (!ponto) break;
        await this.ctx.registros.registrar({
          tipo: 'EVIDENCIA', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto, dependeDe: ocorrencia.id,
          comando: { idObra: p.idObra, idPonto: ponto, idVao: null, idProgramacao: p.id, idApontamento: null, idModelo: null, idItem: null,
            etapa: 'DURANTE', legenda: `Ocorrência: ${this.descricao().trim().slice(0, 400)}` },
          arquivo: { blob: f.foto.arquivo, nome: f.foto.nomeArquivo, tipo: f.foto.contentType },
        });
      }
      this.fotos().forEach(f => URL.revokeObjectURL(f.url));
      this.toast.success(this.impede() ? 'Registrado: sem condição de executar' : 'Ocorrência registrada');
      void this.router.navigate(this.impede() ? ['/hoje'] : ['/obras', p.id], { replaceUrl: true });
    } finally {
      this.salvando.set(false);
    }
  }

  voltar(): void {
    void this.router.navigate(['/obras', this.id()]);
  }
}
