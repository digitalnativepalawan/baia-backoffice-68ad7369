import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Loader2, X, Check, Upload, ScanLine } from 'lucide-react';
import { format, previousSunday, nextSaturday, isSunday, startOfDay } from 'date-fns';
import CameraViewfinder from '@/components/receipts/CameraViewfinder';

const CATEGORIES = ['Food & Beverage', 'Supplies', 'Maintenance', 'Utilities', 'Transport', 'Other'];

type ExtractedData = {
  vendor: string;
  date: string;
  currency: string;
  total: number;
  confidence: { vendor: number; date: number; currency: number; total: number };
};

type ReceiptForm = {
  vendor: string;
  date: string;
  currency: string;
  total: string;
  category: string;
  notes: string;
};

const ConfidenceBadge = ({ score }: { score: number }) => {
  if (score >= 0.8) return <Badge className="bg-green-600/80 text-green-50 text-[10px] ml-1">High</Badge>;
  if (score >= 0.5) return <Badge className="bg-yellow-600/80 text-yellow-50 text-[10px] ml-1">Med</Badge>;
  return <Badge className="bg-red-600/80 text-red-50 text-[10px] ml-1">Low</Badge>;
};

const ReceiptsPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confidence, setConfidence] = useState<ExtractedData['confidence'] | null>(null);
  const [form, setForm] = useState<ReceiptForm>({ vendor: '', date: '', currency: 'PHP', total: '', category: '', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // History list - expenses with image_url (scanned receipts)
  const { data: receipts = [] } = useQuery({
    queryKey: ['scanned-receipts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .not('image_url', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const processImage = async (file: Blob) => {
    setProcessing(true);
    setShowForm(false);
    setEditingId(null);
    setConfidence(null);

    try {
      const ext = 'jpg';
      const path = `scans/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      setImageUrl(publicUrl);

      const { data: fnData, error: fnError } = await supabase.functions.invoke('scan-receipt', {
        body: { imageUrl: publicUrl },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      const extracted = fnData as ExtractedData;
      setForm({
        vendor: extracted.vendor || '',
        date: extracted.date || format(new Date(), 'yyyy-MM-dd'),
        currency: extracted.currency || 'PHP',
        total: String(extracted.total || ''),
        category: '',
        notes: '',
      });
      setConfidence(extracted.confidence || null);
      setShowForm(true);
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(err.message || 'Failed to scan receipt');
      setImageUrl(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCameraCapture = async (blob: Blob) => {
    setShowCamera(false);
    await processImage(blob);
  };

  const handleDiscard = () => {
    setShowForm(false);
    setImageUrl(null);
    setConfidence(null);
    setEditingId(null);
    setForm({ vendor: '', date: '', currency: 'PHP', total: '', category: '', notes: '' });
  };

  const handleSave = async () => {
    if (!form.vendor.trim() || !form.total) {
      toast.error('Vendor and total are required');
      return;
    }

    const now = new Date();
    const ppStart = isSunday(now) ? startOfDay(now) : previousSunday(now);
    const ppEnd = nextSaturday(now);

    const payload: any = {
      vendor: form.vendor.trim(),
      expense_date: form.date || format(now, 'yyyy-MM-dd'),
      amount: parseFloat(form.total) || 0,
      currency: form.currency || 'PHP',
      category: form.category || null,
      notes: form.notes || null,
      status: 'pending_review',
      pay_period_start: format(ppStart, 'yyyy-MM-dd'),
      pay_period_end: format(ppEnd, 'yyyy-MM-dd'),
    };

    if (confidence) {
      payload.ai_confidence = confidence;
    }

    try {
      if (editingId) {
        await supabase.from('expenses').update(payload).eq('id', editingId);
        await supabase.from('expense_history').insert({
          expense_id: editingId,
          action: 'updated',
          user_name: 'Receipt Scanner',
        });
        toast.success('Receipt updated');
      } else {
        payload.image_url = imageUrl;
        const { data: inserted } = await supabase.from('expenses').insert(payload).select('id').single();
        if (inserted) {
          await supabase.from('expense_history').insert({
            expense_id: inserted.id,
            action: 'created',
            user_name: 'Receipt Scanner',
          });
        }
        toast.success('Receipt saved');
      }

      handleDiscard();
      qc.invalidateQueries({ queryKey: ['scanned-receipts'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const openReceipt = (receipt: any) => {
    setEditingId(receipt.id);
    setImageUrl(receipt.image_url);
    setForm({
      vendor: receipt.vendor || '',
      date: receipt.expense_date || '',
      currency: receipt.currency || 'PHP',
      total: String(receipt.amount || ''),
      category: receipt.category || '',
      notes: receipt.notes || '',
    });
    setConfidence(receipt.ai_confidence || null);
    setShowForm(true);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending_review': return 'bg-yellow-600/80 text-yellow-50';
      case 'approved': return 'bg-green-600/80 text-green-50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl tracking-wider text-foreground">Receipt Scanner</h1>
        </div>

        {/* Live Camera Viewfinder */}
        {showCamera && (
          <CameraViewfinder
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        {/* Capture Options */}
        {!showForm && !processing && (
          <div className="mb-8 space-y-3">
            {/* Hidden file input for upload */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCapture}
            />

            {/* Camera button - large and prominent */}
            <Button
              onClick={() => setShowCamera(true)}
              className="w-full h-20 text-lg font-display tracking-wider gap-4 relative overflow-hidden"
              size="lg"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent pointer-events-none" />
              <div className="flex flex-col items-center gap-1.5 relative z-10">
                <div className="flex items-center gap-3">
                  <Camera className="w-7 h-7" />
                  <span>Scan Receipt</span>
                </div>
                <span className="text-xs font-body opacity-70 tracking-normal">Opens camera to scan a receipt</span>
              </div>
            </Button>

            {/* Upload button - secondary */}
            <Button
              onClick={() => fileRef.current?.click()}
              variant="outline"
              className="w-full h-14 font-display tracking-wider gap-3 border-border hover:border-accent/50"
              size="lg"
            >
              <Upload className="w-5 h-5" />
              Upload from Files
            </Button>

            {/* Helper text */}
            <p className="text-center font-body text-xs text-muted-foreground">
              <ScanLine className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              AI will automatically extract receipt details
            </p>
          </div>
        )}

        {/* Processing State */}
        {processing && imageUrl && (
          <div className="mb-8 relative rounded-lg overflow-hidden">
            <img src={imageUrl} alt="Receipt" className="w-full max-h-64 object-contain bg-secondary rounded-lg" />
            <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <span className="font-body text-sm text-foreground">Extracting data…</span>
            </div>
          </div>
        )}

        {/* Review Form */}
        {showForm && (
          <Card className="mb-8 bg-card border-border">
            <CardContent className="p-4 space-y-4">
              {/* Image preview */}
              {imageUrl && (
                <div className="rounded-lg overflow-hidden bg-secondary">
                  <img src={imageUrl} alt="Receipt" className="w-full max-h-48 object-contain" />
                </div>
              )}

              {/* Form fields */}
              <div className="space-y-3">
                <div>
                  <label className="font-body text-xs text-cream-dim flex items-center">
                    Vendor {confidence && <ConfidenceBadge score={confidence.vendor} />}
                  </label>
                  <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                    className="bg-secondary border-border text-foreground font-body mt-1" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-body text-xs text-cream-dim flex items-center">
                      Date {confidence && <ConfidenceBadge score={confidence.date} />}
                    </label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      className="bg-secondary border-border text-foreground font-body mt-1" />
                  </div>
                  <div>
                    <label className="font-body text-xs text-cream-dim flex items-center">
                      Currency {confidence && <ConfidenceBadge score={confidence.currency} />}
                    </label>
                    <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      className="bg-secondary border-border text-foreground font-body mt-1" />
                  </div>
                </div>

                <div>
                  <label className="font-body text-xs text-cream-dim flex items-center">
                    Total Amount {confidence && <ConfidenceBadge score={confidence.total} />}
                  </label>
                  <Input type="number" step="0.01" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))}
                    className="bg-secondary border-border text-foreground font-body mt-1" placeholder="0.00" />
                </div>

                <div>
                  <label className="font-body text-xs text-cream-dim">Category</label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="font-body text-xs text-cream-dim">Notes</label>
                  <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="bg-secondary border-border text-foreground font-body mt-1" rows={2} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={handleSave} className="flex-1 font-display tracking-wider gap-2">
                  <Check className="w-4 h-4" /> Save
                </Button>
                <Button onClick={handleDiscard} variant="outline" className="flex-1 font-display tracking-wider gap-2">
                  <X className="w-4 h-4" /> Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History List */}
        <div>
          <h2 className="font-display text-sm tracking-wider text-foreground mb-3">Scanned Receipts</h2>
          {receipts.length === 0 && (
            <p className="font-body text-sm text-cream-dim text-center py-8">No scanned receipts yet</p>
          )}
          <div className="space-y-2">
            {receipts.map((r: any) => (
              <Card
                key={r.id}
                className="bg-card border-border cursor-pointer hover:border-accent/50 transition-colors"
                onClick={() => openReceipt(r)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-foreground truncate">{r.vendor || 'Unknown vendor'}</p>
                    <p className="font-body text-xs text-cream-dim">
                      {r.expense_date ? format(new Date(r.expense_date), 'MMM d, yyyy') : 'No date'}
                      {r.amount ? ` · ${r.currency || 'PHP'} ${Number(r.amount).toFixed(2)}` : ''}
                    </p>
                  </div>
                  <Badge className={`${statusColor(r.status)} text-[10px] shrink-0 ml-2`}>
                    {r.status === 'pending_review' ? 'Pending' : r.status === 'approved' ? 'Approved' : r.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptsPage;
