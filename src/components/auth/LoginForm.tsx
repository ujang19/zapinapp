'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Divider } from '@tremor/react';
import { Button } from '@/components/ui/Button';
import { TremorInput } from '@/components/ui/TremorInput';
import { GitHubIcon, GoogleIcon, FacebookIcon } from '@/components/ui/SocialIcons';
import { Loader2 } from 'lucide-react';



export default function LoginForm() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
       const result = await authClient.signIn.email({
         email,
         password,
       });

       if (result.error) {
         setError(result.error.message || 'Login failed');
       } else {
         router.push('/dashboard');
       }
     } catch (err) {
       setError('An unexpected error occurred');
     } finally {
       setIsLoading(false);
     }
  };

  const handleSocialLogin = async (provider: 'github' | 'google' | 'facebook') => {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
      });
    } catch (err) {
      setError(`Failed to sign in with ${provider}`);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="rounded-lg bg-white p-8 shadow-lg dark:bg-gray-900">
        <h3 className="text-center text-tremor-title font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
          Log in or create account
        </h3>
        
        {error && (
          <div className="mt-4 rounded-tremor-default bg-red-50 p-3 text-center text-tremor-default text-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong"
            >
              Email
            </label>
            <TremorInput
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="john@company.com"
              className="mt-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong"
            >
              Password
            </label>
            <TremorInput
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="password"
              className="mt-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            isLoading={isLoading}
            loadingText="Signing in..."
            className="mt-4 w-full"
            variant="primary"
          >
            Sign in
          </Button>
        </form>
        <Divider />
        <div className="flex w-full space-x-2 mt-4">
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
          
          <div className="text-center text-sm mt-4">
            Don't have an account?{' '}
            <Link
              href="/register"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              Sign up
            </Link>
          </div>
          

        </div>
      </div>
    </div>
  );
}