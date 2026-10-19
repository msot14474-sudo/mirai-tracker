/** File reading is deterministic; AI only interprets unstructured calendar meaning. */
export type CalendarEntry = {
  title: string;
  start: string;
  end: string;
  kind: 'HOLIDAY' | 'EVENT' | 'EXTRA_WORKING_DAY' | 'CAMPUS_CLOSED' | 'EXAM';
  teachingAllowed: boolean;
  examType: 'SESSIONAL' | 'MID_TERM' | 'PUT' | 'END_TERM' | 'OTHER';
  deadline?: string;
  evidence: string;
  concern: string;
};
export type CalendarSheet = { name: string; rows: string[][] };
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const months = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
function dateValue(
  year: number,
  month: number,
  day: number,
): string | undefined {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : undefined;
}
/** Ambiguous numeric dates require an explicit column format or an unambiguous row in the same column. */
export function readCalendarDate(
  raw: string,
  years: number[],
  order?: 'DMY' | 'MDY',
) {
  const text = raw.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T00:00:00(?:\.000)?Z)?$/.exec(text);
  if (m) return dateValue(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[\s./-]+([a-z]+)(?:[\s,./-]+(\d{4}))?$/i.exec(text);
  if (m) {
    const month = months.indexOf(m[2]!.toLowerCase().slice(0, 3)) + 1;
    const year = m[3] ? +m[3] : years.length === 1 ? years[0] : undefined;
    return year && month ? dateValue(year, month, +m[1]!) : undefined;
  }
  m = /^([a-z]+)[\s.-]+(\d{1,2})(?:[\s,./-]+(\d{4}))?$/i.exec(text);
  if (m)
    return readCalendarDate(
      `${m[2]} ${m[1]}${m[3] ? ' ' + m[3] : ''}`,
      years,
      order,
    );
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (m) {
    const a = +m[1]!,
      b = +m[2]!,
      y = +m[3]!;
    if (a > 12 && b <= 12) return dateValue(y, b, a);
    if (b > 12 && a <= 12) return dateValue(y, a, b);
    if (a === b || order === 'DMY') return dateValue(y, b, a);
    if (order === 'MDY') return dateValue(y, a, b);
  }
  return undefined;
}
const aliases = {
  start: [
    'date',
    'startdate',
    'start',
    'from',
    'fromdate',
    'eventdate',
    'holidaydate',
    'examdate',
    'examstartdate',
  ],
  end: ['enddate', 'end', 'to', 'todate', 'examenddate'],
  title: [
    'title',
    'event',
    'eventname',
    'description',
    'activity',
    'occasion',
    'holiday',
    'name',
    'reason',
  ],
  kind: ['kind', 'type', 'category', 'cat', 'eventtype'],
  teaching: ['teachingallowed', 'teaching', 'workingday', 'isworkingday'],
  exam: ['examtype'],
  deadline: ['syllabusdeadline', 'deadline', 'syllabuscompletiondate'],
};
export function readCalendarSheets(
  sheets: CalendarSheet[],
  start: string,
  end: string,
) {
  const years = Array.from(new Set([+start.slice(0, 4), +end.slice(0, 4)]));
  const entries: CalendarEntry[] = [],
    warnings: string[] = [],
    sources: string[] = [];
  let needsAi = false;
  for (const sheet of sheets) {
    if (!sheet.rows.some((r) => r.some((v) => v.trim()))) continue;
    const headerIndex = sheet.rows.findIndex(
      (row) =>
        row.some((v) =>
          aliases.start.some(
            (a) => normalize(v).replace(/ddmmyyyy|mmddyyyy/g, '') === a,
          ),
        ) && row.some((v) => aliases.title.includes(normalize(v))),
    );
    sources.push(
      `Sheet: ${sheet.name}\n${sheet.rows.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n')}`,
    );
    if (headerIndex < 0) {
      needsAi = true;
      continue;
    }
    const header = sheet.rows[headerIndex]!;
    const col = (key: keyof typeof aliases) =>
      header.findIndex((v) =>
        aliases[key].includes(normalize(v).replace(/ddmmyyyy|mmddyyyy/g, '')),
      );
    const orderCache = new Map<number, 'DMY' | 'MDY' | undefined>();
    const orderFor = (index: number): 'DMY' | 'MDY' | undefined => {
      if (orderCache.has(index)) return orderCache.get(index);
      if (/dd.?mm/i.test(header[index] || '')) return 'DMY';
      if (/mm.?dd/i.test(header[index] || '')) return 'MDY';
      const orders = new Set<string>();
      for (const r of sheet.rows.slice(headerIndex + 1)) {
        const m = /^(\d{1,2})[./-](\d{1,2})[./-]\d{4}$/.exec(
          r[index]?.trim() || '',
        );
        if (m && +m[1]! > 12 && +m[2]! <= 12) orders.add('DMY');
        if (m && +m[2]! > 12 && +m[1]! <= 12) orders.add('MDY');
      }
      const order =
        orders.size === 1 ? ([...orders][0] as 'DMY' | 'MDY') : undefined;
      orderCache.set(index, order);
      return order;
    };
    for (let i = headerIndex + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!;
      if (!row.some((v) => v.trim())) continue;
      const get = (key: keyof typeof aliases) => row[col(key)]?.trim() || '';
      const evidence = `${sheet.name}, row ${i + 1}: ${JSON.stringify(row)}`;
      const from = readCalendarDate(
        get('start'),
        years,
        orderFor(col('start')),
      );
      const to = get('end')
        ? readCalendarDate(
            get('end'),
            years,
            orderFor(col('end')) || orderFor(col('start')),
          )
        : from;
      if (!from || !to || !get('title')) {
        warnings.push(
          `${evidence}: date or event could not be read unambiguously. Correct this row or add it in the preview.`,
        );
        continue;
      }
      const category = normalize(get('kind'));
      const text = `${get('kind')} ${get('title')}`;
      const kind: CalendarEntry['kind'] = /holiday/.test(category)
        ? 'HOLIDAY'
        : /closure|closed|break/.test(category)
          ? 'CAMPUS_CLOSED'
          : /extraworking|workingday/.test(category)
            ? 'EXTRA_WORKING_DAY'
            : /exam|sessional|mid.?term|end.?term|pre.?university|\bPUT\b/i.test(
                  text,
                )
              ? 'EXAM'
              : /holiday/i.test(text)
                ? 'HOLIDAY'
                : 'EVENT';
      const examText = `${get('exam')} ${get('title')}`;
      const examType: CalendarEntry['examType'] = /end.?term/i.test(examText)
        ? 'END_TERM'
        : /mid.?term/i.test(examText)
          ? 'MID_TERM'
          : /pre.?university|\bPUT\b/i.test(examText)
            ? 'PUT'
            : /sessional/i.test(examText)
              ? 'SESSIONAL'
              : 'OTHER';
      const teaching = get('teaching');
      const explicitTeaching = /^(true|yes|y|1)$/i.test(teaching)
        ? true
        : /^(false|no|n|0)$/i.test(teaching)
          ? false
          : undefined;
      const concerns: string[] = [];
      if (kind === 'EVENT' && explicitTeaching === undefined)
        concerns.push(
          'Check whether regular teaching is allowed during this event.',
        );
      if (teaching && explicitTeaching === undefined)
        concerns.push(`Unrecognised teaching value: ${teaching}.`);
      if ((kind === 'HOLIDAY' || kind === 'CAMPUS_CLOSED') && explicitTeaching)
        concerns.push(
          'File marks this holiday/closure as teaching; resolve before saving.',
        );
      if (/tentative/i.test(text)) concerns.push('Tentative date in source.');
      const deadline = get('deadline')
        ? readCalendarDate(
            get('deadline'),
            years,
            orderFor(col('deadline')) || orderFor(col('start')),
          )
        : undefined;
      if (get('deadline') && !deadline)
        concerns.push(
          `Syllabus deadline could not be read: ${get('deadline')}.`,
        );
      entries.push({
        title: get('title'),
        start: from,
        end: to,
        kind,
        examType,
        teachingAllowed: explicitTeaching ?? kind === 'EXTRA_WORKING_DAY',
        ...(deadline ? { deadline } : {}),
        evidence: evidence.slice(0, 4000),
        concern: concerns.join(' '),
      });
    }
  }
  return {
    entries: mergeCalendarEntries(entries),
    warnings,
    source: sources.join('\n\n'),
    needsAi,
  };
}

