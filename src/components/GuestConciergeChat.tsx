import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface GuestContext {
  booking_id: string;
  room_id: string;
  room_name: string;
  guest_name: string;
  check_out: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function GuestConciergeChat({ session, onOpenReception }: {
  session: GuestContext;
  onOpenReception?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

    const nextMessages = [...messages, { role: 'user' as const, content: userMessage, timestamp: new Date() }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('hermes-chat', {
        body: {
          mode: 'guest-concierge',
          context: {
            bookingId: session.booking_id,
            roomId: session.room_id,
            roomName: session.room_name,
            guestName: session.guest_name,
            checkoutDate: session.check_out,
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
        content: `BAIA could not connect to the concierge service: ${message}`,
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
          className="fixed bottom-20 right-4 z-50 h-12 rounded-full px-4 shadow-lg md:bottom-6 md:right-6"
          aria-label="Open BAIA guest concierge"
        >
          <MessageSquare className="w-5 h-5 mr-2" />
          Ask BAIA
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md h-[min(680px,85vh)] flex flex-col p-0 gap-0 bg-card border-border">
          <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="font-display text-sm tracking-wider text-foreground">BAIA Guest Concierge</DialogTitle>
              <p className="font-body text-[11px] text-muted-foreground mt-1">Hermes · qwen2.5:3b</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground font-body text-sm gap-2 py-12">
                <MessageSquare className="w-10 h-10 opacity-40" />
                <p>Hello {session.guest_name.split(' ')[0]}. Ask about BAIA, your stay, resort information, or local recommendations.</p>
                <p className="text-xs opacity-60">For towels, repairs, orders, bookings, or staff action, use Reception.</p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 font-body text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary border border-border text-foreground'
                  }`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
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

          {onOpenReception && (
            <div className="px-4 pt-3">
              <Button variant="outline" className="w-full" onClick={() => { setOpen(false); onOpenReception(); }}>
                Contact Reception
              </Button>
            </div>
          )}

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
