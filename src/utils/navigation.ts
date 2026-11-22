export type AppPage =
  | 'overview'
  | 'checkin'
  | 'muscles'
  | 'hevy'
  | 'coach'
  | 'weekly'
  | 'analysis'
  | 'goals'
  | 'calendar'
  | 'history';

export type CoachSubTab =
  | 'readiness'
  | 'weekly-plan'
  | 'habit-detective'
  | 'testosterone-anabolic';

export type AnalysisHubSubTab =
  | 'strength-boxing'
  | 'biorhythm-body'
  | 'weekly-review'
  | 'mountain-cardio'
  | 'recovery'
  | 'acwr'
  | 'beat-log'
  | 'standards'
  | 'supplements';

export interface NavLocation {
  page: AppPage;
  coachSubTab?: CoachSubTab;
  analysisSubTab?: AnalysisHubSubTab;
}

export interface BreadcrumbItem {
  label: string;
  location: NavLocation;
  isCurrent: boolean;
}

export interface AppPageMeta {
  id: AppPage;
  label: string;
  hash: string;
}

export const APP_PAGES: AppPageMeta[] = [
  { id: 'checkin', label: 'Дневен запис', hash: '#/checkin' },
  { id: 'overview', label: 'Табло', hash: '#/overview' },
  { id: 'muscles', label: 'Мускули', hash: '#/muscles' },
  { id: 'hevy', label: 'Тренировки (Hevy)', hash: '#/hevy' },
  { id: 'coach', label: 'Интелигентен треньор', hash: '#/coach' },
  { id: 'weekly', label: 'Неделен обзор', hash: '#/weekly' },
  { id: 'analysis', label: 'Анализ и Подготовка', hash: '#/analysis' },
  { id: 'goals', label: 'Цели и съвети', hash: '#/goals' },
  { id: 'calendar', label: 'Календар', hash: '#/calendar' },
  { id: 'history', label: 'История', hash: '#/history' },
];

export const MAIN_MENU_ITEMS: Array<{
  id: 'home' | 'coach' | 'analysis';
  emoji: string;
  label: string;
  shortLabel: string;
  location: NavLocation;
}> = [
  {
    id: 'home',
    emoji: '🏠',
    label: 'Начало (Дневен запис)',
    shortLabel: 'Начало',
    location: { page: 'checkin' },
  },
  {
    id: 'coach',
    emoji: '🧠',
    label: 'Интелигентен треньор',
    shortLabel: 'Интелигентен треньор',
    location: { page: 'coach', coachSubTab: 'readiness' },
  },
  {
    id: 'analysis',
    emoji: '📊',
    label: 'Анализи и графики',
    shortLabel: 'Анализи и графики',
    location: { page: 'analysis', analysisSubTab: 'strength-boxing' },
  },
];

export const COACH_SUB_TABS: Array<{
  id: CoachSubTab;
  emoji: string;
  label: string;
  shortLabel: string;
}> = [
  {
    id: 'readiness',
    emoji: '⚡',
    label: 'Днешна готовност и Бокс',
    shortLabel: 'Днешна готовност',
  },
  {
    id: 'weekly-plan',
    emoji: '🌦️',
    label: 'Седмичен план (Зала / Навън)',
    shortLabel: 'Седмичен план',
  },
  {
    id: 'habit-detective',
    emoji: '🔍',
    label: 'Детектив на навиците',
    shortLabel: 'Детектив на навиците',
  },
  {
    id: 'testosterone-anabolic',
    emoji: '🧬',
    label: 'Тестостерон и Анаболна среда',
    shortLabel: 'Тестостерон и Анаболна среда',
  },
];

