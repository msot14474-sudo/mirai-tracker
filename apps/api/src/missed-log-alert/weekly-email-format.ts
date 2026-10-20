const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const inline = (s: string) =>
  escape(s)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<span style="font-family:monospace">$1</span>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '');
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replaceAll('\\|', '|'));
/** Render only supported Markdown constructs. Source HTML is always escaped. */
export function weeklyEmailContent(
  title: string,
  source: string,
  origin: string,
) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const html: string[] = [],
    text: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (
      line.includes('|') &&
      lines[i + 1]?.includes('|') &&
      /^[\s|:\-]+$/.test(lines[i + 1]!)
    ) {
      const headings = cells(line);
      i += 2;
      while (i < lines.length && lines[i]!.includes('|')) {
        const values = cells(lines[i]!);
        html.push(
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #dce5f2;border-radius:10px;border-collapse:collapse;background:#f8faff">' +
            values
              .map(
                (v, n) =>
                  `<tr><td style="padding:10px 14px;border-bottom:1px solid #e5ebf4;width:34%;vertical-align:top;color:#63748d;font-size:13px">${inline(headings[n] ?? 'Detail')}</td><td style="padding:10px 14px;border-bottom:1px solid #e5ebf4;font-size:14px;overflow-wrap:anywhere">${inline(v)}</td></tr>`,
              )
              .join('') +
            '</table>',
        );
        text.push(
          values
            .map((v, n) => `${plain(headings[n] ?? 'Detail')}: ${plain(v)}`)
            .join('\n'),
        );
        i++;
      }
      i--;
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading)
      html.push(
        `<h2 style="font-size:18px;line-height:1.4;color:#1d355d;margin:26px 0 12px">${inline(heading[1]!)}</h2>`,
      );
    else if (/^[-*+]\s+|^\d+\.\s+/.test(line))
      html.push(
        `<p style="margin:8px 0 8px 12px;line-height:1.7;font-size:14px">• ${inline(line.replace(/^[-*+]\s+|^\d+\.\s+/, ''))}</p>`,
      );
    else
      html.push(
        `<p style="margin:12px 0;line-height:1.7;font-size:14px">${inline(line)}</p>`,
      );
    text.push(plain(line));
  }
  let url = 'https://mirai-tracker.vercel.app';
  try {
    const parsed = new URL(origin);
    if (['https:', 'http:'].includes(parsed.protocol)) url = parsed.origin;
  } catch {
    /* Use the application origin fallback. */
  }
  return {
    text: `${plain(title)}\n\n${text.join('\n\n')}\n\nOpen Mirai Tracker → AI insights → Weekly summaries\n${url}`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f7fb;color:#263b59;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:680px;background:#fff;border:1px solid #e1e8f2;border-radius:14px"><tr><td style="padding:26px"><p style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#5375ab">MIRAI TRACKER</p><h1 style="font-size:23px;line-height:1.4;margin:12px 0 20px">${escape(title)}</h1><p style="padding:14px;background:#eef4ff;border-radius:8px;font-size:13px;line-height:1.6">Based on saved records. Missing lecture logs mean teaching is unverified; they do not prove that a class or progress was missed.</p>${html.join('')}<p style="margin-top:28px"><a href="${escape(url)}" style="display:inline-block;background:#2858c7;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:14px">Open Mirai Tracker</a></p><p style="color:#63748d;font-size:12px">This summary is also available in AI insights → Weekly summaries.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
