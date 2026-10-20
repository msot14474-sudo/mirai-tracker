import { weeklyEmailContent } from './weekly-email-format';
it('renders summary headings, emphasis and every table value without raw Markdown or executing source HTML', () => {
  const result = weeklyEmailContent(
    'Weekly review',
    '### Coverage\n**Web** has recorded progress.\n\n| Subject | Logs | Notes |\n|---|---|---|\n| Web | 0 | Not verified |\n| DSA | 2 | <script>bad()</script> |',
    'https://mirai-tracker.vercel.app',
  );
  expect(result.html).toContain('<h2');
  expect(result.html).toContain('<strong>Web</strong>');
  expect(result.html).toContain('Not verified');
  expect(result.html).toContain('&lt;script&gt;');
  expect(result.html).not.toContain('<script>');
  expect(result.html).not.toContain('###');
  expect(result.html).not.toContain('|---');
  expect(result.text).toContain('Subject: DSA');
  expect(result.text).toContain('Logs: 2');
  expect(result.text).not.toContain('**');
  expect(result.text).not.toContain('###');
});
