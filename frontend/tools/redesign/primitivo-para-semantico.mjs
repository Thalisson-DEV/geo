// Troca primitivos neutros (--p-zinc-*, --p-surface-0) por tokens semânticos --geo-* num CSS,
// considerando a propriedade: fundos claros → superfícies, bordas → border, texto → foreground.
// Blocos `.app-dark`/`.dark` ficam como estão. Uso: node tools/redesign/primitivo-para-semantico.mjs <arquivo.css>...
import { readFileSync, writeFileSync } from 'node:fs';

function semantico(prop, tom) {
  const t = tom === 'surface-0' ? 0 : Number(tom);
  if (/^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop)) {
    if (t <= 200) return '--geo-foreground-inverse';
    if (t <= 400) return '--geo-foreground-subtle';
    if (t <= 500) return '--geo-foreground-subtle';
    if (t <= 700) return '--geo-foreground-muted';
    return '--geo-foreground';
  }
  if (/border|outline|column-rule/.test(prop)) {
    if (t <= 200) return '--geo-border';
    if (t <= 400) return '--geo-border-strong';
    return null;
  }
  if (/background|^box-shadow$/.test(prop)) {
    if (t === 0) return '--geo-surface';
    if (t <= 50) return '--geo-surface-subtle';
    if (t <= 100) return '--geo-surface-muted';
    if (t <= 200) return '--geo-border';
    if (t >= 800) return '--geo-surface-inverse';
    return null;
  }
  return null;
}

for (const arquivo of process.argv.slice(2)) {
  const css = readFileSync(arquivo, 'utf8');
  let saida = '';
  let i = 0;
  let trocas = 0;
  // percorre regra a regra: seletor { corpo }
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    saida += css.slice(i, m.index);
    const [inteiro, seletor, corpo] = m;
    if (/\.(app-)?dark\b/.test(seletor)) {
      saida += inteiro;
    } else {
      const novo = corpo.replace(/([a-z-]+)\s*:([^;]*)/g, (decl, prop, valor) =>
        prop + ':' + valor.replace(/var\(--p-(zinc-(\d+)|surface-0)\)/g, (v, _x, tom) => {
          const s = semantico(prop.trim(), tom ?? 'surface-0');
          if (!s) return v;
          trocas++;
          return `var(${s})`;
        })
      );
      saida += seletor + '{' + novo + '}';
    }
    i = m.index + inteiro.length;
  }
  saida += css.slice(i);
  writeFileSync(arquivo, saida);
  console.log(arquivo, trocas, 'trocas');
}
