export const metadata = {
  title: 'FairShare Ledger',
  description: 'Manage shared items and refunds',
};

import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}


