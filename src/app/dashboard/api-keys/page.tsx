'use client';

import { useState } from 'react';
import { useApiKeys } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Plus, Key, Copy, Trash2, Eye, EyeOff, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; scopes: string[]; expiresAt?: string }) => Promise<void>;
}

function CreateApiKeyModal({ isOpen, onClose, onSubmit }: CreateApiKeyModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    scopes: [] as string[],
    expiresAt: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableScopes = [
    { id: 'messages:send', label: 'Send Messages', description: 'Send text and media messages' },
    { id: 'messages:read', label: 'Read Messages', description: 'Access message history' },
    { id: 'instances:read', label: 'Read Instances', description: 'View instance information' },
    { id: 'instances:manage', label: 'Manage Instances', description: 'Create and configure instances' },
    { id: 'bots:read', label: 'Read Bots', description: 'View bot configurations' },
    { id: 'bots:manage', label: 'Manage Bots', description: 'Create and manage bots' },
    { id: 'analytics:read', label: 'Read Analytics', description: 'Access analytics data' }
  ];

  const handleScopeChange = (scopeId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      scopes: checked 
        ? [...prev.scopes, scopeId]
        : prev.scopes.filter(s => s !== scopeId)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit({
        name: formData.name,
        scopes: formData.scopes,
        expiresAt: formData.expiresAt || undefined
      });
      setFormData({ name: '', scopes: [], expiresAt: '' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create API Key</CardTitle>
          <CardDescription>
            Generate a new API key for external integrations
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Key Name</Label>
              <Input
                id="name"
                placeholder="e.g., Production API, Mobile App"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiresAt">Expiration Date (Optional)</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableScopes.map((scope) => (
                  <div key={scope.id} className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      id={scope.id}
                      checked={formData.scopes.includes(scope.id)}
                      onChange={(e) => handleScopeChange(scope.id, e.target.checked)}
                      className="mt-1"
                      disabled={loading}
                    />
                    <div className="flex-1">
                      <label htmlFor={scope.id} className="text-sm font-medium cursor-pointer">
                        {scope.label}
                      </label>
                      <p className="text-xs text-gray-500">{scope.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>

          <div className="flex justify-end space-x-2 p-6 pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || formData.scopes.length === 0}
            >
              {loading ? 'Creating...' : 'Create API Key'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ApiKeysPage() {
  const { apiKeys, loading, createApiKey, revokeApiKey } = useApiKeys();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const handleCreateApiKey = async (data: { name: string; scopes: string[]; expiresAt?: string }) => {
    const result = await createApiKey(data);
    setNewApiKey(result.key);
  };

  const handleCopyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    // You could add a toast notification here
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const maskApiKey = (key: string) => {
    return `${key.substring(0, 8)}${'*'.repeat(32)}${key.substring(key.length - 8)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-600">
            Manage API keys for external integrations
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* New API Key Alert */}
      {newApiKey && (
        <Alert>
          <Key className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">API Key Created Successfully!</p>
              <p className="text-sm">
                Please copy your API key now. You won't be able to see it again.
              </p>
              <div className="flex items-center space-x-2 p-2 bg-gray-100 rounded font-mono text-sm">
                <span className="flex-1">{newApiKey}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyKey(newApiKey)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewApiKey(null)}
              >
                I've copied the key
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* API Keys List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              </div>
            </CardContent>
          </Card>
        ) : apiKeys.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
              <p className="text-gray-600 mb-4">
                Create your first API key to start integrating with external services.
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium text-gray-900">{apiKey.name}</h3>
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        Active
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-mono text-sm text-gray-600">
                        {visibleKeys.has(apiKey.id) ? `zap_${apiKey.id}...` : maskApiKey(`zap_${apiKey.id}...`)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                      >
                        {visibleKeys.has(apiKey.id) ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>Created {format(new Date(apiKey.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                      {apiKey.lastUsedAt && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>Last used {format(new Date(apiKey.lastUsedAt), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {apiKey.expiresAt && (
                        <div className="flex items-center space-x-1">
                          <span>Expires {format(new Date(apiKey.expiresAt), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2">
                      <div className="flex flex-wrap gap-1">
                        {apiKey.scopes.map((scope: string) => (
                          <span
                            key={scope}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeApiKey(apiKey.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Revoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <CreateApiKeyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateApiKey}
      />
    </div>
  );
}