export const ANALYSIS_PRIMARY_SUB_TABS: Array<{
  id: 'strength-boxing' | 'biorhythm-body' | 'weekly-review' | 'mountain-cardio';
  emoji: string;
  label: string;
  shortLabel: string;
}> = [
  {
    id: 'strength-boxing',
    emoji: '⚖️',
    label: 'Сила, Бокс и Категория',
    shortLabel: 'Сила, Бокс и Категория',
  },
  {
    id: 'biorhythm-body',
    emoji: '⏰',
    label: 'Биоритъм, Сън и Тяло',
    shortLabel: 'Биоритъм, Сън и Тяло',
  },
  {
    id: 'weekly-review',
    emoji: '🏆',
    label: 'Неделен обзор',
    shortLabel: 'Неделен обзор',
  },
  {
    id: 'mountain-cardio',
    emoji: '🏔️',
    label: 'Планина и Кардио',
    shortLabel: 'Планина и Кардио',
  },
];

export const MORE_MENU_ITEMS: Array<{
  id: string;
  label: string;
  group: 'training' | 'tools' | 'data';
  location: NavLocation;
}> = [
  {
    id: 'hevy',
    label: 'Тренировки (Hevy)',
    group: 'training',
    location: { page: 'hevy' },
  },
  {
    id: 'beat-log',
    label: 'Победи дневника',
    group: 'training',
    location: { page: 'analysis', analysisSubTab: 'beat-log' },
  },
  {
    id: 'standards',
    label: 'Нива на сила и стандарти',
    group: 'training',
    location: { page: 'analysis', analysisSubTab: 'standards' },
  },
  {
    id: 'acwr',
    label: 'Натоварване и риск (ACWR)',
    group: 'tools',
    location: { page: 'analysis', analysisSubTab: 'acwr' },
  },
  {
    id: 'recovery',
    label: 'Карта на възстановяването (72 ч.)',
    group: 'tools',
    location: { page: 'analysis', analysisSubTab: 'recovery' },
  },
  {
    id: 'supplements',
    label: 'Цикли на добавките',
    group: 'tools',
    location: { page: 'analysis', analysisSubTab: 'supplements' },
  },
  {
    id: 'overview',
    label: 'Табло (3D / Сравнение)',
    group: 'data',
    location: { page: 'overview' },
  },
  {
    id: 'muscles',
    label: 'Мускулен растеж',
    group: 'data',
    location: { page: 'muscles' },
  },
  {
    id: 'goals',
    label: 'Цели и съвети',
    group: 'data',
    location: { page: 'goals' },
  },
  {
    id: 'calendar',
    label: 'Календар',
    group: 'data',
    location: { page: 'calendar' },
  },
  {
    id: 'history',
    label: 'История и Бекъп',
    group: 'data',
    location: { page: 'history' },
  },
];

const ANALYSIS_SUBTAB_LABELS: Record<AnalysisHubSubTab, string> = {
  'strength-boxing': '⚖️ Сила, Бокс и Категория',
  'biorhythm-body': '⏰ Биоритъм, Сън и Тяло',
  'weekly-review': '🏆 Неделен обзор',
  'mountain-cardio': '🏔️ Планина и Кардио',
  recovery: 'Карта на възстановяването',
  acwr: 'Натоварване (ACWR)',
  'beat-log': 'Победи дневника',
  standards: 'Нива на сила',
  supplements: 'Цикли на добавки',
};

const COACH_SUBTAB_LABELS: Record<CoachSubTab, string> = {
  readiness: '⚡ Днешна готовност и Бокс',
  'weekly-plan': '🌦️ Седмичен план (Зала / Навън)',
  'habit-detective': '🔍 Детектив на навиците',
  'testosterone-anabolic': '🧬 Тестостерон и Анаболна среда',
};

const MORE_PAGE_LABELS: Partial<Record<AppPage, string>> = {
  hevy: 'Тренировки (Hevy)',
  overview: 'Табло',
  muscles: 'Мускулен растеж',
  goals: 'Цели и съвети',
  calendar: 'Календар',
  history: 'История и Бекъп',
};

export function getPageHash(page: AppPage): string {
  return `#/${page}`;
}

