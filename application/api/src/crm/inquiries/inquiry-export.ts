import ExcelJS from 'exceljs';
import { formulaSafe } from './inquiry.domain.js';

export async function inquiryWorkbook(
  headers: string[],
  rows: Record<string, unknown>[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MAVIC Centralized System';
  const sheet = workbook.addWorksheet('Inquiries', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = headers.map((key) => ({
    header: key,
    key,
    width: ['description', 'notes', 'label'].includes(key) ? 50 : 24,
  }));
  for (const row of rows)
    sheet.addRow(
      Object.fromEntries(headers.map((key) => [key, formulaSafe(row[key])])),
    );
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
/** Plain, paginated PDF report; escape literal text and bound line width before serialization. */
export function inquiryPdf(headers: string[], rows: Record<string, unknown>[]) {
  const safe = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\x20-\x7e]/g, '?')
      .replaceAll('\\', '\\\\')
      .replaceAll('(', '\\(')
      .replaceAll(')', '\\)');
  const lines = [
    'MAVIC - Inquiry report',
    `Generated ${new Date().toISOString()} | ${rows.length} records`,
    '',
  ];
  rows.forEach((r, n) => {
    lines.push(`Record ${n + 1}`);
    for (const h of headers) {
      const value = `${h}: ${formulaSafe(r[h])}`;
      for (const paragraph of value.split(/\r?\n/))
        for (let p = 0; p < Math.max(1, paragraph.length); p += 88)
          lines.push(paragraph.slice(p, p + 88));
    }
    lines.push('');
  });
  if (!rows.length) lines.push('No inquiries match the selected filters.');
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 58) pages.push(lines.slice(i, i + 58));
  const objects: string[] = [
    '',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const pageIds: number[] = [];
  for (const [n, page] of pages.entries()) {
    const commands = `BT /F1 10 Tf 40 800 Td 13 TL ${page.map((line) => `(${safe(line)}) Tj T*`).join('\n')} ET\nBT /F1 9 Tf 40 24 Td (Page ${n + 1} of ${pages.length}) Tj ET`;
    const streamId = objects.length + 1;
    objects.push(
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
    );
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let content = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, n) => {
    offsets.push(Buffer.byteLength(content, 'ascii'));
    content += `${n + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(content, 'ascii');
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(content, 'ascii');
}
