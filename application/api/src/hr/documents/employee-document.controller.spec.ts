import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from '../employees/employee.service.js';
import { EmployeeDocumentController } from './employee-document.controller.js';
import { EmployeeDocumentService } from './employee-document.service.js';
import { describe, expect, it, vi } from 'vitest';

describe('EmployeeDocumentController access boundaries', () => {
  it.each([
    {
      name: 'PNG image',
      fileName: 'government-id.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    },
    {
      name: 'PDF',
      fileName: 'government-id.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7'),
    },
    {
      name: 'DOCX',
      fileName: 'government-id.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    },
  ])('stores an allowed $name upload as a private file', async ({
    fileName,
    mimeType,
    buffer,
  }) => {
    const create = vi.fn().mockResolvedValue({ id: 'document-1' });
    const controller = new EmployeeDocumentController(
      { list: vi.fn(), create } as unknown as EmployeeDocumentService,
      {
        findById: vi.fn().mockResolvedValue({
          id: 'employee-1',
          branchId: 'branch-1',
          email: 'employee@example.test',
        }),
      } as unknown as EmployeeService,
    );
    const request = {
      user: {
        userId: 'hr-1',
        email: 'hr@example.test',
        role: 'SUPER_ADMIN',
        branchId: null,
      },
    } as AuthenticatedRequest;
    await controller.create(
      'employee-1',
      request,
      {
        category: 'GOVERNMENT_ID',
        documentType: 'Government ID',
        fileName,
      },
      {
        originalname: fileName,
        mimetype: mimeType,
        size: buffer.length,
        buffer,
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        category: 'GOVERNMENT_ID',
        fileName,
        mimeType,
        fileSizeBytes: buffer.length,
        fileData: buffer,
        uploadedBy: 'hr-1',
      }),
      'branch-1',
    );
  });

  it('rejects uploaded files whose contents do not match the file type', async () => {
    const controller = new EmployeeDocumentController(
      { list: vi.fn(), create: vi.fn() } as unknown as EmployeeDocumentService,
      {
        findById: vi.fn().mockResolvedValue({
          id: 'employee-1',
          branchId: 'branch-1',
          email: 'employee@example.test',
        }),
      } as unknown as EmployeeService,
    );
    const request = {
      user: {
        userId: 'hr-1',
        email: 'hr@example.test',
        role: 'SUPER_ADMIN',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(
      controller.create(
        'employee-1',
        request,
        { category: 'CONTRACT_RECORD' },
        {
          originalname: 'fake.pdf',
          mimetype: 'application/pdf',
          size: 4,
          buffer: Buffer.from('fake'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows IT admins to read their own document metadata only', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const controller = new EmployeeDocumentController(
      { list } as unknown as EmployeeDocumentService,
      {
        findById: vi.fn().mockResolvedValue({
          id: 'employee-1',
          branchId: 'branch-1',
          email: 'it@example.test',
        }),
      } as unknown as EmployeeService,
    );
    const request = {
      user: {
        userId: 'it-admin-1',
        email: 'it@example.test',
        role: 'IT_ADMIN',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await expect(controller.list('employee-1', request)).resolves.toEqual([]);
    expect(list).toHaveBeenCalledOnce();

    const anotherEmployee = { ...request, user: { ...request.user!, email: 'someone-else@example.test' } } as AuthenticatedRequest;
    await expect(controller.list('employee-1', anotherEmployee)).rejects.toBeInstanceOf(ForbiddenException);
    expect(list).toHaveBeenCalledOnce();
  });
});
