'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, BarChart3, Users, MessageSquare, Clock, TrendingUp, Activity, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuthToken } from '@/hooks/useClientStorage';

interface BotAnalytics {
  period: '24h' | '7d' | '30d';
  sessions: {
    total: number;
    active: number;
    completed: number;
    abandoned: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
  };
  performance: {
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
  };
  trends: Array<{
    date: string;
    sessions: number;
    messages: number;
    responseTime: number;
  }>;
  topUsers: Array<{
    phoneNumber: string;
    sessionCount: number;
    messageCount: number;
    lastActivity: string;
  }>;
}

interface Bot {
  id: string;
  name: string;
  type: 'TYPEBOT' | 'OPENAI';
  isActive: boolean;
}

export default function BotAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();
  const [bot, setBot] = useState<Bot | null>(null);
  const [analytics, setAnalytics] = useState<BotAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');

  useEffect(() => {
    if (params.id && isClient && token) {
      fetchBot();
      fetchAnalytics();
    }
  }, [params.id, period, isClient, token]);

  const fetchBot = async () => {
    try {
      const response = await fetch(`/api/v1/bots/${params.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bot');
      }

      const data = await response.json();
      setBot(data.data.bot);
    } catch (error) {
      console.error('Error fetching bot:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch bot details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/bots/${params.id}/analytics?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data.data.analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch analytics. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
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

  const formatPhoneNumber = (phone: string) => {
    // Format phone number for display (mask middle digits)
    if (phone.length > 6) {
      return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
    }
    return phone;
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case '24h':
        return 'Last 24 Hours';
      case '7d':
        return 'Last 7 Days';
      case '30d':
        return 'Last 30 Days';
      default:
        return period;
    }
  };

  // Show loading state until client is ready
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (loading && !analytics) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!bot || !analytics) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Analytics Not Available</h1>
          <p className="text-muted-foreground mb-4">Unable to load bot analytics.</p>
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
        <Button variant="ghost" onClick={() => router.push(`/dashboard/bots/${bot.id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{bot.name} Analytics</h1>
          <p className="text-muted-foreground">Bot performance and usage statistics</p>
        </div>
        <div className="ml-auto">
          <div className="flex items-center gap-2">
            <Button
              variant={period === '24h' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('24h')}
            >
              24h
            </Button>
            <Button
              variant={period === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('7d')}
            >
              7d
            </Button>
            <Button
              variant={period === '30d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('30d')}
            >
              30d
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.sessions.total}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.sessions.active} active, {analytics.sessions.completed} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.messages.total}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.messages.inbound} in, {analytics.messages.outbound} out
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
              {formatResponseTime(analytics.performance.avgResponseTime)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average response time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(analytics.performance.successRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {(analytics.performance.errorRate * 100).toFixed(1)}% error rate
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Session Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Session Breakdown
            </CardTitle>
            <CardDescription>
              Session status distribution for {getPeriodLabel(period)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Completed</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{analytics.sessions.completed}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({analytics.sessions.total > 0 
                      ? ((analytics.sessions.completed / analytics.sessions.total) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-sm">Active</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{analytics.sessions.active}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({analytics.sessions.total > 0 
                      ? ((analytics.sessions.active / analytics.sessions.total) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm">Abandoned</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{analytics.sessions.abandoned}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({analytics.sessions.total > 0 
                      ? ((analytics.sessions.abandoned / analytics.sessions.total) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
            <CardDescription>
              Bot performance indicators for {getPeriodLabel(period)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Average Response Time</span>
                <span className="font-semibold">
                  {formatResponseTime(analytics.performance.avgResponseTime)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Success Rate</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {(analytics.performance.successRate * 100).toFixed(1)}%
                  </span>
                  <Badge variant="outline" className="text-green-600">
                    Good
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Error Rate</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {(analytics.performance.errorRate * 100).toFixed(1)}%
                  </span>
                  <Badge 
                    variant="outline" 
                    className={analytics.performance.errorRate < 0.05 ? "text-green-600" : "text-yellow-600"}
                  >
                    {analytics.performance.errorRate < 0.05 ? 'Low' : 'Medium'}
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Messages per Session</span>
                <span className="font-semibold">
                  {analytics.sessions.total > 0 
                    ? (analytics.messages.total / analytics.sessions.total).toFixed(1)
                    : '0'
                  }
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trends Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Activity Trends
          </CardTitle>
          <CardDescription>
            Daily activity trends for {getPeriodLabel(period)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.trends.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Avg Response Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.trends.map((trend, index) => (
                    <TableRow key={index}>
                      <TableCell>{formatDate(trend.date)}</TableCell>
                      <TableCell>{trend.sessions}</TableCell>
                      <TableCell>{trend.messages}</TableCell>
                      <TableCell>{formatResponseTime(trend.responseTime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No trend data available for this period</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Users
          </CardTitle>
          <CardDescription>
            Most active users for {getPeriodLabel(period)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.topUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topUsers.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">
                      {formatPhoneNumber(user.phoneNumber)}
                    </TableCell>
                    <TableCell>{user.sessionCount}</TableCell>
                    <TableCell>{user.messageCount}</TableCell>
                    <TableCell>{formatDateTime(user.lastActivity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No User Activity</h3>
              <p className="text-muted-foreground">
                No user interactions recorded for this period
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}