import { describe, expect, it, vi } from 'vitest';
import {
  incidentCsv,
  incidentStep,
  incidentWorkbook,
  incidentPdf,
} from './incident-report.js';
import ExcelJS from 'exceljs';
import { WorkService } from './work.service.js';
import type { DataSource } from 'typeorm';

describe('simple incident reporting', () => {
  const summary = {
    referenceNumber: 'INC-123',
    employeeName: '=HYPERLINK("private")',
    branchName: 'Makati',
    category: 'CONDUCT',
    incidentDate: '2026-11-07',
    status: 'UNDER_REVIEW',
    caseStatus: 'NOTICE_ISSUED',
    description: 'Private narrative',
    findings: 'Private findings',
  };
  it('exports real Excel cells with summary fields and neutralized formulas', async () => {
    const bytes = await incidentWorkbook([summary]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.getWorksheet('Incidents')!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Reference',
      'Employee',
      'Branch',
      'Category',
      'Incident date',
      'Workflow',
      'Report status',
      'Case status',
    ]);
    expect(sheet.getCell('A2').value).toBe('INC-123');
    expect(sheet.getCell('B2').value).toBe(`'${summary.employeeName}`);
    expect(sheet.getCell('F2').value).toBe('PENDING_EXPLANATION');
    expect(JSON.stringify(sheet.getSheetValues())).not.toContain('Private');
    const empty = new ExcelJS.Workbook();
    await empty.xlsx.load((await incidentWorkbook([])) as never);
    expect(empty.getWorksheet('Incidents')!.rowCount).toBe(1);
  });
  it('exports a paginated incident PDF without private narratives or task labels', () => {
    const pdf = incidentPdf(Array.from({ length: 12 }, () => summary)).toString(
      'ascii',
    );
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Incident report');
    expect(pdf).toContain('INC-123');
    expect(pdf).toContain('PENDING_EXPLANATION');
    expect(pdf).not.toContain('Private');
    expect(pdf).not.toContain('Task ID');
    expect(pdf.match(/\/Type \/Page /g)!.length).toBeGreaterThan(1);
    expect(incidentPdf([]).toString('ascii')).toContain('No incidents match');
  });
  it('rejects oversized exports without returning a partial report or creating a successful-export audit', async () => {
    const query = vi.fn();
    const service = new WorkService({ query } as unknown as DataSource);
    vi.spyOn(service, 'list').mockResolvedValue({
      items: [],
      page: 1,
      hasNext: true,
    });
    await expect(
      service.exportIncidents(
        {
          userId: 'hr',
          email: 'hr@example.invalid',
          role: 'HR_ADMIN',
          branchId: 'a',
        },
        {},
      ),
    ).rejects.toThrow('5,000');
    expect(query).not.toHaveBeenCalled();
  });
  it('shows the formal explanation and decision steps without changing stored status', () => {
    expect(incidentStep({ status: 'SUBMITTED' })).toBe('SUBMITTED');
    expect(incidentStep({ status: 'ESCALATED' })).toBe('UNDER_REVIEW');
    expect(
      incidentStep({ status: 'UNDER_REVIEW', caseStatus: 'NOTICE_ISSUED' }),
    ).toBe('PENDING_EXPLANATION');
    expect(
      incidentStep({ status: 'UNDER_REVIEW', caseStatus: 'DECISION_PENDING' }),
    ).toBe('FOR_DECISION');
    for (const status of ['CLOSED', 'WITHDRAWN', 'DISMISSED'])
      expect(incidentStep({ status, caseStatus: 'NOTICE_ISSUED' })).toBe(
        status,
      );
  });
  it('quotes cells, neutralizes spreadsheet formulas and excludes private narrative', () => {
    const csv = incidentCsv([
      {
        referenceNumber: 'INC-1',
        employeeName: ' \t=HYPERLINK("secret")',
        branchName: 'Branch, A',
        status: 'UNDER_REVIEW',
        category: 'CONDUCT',
        description: 'Secret narrative',
        findings: 'Secret findings',
      },
    ]).toString('utf8');
    expect(csv).toContain('"\' \t=HYPERLINK(""secret"")"');
    expect(csv).toContain('"Branch, A"');
    expect(csv).not.toContain('Secret');
    expect(incidentCsv([]).toString('utf8').split('\r\n')).toHaveLength(2);
  });
});
