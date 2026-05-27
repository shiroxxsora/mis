import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileToBase64, recognizeTooth } from './recognition';
import { authorizedFetch } from './authorizedFetch';

vi.mock('./authorizedFetch', () => ({
  authorizedFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(authorizedFetch);

describe('recognizeTooth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          message: 'Healthy (90%)',
          jobId: 'abc',
          label: 'Healthy',
        }),
        { status: 200 },
      ),
    );

    const result = await recognizeTooth('img-base64');

    expect(result.label).toBe('Healthy');
    expect(mockedFetch).toHaveBeenCalledWith(
      '/api/recognition/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source: 'mis-ui', payload: 'img-base64' }),
      }),
    );
  });

  it('extracts detail from JSON error body', async () => {
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'invalid payload' }), { status: 400 }),
    );

    await expect(recognizeTooth('bad')).rejects.toThrow('invalid payload');
  });

  it('falls back to message from JSON error body', async () => {
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'service unavailable' }), { status: 503 }),
    );

    await expect(recognizeTooth('bad')).rejects.toThrow('service unavailable');
  });

  it('falls back to raw text error body', async () => {
    mockedFetch.mockResolvedValue(new Response('plain text error', { status: 500 }));

    await expect(recognizeTooth('bad')).rejects.toThrow('plain text error');
  });

  it('falls back to HTTP status when body is empty', async () => {
    mockedFetch.mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' }));

    await expect(recognizeTooth('bad')).rejects.toThrow('HTTP 502');
  });
});

describe('fileToBase64', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    vi.stubGlobal(
      'Image',
      class MockImage {
        width = 2048;
        height = 1536;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      },
    );

    vi.stubGlobal(
      'HTMLCanvasElement',
      class MockCanvas {
        width = 0;
        height = 0;
        getContext() {
          return { drawImage: vi.fn() };
        }
        toDataURL() {
          return 'data:image/jpeg;base64,QUJD';
        }
      },
    );

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return new (HTMLCanvasElement as unknown as { new (): HTMLCanvasElement })();
      }
      throw new Error(`Unexpected tag: ${tag}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('compresses image to jpeg base64', async () => {
    const file = new File(['x'], 'tooth.png', { type: 'image/png' });
    await expect(fileToBase64(file)).resolves.toBe('QUJD');
  });

  it('rejects when image fails to load', async () => {
    vi.stubGlobal(
      'Image',
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onerror?.();
        }
      },
    );

    const file = new File(['x'], 'tooth.png', { type: 'image/png' });
    await expect(fileToBase64(file)).rejects.toThrow('Не удалось прочитать изображение');
  });
});
