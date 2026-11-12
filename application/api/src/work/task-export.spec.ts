import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { safeTaskExportCell, taskPdf, taskWorkbook } from './task-export.js';

const row = {
  id: 'task-1',
  title: '=HYPERLINK("https://bad")',
  description: 'Prepare the room (chairs and tables).',
  branchName: 'Mspaces Makati',
  assigneeNames: 'Alex Employee',
  status: 'TODO',
  priority: 'NORMAL',
  startDate: '2026-11-05',
  dueDate: '2026-11-05',
  createdAt: '2026-11-05T09:00:00.000Z',
};

describe('task exports', () => {
  it('neutralizes spreadsheet formulas in all exported text cells', async () => {
    expect(safeTaskExportCell('=1+1')).toBe("'=1+1");
    expect(safeTaskExportCell('\t=1+1')).toBe("'\t=1+1");
    const bytes = await taskWorkbook([row]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.getWorksheet('Tasks')?.getCell('B2').value).toBe(
      "'=HYPERLINK(\"https://bad\")",
    );
  });

  it('creates a structured multi-page report and escapes task text', () => {
    const bytes = taskPdf([row, ...Array.from({ length: 80 }, (_, i) => ({ ...row, id: `task-${i + 2}` }))]);
    const pdf = bytes.toString('ascii');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Task report');
    expect(pdf).toContain('TOTAL TASKS');
    expect(pdf).toContain('ASSIGNEES');
    expect(pdf).toContain('DESCRIPTION');
    expect(pdf).toContain('Not started');
    expect(pdf).toContain('Task ID: task-1');
    expect(pdf).toContain('=HYPERLINK');
    expect(pdf).toContain('Prepare the room \\(chairs and tables\\).');
    expect(pdf.match(/\/Type \/Page /g)?.length).toBeGreaterThan(1);
    expect(pdf).toContain('Page 1 of');
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
  });

  it('keeps an empty report readable', () => {
    const pdf = taskPdf([], new Date('2026-11-05T04:49:00.000Z')).toString('ascii');
    expect(pdf).toContain('No tasks match the current filters.');
    expect(pdf).toContain('(0) Tj');
    expect(pdf).toContain('Page 1 of 1');
  });
});
