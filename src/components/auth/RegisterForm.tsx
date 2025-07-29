'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useFormValidation } from '../../hooks/useAuth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function RegisterForm() {
  const router = useRouter();
  const { register, loading } = useAuth();
  const { errors, validateField, clearErrors, hasErrors } = useFormValidation();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    tenantName: '',
    tenantSlug: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    clearErrors(field);
    setSubmitError('');

    // Auto-generate tenant slug from tenant name
    if (field === 'tenantName') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
      setFormData(prev => ({ ...prev, tenantSlug: slug }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Validate form
    const nameValid = validateField('name', formData.name, {
      required: true,
      minLength: 2
    });

    const emailValid = validateField('email', formData.email, {
      required: true,
      email: true
    });

    const passwordValid = validateField('password', formData.password, {
      required: true,
      password: true,
      minLength: 8
    });

    const confirmPasswordValid = validateField('confirmPassword', formData.confirmPassword, {
      required: true,
      match: 'password'
    }, formData);

    const tenantNameValid = validateField('tenantName', formData.tenantName, {
      required: true,
      minLength: 2
    });

    const tenantSlugValid = validateField('tenantSlug', formData.tenantSlug, {
      required: true,
      minLength: 2
    });

    if (!nameValid || !emailValid || !passwordValid || !confirmPasswordValid || !tenantNameValid || !tenantSlugValid) {
      return;
    }

    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        tenantId: formData.tenantSlug || 'default-tenant',
        role: 'user'
      });
      router.push('/dashboard');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Create your account
        </CardTitle>
        <CardDescription className="text-center">
          Enter your details to get started with Zapin
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('name', e.target.value)}
              className={hasErrors('name') ? 'border-red-500' : ''}
              disabled={loading}
            />
            {hasErrors('name') && (
              <div className="text-sm text-red-500">
                {errors.name?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('email', e.target.value)}
              className={hasErrors('email') ? 'border-red-500' : ''}
              disabled={loading}
            />
            {hasErrors('email') && (
              <div className="text-sm text-red-500">
                {errors.email?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a password"
                value={formData.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('password', e.target.value)}
                className={hasErrors('password') ? 'border-red-500 pr-10' : 'pr-10'}
                disabled={loading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
            {hasErrors('password') && (
              <div className="text-sm text-red-500">
                {errors.password?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('confirmPassword', e.target.value)}
                className={hasErrors('confirmPassword') ? 'border-red-500 pr-10' : 'pr-10'}
                disabled={loading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
            {hasErrors('confirmPassword') && (
              <div className="text-sm text-red-500">
                {errors.confirmPassword?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantName">Organization Name</Label>
            <Input
              id="tenantName"
              type="text"
              placeholder="Enter your organization name"
              value={formData.tenantName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('tenantName', e.target.value)}
              className={hasErrors('tenantName') ? 'border-red-500' : ''}
              disabled={loading}
            />
            {hasErrors('tenantName') && (
              <div className="text-sm text-red-500">
                {errors.tenantName?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantSlug">Organization Slug</Label>
            <Input
              id="tenantSlug"
              type="text"
              placeholder="organization-slug"
              value={formData.tenantSlug}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('tenantSlug', e.target.value)}
              className={hasErrors('tenantSlug') ? 'border-red-500' : ''}
              disabled={loading}
            />
            <div className="text-xs text-gray-500">
              This will be used in your organization URL: zapin.tech/{formData.tenantSlug}
            </div>
            {hasErrors('tenantSlug') && (
              <div className="text-sm text-red-500">
                {errors.tenantSlug?.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>

          <div className="text-center text-sm">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}