// npm run api:gen — gera os tipos TypeScript da API a partir do OpenAPI do backend (springdoc).
// Saída: src/app/api/generated/schema.d.ts (não edite à mão; rode de novo após mudar a API).
// Origem: GEO_API_DOCS (padrão http://localhost:8092/api/v3/api-docs, o backend local).
// openapi-typescript (MIT) roda via npx com versão fixa: não entra no package.json porque ainda
// declara peer typescript@5 e o projeto está no TS 6.
import { spawnSync } from 'node:child_process';

const origem = process.env.GEO_API_DOCS ?? 'http://localhost:8092/api/v3/api-docs';
const r = spawnSync(
  'npx',
  ['-y', 'openapi-typescript@7.10.1', origem, '-o', 'src/app/api/generated/schema.d.ts'],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);
process.exit(r.status ?? 1);
