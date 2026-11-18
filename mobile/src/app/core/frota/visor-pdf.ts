/**
 * Mostra PDF dentro do app. O Chrome do Android não exibe PDF embutido (iframe/embed só oferecem
 * "abrir"), e abrir em outra guia tira a pessoa do app no meio da fiscalização; por isso o pdf.js
 * (dependência justificada aqui) desenha as páginas em canvas. Carregado só quando um PDF é aberto.
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let carregando: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  carregando ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker', import.meta.url), { type: 'module' });
    return lib;
  }).catch((e) => { carregando = null; throw e; });
  return carregando;
}

export interface DocumentoPdf {
  paginas: number;
  /** Desenha a página (1..n) no canvas com a largura em pixels CSS indicada. */
  desenhar(pagina: number, canvas: HTMLCanvasElement, largura: number): Promise<void>;
  fechar(): void;
}

/** Desenho em andamento por canvas: um novo (ao ampliar) cancela o anterior, que o pdf.js não aceita em paralelo. */
const emAndamento = new WeakMap<HTMLCanvasElement, { cancel(): void }>();

/** Desenho interrompido por outro mais novo: não é erro para a pessoa. */
export function desenhoCancelado(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'RenderingCancelledException';
}

export async function abrirPdf(blob: Blob): Promise<DocumentoPdf> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  return {
    paginas: doc.numPages,
    async desenhar(numero, canvas, largura) {
      emAndamento.get(canvas)?.cancel();
      const pagina = await doc.getPage(numero);
      const base = pagina.getViewport({ scale: 1 });
      const escala = largura / base.width;
      // Nitidez em tela de alta densidade, com teto para não estourar a memória do aparelho.
      const densidade = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = pagina.getViewport({ scale: escala * densidade });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / densidade)}px`;
      canvas.style.height = `${Math.floor(viewport.height / densidade)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const tarefa = pagina.render({ canvasContext: ctx, viewport });
      emAndamento.set(canvas, tarefa);
      try {
        await tarefa.promise;
      } finally {
        if (emAndamento.get(canvas) === tarefa) emAndamento.delete(canvas);
      }
    },
    fechar() { void doc.destroy(); }
  };
}
