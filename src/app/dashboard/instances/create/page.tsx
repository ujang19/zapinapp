'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { useToast } from '../../../../components/ui/use-toast';
import { useAuthToken } from '../../../../hooks/useClientStorage';
import { z } from 'zod';

const CreateInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be less than 50 characters').regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, hyphens, and underscores'),
  webhookUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  settings: z.object({
    rejectCall: z.boolean(),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean(),
    alwaysOnline: z.boolean(),
    readMessages: z.boolean(),
    readStatus: z.boolean(),
    syncFullHistory: z.boolean(),
  }),
});

type CreateInstanceForm = z.infer<typeof CreateInstanceSchema>;

export default function CreateInstancePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, isClient } = useAuthToken();
  const [loading, setLoading] = useState(false);

  // Show loading state until client is ready
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }
  const [formData, setFormData] = useState<CreateInstanceForm>({
    name: '',
    webhookUrl: '',
    settings: {
      rejectCall: false,
      msgCall: 'Sorry, I cannot take calls at the moment.',
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith('settings.')) {
      const settingField = field.replace('settings.', '');
      setFormData(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingField]: value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }));
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const validateForm = (): boolean => {
    try {
      CreateInstanceSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        ...(formData.webhookUrl && { webhookUrl: formData.webhookUrl }),
        settings: formData.settings,
      };

      const response = await fetch('/api/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create instance');
      }

      const data = await response.json();

      toast({
        title: 'Success',
        description: 'Instance created successfully',
      });

      // Redirect to instance details page
      router.push(`/dashboard/instances/${data.data.id}`);
    } catch (error) {
      console.error('Error creating instance:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create instance',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <h1 className="text-3xl font-bold tracking-tight">Create Instance</h1>
          <p className="text-muted-foreground">
            Create a new WhatsApp instance to start sending messages
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Configure the basic settings for your WhatsApp instance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Instance Name *</Label>
                <Input
                  id="name"
                  placeholder="my-whatsapp-instance"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Only letters, numbers, hyphens, and underscores are allowed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook URL (Optional)</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  placeholder="https://your-domain.com/webhook"
                  value={formData.webhookUrl}
                  onChange={(e) => handleInputChange('webhookUrl', e.target.value)}
                  className={errors.webhookUrl ? 'border-red-500' : ''}
                />
                {errors.webhookUrl && (
                  <p className="text-sm text-red-500">{errors.webhookUrl}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  URL to receive webhook events. Leave empty to use default webhook.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Instance Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Instance Settings</CardTitle>
              <CardDescription>
                Configure how your WhatsApp instance behaves
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="rejectCall"
                    checked={formData.settings.rejectCall}
                    onChange={(e) => handleInputChange('settings.rejectCall', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="rejectCall" className="text-sm">
                    Reject incoming calls
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="groupsIgnore"
                    checked={formData.settings.groupsIgnore}
                    onChange={(e) => handleInputChange('settings.groupsIgnore', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="groupsIgnore" className="text-sm">
                    Ignore group messages
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="alwaysOnline"
                    checked={formData.settings.alwaysOnline}
                    onChange={(e) => handleInputChange('settings.alwaysOnline', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="alwaysOnline" className="text-sm">
                    Always show as online
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="readMessages"
                    checked={formData.settings.readMessages}
                    onChange={(e) => handleInputChange('settings.readMessages', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="readMessages" className="text-sm">
                    Auto-read messages
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="readStatus"
                    checked={formData.settings.readStatus}
                    onChange={(e) => handleInputChange('settings.readStatus', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="readStatus" className="text-sm">
                    Auto-read status updates
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="syncFullHistory"
                    checked={formData.settings.syncFullHistory}
                    onChange={(e) => handleInputChange('settings.syncFullHistory', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="syncFullHistory" className="text-sm">
                    Sync full chat history
                  </Label>
                </div>
              </div>

              {formData.settings.rejectCall && (
                <div className="space-y-2">
                  <Label htmlFor="msgCall">Call rejection message</Label>
                  <Input
                    id="msgCall"
                    placeholder="Sorry, I cannot take calls at the moment."
                    value={formData.settings.msgCall || ''}
                    onChange={(e) => handleInputChange('settings.msgCall', e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Message to send when rejecting incoming calls
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Instance
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}