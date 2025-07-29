'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Smartphone, Wifi, WifiOff, AlertCircle, RefreshCw, QrCode, Copy, ExternalLink } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { useToast } from '../../../../components/ui/use-toast';
import { InstanceStatus } from '@prisma/client';
import Image from 'next/image';
import { useAuthToken } from '../../../../hooks/useClientStorage';

interface Instance {
  id: string;
  name: string;
  evolutionInstanceId: string;
  phoneNumber: string | null;
  status: InstanceStatus;
  webhookUrl: string | null;
  isActive: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  settings: any;
  _count: {
    messageLogs: number;
    bots: number;
  };
  tenant: {
    name: string;
    plan: string;
  };
}

interface ConnectionInfo {
  status: InstanceStatus;
  phoneNumber?: string;
  lastConnectedAt?: string;
  qrCode?: {
    base64: string;
    code: string;
    expiresAt: string;
  };
}

const statusConfig = {
  CREATED: { label: 'Created', color: 'bg-gray-500', icon: AlertCircle },
  CONNECTING: { label: 'Connecting', color: 'bg-yellow-500', icon: RefreshCw },
  CONNECTED: { label: 'Connected', color: 'bg-green-500', icon: Wifi },
  DISCONNECTED: { label: 'Disconnected', color: 'bg-red-500', icon: WifiOff },
  ERROR: { label: 'Error', color: 'bg-red-600', icon: AlertCircle },
};

export default function InstanceDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const instanceId = params.id as string;

  useEffect(() => {
    if (instanceId && isClient && token) {
      fetchInstance();
      fetchConnectionInfo();
    }
  }, [instanceId, isClient, token]);

  const fetchInstance = async () => {
    try {
      const response = await fetch(`/api/instances/${instanceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch instance');
      }

      const data = await response.json();
      setInstance(data.data);
    } catch (error) {
      console.error('Error fetching instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch instance details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectionInfo = async () => {
    try {
      const response = await fetch(`/api/instances/${instanceId}/connection`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch connection info');
      }

      const data = await response.json();
      setConnectionInfo(data.data);
    } catch (error) {
      console.error('Error fetching connection info:', error);
    }
  };

  const handleConnect = async () => {
    setActionLoading('connect');
    try {
      const response = await fetch(`/api/instances/${instanceId}/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to connect instance');
      }

      const data = await response.json();
      setConnectionInfo(data.data);

      toast({
        title: 'Success',
        description: 'Instance connection initiated',
      });

      // Refresh instance data
      fetchInstance();
    } catch (error) {
      console.error('Error connecting instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect instance',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading('restart');
    try {
      const response = await fetch(`/api/instances/${instanceId}/restart`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to restart instance');
      }

      toast({
        title: 'Success',
        description: 'Instance restarted successfully',
      });

      // Refresh data
      fetchInstance();
      fetchConnectionInfo();
    } catch (error) {
      console.error('Error restarting instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to restart instance',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    setActionLoading('logout');
    try {
      const response = await fetch(`/api/instances/${instanceId}/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to logout instance');
      }

      toast({
        title: 'Success',
        description: 'Instance logged out successfully',
      });

      // Refresh data
      fetchInstance();
      fetchConnectionInfo();
    } catch (error) {
      console.error('Error logging out instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to logout instance',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshQR = async () => {
    setActionLoading('refresh-qr');
    try {
      const response = await fetch(`/api/instances/${instanceId}/qr-refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh QR code');
      }

      const data = await response.json();
      if (data.data) {
        setConnectionInfo(prev => prev ? {
          ...prev,
          qrCode: data.data,
        } : null);

        toast({
          title: 'Success',
          description: 'QR code refreshed',
        });
      }
    } catch (error) {
      console.error('Error refreshing QR code:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh QR code',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  const getStatusBadge = (status: InstanceStatus) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    
    return (
      <Badge variant="secondary" className={`${config.color} text-white`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
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

  // Show loading state until client is ready
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Instance not found</h3>
          <p className="text-muted-foreground">The requested instance could not be found.</p>
        </div>
        <Button onClick={() => router.push('/dashboard/instances')}>
          Back to Instances
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{instance.name}</h1>
            <p className="text-muted-foreground">
              Instance ID: {instance.evolutionInstanceId}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusBadge(instance.status)}
          {!instance.isActive && (
            <Badge variant="secondary" className="bg-gray-500 text-white">
              Inactive
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Smartphone className="w-5 h-5" />
              <span>Connection Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              {getStatusBadge(connectionInfo?.status || instance.status)}
            </div>
            
            {connectionInfo?.phoneNumber && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Phone Number</span>
                <span className="text-sm">{connectionInfo.phoneNumber}</span>
              </div>
            )}

            {instance.lastConnectedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Connected</span>
                <span className="text-sm">{formatDate(instance.lastConnectedAt)}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Created</span>
              <span className="text-sm">{formatDate(instance.createdAt)}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-4">
              {instance.status === 'DISCONNECTED' && (
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={actionLoading === 'connect'}
                >
                  {actionLoading === 'connect' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  Connect
                </Button>
              )}
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleRestart}
                disabled={actionLoading === 'restart'}
              >
                {actionLoading === 'restart' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Restart
              </Button>

              {instance.status === 'CONNECTED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLogout}
                  disabled={actionLoading === 'logout'}
                >
                  {actionLoading === 'logout' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  Logout
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        {(instance.status === 'CONNECTING' || instance.status === 'CREATED') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <QrCode className="w-5 h-5" />
                <span>QR Code</span>
              </CardTitle>
              <CardDescription>
                Scan this QR code with WhatsApp to connect your instance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectionInfo?.qrCode ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-lg border">
                      <Image
                        src={connectionInfo.qrCode.base64}
                        alt="QR Code"
                        width={200}
                        height={200}
                        className="w-48 h-48"
                      />
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      QR Code expires at: {formatDate(connectionInfo.qrCode.expiresAt)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefreshQR}
                      disabled={actionLoading === 'refresh-qr'}
                    >
                      {actionLoading === 'refresh-qr' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                      Refresh QR Code
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <QrCode className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No QR code available</p>
                  <Button
                    size="sm"
                    onClick={handleConnect}
                    disabled={actionLoading === 'connect'}
                  >
                    {actionLoading === 'connect' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    Generate QR Code
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Messages</span>
              <span className="text-sm font-bold">{instance._count.messageLogs}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Bots</span>
              <span className="text-sm font-bold">{instance._count.bots}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Plan</span>
              <Badge variant="outline">{instance.tenant.plan}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {instance.webhookUrl && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Webhook URL</span>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 px-2 py-1 text-xs bg-muted rounded">
                    {instance.webhookUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(instance.webhookUrl!)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(instance.webhookUrl!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {instance.settings && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Settings</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(instance.settings).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={typeof value === 'boolean' ? (value ? 'text-green-600' : 'text-red-600') : ''}>
                        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}