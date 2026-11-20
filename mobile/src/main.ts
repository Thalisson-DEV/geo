// Primeiro import: migra as chaves salvas no aparelho (prefixo antigo) antes de qualquer serviço ler o armazenamento.
import './app/core/migracao/migrar-chaves-geo.bootstrap';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
