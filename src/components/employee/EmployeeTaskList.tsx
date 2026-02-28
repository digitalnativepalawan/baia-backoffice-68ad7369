import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Check, Pencil, Trash2, X, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { sendMessengerMessage } from '@/lib/messenger';
import { useResortProfile } from '@/hooks/useResortProfile';

interface Props {
  employeeId?: string; // filter to one employee (portal) or all (admin)
  createdBy?: 'admin' | 'employee';
  employees?: { id: string; name: string; messenger_link?: string; active?: boolean; display_name?: string }[];
}

const EmployeeTaskList = ({ employeeId, createdBy = 'admin', employees = [] }: Props) => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState(employeeId || '');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDue, setEditDue] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const { data: tasks = [] } = useQuery({
    queryKey: ['employee-tasks', employeeId],
    queryFn: async () => {
      let q = (supabase.from('employee_tasks' as any) as any).select('*').order('created_at', { ascending: false });
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const addTask = async () => {
    const targetId = employeeId || assignee;
    if (!title.trim() || !targetId) return;
    await (supabase.from('employee_tasks' as any) as any).insert({
      employee_id: targetId,
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      created_by: createdBy,
    });
    setTitle(''); setDescription(''); setDueDate(''); setShowForm(false);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task added');
  };

  const toggleComplete = async (task: any) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await (supabase.from('employee_tasks' as any) as any).update({
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
  };

  const saveEdit = async () => {
    if (!editId || !editTitle.trim()) return;
    await (supabase.from('employee_tasks' as any) as any).update({
      title: editTitle.trim(),
      description: editDesc.trim(),
      due_date: editDue ? new Date(editDue).toISOString() : null,
    }).eq('id', editId);
    setEditId(null);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task updated');
  };

  const deleteTask = async (id: string) => {
    await (supabase.from('employee_tasks' as any) as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task deleted');
  };

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name || '';

  return (
    <div className="space-y-3">
      {/* Filter + Add */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'pending', 'completed'] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)} className="font-body text-xs flex-1 capitalize">{f}</Button>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}
        className="font-display text-xs tracking-wider gap-1 w-full">
        <Plus className="w-3.5 h-3.5" /> Add Task
      </Button>

      {showForm && (
        <div className="border border-primary/30 rounded-lg p-3 space-y-2">
          {!employeeId && employees.length > 0 && (
            <select value={assignee} onChange={e => setAssignee(e.target.value)}
              className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
              <option value="">Assign to...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title"
            className="bg-secondary border-border text-foreground font-body text-sm" />
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            className="bg-secondary border-border text-foreground font-body text-sm" />
          <div>
            <label className="font-body text-xs text-muted-foreground">Due date & time</label>
            <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="bg-secondary border-border text-foreground font-body text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTask} className="font-display text-xs tracking-wider flex-1"
              disabled={!title.trim() || (!employeeId && !assignee)}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 && <p className="font-body text-xs text-muted-foreground text-center py-4">No tasks</p>}

      {filtered.map(task => (
        <div key={task.id} className={`border rounded-lg p-3 space-y-1 ${task.status === 'completed' ? 'border-border/50 opacity-60' : 'border-border'}`}>
          {editId === task.id ? (
            <div className="space-y-2">
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-secondary border-border text-foreground font-body text-sm" />
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="bg-secondary border-border text-foreground font-body text-sm" />
              <Input type="datetime-local" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-secondary border-border text-foreground font-body text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} className="font-display text-xs tracking-wider flex-1">Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {!employeeId && <p className="font-body text-xs text-primary">{getEmployeeName(task.employee_id)}</p>}
                  <p className={`font-body text-sm text-foreground ${task.status === 'completed' ? 'line-through' : ''}`}>{task.title}</p>
                  {task.description && <p className="font-body text-xs text-muted-foreground">{task.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleComplete(task)}>
                    <Check className={`w-3.5 h-3.5 ${task.status === 'completed' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => {
                    setEditId(task.id); setEditTitle(task.title); setEditDesc(task.description || '');
                    setEditDue(task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : '');
                  }}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteTask(task.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                    title="Send via Messenger"
                    disabled={(() => { const emp = employees.find(e => e.id === task.employee_id); return !emp?.messenger_link || emp?.active === false; })()}
                    onClick={() => {
                      const emp = employees.find(e => e.id === task.employee_id);
                      if (emp) sendMessengerMessage(
                        { name: emp.name, display_name: emp.display_name, messenger_link: emp.messenger_link || '', active: emp.active !== false },
                        `Task: ${task.title}${task.description ? '\n' + task.description : ''}`,
                        resortProfile?.resort_name || 'Resort'
                      );
                    }}>
                    <MessageCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {task.due_date && (
                  <span className="font-body text-xs text-muted-foreground">
                    Due: {format(new Date(task.due_date), 'MMM d, h:mm a')}
                  </span>
                )}
                <Badge variant={task.status === 'completed' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}
                  className="font-body text-xs capitalize">{task.status}</Badge>
                <Badge variant="outline" className="font-body text-xs">{task.created_by}</Badge>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default EmployeeTaskList;
