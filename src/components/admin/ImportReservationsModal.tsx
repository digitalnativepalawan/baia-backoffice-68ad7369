import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const from = (table: string) => supabase.from(table as any);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guests: any[];
  units: any[];
  onComplete: () => void;
}

interface ParsedRow {
  idx: number;
  guestName: string;
  units: string;
  guestCount: string;
  platform: string;
  checkIn: string;
  checkOut: string;
  pricePerNight: string;
  paidRealized: string;
  notes: string;
  errors: string[];
  selected: boolean;
}

const TEMPLATE_HEADERS = 'Guest Name,Units,Guests,Platform,Check In,Check Out,Price Per Night,Paid So Far Realized,Notes';
const TEMPLATE_EXAMPLE = 'John Doe,"Unit1,Unit2",2,Airbnb,01/15/2026,01/18/2026,1500,2500,First time guest';

// Unit validation is now dynamic — derived from the `units` prop

const PLATFORM_MAP: Record<string, string> = {
  'airbnb': 'Airbnb',
  'booking.com': 'Booking.com',
  'front desk': 'Direct',
  'website': 'Website',
  'agoda': 'Agoda',
  'direct': 'Direct',
};

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse mm/dd/yyyy to yyyy-mm-dd */
function parseDateMMDDYYYY(s: string): string | null {
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const month = mm.padStart(2, '0');
  const day = dd.padStart(2, '0');
  const iso = `${yyyy}-${month}-${day}`;
  if (isNaN(Date.parse(iso))) return null;
  return iso;
}

function mapPlatform(raw: string): string {
  const key = raw.toLowerCase().trim();
  return PLATFORM_MAP[key] || raw;
}

function validateRow(row: ParsedRow, validUnits: string[]): string[] {
  const errs: string[] = [];
  if (!row.guestName) errs.push('Missing guest name');
  if (!row.checkIn) errs.push('Missing check-in date (mm/dd/yyyy)');
  if (!row.checkOut) errs.push('Missing check-out date (mm/dd/yyyy)');
  if (row.checkIn && row.checkOut && row.checkOut <= row.checkIn) errs.push('Check-out must be after check-in');
  if (!row.units) errs.push('Missing units');
  else {
    const unitNames = row.units.split(',').map(u => u.trim()).filter(Boolean);
    const invalid = unitNames.filter(u => !validUnits.some(v => v.toLowerCase() === u.toLowerCase()));
    if (invalid.length > 0) errs.push(`Invalid unit(s): ${invalid.join(', ')} (valid: ${validUnits.join(', ')})`);
  }
  if (row.pricePerNight && isNaN(parseFloat(row.pricePerNight))) errs.push('Price Per Night must be a number');
  if (row.paidRealized && isNaN(parseFloat(row.paidRealized))) errs.push('Paid must be a number');
  return errs;
}