export function normalizeLocation(loc: NavLocation): NavLocation {
  if (loc.page === 'weekly') {
    return { page: 'analysis', analysisSubTab: 'weekly-review' };
  }
  if (loc.page === 'coach') {
    return {
      page: 'coach',
      coachSubTab: loc.coachSubTab ?? 'readiness',
    };
  }
  if (loc.page === 'analysis') {
    return {
      page: 'analysis',
      analysisSubTab: loc.analysisSubTab ?? 'strength-boxing',
    };
  }
  return { page: loc.page };
}

export function getLocationHash(loc: NavLocation): string {
  const norm = normalizeLocation(loc);
  if (norm.page === 'coach') {
    return `#/coach/${norm.coachSubTab ?? 'readiness'}`;
  }
  if (norm.page === 'analysis') {
    return `#/analysis/${norm.analysisSubTab ?? 'strength-boxing'}`;
  }
  return getPageHash(norm.page);
}

export function getLocationKey(loc: NavLocation): string {
  const norm = normalizeLocation(loc);
  if (norm.page === 'coach') {
    return `coach:${norm.coachSubTab ?? 'readiness'}`;
  }
  if (norm.page === 'analysis') {
    return `analysis:${norm.analysisSubTab ?? 'strength-boxing'}`;
  }
  return norm.page;
}

