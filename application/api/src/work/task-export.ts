import ExcelJS from 'exceljs';

export type TaskExportRow = {
  id: string;
  title: string;
  description: string;
  branchName: string;
  assigneeNames: string;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  createdAt: string;
};

export function safeTaskExportCell(value: string) {
  let firstVisible = 0;
  while (firstVisible < value.length) {
    const code = value.charCodeAt(firstVisible);
    if (code > 0x20 && code !== 0x7f) break;
    firstVisible += 1;
  }
  return firstVisible < value.length && '=+-@'.includes(value[firstVisible])
    ? `'${value}`
    : value;
}

export async function taskWorkbook(rows: TaskExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mspaces Centralized Management System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Tasks', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Task ID', key: 'id', width: 38 },
    { header: 'Title', key: 'title', width: 32 },
    { header: 'Description', key: 'description', width: 56 },
    { header: 'Branch', key: 'branchName', width: 24 },
    { header: 'Assignees', key: 'assigneeNames', width: 36 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Start date', key: 'startDate', width: 16 },
    { header: 'Due date', key: 'dueDate', width: 16 },
    { header: 'Created at', key: 'createdAt', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB91C32' },
  };
  for (const row of rows)
    sheet.addRow(
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'string' ? safeTaskExportCell(value) : value,
        ]),
      ),
    );
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: rowNumber > 1 };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function pdfText(value: string) {
  const ascii = value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7e]/g, '?');
  return ascii
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrap(value: string, max: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > max) {
      if (line) lines.push(line);
      line = '';
      for (let index = 0; index < word.length; index += max)
        lines.push(word.slice(index, index + max));
      continue;
    }
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

type PdfColor = readonly [number, number, number];
const ink: PdfColor = [0.14, 0.2, 0.29];
const muted: PdfColor = [0.38, 0.44, 0.52];
const brand: PdfColor = [0.73, 0.11, 0.2];
const border: PdfColor = [0.85, 0.88, 0.92];

function pdfDrawText(
  commands: string[],
  value: string,
  x: number,
  y: number,
  size = 9,
  color: PdfColor = ink,
  bold = false,
) {
  commands.push(
    `${color.join(' ')} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`,
  );
}

function pdfFill(
  commands: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: PdfColor,
) {
  commands.push(`${color.join(' ')} rg ${x} ${y} ${width} ${height} re f`);
}

function pdfLine(
  commands: string[],
  x1: number,
  y: number,
  x2: number,
  color: PdfColor = border,
) {
  commands.push(`${color.join(' ')} RG 0.7 w ${x1} ${y} m ${x2} ${y} l S`);
}

const shortDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});
const manilaDateTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function reportDate(value: string) {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : shortDate.format(date);
}

function reportDateTime(value: Date) {
  return Number.isNaN(value.getTime())
    ? 'Not set'
    : `${manilaDateTime.format(value)} PHT`;
}