const ImportReservationsModal = ({ open, onOpenChange, guests, units, onComplete }: Props) => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS}\n${TEMPLATE_EXAMPLE}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reservations_template.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV has no data rows'); return; }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);

        // Parse dates from mm/dd/yyyy → yyyy-mm-dd
        const rawCheckIn = fields[4] || '';
        const rawCheckOut = fields[5] || '';
        const checkIn = parseDateMMDDYYYY(rawCheckIn);
        const checkOut = parseDateMMDDYYYY(rawCheckOut);

        const row: ParsedRow = {
          idx: i,
          guestName: fields[0] || '',
          units: fields[1] || '',
          guestCount: fields[2] || '1',
          platform: mapPlatform(fields[3] || ''),
          checkIn: checkIn || '',
          checkOut: checkOut || '',
          pricePerNight: fields[6] || '0',
          paidRealized: fields[7] || '0',
          notes: fields[8] || '',
          errors: [],
          selected: true,
        };

        // Add date format errors
        if (rawCheckIn && !checkIn) row.errors.push(`Invalid check-in date "${rawCheckIn}" (use mm/dd/yyyy)`);
        if (rawCheckOut && !checkOut) row.errors.push(`Invalid check-out date "${rawCheckOut}" (use mm/dd/yyyy)`);

        const validUnitNames = units.map((u: any) => u.name || u.unit_name || '');
        row.errors = [...row.errors, ...validateRow(row, validUnitNames)];
        // Deduplicate date errors
        row.errors = [...new Set(row.errors)];
        if (row.errors.length > 0) row.selected = false;
        parsed.push(row);
      }
      setRows(parsed);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const toggleAll = (checked: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, selected: r.errors.length === 0 ? checked : false })));
  };

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map(r => r.idx === idx ? { ...r, selected: !r.selected } : r));
  };

  const doImport = async () => {
    setImporting(true);
    let imported = 0;
    const errors: string[] = [];
    const selectedRows = rows.filter(r => r.selected && r.errors.length === 0);

    const unitNameMap = new Map(units.map((u: any) => [u.name.toLowerCase(), u.id]));
    const guestNameMap = new Map(guests.map((g: any) => [g.full_name.toLowerCase(), g.id]));

    for (const row of selectedRows) {
      try {
        let guestId = guestNameMap.get(row.guestName.toLowerCase());
        if (!guestId) {
          const { data: newGuest, error: gErr } = await from('resort_ops_guests')
            .insert({ full_name: row.guestName })
            .select('id')
            .single() as { data: { id: string } | null; error: any };
          if (gErr || !newGuest) { errors.push(`Row ${row.idx}: Failed to create guest`); continue; }
          guestId = newGuest.id;
          guestNameMap.set(row.guestName.toLowerCase(), guestId);
        }

        const unitNames = row.units.split(',').map(u => u.trim()).filter(Boolean);
        const nightlyRate = parseFloat(row.pricePerNight) || 0;
        const totalPaid = parseFloat(row.paidRealized) || 0;
        const splitPaid = unitNames.length > 0 ? totalPaid / unitNames.length : totalPaid;

        for (const uName of unitNames) {
          const unitId = unitNameMap.get(uName.toLowerCase());
          if (!unitId) {
            errors.push(`Row ${row.idx}: Unit '${uName}' not found`);
            continue;
          }
          const { error: bErr } = await from('resort_ops_bookings').insert({
            guest_id: guestId,
            unit_id: unitId,
            platform: row.platform,
            check_in: row.checkIn,
            check_out: row.checkOut,
            adults: parseInt(row.guestCount) || 1,
            room_rate: nightlyRate,
            paid_amount: splitPaid,
          });
          if (bErr) { errors.push(`Row ${row.idx}: ${bErr.message}`); }
          else { imported++; }
        }
      } catch (err: any) {
        errors.push(`Row ${row.idx}: ${err.message}`);
      }
    }

    setResult({ imported, skipped: selectedRows.length - imported + (rows.length - selectedRows.length), errors });
    setImporting(false);
    if (imported > 0) onComplete();
  };

  const reset = () => {
    setRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const validSelected = rows.filter(r => r.selected && r.errors.length === 0).length;
  // Show first 5 rows for preview
  const previewRows = rows.slice(0, 5);
  const extraCount = rows.length - 5;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-sm tracking-wider">Import Reservations</DialogTitle>
          <DialogDescription className="font-body text-xs text-muted-foreground">Upload a CSV file to batch-create reservations. Dates must be mm/dd/yyyy. Units: G1, G2, G3.</DialogDescription>
        </DialogHeader>

        {/* Result summary */}
        {result && (
          <div className="space-y-3">
            <div className="p-4 rounded border border-border space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-body text-sm text-foreground font-medium">{result.imported} reservations imported</span>
              </div>
              {result.skipped > 0 && (
                <p className="font-body text-xs text-muted-foreground">{result.skipped} rows skipped</p>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="font-body text-xs text-destructive">{e}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => handleClose(false)} className="w-full">Close</Button>
          </div>
        )}

        {/* Upload flow */}
        {!result && (
          <div className="space-y-4">
            {/* Platform mapping info */}
            <div className="p-3 rounded border border-border bg-muted/30 space-y-1">
              <p className="font-body text-xs font-medium text-foreground">Auto-mapped platforms:</p>
              <p className="font-body text-xs text-muted-foreground">Airbnb · Booking.com · Front desk → Direct · Website · Agoda</p>
            </div>

            {/* Template download */}
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-1" /> Download CSV Template
            </Button>

            {/* File upload */}
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              <FileText className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="font-body text-sm text-muted-foreground">Click to upload CSV</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </label>

            {/* Preview (first 5 rows) */}
            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-body text-xs text-muted-foreground">
                    {rows.length} rows parsed · {rows.filter(r => r.errors.length > 0).length} with errors
                  </p>
                  <Button size="sm" variant="ghost" className="text-xs h-7"
                    onClick={() => toggleAll(rows.some(r => !r.selected && r.errors.length === 0))}>
                    {rows.filter(r => r.selected).length === rows.filter(r => r.errors.length === 0).length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {previewRows.map(row => (
                    <div key={row.idx} className={`p-3 rounded border space-y-1 ${row.errors.length > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={row.selected}
                          disabled={row.errors.length > 0}
                          onCheckedChange={() => toggleRow(row.idx)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-body text-sm text-foreground font-medium">{row.guestName || '(no name)'}</p>
                            {row.platform && <Badge variant="secondary" className="text-[10px] h-4">{row.platform}</Badge>}
                          </div>
                          <p className="font-body text-xs text-muted-foreground">Units: {row.units} · {row.guestCount} guests</p>
                          <p className="font-body text-xs text-muted-foreground">{row.checkIn} → {row.checkOut}</p>
                          <p className="font-body text-xs text-muted-foreground">Projected: ₱{row.totalProjected} · Paid: ₱{row.paidRealized}</p>
                          {row.notes && <p className="font-body text-xs text-muted-foreground italic">{row.notes}</p>}
                          {row.errors.map((e, i) => (
                            <p key={i} className="font-body text-xs text-destructive">{e}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <p className="font-body text-xs text-muted-foreground text-center py-2">
                      + {extraCount} more row{extraCount !== 1 ? 's' : ''} (all valid rows will be imported)
                    </p>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={doImport}
                  disabled={importing || validSelected === 0}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {importing ? 'Importing...' : `Import ${validSelected} Reservation${validSelected !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportReservationsModal;
