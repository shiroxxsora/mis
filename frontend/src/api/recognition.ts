import { authorizedFetch } from './authorizedFetch';



export type RecognitionResult = {

  status: string;

  message: string;

  jobId: string;

  label?: string | null;

  confidence?: number | null;

  probHealthy?: number | null;

  shapImageBase64?: string | null;

  limeImageBase64?: string | null;

};



const MAX_IMAGE_EDGE_PX = 1024;

const JPEG_QUALITY = 0.85;



async function loadImageFromFile(file: File): Promise<HTMLImageElement> {

  const objectUrl = URL.createObjectURL(file);

  try {

    const image = new Image();

    await new Promise<void>((resolve, reject) => {

      image.onload = () => resolve();

      image.onerror = () => reject(new Error('Не удалось прочитать изображение'));

      image.src = objectUrl;

    });

    return image;

  } finally {

    URL.revokeObjectURL(objectUrl);

  }

}



function canvasToBase64(canvas: HTMLCanvasElement): string {

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  const base64 = dataUrl.split(',')[1];

  if (!base64) {

    throw new Error('Не удалось подготовить изображение');

  }

  return base64;

}



export async function fileToBase64(file: File): Promise<string> {

  const image = await loadImageFromFile(file);

  const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(image.width, image.height));

  const width = Math.max(1, Math.round(image.width * scale));

  const height = Math.max(1, Math.round(image.height * scale));



  const canvas = document.createElement('canvas');

  canvas.width = width;

  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {

    throw new Error('Не удалось подготовить изображение');

  }

  context.drawImage(image, 0, 0, width, height);

  return canvasToBase64(canvas);

}



export async function recognizeTooth(

  imageBase64: string,

  source = 'mis-ui',

): Promise<RecognitionResult> {

  const response = await authorizedFetch('/api/recognition/start', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ source, payload: imageBase64 }),

  });



  if (!response.ok) {

    const text = await response.text();

    let detail = text;

    try {

      const json = JSON.parse(text) as { detail?: string; message?: string };

      detail = json.detail ?? json.message ?? text;

    } catch {

      /* keep raw text */

    }

    throw new Error(detail || `HTTP ${response.status}`);

  }



  return response.json() as Promise<RecognitionResult>;

}

