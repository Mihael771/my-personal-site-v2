import type { DiaryState } from '../types/fitness';
import { cleanData } from '../utils/cleanData';
import { createInitialDiaryState, parseDiaryPayload } from '../utils/fitnessMath';

const API_ENDPOINT = '/api/data';

export async function fetchDiaryState(): Promise<DiaryState> {
  const response = await fetch(API_ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Грешка при зареждане на данните (${response.status})`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return createInitialDiaryState();
  }

  const parsed = parseDiaryPayload(text);
  if (parsed.ok) {
    return parsed.state;
  }

  return createInitialDiaryState();
}

export async function saveDiaryStateToApi(state: DiaryState): Promise<void> {
  const payload = cleanData(state);
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Грешка при запис на данните (${response.status})`);
  }
}
