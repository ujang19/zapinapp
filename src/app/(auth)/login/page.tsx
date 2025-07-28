import { Metadata } from 'next';
import { LoginForm } from '../../../components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Login - Zapin',
  description: 'Sign in to your Zapin account',
};

export default function LoginPage() {
  return <LoginForm />;
}