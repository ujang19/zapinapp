'use client';

import { Suspense } from 'react';
import { LoginForm } from '../../../components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}