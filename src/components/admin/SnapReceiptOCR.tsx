import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, ScanLine, Upload } from 'lucide-react';
import { toast } from 'sonner';

/* ── Feature flag ── */
const receipt_auto_extract_enabled = true;

/* ── Types ── */
type ExtractedFields = {
  total: string;
  date: string;
  vendor: string;
  vatAmount: string;
  tin: string;
  vatDetected: boolean;
  vatType: string;
};

type Props = {
  onExtracted: (fields: ExtractedFields) => void;
};

/* ── Image preprocessing: grayscale → contrast → threshold ── */
const preprocessImage = (file: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const contrastFactor = 1.5;

      for (let i = 0; i < d.length; i += 4) {
        // Grayscale
        let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Contrast
        gray = ((gray - 128) * contrastFactor) + 128;
        gray = Math.max(0, Math.min(255, gray));
        // Threshold
        gray = gray > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = url;
  });
};

/* ── Extraction helpers ── */

const extractTotal = (text: string): string => {
  const allValues: number[] = [];

  // Currency-prefixed values
  const currencyPattern = /[₱$]\s*([\d,]+\.?\d{0,2})/g;
  let m: RegExpExecArray | null;
  while ((m = currencyPattern.exec(text)) !== null) {
    allValues.push(parseFloat(m[1].replace(/,/g, '')));
  }

  // PHP prefix
  const phpPattern = /PHP\s*([\d,]+\.?\d{0,2})/gi;
  while ((m = phpPattern.exec(text)) !== null) {
    allValues.push(parseFloat(m[1].replace(/,/g, '')));
  }

  // Labeled totals
  const labeledPattern = /(?:total|amount\s*due|balance\s*due|net\s*amount|grand\s*total)[:\s]*[₱$]?\s*([\d,]+\.?\d{0,2})/gi;
  while ((m = labeledPattern.exec(text)) !== null) {
    allValues.push(parseFloat(m[1].replace(/,/g, '')));
  }

  // Fallback: numbers with exactly 2 decimal places
  const decimalPattern = /\b([\d,]+\.\d{2})\b/g;
  while ((m = decimalPattern.exec(text)) !== null) {
    allValues.push(parseFloat(m[1].replace(/,/g, '')));
  }

  const valid = allValues.filter(v => !isNaN(v) && v > 0);
  if (valid.length === 0) return '';
  return Math.max(...valid).toFixed(2);
};

