import { Location } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/** Uma dimensão clicável de um dashboard (`dia`, `mes`, `inspetor`, `centroCusto`…). */
export interface GeoDrillTarget {
  readonly dimension: string;
  readonly value: string;
}

export const GEO_DRILL_QUERY_PARAM = 'drill';

const DIMENSAO_VALIDA = /^[a-zA-Z][a-zA-Z0-9-]*$/;

/** `dia:2026-09-14` → `{ dimension: 'dia', value: '2026-09-14' }`; inválido → `null`. */
export function parseGeoDrill(raw: string | null | undefined): GeoDrillTarget | null {
  if (!raw) return null;
  const separador = raw.indexOf(':');
  if (separador <= 0) return null;
  const dimension = raw.slice(0, separador);
  const value = raw.slice(separador + 1);
  return DIMENSAO_VALIDA.test(dimension) && value ? { dimension, value } : null;
}

export function serializeGeoDrill(target: GeoDrillTarget): string {
  return `${target.dimension}:${target.value}`;
}

/**
 * Estado do drill-down de uma tela, guardado em `?drill=` para o link ser compartilhável. Abrir
 * empilha uma entrada no histórico, então o Voltar do navegador (ou do celular) fecha o painel.
 * Forneça por componente: `providers: [GeoDrillStateService]`.
 */
@Injectable()
export class GeoDrillStateService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  /** Só volta no histórico quando a entrada foi criada por este serviço nesta visita. */
  private empilhado = false;

  private readonly current = signal<GeoDrillTarget | null>(
    parseGeoDrill(this.route.snapshot.queryParamMap.get(GEO_DRILL_QUERY_PARAM)),
  );
  readonly target = this.current.asReadonly();

  constructor() {
    const assinatura = this.route.queryParamMap.subscribe((params) => {
      const alvo = parseGeoDrill(params.get(GEO_DRILL_QUERY_PARAM));
      if (!alvo) this.empilhado = false;
      const atual = this.current();
      if (atual?.dimension !== alvo?.dimension || atual?.value !== alvo?.value) this.current.set(alvo);
    });
    inject(DestroyRef).onDestroy(() => assinatura.unsubscribe());
  }

  open(target: GeoDrillTarget): void {
    const jaAberto = this.current() !== null;
    this.current.set(target);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [GEO_DRILL_QUERY_PARAM]: serializeGeoDrill(target) },
      queryParamsHandling: 'merge',
      // Trocar de alvo com o painel aberto não deve exigir dois "Voltar".
      replaceUrl: jaAberto,
    });
    if (!jaAberto) this.empilhado = true;
  }

  close(): void {
    if (!this.current()) return;
    this.current.set(null);
    if (this.empilhado) {
      this.empilhado = false;
      this.location.back();
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [GEO_DRILL_QUERY_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
