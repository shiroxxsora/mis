import type { RecognitionResult } from '../api/recognition';

type Props = {
  result: RecognitionResult;
};

function imageSrc(base64: string | null | undefined): string | null {
  if (!base64) {
    return null;
  }
  return `data:image/png;base64,${base64}`;
}

export function RecognitionResultView({ result }: Props) {
  const shapSrc = imageSrc(result.shapImageBase64);
  const limeSrc = imageSrc(result.limeImageBase64);

  return (
    <div className="recognition-result">
      <dl className="result">
        <dt>Статус</dt>
        <dd>{result.status}</dd>
        {result.label != null && (
          <>
            <dt>Класс</dt>
            <dd>{result.label}</dd>
          </>
        )}
        {result.confidence != null && (
          <>
            <dt>Уверенность</dt>
            <dd>{(result.confidence * 100).toFixed(1)}%</dd>
          </>
        )}
        {result.probHealthy != null && (
          <>
            <dt>P(Healthy)</dt>
            <dd>{(result.probHealthy * 100).toFixed(1)}%</dd>
          </>
        )}
        <dt>Сообщение</dt>
        <dd>{result.message}</dd>
      </dl>

      {(shapSrc || limeSrc) && (
        <div className="recognition-explain-grid">
          {shapSrc && (
            <figure className="recognition-explain-card">
              <figcaption>SHAP</figcaption>
              <img src={shapSrc} alt="SHAP объяснение" className="recognition-explain-image" />
            </figure>
          )}
          {limeSrc && (
            <figure className="recognition-explain-card">
              <figcaption>LIME</figcaption>
              <img src={limeSrc} alt="LIME объяснение" className="recognition-explain-image" />
            </figure>
          )}
        </div>
      )}
    </div>
  );
}
