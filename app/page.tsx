"use client";

import { useAuth } from '@/contexts/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { GroupSelector } from '@/components/groups/GroupSelector';
import { GroupHomePage } from '@/pages/GroupHomePage';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';

interface Group {
  id: number;
  name: string;
  description?: string;
  role: string;
  joined_at: string;
}

export default function Page() {
  const { user, loading, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const handleLogout = async () => {
    try {
      await logout();
      setSelectedGroup(null);
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">FairShare Ledger</h1>
            <p className="text-lg text-muted-foreground mb-8">
              Manage shared items and calculate refunds for leaving members with ease.
            </p>
          </div>
          <div className="space-y-4">
            <Button onClick={() => setShowAuthModal(true)} size="lg">
              <User className="w-4 h-4 mr-2" />
              Get Started
            </Button>
            <p className="text-sm text-muted-foreground">
              Sign in or create an account to start managing your shared expenses
            </p>
          </div>
        </div>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </div>
    );
  }

  if (!selectedGroup) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold">Welcome back, {user.name}!</h1>
              <p className="text-muted-foreground">Choose a group to get started</p>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
          <GroupSelector onGroupSelect={handleGroupSelect} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center p-4">
          <div>
            <h1 className="text-2xl font-bold">{selectedGroup.name}</h1>
            <p className="text-muted-foreground">
              {selectedGroup.description || 'Manage shared items and refunds'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedGroup(null)}>
              Switch Group
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
        <GroupHomePage groupId={selectedGroup.id} />
      </div>
    </div>
  );
}


