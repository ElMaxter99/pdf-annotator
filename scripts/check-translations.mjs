#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const translationDirCandidates = [
  path.resolve(__dirname, '../src/app/i18n/translations'),
  path.resolve(__dirname, '../src/app/core/i18n/translations'),
];
const baseLanguage = 'es-ES';

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getValue(dictionary, key) {
  return key.split('.').reduce((value, segment) => {
    if (value && typeof value === 'object' && segment in value) {
      return value[segment];
    }
    return undefined;
  }, dictionary);
}

function collectStringKeys(dictionary, prefix = '') {
  return Object.entries(dictionary).flatMap(([key, value]) => {
    const composedKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      return [composedKey];
    }
    if (value && typeof value === 'object') {
      return collectStringKeys(value, composedKey);
    }
    return [];
  });
}

async function resolveTranslationsDir() {
  for (const candidate of translationDirCandidates) {
    try {
      const files = await readdir(candidate);
      return { dir: candidate, files };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    `No translation directory found. Checked: ${translationDirCandidates.join(', ')}`,
  );
}

async function main() {
  const { dir: translationsDir, files } = await resolveTranslationsDir();
  const languages = files
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort();

  if (!languages.includes(baseLanguage)) {
    console.error(`Base language file "${baseLanguage}.json" was not found in ${translationsDir}.`);
    process.exit(1);
  }

  const basePath = path.join(translationsDir, `${baseLanguage}.json`);
  const baseDictionary = await readJson(basePath);
  const baseKeys = new Set(collectStringKeys(baseDictionary));

  let hasErrors = false;

  for (const language of languages.filter((lang) => lang !== baseLanguage)) {
    const languagePath = path.join(translationsDir, `${language}.json`);
    const dictionary = await readJson(languagePath);
    const missingKeys = [];
    const emptyKeys = [];

    for (const key of baseKeys) {
      const value = getValue(dictionary, key);
      if (typeof value !== 'string') {
        missingKeys.push(key);
      } else if (!value.trim()) {
        emptyKeys.push(key);
      }
    }

    if (missingKeys.length || emptyKeys.length) {
      hasErrors = true;
      if (missingKeys.length) {
        console.error(`\n[${language}] Missing translations:`);
        missingKeys.forEach((key) => console.error(`  - ${key}`));
      }
      if (emptyKeys.length) {
        console.error(`\n[${language}] Empty translations:`);
        emptyKeys.forEach((key) => console.error(`  - ${key}`));
      }
    }
  }

  if (hasErrors) {
    console.error('\nTranslation files are inconsistent. Please update the missing entries.');
    process.exit(1);
  }

  console.log(`Translation check passed. ${baseKeys.size} keys validated.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
