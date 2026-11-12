import type { WorkRecord } from './work.policy.js';
import ExcelJS from 'exceljs';
import { safeTaskExportCell, taskPdf } from './task-export.js';

function incidentSummary(r: Record<string, unknown>) {
  const text = (key: string) =>
    typeof r[key] === 'string' ? (r[key] as string) : '';
  return {
    reference: text('referenceNumber'),
    employee: text('employeeName'),
    branch: text('branchName'),
    category: text('category'),
    date: text('incidentDate'),
    workflow: incidentStep({
      status: text('status'),
      caseStatus: text('caseStatus'),
    }),
    status: text('status'),
    caseStatus: text('caseStatus'),
  };
}

export async function incidentWorkbook(rows: Array<Record<string, unknown>>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mspaces Centralized Management System';
  const sheet = workbook.addWorksheet('Incidents', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Reference', key: 'reference', width: 26 },
    { header: 'Employee', key: 'employee', width: 30 },
    { header: 'Branch', key: 'branch', width: 24 },
    { header: 'Category', key: 'category', width: 26 },
    { header: 'Incident date', key: 'date', width: 18 },
    { header: 'Workflow', key: 'workflow', width: 26 },
    { header: 'Report status', key: 'status', width: 24 },
    { header: 'Case status', key: 'caseStatus', width: 24 },
  ];
  for (const row of rows)
    sheet.addRow(
      Object.fromEntries(
        Object.entries(incidentSummary(row)).map(([key, value]) => [
          key,
          safeTaskExportCell(value),
        ]),
      ),
    );
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB91C32' },
  };
  sheet.autoFilter = 'A1:H1';
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function incidentPdf(rows: Array<Record<string, unknown>>) {
  return taskPdf(
    rows.map((row) => {
      const r = incidentSummary(row);
      return {
        id: r.reference || 'Not available',
        title: r.reference || 'Incident report',
        description: `Category: ${r.category || 'Not specified'} | Workflow: ${r.workflow} | Report status: ${r.status} | Case status: ${r.caseStatus || 'Not set'}`,
        branchName: r.branch,
        assigneeNames: r.employee,
        status: r.status,
        priority: '',
        startDate: r.date,
        dueDate: '',
        createdAt: '',
      };
    }),
    new Date(),
    true,
  );
}

export function incidentStep(
  r: Pick<WorkRecord, 'status' | 'caseStatus'>,
): string {
  if (['WITHDRAWN', 'DISMISSED', 'RESOLVED', 'CLOSED'].includes(r.status))
    return r.status;
  if (r.caseStatus === 'DECISION_PENDING' || r.caseStatus === 'CLOSED')
    return 'FOR_DECISION';
  if (
    ['NOTICE_ISSUED', 'AWAITING_RESPONSE'].includes(r.caseStatus ?? '') ||
    r.status === 'DETAILS_REQUESTED'
  )
    return 'PENDING_EXPLANATION';
  return r.status === 'SUBMITTED' ? 'SUBMITTED' : 'UNDER_REVIEW';
}

function csvCell(value: unknown): string {
  let text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  let start = 0;
  while (
    start < text.length &&
    (text.charCodeAt(start) <= 32 || text[start].trim() === '')
  )
    start++;
  if (/^[=+@-]/.test(text.slice(start))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function incidentCsv(rows: Array<Record<string, unknown>>): Buffer {
  const columns = [
    'Reference',
    'Employee',
    'Branch',
    'Category',
    'Incident date',
    'Workflow',
    'Report status',
    'Case status',
  ];
  const data = rows.map((r) => [
    r.referenceNumber,
    r.employeeName,
    r.branchName,
    r.category,
    r.incidentDate,
    incidentStep({
      status: String(r.status),
      caseStatus: r.caseStatus as string | null,
    }),
    r.status,
    r.caseStatus,
  ]);
  return Buffer.from(
    '\ufeff' +
      [columns, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n') +
      '\r\n',
    'utf8',
  );
}
