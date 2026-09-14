import { PermissionsScreen } from '@/components/shared/permissions-screen';

// Deliberately public and outside every role gate: this screen has to render
// before login, and middleware never protects it (see PROTECTED_PREFIXES).
export const metadata = { title: 'Required Permissions · Restaurant OS' };

export default function PermissionsPage() {
  return <PermissionsScreen />;
}
