import { useEffect, useId, useRef, useState } from 'react';
import type { Card } from '../core/model.ts';
import type { SrsState } from '../core/srs.ts';
import { mastery } from '../core/srs.ts';

const CLASSDEF = {
  light: [
    'classDef m_new fill:#fffdf8,stroke:#b9b2a3,color:#3b372f',
    'classDef m_learning fill:#fbe7cf,stroke:#c77d2e,color:#3b2a14',
    'classDef m_young fill:#d9ecf7,stroke:#3d7fae,color:#13324a',
    'classDef m_mature fill:#d3eedf,stroke:#2f7d5b,color:#103c28',
  ],
  dark: [
    'classDef m_new fill:#26241f,stroke:#6d675b,color:#e9e4d8',
    'classDef m_learning fill:#4a3417,stroke:#d99a4e,color:#fbe7cf',
    'classDef m_young fill:#173246,stroke:#5aa0d0,color:#d9ecf7',
    'classDef m_mature fill:#163a2a,stroke:#4fb487,color:#d3eedf',
  ],
};

function isDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** 원본 mermaid에 숙련도 색을 입혀 렌더. 노드 클릭 시 onPick(num) */
export function Mermaid({
  code,
  cards,
  srs,
  onPick,
}: {
  code: string;
  cards: Card[];
  srs: Map<string, SrsState>;
  onPick?: (card: Card) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const rid = useId().replace(/[^\w]/g, '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: mermaid } = await import('mermaid');
      const dark = isDark();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'neutral',
        fontFamily: 'inherit',
        flowchart: { htmlLabels: false },
      });
      const byNode = new Map<string, Card>();
      const groups: Record<string, string[]> = { m_new: [], m_learning: [], m_young: [], m_mature: [] };
      for (const c of cards) {
        const node = c.num.replace(/[^\w]/g, '');
        if (!node || !new RegExp(`\\b${node}\\b`).test(code)) continue;
        byNode.set(node, c);
        groups[`m_${mastery(srs.get(c.id))}`].push(node);
      }
      const extra = [
        ...(dark ? CLASSDEF.dark : CLASSDEF.light),
        ...Object.entries(groups)
          .filter(([, ns]) => ns.length)
          .map(([cls, ns]) => `class ${ns.join(',')} ${cls}`),
      ];
      try {
        const { svg } = await mermaid.render(`mmd${rid}${Date.now()}`, `${code}\n${extra.join('\n')}`);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        setErr('');
        // 가로로 긴 체인은 축소하면 글자가 안 보이므로 원래 크기의 80%로 두고 가로 스크롤
        const el = ref.current.querySelector('svg');
        const vbW = el?.viewBox.baseVal?.width;
        if (el && vbW) {
          el.style.maxWidth = 'none';
          el.style.width = `${Math.round(vbW * 0.8)}px`;
          el.removeAttribute('height');
        }
        if (onPick) {
          ref.current.querySelectorAll<SVGGElement>('g.node').forEach((g) => {
            const m = g.id.match(/flowchart-([^-]+)-/);
            const card = m && byNode.get(m[1]);
            if (!card) return;
            g.style.cursor = 'pointer';
            g.addEventListener('click', () => onPick(card));
          });
        }
      } catch (e) {
        if (!cancelled) setErr(String((e as Error).message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, cards, srs, onPick, rid]);

  return (
    <div className="mermaid-wrap">
      <div ref={ref} className="mermaid-svg" />
      {err && <pre className="muted small">mermaid 렌더 실패: {err}</pre>}
      <div className="legend">
        <span className="dot m_new" />새 카드 <span className="dot m_learning" />학습 중 <span className="dot m_young" />익히는 중{' '}
        <span className="dot m_mature" />숙련
      </div>
    </div>
  );
}
