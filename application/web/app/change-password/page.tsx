import { redirect } from 'next/navigation';

export default function ChangePasswordPage() {
  redirect('/me/security');
}
