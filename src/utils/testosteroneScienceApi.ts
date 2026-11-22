export interface WikiSummaryEntry {
  topic: 'testosterone' | 'tribulus';
  title: string;
  extract: string;
  url: string;
}

export interface PubMedArticleEntry {
  pmid: string;
  title: string;
  year: string;
  journal: string;
  url: string;
}

export interface TestosteroneSciencePayload {
  fetchedAt: number;
  isOfflineFallback: boolean;
  wikipedia: WikiSummaryEntry[];
  pubmedArticles: PubMedArticleEntry[];
}

export const WIKI_TESTOSTERONE_URL =
  'https://bg.wikipedia.org/api/rest_v1/page/summary/%D0%A2%D0%B5%D1%81%D1%82%D0%BE%D1%81%D1%82%D0%B5%D1%80%D0%BE%D0%BD';
export const WIKI_TRIBULUS_URL =
  'https://bg.wikipedia.org/api/rest_v1/page/summary/%D0%91%D0%B0%D0%B1%D0%B8%D0%BD%D0%B8_%D0%B7%D1%8A%D0%B1%D0%B8';
export const PUBMED_ESEARCH_URL =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=testosterone+sleep+resistance+training&retmode=json&retmax=4';

export function buildPubMedSummaryUrl(ids: string[]): string {
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(ids.join(','))}&retmode=json`;
}

export const SCIENCE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SCIENCE_TIMEOUT_MS = 4000; // 4 seconds

const SCIENCE_STORAGE_KEY = 'fizioprogres_testosterone_science_v1';

export const OFFLINE_FALLBACK_SCIENCE_DATA: TestosteroneSciencePayload = {
  fetchedAt: 0,
  isOfflineFallback: true,
  wikipedia: [
    {
      topic: 'testosterone',
      title: 'Тестостерон (офлайн резюме)',
      extract:
        'Тестостеронът е основният мъжки полов и анаболен стероиден хормон, синтезиран главно в клетките на Лайдиг. Регулира мускулната маса, костната плътност, еритропоезата, либидото и възстановяването след силови тренировки. Най-високите естествени нива се поддържат чрез качествен сън (7.5–8.5 ч), силови тренировки и нисък хроничен стрес.',
      url: 'https://bg.wikipedia.org/wiki/%D0%A2%D0%B5%D1%81%D1%82%D0%BE%D1%81%D1%82%D0%B5%D1%80%D0%BE%D0%BD',
    },
    {
      topic: 'tribulus',
      title: 'Бабини зъби — Tribulus terrestris (офлайн резюме)',
      extract:
        'Бабини зъби (Tribulus terrestris) е едногодишно тревисто растение, богато на стероидни сапонини (протодиосцин). Клиничните данни показват подкрепа за либидото, кръвообращението и субективния тонус, като при здрави млади мъже ефектът върху серумния тестостерон е по-скромен в сравнение със съня и базовите силови тренировки.',
      url: 'https://bg.wikipedia.org/wiki/%D0%91%D0%B0%D0%B1%D0%B8%D0%BD%D0%B8_%D0%B7%D1%8A%D0%B1%D0%B8',
    },
  ],
  pubmedArticles: [
    {
      pmid: '21632481',
      title: 'Effect of 1 week of sleep restriction on testosterone levels in young healthy men',
      year: '2011',
      journal: 'JAMA',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21632481/',
    },
    {
      pmid: '15831061',
      title: 'Hormonal responses and adaptations to resistance exercise and training',
      year: '2005',
      journal: 'Sports Medicine',
      url: 'https://pubmed.ncbi.nlm.nih.gov/15831061/',
    },
    {
      pmid: '15994038',
      title: 'The aphrodisiac herb Tribulus terrestris does not influence the androgen production in young men',
      year: '2005',
      journal: 'Journal of Ethnopharmacology',
      url: 'https://pubmed.ncbi.nlm.nih.gov/15994038/',
    },
    {
      pmid: '21154195',
      title: 'Effect of vitamin D supplementation on testosterone levels in men',
      year: '2011',
      journal: 'Hormone and Metabolic Research',
      url: 'https://pubmed.ncbi.nlm.nih.gov/21154195/',
    },
  ],
};

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota/private mode errors silently
  }
}

export function readCachedTestosteroneScience(
  nowMs: number = Date.now(),
): TestosteroneSciencePayload | null {
  const raw = safeStorageGet(SCIENCE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TestosteroneSciencePayload>;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== 'number' ||
      !Array.isArray(parsed.wikipedia) ||
      !Array.isArray(parsed.pubmedArticles)
    ) {
      return null;
    }
    const age = nowMs - parsed.fetchedAt;
    if (age < 0 || age > SCIENCE_CACHE_TTL_MS) return null;
    return {
      fetchedAt: parsed.fetchedAt,
      isOfflineFallback: Boolean(parsed.isOfflineFallback),
      wikipedia: parsed.wikipedia,
      pubmedArticles: parsed.pubmedArticles,
    };
  } catch {
    return null;
  }
}

export function writeCachedTestosteroneScience(
  payload: TestosteroneSciencePayload,
): void {
  safeStorageSet(SCIENCE_STORAGE_KEY, JSON.stringify(payload));
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number = SCIENCE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timerId);
  }
}

function parseWikiSummary(
  raw: unknown,
  topic: 'testosterone' | 'tribulus',
  fallback: WikiSummaryEntry,
): WikiSummaryEntry {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as {
    title?: unknown;
    extract?: unknown;
    content_urls?: { desktop?: { page?: unknown } };
  };
  const extract =
    typeof obj.extract === 'string' && obj.extract.trim().length > 20
      ? obj.extract.trim()
      : '';
  if (!extract) return fallback;
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : fallback.title;
  const url =
    typeof obj.content_urls?.desktop?.page === 'string'
      ? obj.content_urls.desktop.page
      : fallback.url;
  return { topic, title, extract, url };
}

function extractYear(pubdate: unknown): string {
  if (typeof pubdate !== 'string') return '';
  const match = pubdate.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : pubdate.slice(0, 4);
}

export function parsePubMedSummaryResponse(
  raw: unknown,
  ids: string[],
): PubMedArticleEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const resultObj = (raw as { result?: Record<string, unknown> }).result;
  if (!resultObj || typeof resultObj !== 'object') return [];

  const articles: PubMedArticleEntry[] = [];
  for (const id of ids) {
    const item = resultObj[id] as
      | {
          title?: unknown;
          pubdate?: unknown;
          source?: unknown;
          fulljournalname?: unknown;
        }
      | undefined;
    if (!item || typeof item.title !== 'string' || !item.title.trim()) continue;
    articles.push({
      pmid: id,
      title: item.title.trim().replace(/\.$/, ''),
      year: extractYear(item.pubdate) || '—',
      journal:
        typeof item.source === 'string' && item.source.trim()
          ? item.source.trim()
          : typeof item.fulljournalname === 'string'
            ? item.fulljournalname.trim()
            : 'PubMed',
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    });
  }
  return articles;
}

export async function fetchTestosteroneScienceData(options?: {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<{
  data: TestosteroneSciencePayload;
  fromCache: boolean;
}> {
  const nowMs = options?.nowMs ?? Date.now();
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!options?.forceRefresh) {
    const cached = readCachedTestosteroneScience(nowMs);
    if (cached && !cached.isOfflineFallback) {
      return { data: cached, fromCache: true };
    }
  }

  // Fetch Wikipedia BG summaries + PubMed E-search/E-summary in parallel with 4s timeouts
  const wikiTestoPromise = fetchJsonWithTimeout(
    WIKI_TESTOSTERONE_URL,
    SCIENCE_TIMEOUT_MS,
    fetchImpl,
  )
    .then((raw) => ({
      ok: true as const,
      entry: parseWikiSummary(
        raw,
        'testosterone',
        OFFLINE_FALLBACK_SCIENCE_DATA.wikipedia[0],
      ),
    }))
    .catch(() => ({
      ok: false as const,
      entry: OFFLINE_FALLBACK_SCIENCE_DATA.wikipedia[0],
    }));

  const wikiTribulusPromise = fetchJsonWithTimeout(
    WIKI_TRIBULUS_URL,
    SCIENCE_TIMEOUT_MS,
    fetchImpl,
  )
    .then((raw) => ({
      ok: true as const,
      entry: parseWikiSummary(
        raw,
        'tribulus',
        OFFLINE_FALLBACK_SCIENCE_DATA.wikipedia[1],
      ),
    }))
    .catch(() => ({
      ok: false as const,
      entry: OFFLINE_FALLBACK_SCIENCE_DATA.wikipedia[1],
    }));

  const pubmedPromise = (async (): Promise<{
    ok: boolean;
    articles: PubMedArticleEntry[];
  }> => {
    try {
      const searchRaw = (await fetchJsonWithTimeout(
        PUBMED_ESEARCH_URL,
        SCIENCE_TIMEOUT_MS,
        fetchImpl,
      )) as { esearchresult?: { idlist?: unknown } };
      const idList = Array.isArray(searchRaw?.esearchresult?.idlist)
        ? searchRaw.esearchresult!.idlist.filter(
            (x): x is string => typeof x === 'string' && /^\d+$/.test(x),
          )
        : [];
      if (idList.length === 0) {
        return { ok: false, articles: OFFLINE_FALLBACK_SCIENCE_DATA.pubmedArticles };
      }
      const summaryRaw = await fetchJsonWithTimeout(
        buildPubMedSummaryUrl(idList),
        SCIENCE_TIMEOUT_MS,
        fetchImpl,
      );
      const parsed = parsePubMedSummaryResponse(summaryRaw, idList);
      if (parsed.length === 0) {
        return { ok: false, articles: OFFLINE_FALLBACK_SCIENCE_DATA.pubmedArticles };
      }
      return { ok: true, articles: parsed };
    } catch {
      return { ok: false, articles: OFFLINE_FALLBACK_SCIENCE_DATA.pubmedArticles };
    }
  })();

  const [wikiTesto, wikiTribulus, pubmed] = await Promise.all([
    wikiTestoPromise,
    wikiTribulusPromise,
    pubmedPromise,
  ]);

  const anyOnlineSuccess = wikiTesto.ok || wikiTribulus.ok || pubmed.ok;
  const payload: TestosteroneSciencePayload = {
    fetchedAt: nowMs,
    isOfflineFallback: !anyOnlineSuccess,
    wikipedia: [wikiTesto.entry, wikiTribulus.entry],
    pubmedArticles: pubmed.articles,
  };

  if (anyOnlineSuccess) {
    writeCachedTestosteroneScience(payload);
  }

  return { data: payload, fromCache: false };
}
