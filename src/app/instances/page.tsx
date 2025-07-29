'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Smartphone, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useToast } from '../../components/ui/use-toast';
import { useAuthToken } from '../../hooks/useClientStorage';
import { InstanceStatus } from '@prisma/client';
import { SharedLayout } from '../../components/layout/SharedLayout';

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
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InstanceStatus | 'ALL'>('ALL');
  const router = useRouter();
  const { toast } = useToast();
  const { token } = useAuthToken();

  const fetchInstances = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/instances', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch instances');
      }

      const data = await response.json();
      setInstances(data.instances || []);
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

  useEffect(() => {
    if (token) {
      fetchInstances();
    }
  }, [token]);

  const filteredInstances = instances.filter(instance => {
    const matchesSearch = instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         instance.evolutionInstanceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (instance.phoneNumber && instance.phoneNumber.includes(searchTerm));
    const matchesStatus = statusFilter === 'ALL' || instance.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateInstance = () => {
    router.push('/instances/create');
  };

  const handleViewInstance = (instanceId: string) => {
    router.push(`/instances/${instanceId}`);
  };

  const handleDeleteInstance = async (instanceId: string) => {
    if (!confirm('Are you sure you want to delete this instance?')) {
      return;
    }

    try {
      const response = await fetch(`/api/instances/${instanceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete instance');
      }

      toast({
        title: 'Success',
        description: 'Instance deleted successfully',
      });

      // Refresh the instances list
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Instances</h1>
          <p className="text-muted-foreground">
            Manage your WhatsApp instances and their connections
          </p>
        </div>
        <Button onClick={handleCreateInstance} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
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
            <CardTitle className="text-sm font-medium">Disconnected</CardTitle>
            <WifiOff className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {instances.filter(i => i.status === 'DISCONNECTED').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bots</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {instances.reduce((total, instance) => total + instance._count.bots, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search instances..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Status: {statusFilter === 'ALL' ? 'All' : statusConfig[statusFilter as InstanceStatus]?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setStatusFilter('ALL')}>
              All Statuses
            </DropdownMenuItem>
            {Object.entries(statusConfig).map(([status, config]) => (
              <DropdownMenuItem
                key={status}
                onClick={() => setStatusFilter(status as InstanceStatus)}
              >
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
          {filteredInstances.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No instances</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'No instances match your current filters.'
                  : 'Get started by creating your first instance.'}
              </p>
              {!searchTerm && statusFilter === 'ALL' && (
                <div className="mt-6">
                  <Button onClick={handleCreateInstance}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Instance
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Bots</TableHead>
                  <TableHead>Last Connected</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div className="font-semibold">{instance.name}</div>
                        <div className="text-sm text-gray-500">{instance.evolutionInstanceId}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {instance.phoneNumber ? (
                        <span className="font-mono">{instance.phoneNumber}</span>
                      ) : (
                        <span className="text-gray-400">Not connected</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(instance.status)}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{instance._count.messageLogs}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{instance._count.bots}</span>
                    </TableCell>
                    <TableCell>
                      {instance.lastConnectedAt ? (
                        <span className="text-sm">{formatDate(instance.lastConnectedAt)}</span>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-semibold">{instance.tenant.name}</div>
                        <Badge variant="secondary" className="text-xs">
                          {instance.tenant.plan}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleViewInstance(instance.id)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/instances/${instance.id}/edit`)}>
                            Edit instance
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteInstance(instance.id)}
                            className="text-red-600"
                          >
                            Delete instance
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

export default function InstancesPage() {
  return (
    <SharedLayout variant="dashboard">
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      }>
        <InstancesContent />
      </Suspense>
    </SharedLayout>
  );
}