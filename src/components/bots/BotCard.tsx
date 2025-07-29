'use client';

import { Bot, Settings, Play, Pause, Trash2, BarChart3, Zap, Brain } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

interface BotCardProps {
  bot: Bot;
  onEdit: (botId: string) => void;
  onAnalytics: (botId: string) => void;
  onToggleStatus: (botId: string, currentStatus: boolean) => void;
  onDelete: (botId: string, botName: string) => void;
}

export function BotCard({ bot, onEdit, onAnalytics, onToggleStatus, onDelete }: BotCardProps) {
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

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {getBotTypeIcon(bot.type)}
            <div>
              <CardTitle className="text-lg">{bot.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge className={getBotTypeColor(bot.type)} variant="secondary">
                  {bot.type}
                </Badge>
                <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                  {bot.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"

              onClick={() => onEdit(bot.id)}
              title="Edit bot"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"

              onClick={() => onAnalytics(bot.id)}
              title="View analytics"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"

              onClick={() => onToggleStatus(bot.id, bot.isActive)}
              title={bot.isActive ? 'Disable bot' : 'Enable bot'}
            >
              {bot.isActive ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"

              onClick={() => onDelete(bot.id, bot.name)}
              title="Delete bot"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Instance Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Instance:</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{bot.instance.name}</span>
              <Badge className={getInstanceStatusColor(bot.instance.status)} variant="outline">
                {bot.instance.status}
              </Badge>
            </div>
          </div>

          {bot.instance.phoneNumber && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Phone:</span>
              <span className="font-mono">{bot.instance.phoneNumber}</span>
            </div>
          )}

          {/* Stats */}
          {bot.stats && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold">{bot.stats.totalSessions}</div>
                <div className="text-xs text-muted-foreground">Sessions</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{bot.stats.totalMessages}</div>
                <div className="text-xs text-muted-foreground">Messages</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {formatResponseTime(bot.stats.avgResponseTime)}
                </div>
                <div className="text-xs text-muted-foreground">Avg Response</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {(bot.stats.successRate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
            </div>
          )}

          {/* Last Activity */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>Created: {formatDate(bot.createdAt)}</span>
            {bot.stats?.lastActivity && (
              <span>Last active: {formatDate(bot.stats.lastActivity)}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}