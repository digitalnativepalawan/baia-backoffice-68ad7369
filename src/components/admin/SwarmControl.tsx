import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function SwarmControl() {
  const [status, setStatus] = useState<'idle' | 'running'>('idle');

  const startSwarm = () => {
    setStatus('running');
    // Later we will connect to your local swarm service here
    alert("Swarm started! (This is just a placeholder for now)");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl tracking-wider">Agent Swarm Control</h1>
        <Badge variant={status === 'running' ? 'default' : 'secondary'}>
          {status === 'running' ? '🟢 Running' : '⚪ Idle'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Swarm Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={startSwarm} size="lg" className="font-display tracking-wider">
            Start Agent Swarm
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Agents will soon be able to work on orders, bookings, inventory, guest requests, etc.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
