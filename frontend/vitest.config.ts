import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

function angularInlinePlugin() {
  return {
    name: 'angular-inline-plugin',
    transform(code: string, id: string) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
      let newCode = code;
      newCode = newCode.replace(/templateUrl:\s*['"](\.[^'"]+)['"]/g, (match, relPath) => {
        const fullPath = path.resolve(path.dirname(id), relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          return `template: ${JSON.stringify(content)}`;
        }
        return match;
      });
      newCode = newCode.replace(/styleUrl:\s*['"](\.[^'"]+)['"]/g, (match, relPath) => {
        const fullPath = path.resolve(path.dirname(id), relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          return `styles: [${JSON.stringify(content)}]`;
        }
        return match;
      });
      newCode = newCode.replace(/styleUrls:\s*\[([^\]]+)\]/g, () => `styles: []`);
      return { code: newCode, map: null };
    },
  };
}

export default defineConfig({
  plugins: [angularInlinePlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: [
      { find: /^@geo\/ui\/forms$/, replacement: path.resolve(__dirname, './src/app/design-system/forms/index.ts') },
      { find: /^@geo\/ui\/autocomplete$/, replacement: path.resolve(__dirname, './src/app/design-system/autocomplete/index.ts') },
      { find: /^@geo\/ui\/data$/, replacement: path.resolve(__dirname, './src/app/design-system/data/index.ts') },
      { find: /^@geo\/ui\/overlays$/, replacement: path.resolve(__dirname, './src/app/design-system/overlays/index.ts') },
      { find: /^@geo\/ui\/feedback$/, replacement: path.resolve(__dirname, './src/app/design-system/feedback/index.ts') },
      { find: /^@geo\/ui\/patterns$/, replacement: path.resolve(__dirname, './src/app/design-system/patterns/index.ts') },
      { find: /^@geo\/ui\/testing$/, replacement: path.resolve(__dirname, './src/app/design-system/testing/index.ts') },
      { find: /^@geo\/ui$/, replacement: path.resolve(__dirname, './src/app/design-system/index.ts') },
    ],
  },
});
