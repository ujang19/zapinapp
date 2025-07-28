'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Brain, MessageSquare, Settings, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

interface Instance {
  id: string;
  name: string;
  status: string;
  phoneNumber: string | null;
}

interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  category: string;
  pricing: {
    input: number;
    output: number;
  };
}

type BotType = 'TYPEBOT' | 'OPENAI';

interface TypebotFormData {
  name: string;
  instanceId: string;
  typebotUrl: string;
  typebotId: string;
  triggerType: 'all' | 'keyword';
  triggerValue: string;
  settings: {
    enabled: boolean;
    expire: number;
    keywordFinish: string;
    delayMessage: number;
    unknownMessage: string;
    listeningFromMe: boolean;
    stopBotFromMe: boolean;
    keepOpen: boolean;
    debounceTime: number;
  };
}

interface OpenAIFormData {
  name: string;
  instanceId: string;
  model: string;
  systemPrompt: string;
  triggerType: 'all' | 'keyword';
  triggerValue: string;
  settings: {
    enabled: boolean;
    botType: 'assistant' | 'chatCompletion';
    assistantId: string;
    functionUrl: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
    expire: number;
    keywordFinish: string;
    delayMessage: number;
    unknownMessage: string;
    listeningFromMe: boolean;
    stopBotFromMe: boolean;
    keepOpen: boolean;
    debounceTime: number;
    openaiCredsId: string;
  };
}

