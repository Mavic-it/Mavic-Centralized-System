import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest, AuthUserContext } from '../foundation/auth/auth.context.js';
import type { WorkService } from './work.service.js';
import { WorkController } from './work.controller.js';
import type { Response } from 'express';

const user: AuthUserContext = {
  userId: 'employee-user',
  role: 'EMPLOYEE',
  branchId: 'branch-a',
  branchIds: ['branch-a'],
  email: 'employee@example.invalid',
};

describe('work attachment preview response', () => {
  it.each(['xlsx', 'pdf'] as const)('serves incident %s exports as private downloads', async format => {
    const exportIncidents = vi.fn().mockResolvedValue(Buffer.from('report'));
    const controller = new WorkController({exportIncidents} as unknown as WorkService);
    const setHeader = vi.fn();
    await controller.exportIncidents({user} as AuthenticatedRequest,'incidents',{format,branchId:'branch-a',category:'CONDUCT'}, {setHeader} as unknown as Response);
    expect(exportIncidents).toHaveBeenCalledWith(user,expect.objectContaining({format,branchId:'branch-a',category:'CONDUCT'}));
    expect(setHeader).toHaveBeenCalledWith('Content-Type',format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition',`attachment; filename="incidents-${format === 'xlsx' ? 'export.xlsx' : 'report.pdf'}"`);
  });
  it('serves supported task files inline only when preview is requested', async () => {
    const setHeader = vi.fn();
    const service = {
      download: vi.fn().mockResolvedValue({
        mime: 'image/png',
        filename: 'proof.png',
        content: Buffer.from('image fixture'),
      }),
    } as unknown as WorkService;
    const controller = new WorkController(service);

    await controller.download(
      { user } as AuthenticatedRequest,
      'tasks',
      '32c7dd94-e673-4ef9-81b6-aed76095bf30',
      '6ac91c69-b857-4d91-ae41-2e50b343121e',
      '1',
      { setHeader } as unknown as Response,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^inline;/),
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
  });

  it('keeps downloads as attachments and refuses inline rendering of unsupported MIME', async () => {
    const setHeader = vi.fn();
    const service = {
      download: vi.fn().mockResolvedValue({
        mime: 'text/html',
        filename: 'unsafe.html',
        content: Buffer.from('<h1>fixture</h1>'),
      }),
    } as unknown as WorkService;
    const controller = new WorkController(service);

    await controller.download(
      { user } as AuthenticatedRequest,
      'tasks',
      '32c7dd94-e673-4ef9-81b6-aed76095bf30',
      '6ac91c69-b857-4d91-ae41-2e50b343121e',
      '1',
      { setHeader } as unknown as Response,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^attachment;/),
    );
  });
});
