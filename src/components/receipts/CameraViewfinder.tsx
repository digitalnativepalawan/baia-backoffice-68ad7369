import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, SwitchCamera, Loader2 } from 'lucide-react';

type Props = {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
};

const CameraViewfinder = ({ onCapture, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setLoading(true);
    setError(null);

    // Stop any existing stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Camera access denied or unavailable. Please use "Upload from Files" instead.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      // Cleanup on unmount
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          // Stop camera before handing off
          stream?.getTracks().forEach(t => t.stop());
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.85
    );
  };

  const handleClose = () => {
    stream?.getTracks().forEach(t => t.stop());
    onClose();
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-white text-center font-body text-sm">{error}</p>
        <Button onClick={handleClose} variant="outline" className="gap-2">
          <X className="w-4 h-4" /> Close
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar */}
      <div className="flex items-center justify-between p-4 relative z-10">
        <button onClick={handleClose} className="text-white p-2">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-display text-sm tracking-wider">Scan Receipt</span>
        <button onClick={handleFlip} className="text-white p-2">
          <SwitchCamera className="w-6 h-6" />
        </button>
      </div>

      {/* Video feed */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setLoading(false)}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Scan frame guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[85%] h-[60%] border-2 border-white/40 rounded-2xl relative">
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent rounded-br-xl" />
          </div>
        </div>

        {/* Hint text */}
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className="text-white/70 font-body text-xs bg-black/40 px-3 py-1 rounded-full">
            Align receipt within the frame
          </span>
        </div>
      </div>

      {/* Capture button */}
      <div className="p-6 flex justify-center">
        <button
          onClick={handleCapture}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
            <Camera className="w-8 h-8 text-black" />
          </div>
        </button>
      </div>
    </div>
  );
};

export default CameraViewfinder;
