'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Bot, Settings, Play, Pause, Trash2, BarChart3, MessageSquare, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuthToken } from '@/hooks/useClientStorage';
import { SharedLayout } from '@/components/layout/SharedLayout';

interface BotStats {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  avgResponseTime: number;
  successRate: number;
  lastActivity: string | null;
}

interface BotInstance {
  id: string;
  name: string;
  status: string;
  phoneNumber: string | null;
}

interface Bot {
  id: string;
  name: string;
  type: 'TYPEBOT' | 'OPENAI';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  instance: BotInstance;
  stats?: BotStats;
}

interface BotsResponse {
  success: boolean;
  data: {
    bots: Bot[];
    total: number;
    limit: number;
    offset: number;
  };
}

function BotsContent() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { token } = useAuthToken();

  const fetchBots = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/bots', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: BotsResponse = await response.json();
      
      if (result.success) {
        setBots(result.data.bots);
      } else {
        throw new Error('Failed to fetch bots');
      }
    } catch (error) {
      console.error('Error fetching bots:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
      toast({
        title: 'Error',
        description: 'Failed to fetch bots',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBots();
    }
  }, [token]);

  const handleCreateBot = () => {
    router.push('/bots/create');
  };

  const handleEditBot = (botId: string) => {
    router.push(`/bots/${botId}`);
  };

  const handleToggleBotStatus = async (botId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/bots/${botId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle bot status');
      }

      toast({
        title: 'Success',
        description: `Bot ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
      });

      // Refresh the bots list
      fetchBots();
    } catch (error) {
      console.error('Error toggling bot status:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle bot status',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to delete this bot?')) {
      return;
    }

    try {
      const response = await fetch(`/api/bots/${botId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete bot');
      }

      toast({
        title: 'Success',
        description: 'Bot deleted successfully',
      });

      // Refresh the bots list
      fetchBots();
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete bot',
        variant: 'destructive',
      });
    }
  };

  const getBotTypeColor = (type: string) => {
    switch (type) {
      case 'TYPEBOT':
        return 'bg-blue-500';
      case 'OPENAI':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">Error: {error}</div>
        <Button onClick={fetchBots}>Retry</Button>
      </div>
    );
  }

  const activeBots = bots.filter(bot => bot.isActive).length;
  const totalSessions = bots.reduce((sum, bot) => sum + (bot.stats?.totalSessions || 0), 0);
  const totalMessages = bots.reduce((sum, bot) => sum + (bot.stats?.totalMessages || 0), 0);
  const avgResponseTime = bots.length > 0 
    ? bots.reduce((sum, bot) => sum + (bot.stats?.avgResponseTime || 0), 0) / bots.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bots</h1>
          <p className="text-muted-foreground">
            Manage your chatbots and automation workflows
          </p>
        </div>
        <Button onClick={handleCreateBot} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Bot
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bots.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeBots} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgResponseTime.toFixed(1)}s</div>
          </CardContent>
        </Card>
      </div>

      {/* Bots Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Bots</CardTitle>
          <CardDescription>
            A list of all your chatbots and their current status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No bots</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first bot.
              </p>
              <div className="mt-6">
                <Button onClick={handleCreateBot}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Bot
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Instance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((bot) => (
                  <TableRow key={bot.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        {bot.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${getBotTypeColor(bot.type)} text-white`}>
                        {bot.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-semibold">{bot.instance.name}</div>
                        {bot.instance.phoneNumber && (
                          <div className="text-sm text-gray-500 font-mono">
                            {bot.instance.phoneNumber}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                        {bot.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-semibold">
                          {bot.stats?.totalSessions || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                          {bot.stats?.activeSessions || 0} active
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">
                        {bot.stats?.totalMessages || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{formatDate(bot.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => handleToggleBotStatus(bot.id, bot.isActive)}
                        >
                          {bot.isActive ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => handleEditBot(bot.id)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => router.push(`/bots/${bot.id}/analytics`)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteBot(bot.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BotsPage() {
  return (
    <SharedLayout variant="main">
      <BotsContent />
    </SharedLayout>
  );
}