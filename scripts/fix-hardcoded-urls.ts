#!/usr/bin/env ts-node

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';

async function fixHardcodedUrls() {
  console.log('🔧 Fixing hardcoded URLs in test files...');
  
  // Find all integration test files
  const testFiles = await glob('tests/integration/**/*.test.ts');
  
  let filesFixed = 0;
  let totalReplacements = 0;
  
  for (const filePath of testFiles) {
    const content = await readFile(filePath, 'utf-8');
    let updatedContent = content;
    let fileReplacements = 0;
    
    // Skip files that already have testEnv import (likely already fixed)
    if (content.includes("import { testEnv } from '../helpers/testSetup'")) {
      console.log(`⏭️  Skipping ${filePath} (already uses testEnv)`);
      continue;
    }
    
    // Add testEnv import if the file has hardcoded localhost:64971
    if (content.includes('http://localhost:64971') || content.includes('localhost:64971')) {
      // Add import after existing imports
      const importMatch = content.match(/^(import.*\n)+/m);
      if (importMatch && !content.includes("import { testEnv }")) {
        const existingImports = importMatch[0];
        const newImport = "import { testEnv } from '../helpers/testSetup';\n";
        updatedContent = updatedContent.replace(existingImports, existingImports + newImport);
      }
      
      // Replace hardcoded URLs in beforeEach/beforeAll blocks
      updatedContent = updatedContent.replace(
        /(\s+)(const\s+\w+\s*=\s*`[\s\S]*?)baseUrl:\s*["']http:\/\/localhost:64971["']/g,
        (match, indent, configStart) => {
          fileReplacements++;
          return `${indent}const mockBaseUrl = testEnv.getTestBaseUrl();\n${indent}${configStart}baseUrl: "\${mockBaseUrl}"`;
        }
      );
      
      // Replace remaining hardcoded URLs in strings
      updatedContent = updatedContent.replace(
        /baseUrl:\s*["']http:\/\/localhost:64971["']/g,
        () => {
          fileReplacements++;
          return 'baseUrl: "${mockBaseUrl}"';
        }
      );
      
      // Replace in environment variable settings
      updatedContent = updatedContent.replace(
        /process\.env\.E2E_BASE_URL\s*=\s*['"]http:\/\/localhost:64971['"];?/g,
        () => {
          fileReplacements++;
          return "process.env.E2E_BASE_URL = testEnv.getTestBaseUrl();";
        }
      );
      
      // Replace in dry-run expectations
      updatedContent = updatedContent.replace(
        /expect\(.*\)\.toContain\(['"].*http:\/\/localhost:64971.*['"]\)/g,
        (match) => {
          fileReplacements++;
          return match.replace('http://localhost:64971', '${testEnv.getTestBaseUrl()}');
        }
      );
      
      if (fileReplacements > 0) {
        await writeFile(filePath, updatedContent);
        filesFixed++;
        totalReplacements += fileReplacements;
        console.log(`✅ Fixed ${filePath} (${fileReplacements} replacements)`);
      }
    }
  }
  
  console.log(`\n🎉 Summary:`);
  console.log(`   Files fixed: ${filesFixed}`);
  console.log(`   Total replacements: ${totalReplacements}`);
  
  if (filesFixed === 0) {
    console.log('   No files needed fixing!');
  }
}

fixHardcodedUrls().catch(console.error); 