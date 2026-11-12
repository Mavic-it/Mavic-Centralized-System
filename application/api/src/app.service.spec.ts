import { describe, expect, it } from 'vitest';
import { AppService } from './app.service.js';

describe('AppService', () => {
  it('should describe the MSPACES foundation and phased delivery plan', () => {
    const result = new AppService().getOverview();

    expect(result.system).toBe('MSPACES Centralized Management System');
    expect(result.modules).toContain('Authentication & User Management');
    expect(result.modules).toContain('Employee Management / 201 File');
    expect(result.phasePlan).toContain('Phase 1 — Foundation');
  });
});
