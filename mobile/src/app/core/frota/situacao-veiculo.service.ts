import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { silentContext } from '../http/http-context';
import { SituacaoVeiculo } from './situacao-veiculo.models';

const chave = (idVeiculo: string) => `situacao-veiculo:${idVeiculo}`;

/** A última ficha que o aparelho viu, para mostrar sem sinal (com a hora em que foi vista). */
export interface FichaGuardada {
  ficha: SituacaoVeiculo;
  vistaEm: string;
}

/**
 * Ficha do veículo (GET /v1/frota/app/veiculos/{id}/situacao). Manutenção e documentos mudam no
 * escritório, então a consulta vem do servidor; a última fica no aparelho para quando faltar sinal.
 */
@Injectable({ providedIn: 'root' })
export class SituacaoVeiculoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  async situacao(idVeiculo: string): Promise<SituacaoVeiculo> {
    const ficha = await firstValueFrom(this.http.get<SituacaoVeiculo>(`${this.baseUrl}/v1/frota/app/veiculos/${idVeiculo}/situacao`,
      { context: silentContext() }));
    try {
      await db.config.put({ key: chave(idVeiculo), value: { ficha, vistaEm: new Date().toISOString() } satisfies FichaGuardada });
    } catch {
      // Sem espaço no aparelho: a ficha segue na tela, só não fica para depois.
    }
    return ficha;
  }

  async ultimaVista(idVeiculo: string): Promise<FichaGuardada | null> {
    const salvo = await db.config.get(chave(idVeiculo));
    return (salvo?.value as FichaGuardada | undefined) ?? null;
  }
}
