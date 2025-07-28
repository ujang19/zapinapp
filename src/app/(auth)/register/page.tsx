import { Metadata } from 'next';
import { RegisterForm } from '../../../components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Register - Zapin',
  description: 'Create your Zapin account',
};

export default function RegisterPage() {
  return <RegisterForm />;
}