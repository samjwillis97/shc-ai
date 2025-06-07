import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { testEnv } from './testSetup.js';

export class TestMigrationHelper {
  /**
   * Replace httpbin.org URLs with mock server URL in a string
   */
  public static replaceMockUrls(content: string): string {
    if (!testEnv.shouldUseMockServer()) {
      return content; // No replacement needed when using real httpbin.org
    }
    
    const mockUrl = testEnv.getTestBaseUrl();
    return content.replace(/https:\/\/httpbin\.org/g, mockUrl);
  }

  /**
   * Update test expectations for mock server differences
   */
  public static updateMockExpectations(content: string): string {
    if (!testEnv.shouldUseMockServer()) {
      return content; // No changes needed when using real httpbin.org
    }

    // Header names are case-insensitive in HTTP, but our mock server normalizes to lowercase
    // Update test expectations to match mock server behavior
    let updated = content;
    
    // Replace httpbin.org hostname expectations with localhost
    updated = updated.replace(/expect\(.*\.headers\['Host'\]\)\.toBe\('httpbin\.org'\)/g, 
      "expect(response.headers['host']).toContain('localhost')");
    
    // Update header key expectations to lowercase (mock server normalizes)
    const headerMappings = [
      { original: "X-Test-Header", mock: "x-test-header" },
      { original: "X-User", mock: "x-user" },
      { original: "X-Custom", mock: "x-custom" },
      { original: "X-Dynamic-Test", mock: "x-dynamic-test" },
      { original: "X-Delete-Reason", mock: "x-delete-reason" },
      { original: "Authorization", mock: "authorization" }
    ];

    headerMappings.forEach(({ original, mock }) => {
      // Replace exact header references in test expectations
      updated = updated.replace(
        new RegExp(`headers\\['${original}'\\]`, 'g'),
        `headers['${mock}']`
      );
    });

    return updated;
  }

  /**
   * Migrate a single test file to use mock server
   */
  public static async migrateTestFile(filePath: string): Promise<string> {
    const originalContent = await readFile(filePath, 'utf-8');
    
    let migratedContent = originalContent;
    
    // Replace httpbin.org URLs with mock server
    migratedContent = this.replaceMockUrls(migratedContent);
    
    // Update test expectations for mock server behavior
    migratedContent = this.updateMockExpectations(migratedContent);
    
    // Add import for testEnv if needed and not present
    if (migratedContent.includes('testEnv.getTestBaseUrl()') && 
        !migratedContent.includes("import { testEnv }")) {
      // Add the import after other imports
      const importMatch = migratedContent.match(/^(import.*\n)+/m);
      if (importMatch) {
        const existingImports = importMatch[0];
        const newImport = "import { testEnv } from '../helpers/testSetup';\n";
        migratedContent = migratedContent.replace(existingImports, existingImports + newImport);
      }
    }
    
    return migratedContent;
  }

  /**
   * Migrate multiple test files matching a pattern
   */
  public static async migrateTestFiles(pattern: string, dryRun: boolean = true): Promise<{
    migratedFiles: string[],
    changes: { file: string, changeCount: number }[]
  }> {
    const files = await glob(pattern);
    const migratedFiles: string[] = [];
    const changes: { file: string, changeCount: number }[] = [];

    for (const file of files) {
      const originalContent = await readFile(file, 'utf-8');
      const migratedContent = await this.migrateTestFile(file);
      
      const changeCount = this.countChanges(originalContent, migratedContent);
      
      if (changeCount > 0) {
        changes.push({ file, changeCount });
        
        if (!dryRun) {
          await writeFile(file, migratedContent);
          migratedFiles.push(file);
        }
      }
    }

    return { migratedFiles, changes };
  }

  /**
   * Count the number of changes between original and migrated content
   */
  private static countChanges(original: string, migrated: string): number {
    const originalLines = original.split('\n');
    const migratedLines = migrated.split('\n');
    
    let changes = 0;
    const maxLines = Math.max(originalLines.length, migratedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const migratedLine = migratedLines[i] || '';
      
      if (originalLine !== migratedLine) {
        changes++;
      }
    }
    
    return changes;
  }

  /**
   * Create a temporary test configuration with mock server URL
   */
  public static createMockTestConfig(originalConfig: any): any {
    const mockConfig = JSON.parse(JSON.stringify(originalConfig)); // Deep clone
    
    if (mockConfig.apis) {
      Object.keys(mockConfig.apis).forEach(apiKey => {
        if (mockConfig.apis[apiKey].baseUrl === 'https://httpbin.org') {
          mockConfig.apis[apiKey].baseUrl = testEnv.getTestBaseUrl();
        }
      });
    }
    
    return mockConfig;
  }
}

export default TestMigrationHelper; 