/**
 * Importado primeiro em `main.ts`: os módulos ES rodam na ordem dos imports, então a migração das
 * chaves acontece antes de qualquer serviço (inclusive o `AuthService`) ler o armazenamento.
 */
import { migrarChavesGeoNoNavegador } from './migrar-chaves-geo';

migrarChavesGeoNoNavegador();
