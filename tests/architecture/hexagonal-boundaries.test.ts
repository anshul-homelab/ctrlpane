import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

describe('Hexagonal Boundaries [architecture]', () => {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.json',
  });

  it('blueprint domain does not import from other domains', () => {
    const blueprintFiles = project.getSourceFiles('apps/api/src/domains/blueprint/**/*.ts');

    // Greenfield: if no files exist yet, the constraint is trivially satisfied
    if (blueprintFiles.length === 0) {
      return;
    }

    const violations: string[] = [];

    for (const file of blueprintFiles) {
      for (const imp of file.getImportDeclarations()) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        if (
          moduleSpecifier.includes('/domains/') &&
          !moduleSpecifier.includes('/domains/blueprint/')
        ) {
          violations.push(`${file.getFilePath()}: imports from ${moduleSpecifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no domain imports from another domain (cross-domain isolation)', () => {
    const domainFiles = project.getSourceFiles('apps/api/src/domains/**/*.ts');

    // Greenfield: if no files exist yet, the constraint is trivially satisfied
    if (domainFiles.length === 0) {
      return;
    }

    const violations: string[] = [];

    for (const file of domainFiles) {
      const filePath = file.getFilePath();
      // Extract the domain name from the file path
      const domainMatch = filePath.match(/\/domains\/([^/]+)\//);
      if (!domainMatch) continue;
      const currentDomain = domainMatch[1];

      for (const imp of file.getImportDeclarations()) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        const importDomainMatch = moduleSpecifier.match(/\/domains\/([^/]+)/);
        if (importDomainMatch && importDomainMatch[1] !== currentDomain) {
          violations.push(
            `${filePath}: domain "${currentDomain}" imports from domain "${importDomainMatch[1]}" via ${moduleSpecifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