export function parsePageFromHash(rawHash: string): AppPage {
  const normalized = rawHash
    .trim()
    .toLowerCase()
    .replace(/^#\/?/, '')
    .split(/[?#]/)[0];

  if (normalized === 'analysis' || normalized.startsWith('analysis/')) {
    return 'analysis';
  }
  if (normalized === 'coach' || normalized.startsWith('coach/')) {
    return 'coach';
  }

  switch (normalized) {
    case '':
    case 'home':
    case 'checkin':
    case 'daily-checkin':
    case 'daily-log':
    case 'dneven-zapis':
    case 'biometrics':
      return 'checkin';
    case 'overview':
    case 'top':
    case 'comparison':
      return 'overview';
    case 'muscles':
    case 'muscle-allocation':
    case 'progress-chart':
      return 'muscles';
    case 'hevy':
    case 'workouts':
      return 'hevy';
    case 'intelligent-coach':
      return 'coach';
    case 'weekly':
    case 'scorecard':
    case 'weekly-review':
    case 'nedelen-obzor':
      return 'weekly';
    case 'goals':
    case 'measurements':
    case 'recovery-advice':
      return 'goals';
    case 'calendar':
      return 'calendar';
    case 'history':
    case 'backup':
      return 'history';
    default:
      return 'checkin';
  }
}

export function parseLocationFromHash(rawHash: string): NavLocation {
  const cleaned = rawHash
    .trim()
    .toLowerCase()
    .replace(/^#\/?/, '')
    .split(/[?#]/)[0];

  if (cleaned.startsWith('coach/')) {
    const sub = cleaned.slice('coach/'.length);
    if (
      sub === 'readiness' ||
      sub === 'weekly-plan' ||
      sub === 'habit-detective' ||
      sub === 'testosterone-anabolic'
    ) {
      return { page: 'coach', coachSubTab: sub };
    }
    if (sub === 'testosterone' || sub === 'anabolic') {
      return { page: 'coach', coachSubTab: 'testosterone-anabolic' };
    }
    return { page: 'coach', coachSubTab: 'readiness' };
  }

  if (cleaned.startsWith('analysis/')) {
    const sub = cleaned.slice('analysis/'.length);
    if (sub === 'relative-strength' || sub === 'strength-boxing') {
      return { page: 'analysis', analysisSubTab: 'strength-boxing' };
    }
    if (sub === 'biorhythm' || sub === 'biorhythm-body') {
      return { page: 'analysis', analysisSubTab: 'biorhythm-body' };
    }
    if (sub === 'weekly-review' || sub === 'weekly') {
      return { page: 'analysis', analysisSubTab: 'weekly-review' };
    }
    if (sub === 'mountain-cardio' || sub === 'mountain' || sub === 'cardio') {
      return { page: 'analysis', analysisSubTab: 'mountain-cardio' };
    }
    if (
      sub === 'recovery' ||
      sub === 'acwr' ||
      sub === 'beat-log' ||
      sub === 'standards' ||
      sub === 'supplements'
    ) {
      return { page: 'analysis', analysisSubTab: sub };
    }
    return { page: 'analysis', analysisSubTab: 'strength-boxing' };
  }

  const page = parsePageFromHash(rawHash);
  return normalizeLocation({ page });
}

export function getLocationLabel(loc: NavLocation): string {
  const norm = normalizeLocation(loc);
  if (norm.page === 'checkin') {
    return 'Начало > Дневен запис';
  }
  if (norm.page === 'coach') {
    const sub = COACH_SUB_TABS.find((t) => t.id === (norm.coachSubTab ?? 'readiness'));
    return `Интелигентен треньор > ${sub?.shortLabel ?? 'Днешна готовност'}`;
  }
  if (norm.page === 'analysis') {
    const subKey = norm.analysisSubTab ?? 'strength-boxing';
    const cleanSub = ANALYSIS_SUBTAB_LABELS[subKey].replace(/^[^\p{L}]+/u, '').trim();
    return `Анализи > ${cleanSub}`;
  }
  return `Още > ${MORE_PAGE_LABELS[norm.page] ?? norm.page}`;
}

export function getBreadcrumbsForLocation(loc: NavLocation): BreadcrumbItem[] {
  const norm = normalizeLocation(loc);
  const homeCrumb: BreadcrumbItem = {
    label: '🏠 Начало',
    location: { page: 'checkin' },
    isCurrent: norm.page === 'checkin',
  };

  if (norm.page === 'checkin') {
    return [
      homeCrumb,
      {
        label: 'Дневен запис',
        location: { page: 'checkin' },
        isCurrent: true,
      },
    ];
  }

  if (norm.page === 'coach') {
    const sub = norm.coachSubTab ?? 'readiness';
    return [
      { ...homeCrumb, isCurrent: false },
      {
        label: '🧠 Интелигентен треньор',
        location: { page: 'coach', coachSubTab: 'readiness' },
        isCurrent: false,
      },
      {
        label: COACH_SUBTAB_LABELS[sub],
        location: norm,
        isCurrent: true,
      },
    ];
  }

  if (norm.page === 'analysis') {
    const sub = norm.analysisSubTab ?? 'strength-boxing';
    return [
      { ...homeCrumb, isCurrent: false },
      {
        label: '📊 Анализи и графики',
        location: { page: 'analysis', analysisSubTab: 'strength-boxing' },
        isCurrent: false,
      },
      {
        label: ANALYSIS_SUBTAB_LABELS[sub],
        location: norm,
        isCurrent: true,
      },
    ];
  }

  return [
    { ...homeCrumb, isCurrent: false },
    {
      label: MORE_PAGE_LABELS[norm.page] ?? norm.page,
      location: norm,
      isCurrent: true,
    },
  ];
}

const LAST_LOCATION_STORAGE_KEY = 'fizioprogres_last_nav_location_v1';

export function loadPreviousLocation(): NavLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavLocation>;
    if (!parsed || typeof parsed.page !== 'string') return null;
    return normalizeLocation({
      page: parsePageFromHash(`#/${parsed.page}`),
      coachSubTab: parsed.coachSubTab,
      analysisSubTab: parsed.analysisSubTab,
    });
  } catch {
    return null;
  }
}

export function savePreviousLocation(loc: NavLocation): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LAST_LOCATION_STORAGE_KEY,
      JSON.stringify(normalizeLocation(loc)),
    );
  } catch {
    // Ignore storage quota / private-mode errors
  }
}
