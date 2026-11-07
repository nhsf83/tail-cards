// CS_Tutor knowledge_base/tail_interview/<subject>/*.md → public/decks/<subject>.json
// 사용: node scripts/import-cs-tutor.ts [tail_interview 폴더 경로]
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDeck } from '../src/core/parse-card-md.ts';

const SUBJECT_TITLES: Record<string, string> = {
  data_structure: '자료구조 (Data Structures & Algorithms in Python)',
};

const src =
  process.argv[2] ?? process.env.CS_TUTOR_TAIL ?? 'G:/내 드라이브/Agent_GeonJae/CS_Tutor/knowledge_base/tail_interview';
if (!existsSync(src)) {
  console.error(`tail_interview 폴더를 찾을 수 없습니다: ${src}`);
  process.exit(1);
}

const outDir = join(import.meta.dirname, '..', 'public', 'decks');
mkdirSync(outDir, { recursive: true });
const index: { id: string; title: string; file: string; cards: number }[] = [];

for (const subject of readdirSync(src)) {
  const dir = join(src, subject);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((fileName) => ({ fileName, md: readFileSync(join(dir, fileName), 'utf8') }));
  if (!files.length) continue;
  const bundle = buildDeck(files, {
    id: `cs-tutor-${subject}`,
    title: SUBJECT_TITLES[subject] ?? subject,
    subject,
    description: 'CS-Tutor card-interview로 만든 기본 꼬리질문 카드 덱',
    builtIn: true,
    createdAt: 0,
  });
  const file = `${subject}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(bundle));
  index.push({ id: bundle.deck.id, title: bundle.deck.title, file, cards: bundle.cards.length });
  console.log(`${subject}: 챕터 ${bundle.chapters.length}개, 카드 ${bundle.cards.length}장 → public/decks/${file}`);
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
