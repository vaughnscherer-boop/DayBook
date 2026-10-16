/**
 * Automatic groups: items about the same thing (a class, a sport, a project) inside one calendar
 * get grouped, and so colored alike, without the person setting anything up.
 *
 * Rules, in order:
 *  1. A course code ("BIO 101", "cs101", "MATH 2B") joins, or creates, that course's group.
 *  2. A title containing a group's keyword joins it ("bio" and "biology" join "BIO 101").
 *  3. Two or more differently-titled ungrouped items starting with the same word ("Soccer practice",
 *     "Soccer game") create a group named after it.
 * Items the person placed by hand (`locked`) are never moved.
 *
 * Pure functions only — the database side lives in `src/db/groups.ts`.
 */

export type GroupingGroup = { id: string; calendarId: string; keywords: string[]; source: 'auto' | 'user' | 'import' };
export type GroupingItem = {
  key: string; // `${kind}:${id}`
  title: string;
  calendarId: string | null;
  groupId: string | null;
  locked: boolean;
};
export type NewGroup = { tempId: string; calendarId: string; name: string; keywords: string[] };
export type GroupingPlan = {
  newGroups: NewGroup[];
  /** Items whose group changes (temp ids refer to `newGroups`). */
  moves: { key: string; groupId: string | null }[];
  /** Existing groups that picked up a keyword (a course's subject, e.g. "bio"). */
  keywordUpdates: { id: string; keywords: string[] }[];
  /** Auto-made groups left with no items. */
  emptyGroupIds: string[];
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun'];

// Letters + numbers that look like a course code but aren't ("Room 204", "Oct 12", "Ch 3").
const NOT_A_SUBJECT = new Set([
  ...MONTHS,
  ...WEEKDAYS,
  'room', 'rm', 'apt', 'unit', 'suite', 'ste', 'bldg', 'hall', 'gate', 'flight', 'fl', 'bus', 'route', 'rt',
  'hwy', 'hw', 'ch', 'pg', 'pp', 'page', 'week', 'wk', 'day', 'no', 'num', 'ext', 'at', 'by', 'on', 'in',
  'the', 'and', 'for', 'to', 'top', 'lab', 'quiz', 'exam', 'test', 'set', 'pset', 'ps', 'part', 'step',
  'level', 'lvl', 'year', 'yr', 'pm', 'am', 'rd', 'st', 'ave', 'blvd', 'ln', 'dr', 'ct', 'hwk', 'act',
]);

// Generic words that shouldn't name a group on their own ("Call mom", "Buy milk", "Lab report").
const GENERIC = new Set([
  ...MONTHS,
  ...WEEKDAYS,
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow', 'tonight',
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'my', 'our', 'your', 'new', 'next', 'last', 'first',
  'call', 'text', 'email', 'meet', 'meeting', 'buy', 'get', 'pick', 'drop', 'pay', 'make', 'do', 'go', 'see',
  'read', 'write', 'finish', 'start', 'send', 'check', 'review', 'study', 'prep', 'prepare', 'submit', 'turn',
  'book', 'order', 'clean', 'fix', 'work', 'homework', 'assignment', 'project', 'quiz', 'exam', 'test',
  'midterm', 'final', 'lab', 'lecture', 'class', 'due', 'practice', 'game', 'lunch', 'dinner', 'breakfast',
  'coffee', 'appointment', 'appt', 'reminder', 'todo', 'task', 'event', 'notes', 'report', 'paper', 'essay',
  'reading', 'chapter', 'problem', 'problems', 'office', 'hours',
]);

/** Lowercase words, with letters and digits split apart ("BIO101" -> "bio", "101"). */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z]{2,})/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A course code in the text, e.g. { name: 'BIO 101', keyword: 'bio 101', subject: 'bio' }. */
export function courseCode(text: string): { name: string; keyword: string; subject: string } | null {
  const pattern = /\b([A-Za-z]{2,4})[\s-]?(\d{3,4}[A-Za-z]?|\d{1,2}[A-Za-z])\b/g;
  for (const match of text.matchAll(pattern)) {
    const subject = match[1].toLowerCase();
    if (NOT_A_SUBJECT.has(subject)) continue;
    const number = match[2].toUpperCase();
    // "2026" after a word is a year, not a course ("Trip 2026").
    if (/^(19|20)\d\d$/.test(number)) continue;
    return { name: `${subject.toUpperCase()} ${number}`, keyword: `${subject} ${number.toLowerCase()}`, subject };
  }
  return null;
}

/**
 * Whether two class names look like the same course written two ways: the same number, with one
 * subject the start of the other ("LAT 111" and "Latin 111", "BIO 101" and "Biology 101").
 */
export function sameCourse(a: string, b: string): boolean {
  const parse = (text: string) => {
    const match = text.match(/\b([A-Za-z]{2,})[\s-]?(\d{3,4}[A-Za-z]?)\b/);
    return match ? { subject: match[1].toLowerCase(), number: match[2].toLowerCase() } : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y || x.number !== y.number) return false;
  return x.subject.startsWith(y.subject) || y.subject.startsWith(x.subject);
}

/**
 * How strongly `title` matches a keyword: its length in letters, or 0. One-word keywords also match
 * longer words they begin ("bio" matches "biology"); longer phrases must appear as written.
 */
