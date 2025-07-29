'use client';

import { useAuth } from '../../hooks/useAuth';
import { Card, Grid, Metric, Text, Title, ProgressBar, Flex, Badge, List, ListItem } from '@tremor/react';
import { MessageSquare, Bot, Users, BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    {
      title: 'Active Instances',
      value: '3',
      description: 'WhatsApp instances running',
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Active Bots',
      value: '5',
      description: 'Automated bots deployed',
      icon: Bot,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Team Members',
      value: '2',
      description: 'Users in your organization',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Messages Today',
      value: '1,234',
      description: 'Messages sent today',
      icon: BarChart3,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Overview of your WhatsApp business operations
        </p>
      </div>

      {/* Stats Grid */}
      <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="max-w-xs">
            <Flex alignItems="start">
              <div className="truncate">
                <Text>{stat.title}</Text>
                <Metric className="truncate">{stat.value}</Metric>
              </div>
              <div className={`p-2 rounded-full ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </Flex>
            <Text className="mt-1">{stat.description}</Text>
          </Card>
        ))}
      </Grid>

      {/* Recent Activity */}
      <Grid numItems={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Recent Messages</Title>
          <Text className="mt-2">
            Latest messages from your WhatsApp instances
          </Text>
          <List className="mt-4">
            <ListItem>
              <Flex justifyContent="start" className="space-x-3">
                <Badge color="green" size="xs" />
                <div className="flex-1">
                  <Text className="font-medium">Customer inquiry received</Text>
                  <Text className="text-xs text-gray-500">Instance: Business Main • 2 min ago</Text>
                </div>
              </Flex>
            </ListItem>
            <ListItem>
              <Flex justifyContent="start" className="space-x-3">
                <Badge color="blue" size="xs" />
                <div className="flex-1">
                  <Text className="font-medium">Bot response sent</Text>
                  <Text className="text-xs text-gray-500">Bot: Support Assistant • 5 min ago</Text>
                </div>
              </Flex>
            </ListItem>
            <ListItem>
              <Flex justifyContent="start" className="space-x-3">
                <Badge color="orange" size="xs" />
                <div className="flex-1">
                  <Text className="font-medium">Broadcast message delivered</Text>
                  <Text className="text-xs text-gray-500">Campaign: Weekly Newsletter • 1 hour ago</Text>
                </div>
              </Flex>
            </ListItem>
          </List>
        </Card>

        <Card>
          <Title>Quick Actions</Title>
          <Text className="mt-2">
            Common tasks to get you started
          </Text>
          <div className="space-y-3 mt-4">
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <Text className="font-medium">Create New Instance</Text>
              <Text className="text-xs text-gray-500">Set up a new WhatsApp business account</Text>
            </button>
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <Text className="font-medium">Deploy Bot</Text>
              <Text className="text-xs text-gray-500">Add automated responses to your instances</Text>
            </button>
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <Text className="font-medium">Generate API Key</Text>
              <Text className="text-xs text-gray-500">Create keys for external integrations</Text>
            </button>
          </div>
        </Card>
      </Grid>

      {/* Plan Information */}
      <Card>
        <Title>Current Plan</Title>
        <Text className="mt-2">
          Your subscription details and usage
        </Text>
        <Flex className="mt-4" justifyContent="between">
          <div>
            <Title className="text-lg">Business Plan</Title>
            <Text className="text-gray-600">
              User: {user?.name} • Role: {user?.role || 'User'}
            </Text>
          </div>
          <div className="text-right">
            <Text className="text-sm text-gray-500">Monthly Usage</Text>
            <Metric>1,234 / 10,000</Metric>
            <Text className="text-xs text-gray-500">messages sent</Text>
          </div>
        </Flex>
        <div className="mt-4">
          <Flex className="mt-2">
            <Text>Usage Progress</Text>
            <Text>12.34%</Text>
          </Flex>
          <ProgressBar value={12.34} className="mt-2" />
          <Text className="text-xs text-gray-500 mt-1">12.34% of monthly quota used</Text>
        </div>
      </Card>
    </div>
  );
}