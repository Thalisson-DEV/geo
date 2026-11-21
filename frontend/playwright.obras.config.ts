import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/** Capturas das telas de Obras do web (`npx playwright test -c playwright.obras.config.ts`). */
export default defineConfig({ ...base, testDir: './e2e/obras' });
