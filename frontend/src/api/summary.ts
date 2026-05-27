import { authorizedFetch } from './authorizedFetch';

export async function summarizeVisits(input: string): Promise<string> {
  const response = await authorizedFetch('/api/llm/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const body = (await response.json()) as { summary?: string };
  return body.summary ?? '';
}

export async function predictAttendanceProbability(input: string): Promise<number> {
  const response = await authorizedFetch('/api/llm/attendance-probability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const body = (await response.json()) as { probability?: number };
  return body.probability ?? 50;
}
