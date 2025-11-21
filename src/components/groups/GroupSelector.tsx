'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Users, ArrowRight, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  // Optional join date for the group creator
  joinedAt: z.string().optional(),
});

const joinGroupSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
  // Optional join date (YYYY-MM-DD)
  joinedAt: z.string().optional(),
});

type CreateGroupFormValues = z.infer<typeof createGroupSchema>;
type JoinGroupFormValues = z.infer<typeof joinGroupSchema>;

interface Group {
  id: number;
  name: string;
  description?: string;
  role: string;
  joined_at: string;
  invite_code?: string;
}

interface GroupSelectorProps {
  onGroupSelect: (group: Group) => void;
}

export function GroupSelector({ onGroupSelect }: GroupSelectorProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [copiedGroupId, setCopiedGroupId] = useState<number | null>(null);

  const createForm = useForm<CreateGroupFormValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: '',
      description: '',
      joinedAt: undefined,
    },
  });

  const joinForm = useForm<JoinGroupFormValues>({
    resolver: zodResolver(joinGroupSchema),
    defaultValues: {
      inviteCode: '',
      joinedAt: undefined,
    },
  });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/groups');
      if (response.ok) {
        const data = (await response.json()) as { groups: Group[] };
        setGroups(data.groups);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (values: CreateGroupFormValues) => {
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: values.name, description: values.description || undefined, joinedAt: values.joinedAt || undefined }),
      });

  const data = (await response.json()) as { success?: boolean; error?: string } | any;

      if (response.ok) {
        toast.success('Group created successfully!');
        setIsCreateModalOpen(false);
        createForm.reset();
        fetchGroups();
      } else {
        toast.error(data.error || 'Failed to create group');
      }
    } catch (error) {
      toast.error('Failed to create group');
    }
  };

  const handleJoinGroup = async (values: JoinGroupFormValues) => {
    try {
      const response = await fetch('/api/groups/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inviteCode: values.inviteCode, joinedAt: values.joinedAt || undefined }),
      });

  const data = (await response.json()) as { success?: boolean; error?: string } | any;

      if (response.ok) {
        toast.success('Successfully joined the group!');
        setIsJoinModalOpen(false);
        joinForm.reset();
        fetchGroups();
      } else {
        toast.error(data.error || 'Failed to join group');
      }
    } catch (error) {
      toast.error('Failed to join group');
    }
  };

  const handleCopyInviteCode = async (inviteCode: string, groupId: number) => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedGroupId(groupId);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopiedGroupId(null), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = inviteCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedGroupId(groupId);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopiedGroupId(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading groups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Select or Create a Group</h1>
        <p className="text-muted-foreground">Choose a group to manage shared items and calculate refunds</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Create New Group</CardTitle>
                <CardDescription>
                  Start a new group to manage shared items and calculate refunds
                </CardDescription>
              </CardHeader>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateGroup)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter group name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter group description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="joinedAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Joining Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" placeholder="YYYY-MM-DD" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Create Group
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Join Existing Group</CardTitle>
                <CardDescription>
                  Use an invite code to join an existing group
                </CardDescription>
              </CardHeader>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join Group</DialogTitle>
            </DialogHeader>
            <Form {...joinForm}>
              <form onSubmit={joinForm.handleSubmit(handleJoinGroup)} className="space-y-4">
                <FormField
                  control={joinForm.control}
                  name="inviteCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invite Code</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter invite code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={joinForm.control}
                  name="joinedAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Joining Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" placeholder="YYYY-MM-DD" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Join Group
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Your Groups</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Card
                key={group.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onGroupSelect(group)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  {group.description && (
                    <CardDescription>{group.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="capitalize">{group.role}</span>
                      <span>Joined {new Date(group.joined_at).toLocaleDateString()}</span>
                    </div>
                    {group.invite_code && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                        <code className="flex-1 text-xs font-mono text-foreground">
                          {group.invite_code}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyInviteCode(group.invite_code!, group.id);
                          }}
                          className="h-6 w-6 p-0"
                        >
                          {copiedGroupId === group.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
