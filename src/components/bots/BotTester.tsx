'use client';

import { useState } from 'react';
import { TestTube, Send, MessageSquare, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface TestMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface TestResult {
  success: boolean;
  response?: string;
  error?: string;
}

interface BotTesterProps {
  botId: string;
  botName: string;
  botType: 'TYPEBOT' | 'OPENAI';
  isActive: boolean;
  onTest: (message: string, phoneNumber: string) => Promise<TestResult>;
}

export function BotTester({ botId, botName, botType, isActive, onTest }: BotTesterProps) {
  const [testMessage, setTestMessage] = useState('');
  const [testPhone, setTestPhone] = useState('1234567890');
  const [testing, setTesting] = useState(false);
  const [messages, setMessages] = useState<TestMessage[]>([]);

  const handleTest = async () => {
    if (!testMessage.trim() || !testPhone.trim()) {
      return;
    }

    const userMessage: TestMessage = {
      id: Date.now().toString(),
      content: testMessage,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setTesting(true);

    try {
      const result = await onTest(testMessage, testPhone);
      
      const botMessage: TestMessage = {
        id: (Date.now() + 1).toString(),
        content: result.success ? (result.response || 'No response') : (result.error || 'Error occurred'),
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);
      setTestMessage('');
    } catch (error) {
      const errorMessage: TestMessage = {
        id: (Date.now() + 1).toString(),
        content: 'Failed to send test message',
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setTesting(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Bot Tester
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          Test your {botName} bot
          <Badge className={getBotTypeColor(botType)} variant="secondary">
            {botType}
          </Badge>
          {!isActive && (
            <Badge variant="destructive">Inactive</Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="testPhone">Test Phone Number</Label>
            <Input
              id="testPhone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="1234567890"
              disabled={!isActive}
            />
          </div>
          <div>
            <Label htmlFor="testMessage">Test Message</Label>
            <div className="flex gap-2">
              <Input
                id="testMessage"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type your test message..."
                disabled={!isActive || testing}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !testing && isActive) {
                    handleTest();
                  }
                }}
              />
              <Button
                onClick={handleTest}
                disabled={testing || !isActive || !testMessage.trim()}
                size="sm"
              >
                {testing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {!isActive && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Bot must be active to test. Please enable the bot first.
            </p>
          </div>
        )}

        {/* Chat Messages */}
        {messages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Test Conversation</Label>
              <Button variant="outline" size="sm" onClick={clearMessages}>
                Clear
              </Button>
            </div>
            
            <div className="border rounded-md p-4 max-h-96 overflow-y-auto space-y-3 bg-muted/20">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 ${
                    message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.sender === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {message.sender === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  
                  <div className={`flex-1 max-w-[80%] ${
                    message.sender === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    <div className={`inline-block p-3 rounded-lg ${
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              
              {testing && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-block p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-muted-foreground"></div>
                        <span className="text-sm text-muted-foreground">Bot is thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Test Messages */}
        <div className="space-y-2">
          <Label>Quick Test Messages</Label>
          <div className="flex flex-wrap gap-2">
            {[
              'Hello',
              'How are you?',
              'What can you do?',
              'Help me',
              'Thank you',
            ].map((quickMessage) => (
              <Button
                key={quickMessage}
                variant="outline"
                size="sm"
                onClick={() => setTestMessage(quickMessage)}
                disabled={!isActive || testing}
              >
                {quickMessage}
              </Button>
            ))}
          </div>
        </div>

        {/* Test Tips */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
            Testing Tips:
          </h4>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Test different message types to see how your bot responds</li>
            <li>• Try edge cases and unexpected inputs</li>
            <li>• Check response times and accuracy</li>
            {botType === 'TYPEBOT' && (
              <li>• Test your flow paths and conditional logic</li>
            )}
            {botType === 'OPENAI' && (
              <li>• Verify the AI follows your system prompt correctly</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}