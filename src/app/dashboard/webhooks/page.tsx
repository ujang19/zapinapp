'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuthToken } from '@/hooks/useClientStorage';
import { 
  Plus, 
  Settings, 
  Trash2, 
  TestTube, 
  Activity, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  EyeOff,
  Copy,
  RefreshCw
} from 'lucide-react';

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
  createdAt: string;
  updatedAt: string;
}

interface WebhookEvent {
  id: string;
  eventType: string;
  instance: string;
  success: boolean;
  timestamp: string;
  error?: string;
}

interface WebhookStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  successRate: number;
  eventsByType: Record<string, number>;
}

const WEBHOOK_EVENT_TYPES = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_SET',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONTACTS_SET',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'PRESENCE_UPDATE',
  'CHATS_SET',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
  'CHATS_DELETE',
  'GROUPS_UPSERT',
  'GROUP_UPDATE',
  'GROUP_PARTICIPANTS_UPDATE',
  'TYPEBOT_START',
  'TYPEBOT_CHANGE_STATUS',
  'OPENAI_START',
  'OPENAI_CHANGE_STATUS',
  'CALL'
];

export default function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<WebhookConfig | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();

  // Form state
  const [formData, setFormData] = useState({
    url: '',
    events: [] as string[],
    secret: '',
    isActive: true,
    retryAttempts: 3,
    retryDelay: 5000,
    timeout: 30000,
    headers: '{}'
  });

  useEffect(() => {
    if (isClient && token) {
      loadWebhookData();
    }
  }, [isClient, token]);

  // Show loading state until client is ready
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const loadWebhookData = async () => {
    try {
      setLoading(true);
      
      // Load webhook configurations
      const configsResponse = await fetch('/api/webhook/configs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (configsResponse.ok) {
        const configsData = await configsResponse.json();
        setConfigs(configsData.data || []);
      }

      // Load webhook statistics
      const statsResponse = await fetch('/api/webhook/stats?period=24h', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.data);
      }

      // Load recent events
      const eventsResponse = await fetch('/api/webhook/events?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        setEvents(eventsData.data || []);
      }

    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load webhook data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConfig = async () => {
    try {
      const response = await fetch('/api/webhook/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          headers: formData.headers ? JSON.parse(formData.headers) : {}
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Webhook configuration created successfully'
        });
        setShowCreateForm(false);
        resetForm();
        loadWebhookData();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error?.message || 'Failed to create webhook configuration',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create webhook configuration',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateConfig = async (configId: string, updates: Partial<WebhookConfig>) => {
    try {
      const response = await fetch(`/api/webhook/configs/${configId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Webhook configuration updated successfully'
        });
        loadWebhookData();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error?.message || 'Failed to update webhook configuration',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update webhook configuration',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this webhook configuration?')) {
      return;
    }

    try {
      const response = await fetch(`/api/webhook/configs/${configId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Webhook configuration deleted successfully'
        });
        loadWebhookData();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error?.message || 'Failed to delete webhook configuration',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete webhook configuration',
        variant: 'destructive'
      });
    }
  };

  const handleTestConfig = async (configId: string) => {
    try {
      const response = await fetch(`/api/webhook/configs/${configId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: result.data.success ? 'Test Successful' : 'Test Failed',
          description: result.data.success 
            ? `Response: ${result.data.status} ${result.data.statusText}` 
            : `Error: ${result.data.error}`,
          variant: result.data.success ? 'default' : 'destructive'
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error?.message || 'Failed to test webhook',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to test webhook',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      url: '',
      events: [],
      secret: '',
      isActive: true,
      retryAttempts: 3,
      retryDelay: 5000,
      timeout: 30000,
      headers: '{}'
    });
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/webhook/evolution`;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: 'Copied',
      description: 'Webhook URL copied to clipboard'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">
            Manage webhook configurations and monitor real-time events
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyWebhookUrl}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Webhook URL
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Webhook
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Successful</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.successfulEvents.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.failedEvents.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Webhook Configurations */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configurations</CardTitle>
          <CardDescription>
            Configure webhook endpoints to receive real-time events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No webhook configurations found</p>
              <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Webhook
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {configs.map((config) => (
                <div key={config.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={config.isActive ? 'default' : 'secondary'}>
                        {config.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="font-medium">{config.url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConfig(config.id)}
                      >
                        <TestTube className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedConfig(config)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteConfig(config.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Events: {config.events.join(', ')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Retry: {config.retryAttempts} attempts, {config.retryDelay}ms delay, {config.timeout}ms timeout
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>
            Latest webhook events processed by the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No recent events found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Instance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.eventType}</TableCell>
                    <TableCell>{event.instance}</TableCell>
                    <TableCell>
                      <Badge variant={event.success ? 'default' : 'destructive'}>
                        {event.success ? 'Success' : 'Failed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-red-600">
                      {event.error || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Webhook Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Create Webhook Configuration</CardTitle>
              <CardDescription>
                Configure a new webhook endpoint to receive events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="url">Webhook URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://your-domain.com/webhook"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>

              <div>
                <Label>Events to Subscribe</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto">
                  {WEBHOOK_EVENT_TYPES.map((eventType) => (
                    <label key={eventType} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(eventType)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              events: [...formData.events, eventType]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              events: formData.events.filter(event => event !== eventType)
                            });
                          }
                        }}
                      />
                      <span className="text-sm">{eventType}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="secret">Secret (Optional)</Label>
                <div className="relative">
                  <Input
                    id="secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Webhook signature secret"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="retryAttempts">Retry Attempts</Label>
                  <Input
                    id="retryAttempts"
                    type="number"
                    min="0"
                    max="10"
                    value={formData.retryAttempts}
                    onChange={(e) => setFormData({ ...formData, retryAttempts: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="retryDelay">Retry Delay (ms)</Label>
                  <Input
                    id="retryDelay"
                    type="number"
                    min="1000"
                    value={formData.retryDelay}
                    onChange={(e) => setFormData({ ...formData, retryDelay: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min="1000"
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="headers">Custom Headers (JSON)</Label>
                <Textarea
                  id="headers"
                  placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'
                  value={formData.headers}
                  onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateConfig}>
                  Create Webhook
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}