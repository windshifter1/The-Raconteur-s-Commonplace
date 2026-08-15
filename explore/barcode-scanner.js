/**
 * Local camera barcode reader. Prefers BarcodeDetector; ZXing is a lazy fallback.
 * Decoding stays on-device — no AI, no remote vision API.
 */

const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

async function nativeDetector() {
  if (typeof BarcodeDetector !== 'function') return null;
  let formats = WANTED;
  try {
    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
      const supported = await BarcodeDetector.getSupportedFormats();
      formats = WANTED.filter((f) => supported.includes(f));
    }
  } catch {
    formats = WANTED;
  }
  if (!formats.length) return null;
  const detector = new BarcodeDetector({ formats });
  return async (video) => {
    if (video.readyState < 2) return [];
    const codes = await detector.detect(video);
    return (codes || []).map((c) => String(c.rawValue || '')).filter(Boolean);
  };
}

async function zxingDetector() {
  const mod = await import('https://esm.sh/@zxing/browser@0.1.5');
  const Reader = mod.BrowserMultiFormatReader;
  if (!Reader) throw new Error('Barcode decoder unavailable.');
  const reader = new Reader();
  return async (video) => {
    if (video.readyState < 2) return [];
    try {
      const result = await reader.decodeOnceFromVideoElement(video);
      const text = result?.getText?.() || result?.text || '';
      return text ? [String(text)] : [];
    } catch {
      return [];
    }
  };
}

export function createBarcodeScanner({ video, onCode, onError }) {
  let stream = null;
  let timer = 0;
  let running = false;
  let paused = false;
  let detect = null;

  async function ensureDetector() {
    if (detect) return detect;
    detect = await nativeDetector();
    if (!detect) detect = await zxingDetector();
    return detect;
  }

  async function tick() {
    if (!running) return;
    if (!paused && detect && video) {
      try {
        const values = await detect(video);
        if (!paused && values[0]) onCode?.(values[0]);
      } catch (err) {
        onError?.(err);
      }
    }
    timer = window.setTimeout(tick, 220);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Camera is not available in this browser.');
      err.name = 'NotSupportedError';
      throw err;
    }
    await ensureDetector();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    running = true;
    paused = false;
    window.clearTimeout(timer);
    tick();
  }

  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
  }

  function stop() {
    running = false;
    paused = true;
    window.clearTimeout(timer);
    timer = 0;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  return {
    start,
    stop,
    pause,
    resume,
    get paused() {
      return paused;
    },
    get active() {
      return running;
    },
  };
}
