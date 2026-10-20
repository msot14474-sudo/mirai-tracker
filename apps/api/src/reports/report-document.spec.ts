import {
  ReportDocumentService,
  reportRecommendations,
  renderReportDocument,
} from './report-document.service';
import { reportQuerySchema } from './reports.schemas';
const data: any = {
  generatedAt: '2026-10-20T12:00:00Z',
  facultyOnly: true,
  subjects: [
    {
      id: 'web-a',
      subject: { name: 'Web <script>alert(1)</script>', code: 'WEB' },
      campus: { name: 'Own campus' },
      semester: { name: 'Autumn' },
      batch: { name: 'A' },
      track: { name: 'Mirai' },
      teachers: [{ name: 'Teacher' }],
      status: 'NEEDS_DATA',
      reason: 'Lesson plan needed',
      metrics: null,
      deadline: '2026-12-31',
      nextTopic: null,
      unlogged: 3,
      reviewChanges: 0,
    },
  ],
  summary: {
    subjects: 1,
    assessed: 0,
    needsData: 1,
    atRisk: 0,
    metrics: null,
    unlogged: 3,
    logged: 0,
    upcoming: 20,
  },
  exams: [],
  faculty: [],
  delivery: [],
  groups: [{ name: 'Private aggregate' }],
};
it('renders escaped readable text, unknown metrics and charts without exposing campus aggregates to faculty', () => {
  const html = renderReportDocument(
    data,
    {
      sections: [{ title: '## Findings', paragraphs: ['**Check** the plan.'] }],
    },
    'ai',
    reportQuerySchema.parse({}),
    'Teacher',
  );
  expect(html).toContain('Recorded syllabus coverage');
  expect(html).toContain('Not available');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Private aggregate');
  expect(html).not.toContain('## Findings');
  expect(html).not.toContain('**Check**');
});
it('uses AI only to prioritize verified recommendations, preserving all candidates and unknown coverage', async () => {
  const service = new ReportDocumentService(
    { read: jest.fn().mockResolvedValue(data) } as any,
    {
      configuration: () => ({ ready: true }),
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          priorities: ['web-a:logs'],
          sections: [
            {
              title: 'Invented finding',
              paragraphs: ['No teaching happened.'],
            },
          ],
        }),
      }),
    } as any,
  );
  const result = await service.generate(
    { name: 'Teacher' } as any,
    reportQuerySchema.parse({}),
  );
  const html = result.content.toString();
  expect(html).toContain('AI prioritized');
  expect(html).toContain('3 scheduled classes await logs');
  expect(html).toContain('Complete planning data');
  expect(html).toContain('Not available');
  expect(html).not.toContain('No teaching happened');
  expect(html).not.toContain('Invented finding');
  expect(html.indexOf('Confirm teaching records')).toBeLessThan(
    html.indexOf('Complete planning data'),
  );
});
it.each([['invented'], ['web-a:logs', 'web-a:logs']])(
  'rejects unknown or duplicate AI priorities: %j',
  async (...priorities) => {
    const service = new ReportDocumentService(
      { read: jest.fn().mockResolvedValue(data) } as any,
      {
        configuration: () => ({ ready: true }),
        generate: jest
          .fn()
          .mockResolvedValue({ text: JSON.stringify({ priorities }) }),
      } as any,
    );
    const result = await service.generate(
      { name: 'Teacher' } as any,
      reportQuerySchema.parse({}),
    );
    expect(result.content.toString()).toContain('AI analysis was unavailable');
  },
);
it('computes capacity recommendations from recorded hours without inventing unknown values', () => {
  const snapshot = {
    ...data,
    subjects: [
      data.subjects[0],
      {
        ...data.subjects[0],
        id: 'math-a',
        status: 'DANGER',
        metrics: { remainingHours: 18, availableHours: 13 },
      },
    ],
  };
  const recommendations = reportRecommendations(snapshot as any);
  expect(recommendations.some((r) => r.id === 'web-a:capacity')).toBe(false);
  expect(
    recommendations.find((r) => r.id === 'math-a:capacity')?.paragraphs[0],
  ).toContain('5-hour gap');
});
it('labels unavailable AI honestly and uses authorization before invoking AI', async () => {
  const read = jest.fn().mockResolvedValue(data),
    generate = jest.fn().mockRejectedValue(new Error('Provider unavailable'));
  const service = new ReportDocumentService(
    { read } as any,
    { configuration: () => ({ ready: true }), generate } as any,
  );
  const user: any = { name: 'Teacher' };
  const filters = reportQuerySchema.parse({});
  const result = await service.generate(user, filters);
  expect(read).toHaveBeenCalledWith(user, filters);
  expect(result.content.toString()).toContain('AI analysis was unavailable');
  read.mockRejectedValue(new Error('Forbidden'));
  generate.mockClear();
  await expect(service.generate(user, filters)).rejects.toThrow('Forbidden');
  expect(generate).not.toHaveBeenCalled();
});
