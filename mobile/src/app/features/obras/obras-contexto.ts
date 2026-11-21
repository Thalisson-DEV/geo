import { Injectable, computed, inject } from '@angular/core';
import { PacoteObrasService } from '../../core/obras/pacote-obras.service';
import { RegistrosObrasService } from '../../core/obras/registros-obras.service';
import {
  PendenciaLocal, PontoDaExecucao, hojeLocal, liberacaoLocal, referenciaProgramacao, pendenciasDeFoto, pontosDaExecucao, programacoesDoDia,
} from '../../core/obras/obras-regras';
import { ObraCampo, ProgramacaoCampo, RegistroObraLocal } from '../../core/obras/obras.models';
import { isoComFuso } from '../../core/obras/registros-obras.service';

/** O que as telas de Obras perguntam sobre uma programação, já com o que está no aparelho. */
@Injectable({ providedIn: 'root' })
export class ObrasContexto {
  readonly pacote = inject(PacoteObrasService);
  readonly registros = inject(RegistrosObrasService);

  readonly hoje = computed(() => hojeLocal());
  /**
   * Registros do aparelho mais a APR e os impedimentos do dia que o servidor já tem (de outro aparelho, ou de antes de
   * sair e entrar): é com eles que se decide se a equipe já pode executar.
   */
  readonly registrosDoDia = computed<RegistroObraLocal[]>(() => {
    const locais = this.registros.registros();
    const ids = new Set(locais.map(r => r.id));
    const dia = this.hoje();
    const doServidor = this.pacote.liberacaoServidor()
      .filter(l => !l.idLocal || !ids.has(l.idLocal))
      .map((l, i) => ({
        id: `servidor-${l.idLocal ?? i}`, tipo: l.tipo === 'APR' ? 'APR' : 'OCORRENCIA', idObra: l.idObra, envio: 'ENVIADO', dia,
        criadoEm: l.em, comando: { concluir: l.tipo === 'APR', impedeExecucao: l.tipo === 'IMPEDIMENTO', campo: { idLocal: l.idLocal ?? '', instante: isoComFuso(new Date(l.em)) } },
      }) as unknown as RegistroObraLocal);
    return doServidor.length ? [...locais, ...doServidor] : locais;
  });
  readonly doDia = computed(() => programacoesDoDia(this.pacote.programacoes(), this.hoje()));
  /** Próximos dias da agenda (fora hoje). */
  readonly proximas = computed(() => this.pacote.programacoes()
    .filter(p => !this.doDia().includes(p) && p.situacao !== 'CANCELADA')
    .sort((a, b) => a.inicio.split('/').reverse().join('').localeCompare(b.inicio.split('/').reverse().join('')) || a.numero - b.numero));

  ref(p: ProgramacaoCampo): string {
    return referenciaProgramacao(p);
  }

  pontos(p: ProgramacaoCampo): PontoDaExecucao[] {
    return pontosDaExecucao(p, this.pacote.obra(p.idObra), this.registros.registros(), [], this.pacote.recebidoEm());
  }

  itensModelo(obra: ObraCampo | undefined) {
    const modelos = this.pacote.modelosFoto();
    const modelo = modelos.find(m => m.id === obra?.idModeloFoto) ?? modelos[0];
    return modelo?.itens ?? [];
  }

  modeloFoto(obra: ObraCampo | undefined) {
    const modelos = this.pacote.modelosFoto();
    return modelos.find(m => m.id === obra?.idModeloFoto) ?? modelos[0] ?? null;
  }

  pendencias(p: ProgramacaoCampo): PendenciaLocal[] {
    const obra = this.pacote.obra(p.idObra);
    if (!obra) return [];
    // O modelo de fotos é dos postes (fichas As Built por ponto): vão não tem foto obrigatória.
    const feitos = this.pontos(p).filter(x => x.situacao !== 'A_FAZER' && !x.vao).map(x => ({ id: x.id, rotulo: x.rotulo }));
    return pendenciasDeFoto(obra, this.itensModelo(obra), feitos, this.registros.registros());
  }

  liberacao(p: ProgramacaoCampo, temRascunho = false) {
    return liberacaoLocal(p, this.hoje(), this.registrosDoDia(), temRascunho);
  }

  chegou(p: ProgramacaoCampo): boolean {
    const presencas = this.registros.registros()
      .filter(r => r.tipo === 'PRESENCA' && r.dia === this.hoje() && r.idObra === p.idObra)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    return (presencas.at(-1)?.comando as { tipo?: string } | undefined)?.tipo === 'CHEGADA';
  }

  /** "Linha viva · Desligamento 08:00–12:00 · manobra 4471 · Finaliza obra". */
  condicoes(p: ProgramacaoCampo): string[] {
    const c: string[] = [];
    if (p.turno && p.turno !== 'DIA_TODO') c.push(rotuloTurno(p.turno));
    if (p.linhaViva) c.push('Linha viva');
    if (p.desligamento) {
      const janela = p.horaDesligamentoInicio ? ` ${p.horaDesligamentoInicio}${p.horaDesligamentoFim ? '–' + p.horaDesligamentoFim : ''}` : '';
      c.push(`Desligamento${janela}${p.numeroManobra ? ` · manobra ${p.numeroManobra}` : ''}`);
    }
    if (p.finalizaObra) c.push('Finaliza a obra');
    return c;
  }
}

export function rotuloTurno(turno: string): string {
  return ({ MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite', DIA_TODO: 'Dia todo' } as Record<string, string>)[turno] ?? turno;
}

/** "qui, 20/11" a partir de dd/MM/yyyy. */
export function diaCurto(data: string): string {
  const [d, m, a] = data.split('/').map(Number);
  const dia = new Date(a, m - 1, d);
  return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dia.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
