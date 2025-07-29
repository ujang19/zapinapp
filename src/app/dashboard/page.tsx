'use client';

import { useAuth } from '@/hooks/useAuth';
import {
  Grid,
  Metric,
  Text,
  Title,
  ProgressBar,
  Flex,
  List,
  ListItem,
  AreaChart,
  BarChart,
  DonutChart,
  Button,
} from '@tremor/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MessageSquare, 
  Bot, 
  Users, 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Zap,
  CheckCircle,
  Send,
  Settings,
  Eye,
  Clock
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    {
      title: 'Active Instances',
      value: '3',
      change: '+2',
      changeType: 'increase',
      description: 'WhatsApp instances running',
      icon: MessageSquare,
      color: 'blue'
    },
    {
      title: 'Active Bots',
      value: '5',
      change: '+1',
      changeType: 'increase',
      description: 'Automated bots deployed',
      icon: Bot,
      color: 'emerald'
    },
    {
      title: 'Team Members',
      value: '2',
      change: '0',
      changeType: 'neutral',
      description: 'Users in your organization',
      icon: Users,
      color: 'violet'
    },
    {
      title: 'Messages Today',
      value: '1,234',
      change: '+15%',
      changeType: 'increase',
      description: 'Messages sent today',
      icon: MessageSquare,
      color: 'blue'
    }
  ];

  const messageData = [
    { date: 'Jan 1', Messages: 400, Responses: 240 },
    { date: 'Jan 2', Messages: 300, Responses: 139 },
    { date: 'Jan 3', Messages: 200, Responses: 980 },
    { date: 'Jan 4', Messages: 278, Responses: 390 },
    { date: 'Jan 5', Messages: 189, Responses: 480 },
    { date: 'Jan 6', Messages: 239, Responses: 380 },
    { date: 'Jan 7', Messages: 349, Responses: 430 },
  ];

  const instanceData = [
    { name: 'Business Main', value: 45, color: 'blue' },
    { name: 'Support Bot', value: 30, color: 'emerald' },
    { name: 'Marketing', value: 25, color: 'violet' },
  ];

  const performanceData = [
    { metric: 'Response Rate', value: 95 },
    { metric: 'Delivery Rate', value: 98 },
    { metric: 'Bot Accuracy', value: 87 },
    { metric: 'User Satisfaction', value: 92 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                Welcome back, {user?.name || 'Demo User'}!
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Here's what's happening with your WhatsApp business today
              </p>
            </div>
            <div className="flex items-center space-x-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              <Text className="font-medium">All Systems Operational</Text>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
           {stats.map((stat) => (
             <Card key={stat.title}>
               <CardContent className="p-6">
                 <Flex alignItems="start">
                   <div className="flex-1">
                     <Text className="text-sm font-medium text-gray-600 dark:text-gray-400">
                       {stat.title}
                     </Text>
                     <Metric className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-50">
                       {stat.value}
                     </Metric>
                     <Text className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                       {stat.description}
                     </Text>
                   </div>
                   <div className="flex flex-col items-end">
                     <Text className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                       {stat.change}
                     </Text>
                     <stat.icon className="h-5 w-5 text-gray-400 ml-2" />
                   </div>
                 </Flex>
               </CardContent>
             </Card>
           ))}
         </div>

        {/* Charts Section */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
           <Card>
             <CardHeader>
                <CardTitle className="text-xl" style={{color: 'var(--color-gray-800)'}}>Message Analytics</CardTitle>
              </CardHeader>
             <CardContent>
               <AreaChart
                 className="h-72"
                 data={messageData}
                 index="date"
                 categories={["Messages", "Responses"]}
                 colors={["blue", "emerald"]}
                 valueFormatter={(number) => `${number.toLocaleString()}`}
                 showLegend={true}
                 showGridLines={true}
                 curveType="natural"
               />
             </CardContent>
           </Card>

           <Card>
             <CardHeader>
                <CardTitle className="text-xl" style={{color: 'var(--color-gray-800)'}}>Instance Distribution</CardTitle>
              </CardHeader>
             <CardContent>
               <DonutChart
                 className="h-72"
                 data={instanceData}
                 category="value"
                 index="name"
                 colors={["blue", "emerald", "violet"]}
                 valueFormatter={(number) => `${number}%`}
                 showLabel={true}
                 showAnimation={true}
               />
             </CardContent>
           </Card>
         </div>

        {/* Performance & Activity */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
           <Card>
             <CardHeader>
                <CardTitle className="text-xl" style={{color: 'var(--color-gray-800)'}}>Performance Metrics</CardTitle>
              </CardHeader>
             <CardContent>
               <div className="space-y-4">
                 {performanceData.map((item) => (
                   <div key={item.metric}>
                     <Flex alignItems="center" justifyContent="between" className="mb-2">
                       <Text className="font-medium">{item.metric}</Text>
                       <Text className="font-bold text-slate-700">{item.value}%</Text>
                     </Flex>
                     <ProgressBar 
                       value={item.value} 
                       color={item.value >= 90 ? "emerald" : item.value >= 80 ? "amber" : "red"}
                       className="h-2"
                     />
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>

          <Card>
            <CardHeader>
               <CardTitle className="text-xl" style={{color: 'var(--color-gray-800)'}}>Recent Activity</CardTitle>
             </CardHeader>
            <CardContent>
              <List className="space-y-3">
                <ListItem className="border-l-4 border-blue-500 pl-4 bg-blue-50/50 rounded-r-2xl">
                  <Flex alignItems="start" className="space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mt-1">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <Text className="font-medium">New message received</Text>
                      <Text className="text-sm text-slate-500">Customer inquiry about product pricing</Text>
                      <Flex alignItems="center" className="mt-1 space-x-2">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <Text className="text-xs text-slate-400">2 minutes ago</Text>
                      </Flex>
                    </div>
                    <Text className="text-xs text-blue-600 font-medium">New</Text>
                  </Flex>
                </ListItem>
                <ListItem className="border-l-4 border-emerald-500 pl-4 bg-emerald-50/50 rounded-r-2xl">
                  <Flex alignItems="start" className="space-x-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mt-1">
                      <Bot className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <Text className="font-medium">Bot response sent</Text>
                      <Text className="text-sm text-slate-500">Automated welcome message delivered</Text>
                      <Flex alignItems="center" className="mt-1 space-x-2">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <Text className="text-xs text-slate-400">5 minutes ago</Text>
                      </Flex>
                    </div>
                    <Text className="text-xs text-emerald-600 font-medium">Sent</Text>
                  </Flex>
                </ListItem>
                <ListItem className="border-l-4 border-violet-500 pl-4 bg-violet-50/50 rounded-r-2xl">
                  <Flex alignItems="start" className="space-x-3">
                    <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center mt-1">
                      <Activity className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <Text className="font-medium">Instance status updated</Text>
                      <Text className="text-sm text-slate-500">Business Main instance is now online</Text>
                      <Flex alignItems="center" className="mt-1 space-x-2">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <Text className="text-xs text-slate-400">10 minutes ago</Text>
                      </Flex>
                    </div>
                    <Text className="text-xs text-violet-600 font-medium">Info</Text>
                  </Flex>
                </ListItem>
              </List>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
               <CardTitle className="text-xl" style={{color: 'var(--color-gray-800)'}}>Quick Actions</CardTitle>
             </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button
                  icon={MessageSquare}
                  variant="primary"
                  className="w-full justify-start"
                >
                  Create Instance
                </Button>
                <Button
                  icon={Bot}
                  variant="secondary"
                  className="w-full justify-start"
                >
                  Deploy Bot
                </Button>
                <Button
                  icon={Users}
                  variant="secondary"
                  className="w-full justify-start"
                >
                  Invite Member
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage & Plan */}
        <Card>
          <CardHeader>
            <Flex alignItems="center" justifyContent="between">
              <div>
                <CardTitle className="text-xl font-bold" style={{color: 'var(--color-gray-800)'}}>Current Plan</CardTitle>
                <Text className="text-lg text-slate-600 mt-1">Professional Plan</Text>
              </div>
              <div className="flex items-center space-x-2 text-emerald-600">
                <CheckCircle className="h-5 w-5" />
                <Text className="font-medium">Active</Text>
              </div>
            </Flex>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
                  <Flex alignItems="center" className="space-x-2 mb-3">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    <Text className="font-semibold text-blue-900">Messages Usage</Text>
                  </Flex>
                  <Flex alignItems="center" justifyContent="between" className="mb-2">
                    <Text className="font-medium">Messages Used</Text>
                    <Text className="font-bold">8,234 / 10,000</Text>
                  </Flex>
                  <ProgressBar value={82} color="blue" className="h-3" />
                  <Text className="text-sm text-slate-500 mt-1">82% of monthly limit used</Text>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                  <Flex alignItems="center" className="space-x-2 mb-3">
                    <Zap className="h-5 w-5 text-emerald-600" />
                    <Text className="font-semibold text-emerald-900">API Calls</Text>
                  </Flex>
                  <Flex alignItems="center" justifyContent="between" className="mb-2">
                    <Text className="font-medium">API Calls</Text>
                    <Text className="font-bold">1,456 / 5,000</Text>
                  </Flex>
                  <ProgressBar value={29} color="emerald" className="h-3" />
                  <Text className="text-sm text-slate-500 mt-1">29% of monthly limit used</Text>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}