export type PdfTextItem = { str: string; transform: number[] };
/** Keep left/right cells on their original row, rather than interleaving PDF token order. */
export function calendarPdfText(items: PdfTextItem[], page: number) {
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of [...items]
    .filter((i) => i.str.trim())
    .sort((a, b) => b.transform[5]! - a.transform[5]!)) {
    const y = item.transform[5] || 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) < 0.8) last.items.push(item);
    else lines.push({ y, items: [item] });
  }
  return (
    `Page ${page}\n` +
    lines
      .map((line, i) => {
        const cells = line.items
          .sort((a, b) => a.transform[4]! - b.transform[4]!)
          .map((v) => v.str.trim());
        // Bare day-number grids and weekday headings carry no explicit date/event relationship.
        if (cells.every((v) => /^(\d{1,2}|Su|Mo|Tu|We|Th|Fr|Sa)$/i.test(v)))
          return '';
        return `Line ${i + 1}: ${cells.join(' | ')}`;
      })
      .filter(Boolean)
      .join('\n')
  );
}
/** Bound output as well as input: a short calendar can contain many dated events. */
export function calendarChunks(source: string) {
  const lines = source.split('\n').filter((l) => l.trim());
  const chunks: string[] = [];
  let current: string[] = [],
    size = 0,
    context = '';
  let page = '',
    sheet = '',
    heading = '',
    tableHeader = '',
    document = '';
  const flush = () => {
    if (current.length) chunks.push(context + current.join('\n'));
    current = [];
    size = 0;
  };
  for (const line of lines) {
    if (current.length && (size + line.length > 4500 || current.length >= 8))
      flush();
    if (!current.length)
      context =
        [document, page, sheet, heading, tableHeader]
          .filter(Boolean)
          .join('\n') + '\n';
    if (/^Page \d+/.test(line)) {
      page = line;
      heading = '';
      tableHeader = '';
    }
    if (/^Sheet:/.test(line)) {
      sheet = line;
      tableHeader = '';
    }
    if (/SESSION\s*:/i.test(line)) document = line;
    if (
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i.test(
        line,
      )
    )
      heading = line;
    if (
      /Date.*(?:Event|Title)|Start date.*Title/i.test(line) &&
      !/20\d{2}-\d{2}/.test(line)
    )
      tableHeader = line;
    current.push(line);
    size += line.length;
  }
  flush();
  return chunks;
}
/** Consecutive exam rows form one exam window; gaps and conflicting entries remain visible. */
export function mergeCalendarEntries(entries: CalendarEntry[]) {
  const result: CalendarEntry[] = [];
  for (const entry of [...entries].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    const previous = result.find(
      (p) =>
        p.title.toLowerCase() === entry.title.toLowerCase() &&
        p.kind === entry.kind &&
        p.examType === entry.examType &&
        p.teachingAllowed === entry.teachingAllowed &&
        p.deadline === entry.deadline &&
        (p.end === entry.start ||
          (['EXAM', 'CAMPUS_CLOSED'].includes(p.kind) &&
            Date.parse(entry.start) === Date.parse(p.end) + 86400000)),
    );
    if (previous) {
      previous.end = previous.end > entry.end ? previous.end : entry.end;
      previous.evidence = [previous.evidence, entry.evidence]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);
      previous.concern = [
        ...new Set([previous.concern, entry.concern].filter(Boolean)),
      ]
        .join(' ')
        .slice(0, 2000);
    } else result.push({ ...entry });
  }
  return result;
}
