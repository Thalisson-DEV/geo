import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { db } from '../db/app-db';
import { TurnoService } from '../turno/turno.service';
import { VeiculoChecklist } from './checklist-veiculo.models';
import { ChecklistVeiculoService } from './checklist-veiculo.service';

/** O que o aparelho sabe para dizer qual veículo está com a pessoa agora. */
export interface PistasVeiculo {
  /** Veículo do turno aberto da equipe. */
  idVeiculoTurno: string | null;
  /** Veículo da equipe na composição (antes de abrir o turno). */
  idVeiculoEquipe: string | null;
  /** Colaborador da pessoa logada, para achar o vínculo de condutor. */
  idColaborador: string | null;
  /** Veículo do último checklist enviado deste aparelho. */
  idVeiculoUltimoChecklist: string | null;
}

/** De onde veio o veículo atual: a tela explica isso para a pessoa confiar (ou trocar). */
export type OrigemVeiculo = 'TURNO' | 'EQUIPE' | 'CONDUTOR' | 'ULTIMO_CHECKLIST';

export interface VeiculoAtual {
  idVeiculo: string;
  origem: OrigemVeiculo;
}

export const TEXTO_ORIGEM: Record<OrigemVeiculo, string> = {
  TURNO: 'Veículo do turno aberto da equipe',
  EQUIPE: 'Veículo da sua equipe',
  CONDUTOR: 'Vinculado a você como condutor',
  ULTIMO_CHECKLIST: 'Do último checklist deste celular'
};

/**
 * Veículo atual da pessoa, que já vem marcado no checklist, no abastecimento e na situação do veículo.
 * Em ordem: o do turno aberto, o da equipe, o único vinculado à pessoa como condutor (caso do
 * administrativo) e o do último checklist do aparelho. Só vale veículo do catálogo da frota.
 */
export function veiculoAtual(veiculos: Pick<VeiculoChecklist, 'idVeiculo' | 'idCondutorAtual'>[], pistas: PistasVeiculo): VeiculoAtual | null {
  const existe = (id: string | null): id is string => !!id && veiculos.some((v) => v.idVeiculo === id);
  if (existe(pistas.idVeiculoTurno)) return { idVeiculo: pistas.idVeiculoTurno, origem: 'TURNO' };
  if (existe(pistas.idVeiculoEquipe)) return { idVeiculo: pistas.idVeiculoEquipe, origem: 'EQUIPE' };
  if (pistas.idColaborador) {
    const meus = veiculos.filter((v) => v.idCondutorAtual === pistas.idColaborador);
    if (meus.length === 1) return { idVeiculo: meus[0].idVeiculo, origem: 'CONDUTOR' };
  }
  if (existe(pistas.idVeiculoUltimoChecklist)) return { idVeiculo: pistas.idVeiculoUltimoChecklist, origem: 'ULTIMO_CHECKLIST' };
  return null;
}

export function sugerirVeiculo(veiculos: Pick<VeiculoChecklist, 'idVeiculo' | 'idCondutorAtual'>[], pistas: PistasVeiculo): string | null {
  return veiculoAtual(veiculos, pistas)?.idVeiculo ?? null;
}

/** Junta as pistas guardadas no aparelho (funciona sem sinal). */
@Injectable({ providedIn: 'root' })
export class MeuVeiculoService {
  private readonly auth = inject(AuthService);
  private readonly turnos = inject(TurnoService);
  private readonly checklists = inject(ChecklistVeiculoService);

  async meuColaborador(): Promise<string | null> {
    const usuario = this.auth.currentUser()?.id;
    if (!usuario) return null;
    return (await db.colaboradores.where('idUsuario').equals(usuario).first())?.id ?? null;
  }

  async sugerido(veiculos: Pick<VeiculoChecklist, 'idVeiculo' | 'idCondutorAtual'>[]): Promise<string | null> {
    return (await this.atual(veiculos))?.idVeiculo ?? null;
  }

  async atual(veiculos: Pick<VeiculoChecklist, 'idVeiculo' | 'idCondutorAtual'>[]): Promise<VeiculoAtual | null> {
    // Aberto direto na Frota (sem passar pelo Hoje), o turno do aparelho ainda não foi lido.
    if (!this.turnos.turnoAtivo()) await this.turnos.loadTurnoAtivo().catch(() => undefined);
    const turno = this.turnos.turnoAtivo();
    const [composicao, idColaborador, checklists] = await Promise.all([
      this.turnos.loadComposicaoLocal().catch(() => null),
      this.meuColaborador(),
      this.checklists.listar()
    ]);
    const ultimo = checklists
      .filter((c) => c.idVeiculo && c.statusSync !== 'RASCUNHO')
      .sort((a, b) => (b.preenchidoEm ?? b.criadoEm).localeCompare(a.preenchidoEm ?? a.criadoEm))[0];
    return veiculoAtual(veiculos, {
      idVeiculoTurno: turno?.status === 'ABERTO' ? turno.idVeiculo ?? null : null,
      idVeiculoEquipe: composicao?.veiculo?.id ?? null,
      idColaborador,
      idVeiculoUltimoChecklist: ultimo?.idVeiculo ?? null
    });
  }
}
