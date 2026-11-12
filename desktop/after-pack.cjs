'use strict';
// electron-builder no copia `node_modules` con extraResources: el ayudante de IA necesita las suyas (pdf.js y el módulo nativo de canvas,
// instaladas en el mismo sistema que compila el instalador).
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const resources =
    packager.platform.name === 'mac' ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources') : path.join(appOutDir, 'resources');
  const from = path.join(__dirname, '..', 'tools', 'ai-phase0', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('Faltan las dependencias del ayudante: ejecuta «npm install --prefix tools/ai-phase0» antes de empaquetar.');
  fs.cpSync(from, path.join(resources, 'tools', 'ai-phase0', 'node_modules'), { recursive: true, dereference: true });
};
