import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - Zapin',
  description: 'Sign in to your Zapin account',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Zapin
          </h1>
          <p className="text-gray-600">
            WhatsApp Business Management Platform
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}