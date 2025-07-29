'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Bot, Settings, Play, Pause, Trash2, BarChart3, MessageSquare, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuthToken } from '@/hooks/useClientStorage';

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

export default function BotsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    type?: 'TYPEBOT' | 'OPENAI';
    isActive?: boolean;
  }>({});

  useEffect(() => {
    if (isClient && token) {
      fetchBots();
    }
  }, [isClient, token, filter]);

  // Show loading state until client is ready
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const fetchBots = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.type) params.append('type', filter.type);
      if (filter.isActive !== undefined) params.append('isActive', filter.isActive.toString());

      const response = await fetch(`/api/v1/bots?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bots');
      }

      const data: BotsResponse = await response.json();
      setBots(data.data.bots);
    } catch (error) {
      console.error('Error fetching bots:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch bots. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleBotStatus = async (botId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/v1/bots/${botId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          isActive: !currentStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update bot status');
      }

      toast({
        title: 'Success',
        description: `Bot ${!currentStatus ? 'enabled' : 'disabled'} successfully.`,
      });

      fetchBots(); // Refresh the list
    } catch (error) {
      console.error('Error updating bot status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bot status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const deleteBot = async (botId: string, botName: string) => {
    if (!confirm(`Are you sure you want to delete the bot "${botName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/bots/${botId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete bot');
      }

      toast({
        title: 'Success',
        description: 'Bot deleted successfully.',
      });

      fetchBots(); // Refresh the list
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete bot. Please try again.',
        variant: 'destructive',
      });
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

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getBotTypeColor = (type: string) => {
    switch (type) {
      case 'TYPEBOT':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'OPENAI':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getInstanceStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'CONNECTING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'DISCONNECTED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Bot Management</h1>
            <p className="text-muted-foreground">Manage your AI bots and automation</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Bot Management</h1>
          <p className="text-muted-foreground">Manage your AI bots and automation</p>
        </div>
        <Button onClick={() => router.push('/dashboard/bots/create')} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Bot
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bots.length}</div>
            <p className="text-xs text-muted-foreground">
              {bots.filter(bot => bot.isActive).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bots.reduce((sum, bot) => sum + (bot.stats?.activeSessions || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all bots
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bots.reduce((sum, bot) => sum + (bot.stats?.totalMessages || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bots.length > 0 
                ? formatResponseTime(
                    bots.reduce((sum, bot) => sum + (bot.stats?.avgResponseTime || 0), 0) / bots.length
                  )
                : '0ms'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Average across all bots
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={filter.type === undefined ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter({ ...filter, type: undefined })}
        >
          All Types
        </Button>
        <Button
          variant={filter.type === 'TYPEBOT' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter({ ...filter, type: 'TYPEBOT' })}
        >
          Typebot
        </Button>
        <Button
          variant={filter.type === 'OPENAI' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter({ ...filter, type: 'OPENAI' })}
        >
          OpenAI
        </Button>
        <div className="ml-4 border-l pl-4">
          <Button
            variant={filter.isActive === undefined ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter({ ...filter, isActive: undefined })}
          >
            All Status
          </Button>
          <Button
            variant={filter.isActive === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter({ ...filter, isActive: true })}
          >
            Active
          </Button>
          <Button
            variant={filter.isActive === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter({ ...filter, isActive: false })}
          >
            Inactive
          </Button>
        </div>
      </div>

      {/* Bots Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Bots</CardTitle>
          <CardDescription>
            Manage and monitor your AI bots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No bots found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first AI bot
              </p>
              <Button onClick={() => router.push('/dashboard/bots/create')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Bot
              </Button>
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
                  <TableHead>Response Time</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Actions</TableHead>
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
                      <Badge className={getBotTypeColor(bot.type)}>
                        {bot.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{bot.instance.name}</span>
                        <Badge className={getInstanceStatusColor(bot.instance.status)} variant="outline">
                          {bot.instance.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                        {bot.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{bot.stats?.totalSessions || 0} total</span>
                        <span className="text-sm text-muted-foreground">
                          {bot.stats?.activeSessions || 0} active
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{bot.stats?.totalMessages || 0}</TableCell>
                    <TableCell>
                      {bot.stats?.avgResponseTime 
                        ? formatResponseTime(bot.stats.avgResponseTime)
                        : 'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      {bot.stats?.lastActivity 
                        ? formatDate(bot.stats.lastActivity)
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/bots/${bot.id}`)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/bots/${bot.id}/analytics`)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleBotStatus(bot.id, bot.isActive)}
                        >
                          {bot.isActive ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBot(bot.id, bot.name)}
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