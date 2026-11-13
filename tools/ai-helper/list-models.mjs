#!/usr/bin/env node
// Prueba a mano: `node tools/ai-helper/list-models.mjs [claude|copilot]` imprime los modelos que lee la app (por defecto, los dos).
import { listModels } from './models.mjs';

for (const provider of process.argv[2] ? [process.argv[2]] : ['claude', 'copilot']) {
  try {
    const { models } = await listModels(provider);
    console.log(`${provider}: ${models.length} modelos`);
    for (const m of models) console.log(`  ${m.id}  ·  ${m.name}${m.group ? `  ·  ${m.group}` : ''}`);
  } catch (e) {
    console.log(`${provider}: ERROR ${e.code} · ${e.message}`);
  }
}
