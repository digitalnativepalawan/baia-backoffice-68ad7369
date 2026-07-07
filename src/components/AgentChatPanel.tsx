import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession } from '@/lib/session';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUBAGENTS = [
  { value: 'operations-overview', label: 'Operations Overview' },
  { value: 'guest-services', label: 'Guest Services' },
  { value: 'reservations', label: 'Reservations' },
  { value: 'food-beverage', label: 'Food & Beverage' },
  { value: 'housekeeping', label: 'Housekeeping' },
];

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [subagent, setSubagent] = useState('operations-overview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const userMessage = input.trim();
    if (!userMessage || loading) return;

    const staff = getStaffSession();
    if (!staff) {
      setMessages(current => [...current, {
        role: 'assistant',
        content: 'Your staff session has expired. Please sign in again.',
        timestamp: new Date(),
      }]);
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content: userMessage, timestamp: new Date() }];
    setInput('');
    setMessages(nextMessages);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('hermes-chat', {
        body: {
          mode: 'admin-panel',
          approvedSubagent: subagent,
          context: {
            employeeId: staff.employeeId,
            name: staff.name,
          },
          messages: nextMessages.slice(-12).map(({ role, content }) => ({ role, content })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error.message || 'Hermes request failed');
      if (!data?.reply) throw new Error('Hermes returned no response');

      setMessages(current => [...current, {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hermes is unavailable';
      setMessages(current => [...current, {
        role: 'assistant',
        content: `BAIA could not connect to Hermes: ${message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-50 h-12 rounded-full px-4 shadow-lg bg-primary hover:bg-primary/90 md:bottom-6 md:right-6"
          aria-label="Open BAIA operations assistant"
        >
          <MessageSquare className="w-5 h-5 mr-2" />
          BAIA
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md h-[min(680px,85vh)] flex flex-col p-0 gap-0 bg-card border-border">
          <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="font-display text-sm tracking-wider text-foreground">
                BAIA Operations Assistant
              </DialogTitle>
              <p className="font-body text-[11px] text-muted-foreground mt-1">Read-only assistance through OpenRouter · anthropic/claude-3.5-haiku</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <div className="px-4 py-3 border-b border-border">
            <Select value={subagent} onValueChange={setSubagent} disabled={loading}>
              <SelectTrigger className="bg-secondary border-border font-body text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBAGENTS.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground font-body text-sm gap-2 py-12">
                <MessageSquare className="w-10 h-10 opacity-40" />
                <p>Ask about resort operations using the selected approved subagent.</p>
                <p className="text-xs opacity-60">BAIA starts read-only and will not change resort data.</p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 font-body text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary border border-border text-foreground'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-[10px] mt-1 opacity-70">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> BAIA is thinking…
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-4 py-3 border-t border-border flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value.slice(0, 4000))}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) sendMessage(); }}
              placeholder="Ask BAIA…"
              className="font-body bg-secondary border-border text-foreground"
              disabled={loading}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()} className="px-3" aria-label="Send message">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
