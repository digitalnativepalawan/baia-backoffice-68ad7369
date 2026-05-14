
import { useState, useRef, useEffect } from 'react';
import { getStaffSession } from '@/lib/session';
import { Bot, Send, X, MessageSquare, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

interface StaffSession {
  employeeId: string;
  name: string;
  isAdmin: boolean;
  permissions: string[];
  expiresAt: number;
}

export function HermesAdminPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const session = getStaffSession() as StaffSession | null;
      if (!session || !session.isAdmin) {
        throw new Error('Admin access required');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');
      const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
      const endpoint = `https://${projectRef}.functions.supabase.co/hermes-chat`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          role: 'admin',
          staffSession: {
            employeeId: session.employeeId,
            name: session.name,
            isAdmin: session.isAdmin,
            permissions: session.permissions
          },
          context: {} // Edge Function will auto-fill stats
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to get response');
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const reply = data.reply;
      if (reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      } else {
        throw new Error('Empty response from assistant');
      }
    } catch (error: any) {
      console.error('Hermes admin chat error:', error);
      toast.error(error.message || 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestions = [
    "Show new orders",
    "Any low stock items?",
    "Today's revenue",
    "Who's on housekeeping?",
    "Send alert to kitchen: rush order #123"
  ];

  const session = getStaffSession();
  if (!session || !session.isAdmin) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
          aria-label="Open Hermes Admin Assistant"
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {open && (
        <Card className="fixed bottom-6 left-6 z-50 w-[90vw] max-w-md h-[70vh] flex flex-col shadow-2xl border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <div className="flex items-center gap-3">
              <Avatar className="w-8 h-8 bg-primary/10">
                <AvatarFallback className="text-primary"><Bot className="w-5 h-5" /></AvatarFallback>
              </Avatar>
              <div>
                <p className="font-body text-sm font-medium text-foreground">Hermes Ops Assistant</p>
                <p className="font-body text-xs text-muted-foreground">Admin: {session.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMessages([])}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="font-body text-sm text-muted-foreground">
                    Hi, {session.name}. I'm here to help with operations. Ask me anything:
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(suggestion)}
                        className="text-xs font-body text-primary hover:underline"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                    <p className="font-body text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-lg p-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border bg-card">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about operations, orders, inventory..."
                disabled={loading}
                className="flex-1"
              />
              <Button size="icon" onClick={sendMessage} disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
