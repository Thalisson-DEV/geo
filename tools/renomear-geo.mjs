#!/usr/bin/env node
/**
 * Troca o prefixo `ces` (herdado do sistema de origem) por `geo` em todo o repositório.
 *
 *   node tools/renomear-geo.mjs            mostra o que mudaria (não grava nada)
 *   node tools/renomear-geo.mjs --aplicar  grava as trocas e renomeia os arquivos com `git mv`
 *   node tools/renomear-geo.mjs --check    falha (código 1) se ainda houver algo a trocar
 *
 * Só troca ocorrências ancoradas (`--ces-`, `ces-x`, `@ces/`, `cesX`, `CesX`, `ces_x`, `ces.x`,
 * `CES_X`, `"ces"`), nunca palavras que contêm "ces" ("acesso", "processo", "necessário").
 * É idempotente e pode ser rodado em qualquer branch antes do merge com a principal.
 *
 * Uma linha com o marcador `renomear-geo: manter` não é alterada: serve para o código de
 * migração que precisa ler os nomes antigos (chaves do navegador, cookie, banco do aparelho) e
 * para nomes de infraestrutura que não mudam aqui (serviço no Railway, banco local `ces-db`).
 * O marcador `renomear-geo: manter a linha seguinte` protege a linha de baixo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARCADOR_MANTER = 'renomear-geo: manter';
/** Para arquivos que não aceitam comentário na mesma linha (ex.: `.env`). */
export const MARCADOR_MANTER_SEGUINTE = 'renomear-geo: manter a linha seguinte';

/** Pastas e arquivos varridos (relativos à raiz do repositório). */
export const ESCOPO = ['frontend', 'backend', '.github', 'openspec/config.yaml', 'AGENTS.md', 'README.md'];

/** Fora da renomeação, com o motivo. */
export const ISENCOES = [
  // Migrações Flyway são imutáveis (checksum): o histórico do banco fica como está.
  /^backend\/src\/main\/resources\/db\/migration\//,
  // Containers locais compartilhados com outros checkouts da máquina (fora do escopo).
  /^backend\/docker-compose\.ya?ml$/,
  // Lockfiles são gerados pelo npm.
  /(^|\/)package-lock\.json$/,
  // Este script e seus testes descrevem os nomes antigos.
  /^tools\/renomear-geo(\.test)?\.mjs$/,
];

const BINARIOS = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|pdf|mp4|webm|mp3|zip|jar|gz|xlsx?|docx?)$/i;

