import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Clock, Receipt, Trash2, Check, Download, Upload, RotateCcw, Eye } from 'lucide-react';
import SnapReceiptOCR from './SnapReceiptOCR';
import { format, startOfDay, startOfMonth, previousSunday, nextSaturday, isSunday } from 'date-fns';
import jsPDF from 'jspdf';

type SubView = 'list' | 'form';
type DateFilter = 'period' | 'month' | 'all';
type Expense = {
  id: string; status: string; image_url: string | null; pdf_url: string | null;
  vendor: string | null; expense_date: string | null; amount: number;
  vat_type: string | null; tin: string | null; tax_amount: number;
  category: string | null; notes: string | null; created_by: string | null;
  created_at: string; reviewed_by: string | null; reviewed_at: string | null;
  pay_period_start: string | null; pay_period_end: string | null; deleted_at: string | null;
};
type HistoryEntry = {
  id: string; expense_id: string; action: string; user_name: string | null;
  field: string | null; old_value: string | null; new_value: string | null; created_at: string;
};

const CATEGORIES = ['Food & Beverage', 'Supplies', 'Maintenance', 'Utilities', 'Transport', 'Other'];

const ExpensesDashboard = () => {
  const qc = useQueryClient();
  const [subView, setSubView] = useState<SubView>('list');
  const [dateFilter, setDateFilter] = useState<DateFilter>('period');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [form, setForm] = useState({
    vendor: '', expense_date: format(new Date(), 'yyyy-MM-dd'), amount: '',
    vat_type: '', tin: '', tax_amount: '', category: 'Supplies',
    notes: '', created_by: localStorage.getItem('expense_created_by') || '',
    image_url: '',
  });

  const now = new Date();
  const payPeriodStart = isSunday(now) ? startOfDay(now) : previousSunday(now);
  const payPeriodEnd = nextSaturday(now);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
      return (data || []) as Expense[];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ['expense-history', selectedExpense?.id],
    enabled: !!selectedExpense,
    queryFn: async () => {
      if (!selectedExpense) return [];
      const { data } = await supabase.from('expense_history').select('*')
        .eq('expense_id', selectedExpense.id).order('created_at', { ascending: false });
      return (data || []) as HistoryEntry[];
    },
  });

  const filtered = useMemo(() => {
    let list = expenses;
    if (!showDeleted) list = list.filter(e => e.status !== 'deleted');
    else list = list.filter(e => e.status === 'deleted');

    if (dateFilter === 'period') {
      const ps = format(payPeriodStart, 'yyyy-MM-dd');
      const pe = format(payPeriodEnd, 'yyyy-MM-dd');
      list = list.filter(e => e.pay_period_start === ps && e.pay_period_end === pe);
    } else if (dateFilter === 'month') {
      const ms = format(startOfMonth(now), 'yyyy-MM-dd');
      list = list.filter(e => e.expense_date && e.expense_date >= ms);
    }
    return list;
  }, [expenses, dateFilter, showDeleted, payPeriodStart, payPeriodEnd, now]);

  const pending = filtered.filter(e => e.status === 'pending_review');
  const approved = filtered.filter(e => e.status === 'approved');
  const drafts = filtered.filter(e => e.status === 'draft');
  const deleted = filtered.filter(e => e.status === 'deleted');

  const totalApproved = approved.reduce((s, e) => s + Number(e.amount || 0), 0);

  const resetForm = () => {
    setForm({
      vendor: '', expense_date: format(new Date(), 'yyyy-MM-dd'), amount: '',
      vat_type: '', tin: '', tax_amount: '', category: 'Supplies',
      notes: '', created_by: localStorage.getItem('expense_created_by') || '',
      image_url: '',
    });
    setSelectedExpense(null);
    setConfirmDelete(false);
  };

  const openNew = () => { resetForm(); setSubView('form'); };

  const openEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setForm({
      vendor: expense.vendor || '', expense_date: expense.expense_date || format(new Date(), 'yyyy-MM-dd'),
      amount: String(expense.amount || ''), vat_type: expense.vat_type || '',
      tin: expense.tin || '', tax_amount: String(expense.tax_amount || ''),
      category: expense.category || 'Supplies', notes: expense.notes || '',
      created_by: expense.created_by || localStorage.getItem('expense_created_by') || '',
      image_url: expense.image_url || '',
    });
    setSubView('form');
    qc.invalidateQueries({ queryKey: ['expense-history', expense.id] });
  };

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `receipts/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
      toast.success('Receipt uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const recordHistory = async (expenseId: string, action: string, field?: string, oldVal?: string, newVal?: string) => {
    await supabase.from('expense_history').insert({
      expense_id: expenseId, action, user_name: form.created_by || 'Admin',
      field: field || null, old_value: oldVal || null, new_value: newVal || null,
    });
  };

  const trackChanges = async (expenseId: string, old: Expense) => {
    const fields: { key: keyof typeof form; label: string }[] = [
      { key: 'vendor', label: 'vendor' }, { key: 'amount', label: 'amount' },
      { key: 'expense_date', label: 'expense_date' }, { key: 'vat_type', label: 'vat_type' },
      { key: 'tin', label: 'tin' }, { key: 'tax_amount', label: 'tax_amount' },
      { key: 'category', label: 'category' }, { key: 'notes', label: 'notes' },
    ];
    for (const f of fields) {
      const oldV = String(old[f.key as keyof Expense] ?? '');
      const newV = String(form[f.key] ?? '');
      if (oldV !== newV) {
        await recordHistory(expenseId, 'updated', f.label, oldV, newV);
      }
    }
  };

  const saveExpense = async (status: 'draft' | 'pending_review' | 'approved') => {
    if (form.created_by) localStorage.setItem('expense_created_by', form.created_by);

    const ps = format(payPeriodStart, 'yyyy-MM-dd');
    const pe = format(payPeriodEnd, 'yyyy-MM-dd');
    const payload = {
      vendor: form.vendor, expense_date: form.expense_date || null,
      amount: parseFloat(form.amount) || 0, vat_type: form.vat_type,
      tin: form.tin, tax_amount: parseFloat(form.tax_amount) || 0,
      category: form.category, notes: form.notes, created_by: form.created_by,
      image_url: form.image_url || null, status,
      pay_period_start: ps, pay_period_end: pe,
      ...(status === 'approved' ? { reviewed_by: form.created_by, reviewed_at: new Date().toISOString() } : {}),
    };

    if (selectedExpense) {
      await trackChanges(selectedExpense.id, selectedExpense);
      if (status !== selectedExpense.status) {
        await recordHistory(selectedExpense.id, status === 'approved' ? 'approved' : 'updated', 'status', selectedExpense.status, status);
      }
      await supabase.from('expenses').update(payload).eq('id', selectedExpense.id);

      if (status === 'approved') await generatePdf(selectedExpense.id, payload);
    } else {
      const { data } = await supabase.from('expenses').insert(payload).select().single();
      if (data) {
        await recordHistory(data.id, 'created');
        if (status === 'approved') await generatePdf(data.id, payload);
      }
    }

    qc.invalidateQueries({ queryKey: ['expenses'] });
    toast.success(status === 'approved' ? 'Expense approved' : status === 'pending_review' ? 'Submitted for review' : 'Draft saved');
    resetForm();
    setSubView('list');
  };

  const deleteExpense = async () => {
    if (!selectedExpense) return;
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
    await supabase.from('expenses').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', selectedExpense.id);
    await recordHistory(selectedExpense.id, 'deleted');
    qc.invalidateQueries({ queryKey: ['expenses'] });
    toast.success('Expense deleted');
    resetForm();
    setSubView('list');
  };

  const restoreExpense = async (id: string) => {
    await supabase.from('expenses').update({ status: 'draft', deleted_at: null }).eq('id', id);
    await supabase.from('expense_history').insert({
      expense_id: id, action: 'restored', user_name: 'Admin',
    });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    toast.success('Expense restored');
  };

  const generatePdf = async (expenseId: string, data: any) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Expense Receipt', 14, 22);
      doc.setFontSize(10);
      let y = 35;
      const lines = [
        ['Vendor', data.vendor || ''], ['Date', data.expense_date || ''],
        ['Amount', `₱${Number(data.amount || 0).toFixed(2)}`],
        ['VAT Type', data.vat_type || ''], ['TIN', data.tin || ''],
        ['Tax Amount', `₱${Number(data.tax_amount || 0).toFixed(2)}`],
        ['Category', data.category || ''], ['Notes', data.notes || ''],
        ['Created By', data.created_by || ''], ['Status', data.status || 'approved'],
        ['Reviewed By', data.reviewed_by || ''],
      ];
      lines.forEach(([label, val]) => {
        doc.text(`${label}: ${val}`, 14, y);
        y += 7;
      });

      const pdfBlob = doc.output('blob');
      const pdfPath = `pdfs/${expenseId}.pdf`;
      await supabase.storage.from('receipts').upload(pdfPath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(pdfPath);
      await supabase.from('expenses').update({ pdf_url: urlData.publicUrl }).eq('id', expenseId);
    } catch (e) {
      console.error('PDF generation failed', e);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-muted text-muted-foreground',
      pending_review: 'bg-yellow-500/20 text-yellow-300',
      approved: 'bg-green-500/20 text-green-300',
      deleted: 'bg-destructive/20 text-destructive',
    };
    return <Badge className={`text-xs font-body ${map[status] || ''}`}>{status.replace('_', ' ')}</Badge>;
  };

  // ── LIST VIEW ──
  if (subView === 'list') {
    return (
      <div className="space-y-4">
        {/* Pay Period Banner */}
        <div className="border border-primary/30 bg-primary/5 rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-display text-xs tracking-wider text-foreground">
              Pay Period: {format(payPeriodStart, 'EEE, MMM d')} – {format(payPeriodEnd, 'EEE, MMM d')}
            </span>
          </div>
          <Badge variant="outline" className="text-xs font-body">Payday: Saturday</Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-4 bg-secondary/50">
            <p className="font-body text-xs text-muted-foreground">Total Approved</p>
            <p className="font-display text-lg text-foreground">₱{totalApproved.toFixed(2)}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-secondary/50">
            <p className="font-body text-xs text-muted-foreground">Pending Review</p>
            <p className="font-display text-lg text-foreground">{pending.length}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[140px] bg-secondary border-border text-foreground font-body text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="period">Pay Period</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openNew} className="font-display text-xs tracking-wider gap-1 ml-auto">
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        {/* Show Deleted toggle */}
        <div className="flex items-center gap-2">
          <Switch checked={showDeleted} onCheckedChange={setShowDeleted} />
          <span className="font-body text-xs text-muted-foreground">Show Deleted</span>
        </div>

        {/* Deleted */}
        {showDeleted && deleted.length > 0 && (
          <section>
            <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2">Deleted</h3>
            {deleted.map(e => (
              <div key={e.id} className="border border-border rounded-lg p-3 mb-2 bg-secondary/30 opacity-60">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-body text-sm text-foreground">{e.vendor || 'No vendor'}</p>
                    <p className="font-body text-xs text-muted-foreground">{e.expense_date} · ₱{Number(e.amount).toFixed(2)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restoreExpense(e.id)} className="font-display text-xs gap-1">
                    <RotateCcw className="w-3 h-3" /> Restore
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Pending Review */}
        {!showDeleted && pending.length > 0 && (
          <section>
            <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2">Pending Review ({pending.length})</h3>
            {pending.map(e => (
              <div key={e.id} onClick={() => openEdit(e)}
                className="border border-border rounded-lg p-3 mb-2 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm text-foreground truncate">{e.vendor || 'No vendor'}</p>
                    <p className="font-body text-xs text-muted-foreground">{e.expense_date} · ₱{Number(e.amount).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.category && <Badge variant="outline" className="text-xs font-body">{e.category}</Badge>}
                    {statusBadge(e.status)}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Drafts */}
        {!showDeleted && drafts.length > 0 && (
          <section>
            <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2">Drafts ({drafts.length})</h3>
            {drafts.map(e => (
              <div key={e.id} onClick={() => openEdit(e)}
                className="border border-border rounded-lg p-3 mb-2 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm text-foreground truncate">{e.vendor || 'No vendor'}</p>
                    <p className="font-body text-xs text-muted-foreground">{e.expense_date} · ₱{Number(e.amount).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.category && <Badge variant="outline" className="text-xs font-body">{e.category}</Badge>}
                    {statusBadge(e.status)}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Approved */}
        {!showDeleted && approved.length > 0 && (
          <section>
            <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2">Approved ({approved.length})</h3>
            {approved.map(e => (
              <div key={e.id} onClick={() => openEdit(e)}
                className="border border-border rounded-lg p-3 mb-2 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm text-foreground truncate">{e.vendor || 'No vendor'}</p>
                    <p className="font-body text-xs text-muted-foreground">{e.expense_date} · ₱{Number(e.amount).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.category && <Badge variant="outline" className="text-xs font-body">{e.category}</Badge>}
                    {statusBadge(e.status)}
                    {e.pdf_url && (
                      <a href={e.pdf_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}>
                        <Download className="w-4 h-4 text-primary" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {!showDeleted && pending.length === 0 && approved.length === 0 && drafts.length === 0 && (
          <p className="font-body text-sm text-muted-foreground text-center py-8">No expenses yet. Tap "+ New" to add one.</p>
        )}
      </div>
    );
  }

  // ── FORM VIEW ──
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => { resetForm(); setSubView('list'); }}
        className="font-display text-xs tracking-wider gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to list
      </Button>

      <div className="md:grid md:grid-cols-2 md:gap-6">
        {/* Image side */}
        <div className="mb-4 md:mb-0">
          {form.image_url ? (
            <div className="relative">
              <img src={form.image_url} alt="Receipt" className="w-full rounded-lg border border-border max-h-[400px] object-contain bg-secondary" />
              <Button size="sm" variant="outline" className="absolute top-2 right-2 font-body text-xs"
                onClick={() => setForm(f => ({ ...f, image_url: '' }))}>Change</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/30 transition-colors min-h-[160px]">
                {uploading ? (
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="font-body text-sm text-muted-foreground">Upload Receipt</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadReceipt(file);
                }} />
              </label>
              <SnapReceiptOCR onExtracted={({ total, date, vendor, vatAmount, tin, vatType }) => {
                setForm(f => ({
                  ...f,
                  amount: total || f.amount,
                  expense_date: date || f.expense_date,
                  vendor: vendor || f.vendor,
                  tax_amount: vatAmount || f.tax_amount,
                  tin: tin || f.tin,
                  vat_type: vatType || f.vat_type,
                }));
              }} />
            </div>
          )}
        </div>

        {/* Form side */}
        <div className="space-y-3">
          <div>
            <label className="font-body text-xs text-muted-foreground">Vendor</label>
            <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="Vendor name" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Expense Date</label>
            <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Amount (₱)</label>
            <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="0.00" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">VAT Type</label>
            <Input value={form.vat_type} onChange={e => setForm(f => ({ ...f, vat_type: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="e.g. Vatable, VAT Exempt, Zero Rated" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">TIN</label>
            <Input value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="Tax ID Number" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Tax Amount (₱)</label>
            <Input type="number" step="0.01" value={form.tax_amount} onChange={e => setForm(f => ({ ...f, tax_amount: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="0.00" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Category</label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" rows={2} placeholder="Optional notes" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Created By</label>
            <Input value={form.created_by} onChange={e => setForm(f => ({ ...f, created_by: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body mt-1" placeholder="Your name" />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => saveExpense('draft')}
          className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Save Draft</Button>
        <Button variant="secondary" size="sm" onClick={() => saveExpense('pending_review')}
          className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Submit for Review</Button>
        <Button size="sm" onClick={() => saveExpense('approved')}
          className="font-display text-xs tracking-wider flex-1 min-h-[44px] gap-1">
          <Check className="w-3.5 h-3.5" /> Approve
        </Button>
      </div>

      {selectedExpense && (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={deleteExpense}
            className="font-display text-xs tracking-wider flex-1 min-h-[44px]">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </Button>
          {selectedExpense.pdf_url && (
            <a href={selectedExpense.pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" size="sm" className="font-display text-xs tracking-wider w-full min-h-[44px] gap-1">
                <Download className="w-3.5 h-3.5" /> Download PDF
              </Button>
            </a>
          )}
        </div>
      )}

      {/* Edit History */}
      {selectedExpense && history.length > 0 && (
        <section>
          <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2">Edit History</h3>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="border border-border rounded px-3 py-2 bg-secondary/20 text-xs font-body text-muted-foreground">
                <span className="text-foreground">{h.action}</span>
                {h.field && <> · <span>{h.field}</span>: <span className="line-through">{h.old_value}</span> → <span className="text-foreground">{h.new_value}</span></>}
                <span className="block text-[10px]">{h.user_name} · {format(new Date(h.created_at), 'MMM d, h:mm a')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ExpensesDashboard;
