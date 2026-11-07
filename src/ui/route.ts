import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function href(path: (string | undefined)[], query?: Record<string, string | undefined>): string {
  const p = path.filter((x): x is string => !!x).map(encodeURIComponent).join('/');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) q.set(k, v);
  const qs = q.toString();
  return `#/${p}${qs ? `?${qs}` : ''}`;
}

export const go = (h: string) => {
  location.hash = h;
};
