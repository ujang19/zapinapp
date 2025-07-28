'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Bot, Settings, Play, Pause, TestTube, BarChart3, MessageSquare, Clock, Users, Zap, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

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
  config: any;
  createdAt: string;
  updatedAt: string;
  instance: BotInstance;
  stats?: BotStats;
}

interface TestResult {
  success: boolean;
  response?: string;
  error?: string;
}

export default function BotDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (params.id) {
      fetchBot();
    }
  }, [params.id]);

  const fetchBot = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/bots/${params.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bot');
      }

      const data = await response.json();
      setBot(data.data.bot);
      setFormData({
        name: data.data.bot.name,
        isActive: data.data.bot.isActive,
        config: data.data.bot.config,
      });
    } catch (error) {
      console.error('Error fetching bot:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch bot details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/v1/bots/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update bot');
      }

      const data = await response.json();
      setBot(data.data.bot);
      setEditMode(false);
      
      toast({
        title: 'Success',
        description: 'Bot updated successfully.',
      });
    } catch (error) {
      console.error('Error updating bot:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim() || !testPhone.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both test message and phone number.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setTesting(true);
      const response = await fetch(`/api/v1/bots/${params.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: testMessage,
          phoneNumber: testPhone,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to test bot');
      }

      const data = await response.json();
      setTestResult(data.data);
    } catch (error) {
      console.error('Error testing bot:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  const toggleBotStatus = async () => {
    try {
      const response = await fetch(`/api/v1/bots/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          isActive: !bot?.isActive,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update bot status');
      }

      const data = await response.json();
      setBot(data.data.bot);
      
      toast({
        title: 'Success',
        description: `Bot ${!bot?.isActive ? 'enabled' : 'disabled'} successfully.`,
      });
    } catch (error) {
      console.error('Error updating bot status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bot status. Please try again.',
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

  const getBotTypeIcon = (type: string) => {
    switch (type) {
      case 'TYPEBOT':
        return <Zap className="h-5 w-5 text-blue-600" />;
      case 'OPENAI':
        return <Brain className="h-5 w-5 text-green-600" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Bot Not Found</h1>
          <p className="text-muted-foreground mb-4">The bot you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/dashboard/bots')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bots
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/bots')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          {getBotTypeIcon(bot.type)}
          <div>
            <h1 className="text-3xl font-bold">{bot.name}</h1>
            <p className="text-muted-foreground">Bot Configuration & Management</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/bots/${bot.id}/analytics`)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button
            variant={bot.isActive ? 'destructive' : 'default'}
            onClick={toggleBotStatus}
          >
            {bot.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Disable
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Enable
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Bot Configuration</CardTitle>
                <CardDescription>Manage your bot settings and configuration</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <Button variant="outline" onClick={() => setEditMode(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Bot Name</Label>
                  {editMode ? (
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm font-medium mt-1">{bot.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="type">Bot Type</Label>
                  <div className="mt-1">
                    <Badge className={getBotTypeColor(bot.type)}>
                      {bot.type}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="instance">WhatsApp Instance</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-medium">{bot.instance.name}</span>
                  <Badge className={getInstanceStatusColor(bot.instance.status)} variant="outline">
                    {bot.instance.status}
                  </Badge>
                  {bot.instance.phoneNumber && (
                    <span className="text-sm text-muted-foreground">
                      ({bot.instance.phoneNumber})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="active">Bot Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable the bot
                  </p>
                </div>
                {editMode ? (
                  <Switch
                    id="active"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                ) : (
                  <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                    {bot.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                )}
              </div>

              {/* Bot-specific configuration */}
              {bot.type === 'TYPEBOT' && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-semibold">Typebot Configuration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Typebot URL</Label>
                      <p className="text-sm mt-1 break-all">{bot.config.typebotUrl}</p>
                    </div>
                    <div>
                      <Label>Typebot ID</Label>
                      <p className="text-sm mt-1">{bot.config.typebotId}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Trigger Type</Label>
                      <p className="text-sm mt-1 capitalize">{bot.config.triggerType}</p>
                    </div>
                    {bot.config.triggerValue && (
                      <div>
                        <Label>Trigger Keyword</Label>
                        <p className="text-sm mt-1">{bot.config.triggerValue}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {bot.type === 'OPENAI' && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-semibold">OpenAI Configuration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Model</Label>
                      <p className="text-sm mt-1">{bot.config.model}</p>
                    </div>
                    <div>
                      <Label>Max Tokens</Label>
                      <p className="text-sm mt-1">{bot.config.maxTokens || 'Default'}</p>
                    </div>
                  </div>
                  <div>
                    <Label>System Prompt</Label>
                    <p className="text-sm mt-1 p-2 bg-muted rounded-md">
                      {bot.config.systemPrompt}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Temperature</Label>
                      <p className="text-sm mt-1">{bot.config.temperature || 0.7}</p>
                    </div>
                    <div>
                      <Label>Trigger Type</Label>
                      <p className="text-sm mt-1 capitalize">{bot.config.triggerType}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bot Testing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Test Bot
              </CardTitle>
              <CardDescription>
                Send a test message to see how your bot responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="testPhone">Test Phone Number</Label>
                  <Input
                    id="testPhone"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="1234567890"
                  />
                </div>
                <div>
                  <Label htmlFor="testMessage">Test Message</Label>
                  <Input
                    id="testMessage"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Hello, how are you?"
                  />
                </div>
              </div>
              
              <Button onClick={handleTest} disabled={testing || !bot.isActive}>
                {testing ? 'Testing...' : 'Send Test Message'}
              </Button>

              {!bot.isActive && (
                <p className="text-sm text-muted-foreground">
                  Bot must be active to test
                </p>
              )}

              {testResult && (
                <div className={`p-4 rounded-md ${testResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <h4 className={`font-semibold ${testResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
                  </h4>
                  <p className={`text-sm mt-1 ${testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {testResult.success ? testResult.response : testResult.error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Bot Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Total Sessions</span>
                </div>
                <span className="font-semibold">{bot.stats?.totalSessions || 0}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Active Sessions</span>
                </div>
                <span className="font-semibold">{bot.stats?.activeSessions || 0}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Total Messages</span>
                </div>
                <span className="font-semibold">{bot.stats?.totalMessages || 0}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Avg Response</span>
                </div>
                <span className="font-semibold">
                  {bot.stats?.avgResponseTime 
                    ? formatResponseTime(bot.stats.avgResponseTime)
                    : 'N/A'
                  }
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Success Rate</span>
                </div>
                <span className="font-semibold">
                  {bot.stats?.successRate 
                    ? `${(bot.stats.successRate * 100).toFixed(1)}%`
                    : 'N/A'
                  }
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Bot Info */}
          <Card>
            <CardHeader>
              <CardTitle>Bot Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Created</Label>
                <p className="text-sm mt-1">{formatDate(bot.createdAt)}</p>
              </div>
              
              <div>
                <Label>Last Updated</Label>
                <p className="text-sm mt-1">{formatDate(bot.updatedAt)}</p>
              </div>
              
              {bot.stats?.lastActivity && (
                <div>
                  <Label>Last Activity</Label>
                  <p className="text-sm mt-1">{formatDate(bot.stats.lastActivity)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}