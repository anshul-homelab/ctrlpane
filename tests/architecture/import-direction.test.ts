import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

describe('Import Direction [architecture]', () => {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.json',
  });

  it('repository files do not import from routes or service', () => {
    const repoFiles = project.getSourceFiles('apps/api/src/domains/**/repository*.ts');

    // Greenfield: if no files exist yet, the constraint is trivially satisfied
    if (repoFiles.length === 0) {
      return;
    }

    const violations: string[] = [];

    for (const file of repoFiles) {
      for (const imp of file.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        if (specifier.includes('routes') || specifier.includes('service')) {
          violations.push(`${file.getFilePath()}: imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('service files do not import from routes', () => {
    const serviceFiles = project.getSourceFiles('apps/api/src/domains/**/service*.ts');

    // Greenfield: if no files exist yet, the constraint is trivially satisfied
    if (serviceFiles.length === 0) {
      return;
    }

    const violations: string[] = [];

    for (const file of serviceFiles) {
      for (const imp of file.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        if (specifier.includes('routes')) {
          violations.push(`${file.getFilePath()}: imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
