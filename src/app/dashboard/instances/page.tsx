'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Smartphone, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { useToast } from '../../../components/ui/use-toast';
import { useAuthToken } from '../../../hooks/useClientStorage';
import { InstanceStatus } from '@prisma/client';

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
  _count: {
    messageLogs: number;
    bots: number;
  };
  tenant: {
    name: string;
    plan: string;
  };
}

const statusConfig = {
  CREATED: { label: 'Created', color: 'bg-gray-500', icon: AlertCircle },
  CONNECTING: { label: 'Connecting', color: 'bg-yellow-500', icon: RefreshCw },
  CONNECTED: { label: 'Connected', color: 'bg-green-500', icon: Wifi },
  DISCONNECTED: { label: 'Disconnected', color: 'bg-red-500', icon: WifiOff },
  ERROR: { label: 'Error', color: 'bg-red-600', icon: AlertCircle },
};

function InstancesContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InstanceStatus | 'ALL'>('ALL');

  useEffect(() => {
    if (isClient && token) {
      fetchInstances();
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

  const fetchInstances = async () => {
    try {
      const response = await fetch('/api/instances', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch instances');
      }

      const data = await response.json();
      setInstances(data.data || []);
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch instances',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (instanceId: string) => {
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

      toast({
        title: 'Success',
        description: 'Instance connection initiated',
      });

      // Refresh instances
      fetchInstances();
    } catch (error) {
      console.error('Error connecting instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect instance',
        variant: 'destructive',
      });
    }
  };

  const handleRestart = async (instanceId: string) => {
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

      // Refresh instances
      fetchInstances();
    } catch (error) {
      console.error('Error restarting instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to restart instance',
        variant: 'destructive',
      });
    }
  };

  const handleLogout = async (instanceId: string) => {
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

      // Refresh instances
      fetchInstances();
    } catch (error) {
      console.error('Error logging out instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to logout instance',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (instanceId: string) => {
    if (!confirm('Are you sure you want to delete this instance? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/instances/${instanceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete instance');
      }

      toast({
        title: 'Success',
        description: 'Instance deleted successfully',
      });

      // Refresh instances
      fetchInstances();
    } catch (error) {
      console.error('Error deleting instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete instance',
        variant: 'destructive',
      });
    }
  };

  const filteredInstances = instances.filter(instance => {
    const matchesSearch = instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         instance.phoneNumber?.includes(searchTerm) ||
                         instance.evolutionInstanceId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || instance.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Instances</h1>
          <p className="text-muted-foreground">
            Manage your WhatsApp instances and connections
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/instances/create')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Instance
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Instances</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected</CardTitle>
            <Wifi className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {instances.filter(i => i.status === 'CONNECTED').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connecting</CardTitle>
            <RefreshCw className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {instances.filter(i => i.status === 'CONNECTING').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {instances.reduce((sum, i) => sum + i._count.messageLogs, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search instances..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Status: {statusFilter === 'ALL' ? 'All' : statusConfig[statusFilter as InstanceStatus]?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setStatusFilter('ALL')}>
              All Statuses
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {Object.entries(statusConfig).map(([status, config]) => (
              <DropdownMenuItem
                key={status}
                onClick={() => setStatusFilter(status as InstanceStatus)}
              >
                <config.icon className="w-4 h-4 mr-2" />
                {config.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Instances Table */}
      <Card>
        <CardHeader>
          <CardTitle>Instances</CardTitle>
          <CardDescription>
            A list of all your WhatsApp instances and their current status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Bots</TableHead>
                <TableHead>Last Connected</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <Smartphone className="w-8 h-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No instances found</p>
                      <Button
                        variant="outline"
                        onClick={() => router.push('/dashboard/instances/create')}
                      >
                        Create your first instance
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInstances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <span>{instance.name}</span>
                        {!instance.isActive && (
                          <Badge variant="secondary" className="bg-gray-500 text-white">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {instance.phoneNumber || (
                        <span className="text-muted-foreground">Not connected</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(instance.status)}</TableCell>
                    <TableCell>{instance._count.messageLogs}</TableCell>
                    <TableCell>{instance._count.bots}</TableCell>
                    <TableCell>
                      {instance.lastConnectedAt ? (
                        formatDate(instance.lastConnectedAt)
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(instance.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => router.push(`/dashboard/instances/${instance.id}`)}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {instance.status === 'DISCONNECTED' && (
                            <DropdownMenuItem onClick={() => handleConnect(instance.id)}>
                              Connect
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleRestart(instance.id)}>
                            Restart
                          </DropdownMenuItem>
                          {instance.status === 'CONNECTED' && (
                            <DropdownMenuItem onClick={() => handleLogout(instance.id)}>
                              Logout
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(instance.id)}
                            className="text-red-600"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InstancesPage() {
  return (
    <Suspense>
      <InstancesContent />
    </Suspense>
  );
}