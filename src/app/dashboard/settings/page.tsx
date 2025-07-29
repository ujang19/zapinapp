'use client';

import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { User, Lock, Building, Save } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  
  // Profile form state
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  // Organization form state
  const [orgData, setOrgData] = useState({
    name: 'Default Organization',
    slug: 'default-org'
  });
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgMessage, setOrgMessage] = useState('');

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage('');

    try {
      // Here you would call an API to update profile
      // await updateProfile(profileData);
      setProfileMessage('Profile updated successfully!');
    } catch (error) {
      setProfileMessage('Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgLoading(true);
    setOrgMessage('');

    try {
      // Here you would call an API to update organization
      // await updateOrganization(orgData);
      setOrgMessage('Organization updated successfully!');
    } catch (error) {
      setOrgMessage('Failed to update organization');
    } finally {
      setOrgLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">
          Manage your account and organization settings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleProfileSubmit}>
            <CardContent className="space-y-4">
              {profileMessage && (
                <Alert>
                  <AlertDescription>{profileMessage}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profileData.name}
                  onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                  disabled={profileLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={profileLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Input
                  value={user?.role || 'User'}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Tenant ID</Label>
                <Input
                  value={user?.tenantId || ''}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <Button
                type="submit"
                disabled={profileLoading}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {profileLoading ? 'Saving...' : 'Save Profile'}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Password Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Lock className="h-5 w-5 mr-2" />
              Password Management
            </CardTitle>
            <CardDescription>
              Password changes are handled through Better Auth
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                To change your password, please use the Better Auth password reset flow or contact your administrator.
              </AlertDescription>
            </Alert>

            <Button
              disabled
              className="w-full"
              variant="outline"
            >
              <Lock className="h-4 w-4 mr-2" />
              Password Reset (Coming Soon)
            </Button>
          </CardContent>
        </Card>

        {/* Organization Settings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2" />
              Organization Settings
            </CardTitle>
            <CardDescription>
              Manage your organization information
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleOrgSubmit}>
            <CardContent className="space-y-4">
              {orgMessage && (
                <Alert>
                  <AlertDescription>{orgMessage}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    value={orgData.name}
                    onChange={(e) => setOrgData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={orgLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Organization Slug</Label>
                  <Input
                    id="orgSlug"
                    value={orgData.slug}
                    onChange={(e) => setOrgData(prev => ({ ...prev, slug: e.target.value }))}
                    disabled={orgLoading}
                  />
                  <p className="text-xs text-gray-500">
                    Used in your organization URL: zapin.tech/{orgData.slug}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current Plan</Label>
                  <Input
                    value="Business Plan"
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input
                    value="Active"
                    disabled
                    className="bg-gray-50"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={orgLoading}
              >
                <Save className="h-4 w-4 mr-2" />
                {orgLoading ? 'Saving...' : 'Save Organization'}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}