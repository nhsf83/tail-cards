import { Fragment, type ReactNode } from 'react';

// 카드 필드용 최소 마크다운: `code`, **bold**, [[wiki|alias]], $math$, 줄바꿈.
// HTML은 해석하지 않는다 (모든 텍스트는 React 텍스트 노드).

const TOKEN = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\[\[[^\]]+\]\])|(\$[^$\n]+\$)|(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])/g;

export function wikiLabel(inner: string): string {
  const [target, alias] = inner.split('|');
  if (alias) return alias.trim();
  const [file, heading] = target.split('#');
  const name = (file.split('/').pop() ?? file).trim();
  const h = heading?.replace(/^\^/, '').trim();
  if (!name) return h ?? target;
  return h ? `${name} § ${h}` : name;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(m[2].slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const label = wikiLabel(m[3].slice(2, -2));
      out.push(
        <span key={k} className="wiki" title={m[3].slice(2, -2)}>
          {label}
        </span>,
      );
    } else if (m[4]) out.push(<span key={k} className="math">{m[4].slice(1, -1)}</span>);
    else if (m[5]) out.push(<em key={k}>{inline(m[5], k)}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Inline({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((l, i) => {
        const trimmed = l.trim();
        const isSource = trimmed.startsWith('→');
        return (
          <Fragment key={i}>
            {i > 0 && !isSource && <br />}
            {isSource ? (
              <span className={`src-line${trimmed.includes('📌') ? ' pinned' : ''}`}>{inline(trimmed, `l${i}`)}</span>
            ) : (
              inline(l, `l${i}`)
            )}
          </Fragment>
        );
      })}
    </>
  );
}
