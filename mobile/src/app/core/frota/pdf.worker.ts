/// <reference lib="webworker" />
// Worker do pdf.js empacotado pelo build (vira .js com hash e entra no cache do service worker),
// para os documentos abrirem no app mesmo sem sinal.
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