/** Regras de conteúdo, na ordem em que são aplicadas. */
export const REGRAS = [
  // Tokens CSS: --ces-brand
  [/--ces-/g, '--geo-'],
  // Entrypoints: @ces/ui
  [/@ces\//g, '@geo/'],
  // Entrypoints dentro de regex, com a barra escapada: /^@ces\/ui$/
  [/@ces(?=\\\/)/g, '@geo'],
  // Nome de tag em maiúsculas (element.tagName): 'CES-BUTTON', 'CES-{{NAME}}'
  [/(?<![A-Za-z0-9])CES(?=-[A-Z0-9{$])/g, 'GEO'],
  // Seletores, classes, atributos e nomes com hífen: ces-button, .ces-x, data-ces-density
  [/(?<![A-Za-z0-9])ces(?=-[a-z0-9$*{])/g, 'geo'],
  // Chaves e variáveis com sublinhado: ces_session_enc, $ces_x
  [/(?<![A-Za-z0-9])ces(?=_[a-z0-9])/g, 'geo'],
  // Propriedades, camadas, métricas e chaves com ponto: ces.email, @layer ces.tokens, ces.nav
  [/(?<![A-Za-z0-9])ces(?=\.[a-z])/g, 'geo'],
  // Chaves com dois-pontos e URIs: ces:reload, ces://fontes
  [/(?<![A-Za-z0-9])ces(?=:(?:\/\/|[a-z]))/g, 'geo'],
  // Raiz de YAML: "ces:" sozinho na linha
  [/^ces:(?=[ \t]*(?:#.*)?$)/gm, 'geo:'],
  // Caminhos: /opt/ces/
  [/(?<=\/)ces(?=\/)/g, 'geo'],
  // Identificadores: cesPreset, CesButtonComponent, formatCesChartValue, Ces@ (senha inicial)
  [/(?<![A-Za-z0-9])ces(?=[A-Z])/g, 'geo'],
  [/(?<![A-Za-z0-9])Ces(?=[A-Z@]|\$\{)/g, 'Geo'],
  [/(?<=[a-z0-9])Ces(?![a-z])/g, 'Geo'],
  // Constantes e variáveis de ambiente: CES_PRIMARY_COLORS, __CES_CONFIG__
  [/(?<![A-Za-z0-9])CES(?=_[A-Z0-9])/g, 'GEO'],
  // Valor isolado entre aspas ou tags: "ces", 'ces', <artifactId>ces</artifactId>
  [/(?<=["'>])ces(?=["'<])/g, 'geo'],
];

/** Aplica as regras a um texto, preservando as linhas com o marcador de manter. */
export function renomearTexto(texto) {
  if (!/ces/i.test(texto)) return texto;
  let manterSeguinte = false;
  return texto
    .split(/(?<=\n)/)
    .map((linha) => {
      const manter = manterSeguinte || linha.includes(MARCADOR_MANTER);
      manterSeguinte = linha.includes(MARCADOR_MANTER_SEGUINTE);
      return manter ? linha : renomearLinha(linha);
    })
    .join('');
}

function renomearLinha(linha) {
  let saida = linha;
  for (const [padrao, troca] of REGRAS) saida = saida.replace(padrao, troca);
  return saida;
}

/** Novo caminho de um arquivo, trocando o prefixo só no nome do arquivo e das pastas. */
export function renomearCaminho(caminho) {
  return caminho
    .split('/')
    .map((parte) =>
      parte
        .replace(/^ces(?=[-_.][a-z0-9])/, 'geo')
        .replace(/^Ces(?=[A-Z])/, 'Geo')
        .replace(/(?<=[a-z0-9])Ces(?![a-z])/, 'Geo'),
    )
    .join('/');
}

export function isento(caminho) {
  return ISENCOES.some((regra) => regra.test(caminho)) || BINARIOS.test(caminho);
}

/** Lista os arquivos versionados do escopo, já sem as isenções. */
export function listarArquivos(raiz) {
  const saida = execFileSync('git', ['ls-files', '-z', '--', ...ESCOPO], { cwd: raiz, maxBuffer: 256 * 1024 * 1024 });
  return saida
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((caminho) => !isento(caminho));
}

/** Calcula as trocas sem gravar nada. */
export function planejar(raiz) {
  const conteudo = [];
  const arquivos = [];
  for (const caminho of listarArquivos(raiz)) {
    let texto;
    try {
      texto = readFileSync(join(raiz, caminho), 'utf8');
    } catch {
      continue; // apagado no working tree
    }
    const novo = renomearTexto(texto);
    if (novo !== texto) conteudo.push({ caminho, texto: novo, ocorrencias: contarDiferencas(texto, novo) });
    const novoCaminho = renomearCaminho(caminho);
    if (novoCaminho !== caminho) arquivos.push({ de: caminho, para: novoCaminho });
  }
  return { conteudo, arquivos };
}

function contarDiferencas(antes, depois) {
  const a = antes.split('\n');
  const b = depois.split('\n');
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

export function aplicar(raiz, plano) {
  for (const { caminho, texto } of plano.conteudo) writeFileSync(join(raiz, caminho), texto, 'utf8');
  for (const { de, para } of plano.arquivos) {
    execFileSync('git', ['mv', '-k', de, para], { cwd: raiz });
  }
}

function principal() {
  const args = new Set(process.argv.slice(2));
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const plano = planejar(raiz);
  const linhas = plano.conteudo.reduce((total, item) => total + item.ocorrencias, 0);

  if (args.has('--check')) {
    if (plano.conteudo.length === 0 && plano.arquivos.length === 0) {
      console.log('renomear-geo: nenhum identificador `ces` fora das isenções.');
      return;
    }
    console.error(`renomear-geo: ainda há o prefixo \`ces\` em ${plano.conteudo.length} arquivo(s) e ${plano.arquivos.length} nome(s) de arquivo.`);
    for (const { caminho } of plano.conteudo.slice(0, 30)) console.error(`  ${caminho}`);
    for (const { de, para } of plano.arquivos.slice(0, 30)) console.error(`  ${de} -> ${posix.basename(para)}`);
    console.error('Use o prefixo `geo` (`--geo-*`, `<geo-*>`, `@geo/ui`, `Geo*`) ou rode `node tools/renomear-geo.mjs --aplicar`.');
    process.exitCode = 1;
    return;
  }

  if (args.has('--aplicar')) {
    aplicar(raiz, plano);
    console.log(`renomear-geo: ${linhas} linha(s) em ${plano.conteudo.length} arquivo(s) e ${plano.arquivos.length} arquivo(s) renomeado(s).`);
    return;
  }

  console.log(`renomear-geo (simulação): ${linhas} linha(s) em ${plano.conteudo.length} arquivo(s), ${plano.arquivos.length} arquivo(s) a renomear.`);
  for (const { caminho, ocorrencias } of plano.conteudo) console.log(`  ${String(ocorrencias).padStart(5)}  ${caminho}`);
  for (const { de, para } of plano.arquivos) console.log(`  mv ${de} -> ${basename(para)}`);
  console.log('Nada foi gravado. Use --aplicar para gravar.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