export function keywordScore(titleTokens: string[], keyword: string): number {
  const words = tokens(keyword);
  if (words.length === 0) return 0;
  if (words.length === 1) {
    const [word] = words;
    const hit = titleTokens.some((t) => t === word || (word.length >= 3 && t.startsWith(word)));
    return hit ? word.length : 0;
  }
  for (let i = 0; i + words.length <= titleTokens.length; i++) {
    if (words.every((word, j) => titleTokens[i + j] === word)) return words.join('').length + words.length;
  }
  return 0;
}

/** The group in `groups` whose keywords best match `title`, if any. */
export function bestGroup(title: string, groups: GroupingGroup[]): GroupingGroup | null {
  const titleTokens = tokens(title);
  let best: GroupingGroup | null = null;
  let bestScore = 0;
  for (const group of groups) {
    for (const keyword of group.keywords) {
      const score = keywordScore(titleTokens, keyword);
      if (score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
  }
  return best;
}

/** The first word of a title that could name a group ("Soccer practice" -> "soccer"), if any. */
export function leadingWord(title: string): string | null {
  for (const token of tokens(title)) {
    if (GENERIC.has(token)) continue;
    return /^[a-z]{3,}$/.test(token) ? token : null;
  }
  return null;
}

const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);

/**
 * Works out which group every unlocked item belongs in, which new groups that needs, and which
 * auto-made groups ended up empty. Doesn't change anything itself.
 */
export function planGrouping(groups: GroupingGroup[], items: GroupingItem[]): GroupingPlan {
  const newGroups: NewGroup[] = [];
  const moves: GroupingPlan['moves'] = [];
  const target = new Map<string, string | null>(); // item key -> group id (or temp id)
  // Work on copies so keywords picked up along the way can be reported, not mutated in place.
  const working = groups.map((group) => ({ ...group, keywords: [...group.keywords] }));

  const calendarIds = [...new Set(items.map((item) => item.calendarId).filter((id): id is string => !!id))];
  for (const calendarId of calendarIds) {
    const calendarItems = items.filter((item) => item.calendarId === calendarId);
    const known: GroupingGroup[] = working.filter((group) => group.calendarId === calendarId);
    // Automatic groups must earn their place again on every pass (a course code still in use, or a
    // shared word); otherwise their own keywords would keep them alive forever. Yours always count.
    const justified = new Set<string>();
    const addGroup = (name: string, keywords: string[]) => {
      const group: GroupingGroup = { id: `new:${calendarId}:${newGroups.length}`, calendarId, keywords, source: 'auto' };
      newGroups.push({ tempId: group.id, calendarId, name, keywords });
      known.push(group);
      return group;
    };

    // 1. Course codes. A course's subject ("bio") becomes a keyword too, unless two courses share it.
    for (const item of calendarItems) {
      if (item.locked) continue;
      const code = courseCode(item.title);
      if (!code) continue;
      const existing = known.find((group) => group.keywords.includes(code.keyword));
      const group = existing ?? addGroup(code.name, [code.keyword]);
      justified.add(group.id);
      target.set(item.key, group.id);
    }
    const subjects = new Map<string, GroupingGroup[]>();
    for (const group of known) {
      for (const keyword of group.keywords) {
        const code = courseCode(keyword);
        if (code) subjects.set(code.subject, [...(subjects.get(code.subject) ?? []), group]);
      }
    }
    for (const [subject, sharing] of subjects) {
      const [only] = sharing;
      if (sharing.length === 1 && only.keywords.every((k) => k !== subject)) only.keywords.push(subject);
    }

    // 2. Keywords of your groups and of courses still in use.
    const matchable = known.filter((group) => group.source !== 'auto' || justified.has(group.id));
    for (const item of calendarItems) {
      if (item.locked || target.has(item.key)) continue;
      const group = bestGroup(item.title, matchable);
      if (group) target.set(item.key, group.id);
    }

    // 3. A word shared by the start of two or more still-ungrouped items.
    const byWord = new Map<string, GroupingItem[]>();
    for (const item of calendarItems) {
      if (item.locked || target.has(item.key)) continue;
      const word = leadingWord(item.title);
      if (word) byWord.set(word, [...(byWord.get(word) ?? []), item]);
    }
    for (const [word, sharing] of byWord) {
      // Copies of one item ("Dentist", "Dentist") aren't a group; different things sharing a word are.
      if (new Set(sharing.map((item) => tokens(item.title).join(' '))).size < 2) continue;
      const existing = known.find((group) => group.source === 'auto' && group.keywords.includes(word));
      const group = existing ?? addGroup(capitalize(word), [word]);
      for (const item of sharing) target.set(item.key, group.id);
    }
  }

  for (const item of items) {
    if (item.locked) continue;
    const next = target.get(item.key) ?? null;
    if (next !== item.groupId) moves.push({ key: item.key, groupId: next });
  }

  // Auto-made groups nobody is in any more go away; ones you renamed or imported stay.
  const used = new Set(items.map((item) => (item.locked ? item.groupId : (target.get(item.key) ?? null))));
  const emptyGroupIds = groups.filter((group) => group.source === 'auto' && !used.has(group.id)).map((g) => g.id);

  const keywordUpdates = working
    .filter((group, i) => group.keywords.length !== groups[i].keywords.length)
    .map((group) => ({ id: group.id, keywords: group.keywords }));

  return { newGroups, moves, keywordUpdates, emptyGroupIds };
}
