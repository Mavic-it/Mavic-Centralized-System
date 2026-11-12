import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeDocumentService } from './employee-document.service.js';

describe('EmployeeDocumentService uploaded files', () => {
  it('calculates required checklist completion from the latest valid file per requirement', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'requirement-1',
        name: 'Signed contract',
        category: 'CONTRACT_RECORD',
        isRequired: true,
        isComplete: true,
        documentId: 'document-1',
        fileName: 'contract.pdf',
        expirationDate: null,
        documentStatus: 'ACTIVE',
        version: '2',
      },
      {
        id: 'requirement-2',
        name: 'Government ID',
        category: 'GOVERNMENT_ID',
        isRequired: true,
        isComplete: false,
        documentId: null,
        fileName: null,
        expirationDate: null,
        documentStatus: null,
        version: null,
      },
      {
        id: 'requirement-3',
        name: 'Training certificate',
        category: 'CONTRACT_RECORD',
        isRequired: false,
        isComplete: false,
        documentId: null,
        fileName: null,
        expirationDate: null,
        documentStatus: null,
        version: null,
      },
    ]);
    const service = new EmployeeDocumentService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getChecklist('employee-1', 'branch-1'),
    ).resolves.toMatchObject({
      status: 'INCOMPLETE',
      requiredCount: 2,
      completedRequiredCount: 1,
      requirements: [
        { id: 'requirement-1', isComplete: true, version: 2 },
        { id: 'requirement-2', isComplete: false },
        { id: 'requirement-3', isRequired: false, isComplete: false },
      ],
    });
    expect(query.mock.calls[0][0]).toContain('expiration_date >= CURRENT_DATE');
  });

  it('reports a distinct not-configured state when no branch requirements exist', async () => {
    const service = new EmployeeDocumentService({
      query: vi.fn().mockResolvedValue([]),
    } as unknown as DataSource);

    await expect(
      service.getChecklist('employee-1', 'branch-1'),
    ).resolves.toMatchObject({
      status: 'NOT_CONFIGURED',
      requiredCount: 0,
      completedRequiredCount: 0,
      requirements: [],
    });
  });

  it('validates and versions a requirement-linked upload inside the employee transaction', async () => {
    const insertedDocument = {
      id: 'document-2',
      employeeId: 'employee-1',
      requirementId: 'requirement-1',
      category: 'CONTRACT_RECORD' as const,
      documentType: 'Contract / Record',
      fileName: 'signed-contract.pdf',
      fileSizeBytes: 32,
      mimeType: 'application/pdf',
      hasFile: true,
      uploadedBy: 'hr-1',
      expirationDate: null,
      status: 'ACTIVE' as const,
      version: 3,
      createdAt: '2026-10-09T00:00:00.000Z',
    };
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM employees WHERE id = $1 FOR UPDATE')) {
        return [{ id: 'employee-1' }];
      }
      if (sql.includes('FROM employee_document_requirements')) {
        return [{ id: 'requirement-1', category: 'CONTRACT_RECORD' }];
      }
      if (sql.includes('COALESCE(MAX(version)')) return [{ version: '3' }];
      if (sql.startsWith('INSERT INTO employee_documents')) {
        return [insertedDocument];
      }
      return [];
    });
    const dataSource = {
      transaction: (
        operation: (manager: { query: typeof managerQuery }) => unknown,
      ) => operation({ query: managerQuery }),
    } as unknown as DataSource;
    const service = new EmployeeDocumentService(dataSource);

    await expect(
      service.create(
        {
          employeeId: 'employee-1',
          requirementId: 'requirement-1',
          category: 'CONTRACT_RECORD',
          fileName: 'signed-contract.pdf',
          fileSizeBytes: 32,
          mimeType: 'application/pdf',
          fileData: Buffer.from('%PDF-1.7'),
          uploadedBy: 'hr-1',
          expirationDate: null,
        },
        'branch-1',
      ),
    ).resolves.toMatchObject({ requirementId: 'requirement-1', version: 3 });

    const insert = managerQuery.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO employee_documents'),
    );
    expect(insert?.[0]).toContain('requirement_id');
    expect(insert?.[1]?.[10]).toBe(3);
    expect(insert?.[1]?.[11]).toBe('requirement-1');
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO audit_logs'),
      ),
    ).toBe(true);
  });

  it('attaches an existing active file without copying its stored bytes', async () => {
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM employees WHERE id = $1 FOR UPDATE'))
        return [{ id: 'employee-1' }];
      if (
        sql.includes('FROM employee_documents') &&
        sql.includes('FOR UPDATE')
      ) {
        return [
          {
            id: 'document-1',
            category: 'GOVERNMENT_ID',
            requirementId: null,
            status: 'ACTIVE',
            expirationDate: null,
          },
        ];
      }
      if (sql.includes('FROM employee_document_requirements')) {
        return [{ id: 'requirement-1', category: 'GOVERNMENT_ID' }];
      }
      if (sql.includes('COALESCE(MAX(version)')) return [{ version: 2 }];
      if (sql.startsWith('UPDATE employee_documents')) {
        return [
          {
            id: 'document-1',
            employeeId: 'employee-1',
            requirementId: 'requirement-1',
            version: 2,
          },
        ];
      }
      return [];
    });
    const service = new EmployeeDocumentService({
      transaction: (
        operation: (manager: { query: typeof managerQuery }) => unknown,
      ) => operation({ query: managerQuery }),
    } as unknown as DataSource);

    await expect(
      service.attachExistingDocument(
        'employee-1',
        'document-1',
        'requirement-1',
        'branch-1',
        { userId: 'hr-1' },
      ),
    ).resolves.toMatchObject({ requirementId: 'requirement-1', version: 2 });

    const update = managerQuery.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE employee_documents'),
    );
    expect(update?.[0]).not.toContain('file_data =');
    expect(update?.[1]).toEqual([
      'document-1',
      'employee-1',
      'requirement-1',
      2,
    ]);
  });

  it('lists file metadata without returning the stored bytes', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'document-1',
        employeeId: 'employee-1',
        category: 'GOVERNMENT_ID',
        documentType: 'Government ID',
        fileName: 'id.png',
        fileSizeBytes: '128',
        mimeType: 'image/png',
        hasFile: true,
        uploadedBy: 'hr-1',
        expirationDate: null,
        status: 'ACTIVE',
        version: 1,
        createdAt: '2026-10-07T00:00:00.000Z',
      },
    ]);
    const service = new EmployeeDocumentService({
      query,
    } as unknown as DataSource);

    const documents = await service.list('employee-1');

    expect(documents[0]).toMatchObject({
      category: 'GOVERNMENT_ID',
      fileName: 'id.png',
      mimeType: 'image/png',
      hasFile: true,
      fileSizeBytes: 128,
    });
    expect(documents[0]).not.toHaveProperty('data');
    expect(query.mock.calls[0][0]).toContain('file_data IS NOT NULL');
  });

  it('loads file bytes only for the requested employee and document', async () => {
    const data = Buffer.from([1, 2, 3]);
    const query = vi
      .fn()
      .mockResolvedValue([
        { fileName: 'contract.pdf', mimeType: 'application/pdf', data },
      ]);
    const service = new EmployeeDocumentService({
      query,
    } as unknown as DataSource);

    await expect(service.getFile('employee-1', 'document-1')).resolves.toEqual({
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      data,
    });
    expect(query.mock.calls[0][1]).toEqual(['employee-1', 'document-1']);
  });
});