function reportStatus(value: string) {
  const labels: Record<string, string> = {
    TODO: 'Not started',
    STARTED: 'Started',
    IN_PROGRESS: 'In progress',
    STUCK: 'Stuck',
    FOR_REVIEW: 'For review',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function reportPriority(value: string) {
  return value ? value.charAt(0) + value.slice(1).toLowerCase() : 'Not set';
}

function prepareCard(row: TaskExportRow) {
  const title = wrap(row.title || 'Untitled task', 56);
  const branch = wrap(row.branchName || 'Not specified', 34);
  const assignees = wrap(row.assigneeNames || 'None', 98);
  const description = wrap(
    row.description.slice(0, 300) || 'No description provided.',
    98,
  );
  const titleHeight = 42 + 13 * (title.length - 1);
  const metaHeight = 38 + 11 * (branch.length - 1);
  const assigneeHeight = 21 + 11 * assignees.length;
  const descriptionHeight = 21 + 11 * description.length;
  return {
    row,
    title,
    branch,
    assignees,
    description,
    titleHeight,
    metaHeight,
    assigneeHeight,
    descriptionHeight,
    height: titleHeight + metaHeight + assigneeHeight + descriptionHeight + 26,
  };
}

function drawCard(
  commands: string[],
  card: ReturnType<typeof prepareCard>,
  number: number,
  top: number,
  incident = false,
) {
  const x = 42;
  const width = 528;
  const bottom = top - card.height;
  pdfFill(commands, x, bottom, width, card.height, [1, 1, 1]);
  commands.push(
    `${border.join(' ')} RG 0.8 w ${x} ${bottom} ${width} ${card.height} re S`,
  );

  pdfDrawText(
    commands,
    String(number).padStart(2, '0'),
    x + 14,
    top - 22,
    9,
    brand,
    true,
  );
  card.title.forEach((line, index) =>
    pdfDrawText(commands, line, x + 40, top - 22 - 13 * index, 11, ink, true),
  );
  const badgeColor: PdfColor =
    card.row.status === 'COMPLETED'
      ? [0.9, 0.97, 0.93]
      : card.row.status === 'STUCK' || card.row.status === 'CANCELLED'
        ? [1, 0.93, 0.94]
        : card.row.status === 'FOR_REVIEW'
          ? [1, 0.96, 0.87]
          : [0.92, 0.95, 0.99];
  pdfFill(commands, x + width - 110, top - 32, 94, 20, badgeColor);
  pdfDrawText(
    commands,
    reportStatus(card.row.status),
    x + width - 102,
    top - 25,
    8,
    ink,
    true,
  );

  const titleBottom = top - card.titleHeight;
  pdfLine(commands, x + 14, titleBottom, x + width - 14);
  pdfDrawText(commands, 'BRANCH', x + 14, titleBottom - 12, 7, muted, true);
  if (!incident)
    pdfDrawText(
      commands,
      'PRIORITY',
      x + 218,
      titleBottom - 12,
      7,
      muted,
      true,
    );
  pdfDrawText(
    commands,
    incident ? 'INCIDENT DATE' : 'START / DUE',
    x + 315,
    titleBottom - 12,
    7,
    muted,
    true,
  );
  card.branch.forEach((line, index) =>
    pdfDrawText(commands, line, x + 14, titleBottom - 27 - 11 * index, 9),
  );
  if (!incident)
    pdfDrawText(
      commands,
      reportPriority(card.row.priority),
      x + 218,
      titleBottom - 27,
      9,
    );
  pdfDrawText(
    commands,
    incident
      ? reportDate(card.row.startDate)
      : `${reportDate(card.row.startDate)} - ${reportDate(card.row.dueDate)}`,
    x + 315,
    titleBottom - 27,
    8,
  );

  const assigneeTop = titleBottom - card.metaHeight;
  pdfDrawText(
    commands,
    incident ? 'EMPLOYEE' : 'ASSIGNEES',
    x + 14,
    assigneeTop - 12,
    7,
    muted,
    true,
  );
  card.assignees.forEach((line, index) =>
    pdfDrawText(commands, line, x + 14, assigneeTop - 27 - 11 * index, 9),
  );

  const descriptionTop = assigneeTop - card.assigneeHeight;
  pdfDrawText(
    commands,
    incident ? 'WORKFLOW DETAILS' : 'DESCRIPTION',
    x + 14,
    descriptionTop - 12,
    7,
    muted,
    true,
  );
  card.description.forEach((line, index) =>
    pdfDrawText(commands, line, x + 14, descriptionTop - 27 - 11 * index, 9),
  );

  const footerTop = descriptionTop - card.descriptionHeight;
  pdfLine(commands, x + 14, footerTop - 4, x + width - 14);
  pdfDrawText(
    commands,
    `${incident ? 'Reference' : 'Task ID'}: ${card.row.id}`,
    x + 14,
    footerTop - 18,
    7,
    muted,
  );
  const created = new Date(card.row.createdAt);
  if (!incident)
    pdfDrawText(
      commands,
      `Created: ${reportDateTime(created)}`,
      x + 282,
      footerTop - 18,
      7,
      muted,
    );
}

export function taskPdf(
  rows: TaskExportRow[],
  generatedAt = new Date(),
  incident = false,
) {
  const pages: string[][] = [];
  const branchCount = new Set(rows.map((row) => row.branchName)).size;
  const generated = reportDateTime(generatedAt);
  const addPage = () => {
    const page: string[] = [];
    pdfFill(page, 0, 831, 612, 11, brand);
    pdfDrawText(
      page,
      incident
        ? 'MSPACES  /  CONFIDENTIAL HR RECORDS'
        : 'MSPACES  /  OPERATIONS',
      42,
      805,
      9,
      brand,
      true,
    );
    pdfDrawText(
      page,
      incident ? 'Incident report' : 'Task report',
      42,
      773,
      21,
      ink,
      true,
    );
    pdfDrawText(
      page,
      incident
        ? 'Exported from the incident list'
        : 'Exported from the task list',
      42,
      754,
      9,
      muted,
    );
    pdfLine(page, 42, 741, 570);
    pdfFill(page, 42, 685, 528, 44, [0.96, 0.97, 0.98]);
    pdfDrawText(
      page,
      incident ? 'TOTAL INCIDENTS' : 'TOTAL TASKS',
      56,
      713,
      7,
      muted,
      true,
    );
    pdfDrawText(page, String(rows.length), 56, 697, 12, ink, true);
    pdfDrawText(page, 'BRANCHES', 180, 713, 7, muted, true);
    pdfDrawText(page, String(branchCount), 180, 697, 12, ink, true);
    pdfDrawText(page, 'GENERATED', 300, 713, 7, muted, true);
    pdfDrawText(page, generated, 300, 697, 9, ink);
    pages.push(page);
    return page;
  };

  let page = addPage();
  let cursor = 668;
  if (!rows.length) {
    pdfFill(page, 42, 569, 528, 82, [0.98, 0.98, 0.99]);
    pdfDrawText(
      page,
      incident
        ? 'No incidents match the current filters.'
        : 'No tasks match the current filters.',
      58,
      609,
      11,
      ink,
      true,
    );
    pdfDrawText(
      page,
      'Adjust the list filters and export again.',
      58,
      590,
      9,
      muted,
    );
  }
  rows.forEach((row, index) => {
    const card = prepareCard(row);
    if (cursor - card.height < 66) {
      page = addPage();
      cursor = 668;
    }
    drawCard(page, card, index + 1, cursor, incident);
    cursor -= card.height + 10;
  });
  pages.forEach((commands, index) => {
    pdfLine(commands, 42, 50, 570);
    pdfDrawText(
      commands,
      'Mspaces Centralized Management System',
      42,
      34,
      8,
      muted,
    );
    pdfDrawText(
      commands,
      `Page ${index + 1} of ${pages.length}`,
      506,
      34,
      8,
      muted,
    );
  });

  const objects: Buffer[] = [];
  const addObject = (body: string) => {
    objects.push(Buffer.from(body, 'ascii'));
    return objects.length;
  };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );
  const boldFontId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  );
  const pageIds: number[] = [];
  for (const commands of pages) {
    const content = commands.join('\n');
    const contentBuffer = Buffer.from(content, 'ascii');
    const contentId = addObject(
      `<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`,
    );
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = Buffer.from(
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    'ascii',
  );
  objects[pagesId - 1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    'ascii',
  );

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%Mspaces\n', 'ascii')];
  const offsets = [0];
  let byteLength = chunks[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(byteLength);
    const object = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      objects[index],
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(object);
    byteLength += object.length;
  }
  const xrefOffset = byteLength;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('\n');
  chunks.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(chunks);
}
