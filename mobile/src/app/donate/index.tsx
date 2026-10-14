import { GiveForm } from '@/components/give-form';

// The signed-in student's Give screen. The form itself lives in components/give-form.tsx
// because visitors without an account use the same one (src/app/give.tsx).
export default function GiveScreen() {
  return <GiveForm />;
}
