'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useFormValidation } from '../../hooks/useAuth';
import { authClient } from '@/lib/auth-client';
import { Button } from '../ui/Button';
import { TremorInput } from '@/components/ui/TremorInput';
import { GitHubIcon, GoogleIcon, FacebookIcon } from '@/components/ui/SocialIcons';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Divider } from '@tremor/react';

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

    if (!nameValid || !emailValid || !passwordValid || !confirmPasswordValid || !tenantNameValid) {
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

  const handleSocialLogin = async (provider: 'github' | 'google' | 'facebook') => {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
      });
    } catch (err) {
      setSubmitError(`Failed to sign in with ${provider}`);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Create your account
        </CardTitle>
        <CardDescription className="text-center">
          Enter your details to get started
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
            <label htmlFor="name" className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">Full Name</label>
            <TremorInput
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              error={hasErrors('name')}
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
            <label htmlFor="email" className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">Email</label>
            <TremorInput
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              error={hasErrors('email')}
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
            <label htmlFor="password" className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">Password</label>
            <div className="relative">
              <TremorInput
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                error={hasErrors('password')}
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
            <label htmlFor="confirmPassword" className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">Confirm Password</label>
            <div className="relative">
              <TremorInput
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                error={hasErrors('confirmPassword')}
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
            <label htmlFor="tenantName" className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">Organization Name</label>
            <TremorInput
              id="tenantName"
              type="text"
              placeholder="Enter your organization name"
              value={formData.tenantName}
              onChange={(e) => handleInputChange('tenantName', e.target.value)}
              error={hasErrors('tenantName')}
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


        </CardContent>

        <CardFooter className="flex flex-col space-y-3">
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

          <Divider />
          <div className="flex w-full space-x-2">
            <button
              type="button"
              onClick={() => handleSocialLogin('github')}
              className="flex items-center justify-center flex-1 px-3 py-2 rounded-md border border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-800 transition-colors"
              aria-label="Sign in with GitHub"
            >
              <GitHubIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              className="flex items-center justify-center flex-1 px-3 py-2 rounded-md border border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-800 transition-colors"
              aria-label="Sign in with Google"
            >
              <GoogleIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('facebook')}
              className="flex items-center justify-center flex-1 px-3 py-2 rounded-md border border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-800 transition-colors"
              aria-label="Sign in with Facebook"
            >
              <FacebookIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </button>
          </div>

          <div className="text-center text-sm text-tremor-content dark:text-dark-tremor-content">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-tremor-brand hover:text-tremor-brand-emphasis dark:text-dark-tremor-brand dark:hover:text-dark-tremor-brand-emphasis font-medium underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}