export default function CreateBotPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [botType, setBotType] = useState<BotType | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [models, setModels] = useState<OpenAIModel[]>([]);
  const [loading, setLoading] = useState(false);

  const [typebotForm, setTypebotForm] = useState<TypebotFormData>({
    name: '',
    instanceId: '',
    typebotUrl: '',
    typebotId: '',
    triggerType: 'all',
    triggerValue: '',
    settings: {
      enabled: true,
      expire: 60,
      keywordFinish: '',
      delayMessage: 1000,
      unknownMessage: 'Sorry, I didn\'t understand that.',
      listeningFromMe: false,
      stopBotFromMe: true,
      keepOpen: false,
      debounceTime: 0,
    },
  });

  const [openaiForm, setOpenaiForm] = useState<OpenAIFormData>({
    name: '',
    instanceId: '',
    model: 'gpt-4o-mini',
    systemPrompt: '',
    triggerType: 'all',
    triggerValue: '',
    settings: {
      enabled: true,
      botType: 'chatCompletion',
      assistantId: '',
      functionUrl: '',
      maxTokens: 1000,
      temperature: 0.7,
      topP: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
      expire: 60,
      keywordFinish: '',
      delayMessage: 1000,
      unknownMessage: 'Sorry, I didn\'t understand that.',
      listeningFromMe: false,
      stopBotFromMe: true,
      keepOpen: false,
      debounceTime: 0,
      openaiCredsId: '',
    },
  });

  useEffect(() => {
    fetchInstances();
    fetchModels();
  }, []);

  const fetchInstances = async () => {
    try {
      const response = await fetch('/api/v1/instances', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch instances');
      }

      const data = await response.json();
      setInstances(data.data.instances || []);
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch instances. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/v1/bots/available-models', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      setModels(data.data.models || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch OpenAI models. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateBot = async () => {
    try {
      setLoading(true);

      const endpoint = botType === 'TYPEBOT' ? '/api/v1/bots/typebot' : '/api/v1/bots/openai';
      const payload = botType === 'TYPEBOT' ? typebotForm : openaiForm;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create bot');
      }

      const data = await response.json();
      
      toast({
        title: 'Success',
        description: 'Bot created successfully!',
      });

      router.push(`/dashboard/bots/${data.data.bot.id}`);
    } catch (error) {
      console.error('Error creating bot:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create bot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center space-x-4">
        {[1, 2, 3].map((stepNumber) => (
          <div key={stepNumber} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= stepNumber
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {stepNumber}
            </div>
            {stepNumber < 3 && (
              <div
                className={`w-12 h-0.5 ${
                  step > stepNumber ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderBotTypeSelection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Choose Bot Type</h2>
        <p className="text-muted-foreground">
          Select the type of AI bot you want to create
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className={`cursor-pointer transition-all hover:shadow-lg ${
            botType === 'TYPEBOT' ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => setBotType('TYPEBOT')}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-blue-100 dark:bg-blue-900 rounded-full w-fit">
              <Zap className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle>Typebot</CardTitle>
            <CardDescription>
              Visual flow-based chatbot builder with drag-and-drop interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Visual conversation flows
              </li>
              <li className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-green-500" />
                Easy to configure
              </li>
              <li className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-green-500" />
                No coding required
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all hover:shadow-lg ${
            botType === 'OPENAI' ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => setBotType('OPENAI')}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-green-100 dark:bg-green-900 rounded-full w-fit">
              <Brain className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>OpenAI Bot</CardTitle>
            <CardDescription>
              AI-powered chatbot using OpenAI's GPT models for intelligent conversations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-green-500" />
                Advanced AI capabilities
              </li>
              <li className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Natural conversations
              </li>
              <li className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-green-500" />
                Customizable prompts
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center mt-8">
        <Button
          onClick={() => setStep(2)}
          disabled={!botType}
          className="px-8"
        >
          Continue
        </Button>
      </div>
    </div>
  );

  const renderTypebotConfiguration = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Configure Typebot</h2>
        <p className="text-muted-foreground">
          Set up your Typebot integration
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Bot Name</Label>
          <Input
            id="name"
            value={typebotForm.name}
            onChange={(e) => setTypebotForm({ ...typebotForm, name: e.target.value })}
            placeholder="Enter bot name"
          />
        </div>

        <div>
          <Label htmlFor="instance">WhatsApp Instance</Label>
          <Select
            value={typebotForm.instanceId}
            onValueChange={(value) => setTypebotForm({ ...typebotForm, instanceId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name} ({instance.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="typebotUrl">Typebot URL</Label>
          <Input
            id="typebotUrl"
            value={typebotForm.typebotUrl}
            onChange={(e) => setTypebotForm({ ...typebotForm, typebotUrl: e.target.value })}
            placeholder="https://your-typebot-url.com"
          />
        </div>

        <div>
          <Label htmlFor="typebotId">Typebot ID</Label>
          <Input
            id="typebotId"
            value={typebotForm.typebotId}
            onChange={(e) => setTypebotForm({ ...typebotForm, typebotId: e.target.value })}
            placeholder="Enter your Typebot ID"
          />
        </div>

        <div>
          <Label htmlFor="triggerType">Trigger Type</Label>
          <Select
            value={typebotForm.triggerType}
            onValueChange={(value: 'all' | 'keyword') => 
              setTypebotForm({ ...typebotForm, triggerType: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Messages</SelectItem>
              <SelectItem value="keyword">Specific Keyword</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {typebotForm.triggerType === 'keyword' && (
          <div>
            <Label htmlFor="triggerValue">Trigger Keyword</Label>
            <Input
              id="triggerValue"
              value={typebotForm.triggerValue}
              onChange={(e) => setTypebotForm({ ...typebotForm, triggerValue: e.target.value })}
              placeholder="Enter trigger keyword"
            />
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={() => setStep(3)}
          disabled={!typebotForm.name || !typebotForm.instanceId || !typebotForm.typebotUrl || !typebotForm.typebotId}
        >
          Continue
        </Button>
      </div>
    </div>
  );

  const renderOpenAIConfiguration = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Configure OpenAI Bot</h2>
        <p className="text-muted-foreground">
          Set up your AI-powered chatbot
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Bot Name</Label>
          <Input
            id="name"
            value={openaiForm.name}
            onChange={(e) => setOpenaiForm({ ...openaiForm, name: e.target.value })}
            placeholder="Enter bot name"
          />
        </div>

        <div>
          <Label htmlFor="instance">WhatsApp Instance</Label>
          <Select
            value={openaiForm.instanceId}
            onValueChange={(value) => setOpenaiForm({ ...openaiForm, instanceId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name} ({instance.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="model">OpenAI Model</Label>
          <Select
            value={openaiForm.model}
            onValueChange={(value) => setOpenaiForm({ ...openaiForm, model: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex flex-col">
                    <span>{model.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.description} - ${model.pricing.input}/1K input tokens
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="systemPrompt">System Prompt</Label>
          <Textarea
            id="systemPrompt"
            value={openaiForm.systemPrompt}
            onChange={(e) => setOpenaiForm({ ...openaiForm, systemPrompt: e.target.value })}
            placeholder="You are a helpful assistant that..."
            rows={4}
          />
        </div>

        <div>
          <Label htmlFor="triggerType">Trigger Type</Label>
          <Select
            value={openaiForm.triggerType}
            onValueChange={(value: 'all' | 'keyword') => 
              setOpenaiForm({ ...openaiForm, triggerType: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Messages</SelectItem>
              <SelectItem value="keyword">Specific Keyword</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {openaiForm.triggerType === 'keyword' && (
          <div>
            <Label htmlFor="triggerValue">Trigger Keyword</Label>
            <Input
              id="triggerValue"
              value={openaiForm.triggerValue}
              onChange={(e) => setOpenaiForm({ ...openaiForm, triggerValue: e.target.value })}
              placeholder="Enter trigger keyword"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              value={openaiForm.settings.maxTokens}
              onChange={(e) => setOpenaiForm({
                ...openaiForm,
                settings: { ...openaiForm.settings, maxTokens: parseInt(e.target.value) || 1000 }
              })}
              min={1}
              max={4096}
            />
          </div>
          <div>
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              step="0.1"
              value={openaiForm.settings.temperature}
              onChange={(e) => setOpenaiForm({
                ...openaiForm,
                settings: { ...openaiForm.settings, temperature: parseFloat(e.target.value) || 0.7 }
              })}
              min={0}
              max={2}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={() => setStep(3)}
          disabled={!openaiForm.name || !openaiForm.instanceId || !openaiForm.systemPrompt}
        >
          Continue
        </Button>
      </div>
    </div>
  );

  const renderAdvancedSettings = () => {
    const currentForm = botType === 'TYPEBOT' ? typebotForm : openaiForm;
    const updateSettings = (settings: any) => {
      if (botType === 'TYPEBOT') {
        setTypebotForm({ ...typebotForm, settings: { ...typebotForm.settings, ...settings } });
      } else {
        setOpenaiForm({ ...openaiForm, settings: { ...openaiForm.settings, ...settings } });
      }
    };

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Advanced Settings</h2>
          <p className="text-muted-foreground">
            Fine-tune your bot's behavior
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enabled">Enable Bot</Label>
              <p className="text-sm text-muted-foreground">
                Start the bot immediately after creation
              </p>
            </div>
            <Switch
              id="enabled"
              checked={currentForm.settings.enabled}
              onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expire">Session Timeout (minutes)</Label>
              <Input
                id="expire"
                type="number"
                value={currentForm.settings.expire}
                onChange={(e) => updateSettings({ expire: parseInt(e.target.value) || 60 })}
                min={1}
                max={1440}
              />
            </div>
            <div>
              <Label htmlFor="delayMessage">Message Delay (ms)</Label>
              <Input
                id="delayMessage"
                type="number"
                value={currentForm.settings.delayMessage}
                onChange={(e) => updateSettings({ delayMessage: parseInt(e.target.value) || 1000 })}
                min={0}
                max={10000}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="unknownMessage">Unknown Message Response</Label>
            <Input
              id="unknownMessage"
              value={currentForm.settings.unknownMessage}
              onChange={(e) => updateSettings({ unknownMessage: e.target.value })}
              placeholder="Message when bot doesn't understand"
            />
          </div>

          <div>
            <Label htmlFor="keywordFinish">Finish Keyword</Label>
            <Input
              id="keywordFinish"
              value={currentForm.settings.keywordFinish}
              onChange={(e) => updateSettings({ keywordFinish: e.target.value })}
              placeholder="Keyword to end conversation"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="listeningFromMe">Listen to My Messages</Label>
                <p className="text-sm text-muted-foreground">
                  Bot responds to messages sent by you
                </p>
              </div>
              <Switch
                id="listeningFromMe"
                checked={currentForm.settings.listeningFromMe}
                onCheckedChange={(checked) => updateSettings({ listeningFromMe: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="stopBotFromMe">Stop Bot from My Messages</Label>
                <p className="text-sm text-muted-foreground">
                  Your messages can stop the bot
                </p>
              </div>
              <Switch
                id="stopBotFromMe"
                checked={currentForm.settings.stopBotFromMe}
                onCheckedChange={(checked) => updateSettings({ stopBotFromMe: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="keepOpen">Keep Session Open</Label>
                <p className="text-sm text-muted-foreground">
                  Don't automatically close sessions
                </p>
              </div>
              <Switch
                id="keepOpen"
                checked={currentForm.settings.keepOpen}
                onCheckedChange={(checked) => updateSettings({ keepOpen: checked })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(2)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleCreateBot} disabled={loading}>
            {loading ? 'Creating...' : 'Create Bot'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/bots')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create New Bot</h1>
          <p className="text-muted-foreground">Set up your AI-powered chatbot</p>
        </div>
      </div>

      {renderStepIndicator()}

      <Card>
        <CardContent className="p-8">
          {step === 1 && renderBotTypeSelection()}
          {step === 2 && botType === 'TYPEBOT' && renderTypebotConfiguration()}
          {step === 2 && botType === 'OPENAI' && renderOpenAIConfiguration()}
          {step === 3 && renderAdvancedSettings()}
        </CardContent>
      </Card>
    </div>
  );
}