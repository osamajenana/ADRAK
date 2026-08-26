/**
 * Reading QR codes off a student's screen with the device camera.
 *
 * Uses the platform's own BarcodeDetector, which is present in Chrome on Android — the browser
 * essentially every device here runs. That is zero bytes downloaded for the single most
 * demanding piece of this feature. Where it is missing, the app says so plainly rather than
 * pulling down a decoding library over a connection that may not survive it.
 */

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const detectorConstructor = (): BarcodeDetectorConstructor | null =>
  (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;

export const scanningSupported = (): boolean => detectorConstructor() !== null;

export interface Scanner {
  stop(): void;
}

/**
 * Starts the camera and calls `onCode` for every distinct code seen.
 *
 * Deduplicated by value: a QR held in front of a camera is read many times a second, and without
 * this the teacher would see the same frame accepted thirty times and have no idea whether the
 * next one had registered.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (value: string) => void,
): Promise<Scanner> {
  const Detector = detectorConstructor();

  if (!Detector) throw new Error('هذا المتصفح لا يدعم مسح الرموز. استخدم كروم على أندرويد.');

  const stream = await navigator.mediaDevices.getUserMedia({
    // The rear camera: the teacher is pointing the device at a screen someone else is holding.
    video: { facingMode: 'environment' },
  });

  video.srcObject = stream;
  await video.play();

  const detector = new Detector({ formats: ['qr_code'] });
  const seen = new Set<string>();

  let running = true;

  const tick = async (): Promise<void> => {
    if (!running) return;

    try {
      for (const barcode of await detector.detect(video)) {
        if (!seen.has(barcode.rawValue)) {
          seen.add(barcode.rawValue);
          onCode(barcode.rawValue);
        }
      }
    } catch {
      // A frame that fails to decode is the normal case between codes, not an error worth
      // surfacing. Keep looking.
    }

    if (running) requestAnimationFrame(() => void tick());
  };

  void tick();

  return {
    stop() {
      running = false;
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
