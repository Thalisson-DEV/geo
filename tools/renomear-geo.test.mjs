import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isento, renomearCaminho, renomearTexto } from './renomear-geo.mjs';

test('troca tokens, componentes, entrypoints e identificadores', () => {
  const casos = [
    ['color: var(--ces-brand);', 'color: var(--geo-brand);'],
    ['<ces-button label="Salvar"></ces-button>', '<geo-button label="Salvar"></geo-button>'],
    ["import { CesButtonComponent } from '@ces/ui';", "import { GeoButtonComponent } from '@geo/ui';"],
    ["import { x } from '@ces/ui/forms';", "import { x } from '@geo/ui/forms';"],
    ['export const cesPreset = {};', 'export const geoPreset = {};'],
    ['formatCesChartValue(v)', 'formatGeoChartValue(v)'],
    ['ContextoCes contexto = new ContextoCes();', 'ContextoGeo contexto = new ContextoGeo();'],
    ['CES_PRIMARY_COLORS', 'GEO_PRIMARY_COLORS'],
    ['globalThis.__CES_CONFIG__', 'globalThis.__GEO_CONFIG__'],
    ["localStorage.getItem('ces_theme_mode')", "localStorage.getItem('geo_theme_mode')"],
    ["const STORAGE_KEY = 'ces.nav';", "const STORAGE_KEY = 'geo.nav';"],
    ["'ces:reload-versao-obsoleta'", "'geo:reload-versao-obsoleta'"],
    ['@layer ces.tokens {', '@layer geo.tokens {'],
    ['@ConfigurationProperties(prefix = "ces.email")', '@ConfigurationProperties(prefix = "geo.email")'],
    ['@Value("${ces.frota.cron:0 0 * * * *}")', '@Value("${geo.frota.cron:0 0 * * * *}")'],
    ['provedor: ${CES_EMAIL_PROVEDOR:NENHUM}', 'provedor: ${GEO_EMAIL_PROVEDOR:NENHUM}'],
    ['html[data-ces-density="compact"]', 'html[data-geo-density="compact"]'],
    ['.ces-kpi__icon {', '.geo-kpi__icon {'],
    ['servidor.put("name", "ces");', 'servidor.put("name", "geo");'],
    ['"ces://fontes-de-dados"', '"geo://fontes-de-dados"'],
    ['<artifactId>ces</artifactId>', '<artifactId>geo</artifactId>'],
    ['public class CesApplication {', 'public class GeoApplication {'],
    ['new StringBuilder("Ces@")', 'new StringBuilder("Geo@")'],
    ['COPY docker/env.template.js /opt/ces/env.template.js', 'COPY docker/env.template.js /opt/geo/env.template.js'],
    ['"buildTarget": "ces-frontend:build:production"', '"buildTarget": "geo-frontend:build:production"'],
    ["selector: 'ces-{{NAME}}',", "selector: 'geo-{{NAME}}',"],
    ["{ find: /^@ces\\/ui\\/forms$/, replacement: x }", "{ find: /^@geo\\/ui\\/forms$/, replacement: x }"],
    ["expect(el.tagName).toBe('CES-{{NAME}}');", "expect(el.tagName).toBe('GEO-{{NAME}}');"],
    ["expect(el.tagName).toBe('CES-BUTTON');", "expect(el.tagName).toBe('GEO-BUTTON');"],
    ['selector: `ces-${name}`, className: `Ces${pascal}`', 'selector: `geo-${name}`, className: `Geo${pascal}`'],
    ['docker build --tag ces-${{ matrix.application }}:ci', 'docker build --tag geo-${{ matrix.application }}:ci'],
    ['Novas telas devem usar classes ces-*.', 'Novas telas devem usar classes geo-*.'],
  ];
  for (const [antes, depois] of casos) assert.equal(renomearTexto(antes), depois, antes);
});

test('troca a raiz de um YAML', () => {
  assert.equal(renomearTexto('spring:\n  x: 1\nces:\n  email:\n'), 'spring:\n  x: 1\ngeo:\n  email:\n');
});

test('preserva palavras que contêm "ces"', () => {
  const textos = [
    'Seu acesso ao processo foi concluído com sucesso.',
    'É necessário revisar os serviços e as concessionárias.',
    'PROCESSAMENTO_IMPORTACAO, ACESSO_SENHA, SUCCESS, EXCESSO_VELOCIDADE, CONCESSIONARIA',
    'processes.length; successful; accessKey; Cesto; CESTO; Cestos de lixo; CESAR TACOGRAFO',
    'vezes, doces, alfaces, lances. Preces: vozes.',
    'id_veiculo_ces UUID',
  ];
  for (const texto of textos) assert.equal(renomearTexto(texto), texto, texto);
});

test('não altera linhas com o marcador de manter', () => {
  const texto = "super('CesDatabase'); // renomear-geo: manter\nconst x = cesPreset;\n";
  assert.equal(renomearTexto(texto), "super('CesDatabase'); // renomear-geo: manter\nconst x = geoPreset;\n");
});

test('marcador de linha seguinte protege só a linha de baixo', () => {
  const texto = '# renomear-geo: manter a linha seguinte\nPOSTGRES_DB=ces-db\nCES_X=1\n';
  assert.equal(renomearTexto(texto), '# renomear-geo: manter a linha seguinte\nPOSTGRES_DB=ces-db\nGEO_X=1\n');
});

test('é idempotente', () => {
  const texto = "import { CesButtonComponent } from '@ces/ui';\n<ces-status tone=\"success\">\nvar(--ces-brand)\n";
  const umaVez = renomearTexto(texto);
  assert.equal(renomearTexto(umaVez), umaVez);
});

test('renomeia arquivos pelo nome, não pelo caminho', () => {
  assert.equal(
    renomearCaminho('frontend/src/app/design-system/primitives/button/ces-button.component.ts'),
    'frontend/src/app/design-system/primitives/button/geo-button.component.ts',
  );
  assert.equal(renomearCaminho('backend/src/main/java/com/nexo/app/CesApplication.java'), 'backend/src/main/java/com/nexo/app/GeoApplication.java');
  assert.equal(renomearCaminho('backend/src/main/java/x/agent/ContextoCes.java'), 'backend/src/main/java/x/agent/ContextoGeo.java');
  assert.equal(renomearCaminho('frontend/src/app/features/processos/Processes.ts'), 'frontend/src/app/features/processos/Processes.ts');
  assert.equal(renomearCaminho('frontend/src/app/features/processos/acesso.ts'), 'frontend/src/app/features/processos/acesso.ts');
});

test('isenta migrações Flyway, lockfiles e binários', () => {
  assert.ok(isento('backend/src/main/resources/db/migration/V30__Criar_Tabela_Telemetria_Eventos.sql'));
  assert.ok(isento('frontend/package-lock.json'));
  assert.ok(isento('frontend/public/icons/icon-192.png'));
  assert.ok(!isento('backend/src/main/resources/application.yaml'));
});
