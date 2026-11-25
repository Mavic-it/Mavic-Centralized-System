import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { inquiryPdf, inquiryWorkbook } from './inquiry-export.js';
describe('Inquiry file exports', () => {
  it('writes actual Excel cells and neutralizes formulas', async () => {
    const buffer = await inquiryWorkbook(
      ['client', 'count'],
      [{ client: '=1+1', count: 2 }],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet('Inquiries')?.getCell('A2').value).toBe(
      "'=1+1",
    );
  });
  it('writes a paginated PDF with escaped text and valid xref offsets', () => {
    const buffer = inquiryPdf(
      ['client'],
      Array.from({ length: 70 }, () => ({ client: 'Client (test) \\ name' })),
    );
    const text = buffer.toString('ascii');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('Client \\(test\\) \\\\ name');
    expect(text).toContain('Page 2');
    const xref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
  });
});