const extractDate = (text: string): string => {
  // YYYY-MM-DD
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or MM/DD/YY
  const mdySlash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdySlash) {
    let first = parseInt(mdySlash[1]);
    let second = parseInt(mdySlash[2]);
    let y = mdySlash[3];
    if (y.length === 2) y = `20${y}`;
    // If first > 12, treat as DD/MM/YYYY
    if (first > 12) {
      return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
    }
    return `${y}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
  }

  // MM-DD-YYYY
  const mdyDash = text.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (mdyDash) {
    const m2 = mdyDash[1].padStart(2, '0');
    const d2 = mdyDash[2].padStart(2, '0');
    let y2 = mdyDash[3];
    if (y2.length === 2) y2 = `20${y2}`;
    return `${y2}-${m2}-${d2}`;
  }

  // Month name formats
  const monthNames = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i;
  const monthMatch = text.match(monthNames);
  if (monthMatch) {
    const monthStr = monthMatch[0].slice(0, 3).toLowerCase();
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    return `${monthMatch[2]}-${months[monthStr] || '01'}-${monthMatch[1].padStart(2, '0')}`;
  }

  return '';
};

const SKIP_LINES = /^(official\s*receipt|sales\s*invoice|receipt|invoice|date|time|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/i;

const extractVendor = (text: string): string => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
  for (const line of lines) {
    if (SKIP_LINES.test(line)) continue;
    const letters = line.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 3) continue;
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (upper / letters.length > 0.6) return line;
  }
  return '';
};

const detectVatType = (text: string): string => {
  if (/vat\s*exempt/i.test(text)) return 'VAT Exempt';
  if (/zero\s*rated|0%\s*vat/i.test(text)) return 'Zero Rated';
  if (/vat\s*12%|vatable/i.test(text)) return 'Vatable';
  // If a VAT amount line exists, assume vatable
  if (/vat/i.test(text)) return 'Vatable';
  return '';
};

const extractVAT = (text: string): { vatAmount: string; vatDetected: boolean; vatType: string } => {
  const vatType = detectVatType(text);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/vat/i.test(lines[i])) {
      const numMatch = lines[i].match(/([\d,]+\.?\d{0,2})/);
      if (numMatch) return { vatAmount: numMatch[1].replace(/,/g, ''), vatDetected: true, vatType };
      if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/([\d,]+\.?\d{0,2})/);
        if (nextMatch) return { vatAmount: nextMatch[1].replace(/,/g, ''), vatDetected: true, vatType };
      }
      return { vatAmount: '', vatDetected: true, vatType };
    }
  }
  return { vatAmount: '', vatDetected: false, vatType };
};

const extractTIN = (text: string): string => {
  // ###-###-###-### or ###-###-###
  const dashPattern = text.match(/\d{3}-\d{3}-\d{3}(-\d{3})?/);
  if (dashPattern) return dashPattern[0];
  // 9-12 digit string near "TIN"
  const tinArea = text.match(/TIN[:\s]*([\d\s]{9,15})/i);
  if (tinArea) {
    const digits = tinArea[1].replace(/\s/g, '');
    if (digits.length >= 9 && digits.length <= 12) return digits;
  }
  return '';
};

/* ── Component ── */
const SnapReceiptOCR = ({ onExtracted }: Props) => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!receipt_auto_extract_enabled) return null;

  const processFile = async (file: File) => {
    setProcessing(true);
    setProgress(0);

    try {
      const dataUrl = await preprocessImage(file);

      const worker = await createWorker('eng', undefined, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(dataUrl);
      await worker.terminate();

      const total = extractTotal(text);
      const date = extractDate(text);
      const vendor = extractVendor(text);
      const { vatAmount, vatDetected, vatType } = extractVAT(text);
      const tin = extractTIN(text);

      if (!total && !date && !vendor) {
        toast.info('Could not extract data. Please fill in manually.');
      } else {
        const parts: string[] = [];
        if (vendor) parts.push(`Vendor: ${vendor}`);
        if (total) parts.push(`Total: ₱${total}`);
        if (date) parts.push(`Date: ${date}`);
        if (vatType) parts.push(`VAT: ${vatType}`);
        else if (vatDetected) parts.push('VAT detected');
        if (tin) parts.push(`TIN: ${tin}`);
        toast.success(`Extracted: ${parts.join(', ')}`);
      }

      onExtracted({ total, date, vendor, vatAmount, tin, vatDetected, vatType });
    } catch (err: any) {
      console.error('OCR error:', err);
      toast.error('Failed to process image');
    } finally {
      setProcessing(false);
      setProgress(0);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-1.5">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInput} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleInput} />

      <Button
        type="button" variant="outline" size="sm" disabled={processing}
        onClick={() => cameraRef.current?.click()}
        className="font-display text-xs tracking-wider gap-1.5 w-full min-h-[44px] border-accent/40 hover:border-accent"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing {progress}%…
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            <ScanLine className="w-3.5 h-3.5" />
            Snap Receipt
          </>
        )}
      </Button>

      {!processing && (
        <Button
          type="button" variant="ghost" size="sm" disabled={processing}
          onClick={() => fileRef.current?.click()}
          className="font-display text-xs tracking-wider gap-1.5 w-full min-h-[36px] text-muted-foreground"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload File
        </Button>
      )}

      {processing && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default SnapReceiptOCR;
