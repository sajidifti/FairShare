'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, PlusCircle, UserPlus, Trash2, Edit, Info, RotateCw, Users, Package, DollarSign, Copy, Check, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
import { convertDaysToYears, convertYearsToDays } from '@/lib/item-utils';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  joined_at: string;
  leave_date?: string;
}

interface Item {
  id: number;
  name: string;
  price: number;
  purchase_date: string;
  depreciation_years?: number;
  depreciation_days?: number;
  created_by: number;
  created_by_name: string;
}

interface GroupHomePageProps {
  groupId: number;
}

const itemSchema = z.object({
  name: z.string().min(2, { message: "Item name must be at least 2 characters." }),
  price: z.coerce.number().positive({ message: "Price must be a positive number." }),
  purchaseDate: z.date({ message: "A valid purchase date is required." }),
  periodType: z.enum(['days', 'years']),
  periodValue: z.coerce.number().int().min(1, { message: 'Must be at least 1' }),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function calculateRefundForItem(member: Member, item: Item, allMembers: Member[]): number {
  // If member has no leave date, they haven't left — assume no refund due yet
  if (!member.leave_date) return 0;

  const purchaseDate = new Date(item.purchase_date);
  const memberJoinDate = new Date(member.joined_at);
  const memberLeaveDate = new Date(member.leave_date);

  // If the member joined after purchase date, they don't pay anything (not present at purchase)
  if (memberJoinDate > purchaseDate) return 0;

  // If the member left on or before purchase date, they pay nothing
  if (memberLeaveDate <= purchaseDate) return 0;

  // Depreciation period in days (linear). Prefer explicit depreciation_days if present, otherwise convert years -> days.
  const depreciationDays = Math.max(1, Math.round((item.depreciation_days ?? (item.depreciation_years ? item.depreciation_years * 365 : 365))));

  // Depreciation end date (inclusive)
  const depreciationEnd = new Date(purchaseDate.getTime());
  depreciationEnd.setDate(depreciationEnd.getDate() + (depreciationDays - 1));

  // If member left after depreciation ends, they used the item for its full depreciation period
  // The member only pays for days they were present during the depreciation window
  const startDate = purchaseDate; // Member was present at purchase, so start from purchase date
  const endDate = memberLeaveDate < depreciationEnd ? memberLeaveDate : depreciationEnd;

  if (endDate < startDate) return 0;

  // Filter members who were present at purchase time (joined on or before purchase date)
  const membersAtPurchase = allMembers.filter(m => {
    const joinDate = new Date(m.joined_at);
    return joinDate <= purchaseDate;
  });

  // Per-day cost of the item over its depreciation period
  const perDayValue = item.price / depreciationDays;

  // Iterate each day in [startDate, endDate] (inclusive) and allocate per-day cost
  let total = 0;
  const oneDayMs = 1000 * 60 * 60 * 24;

  // Normalize dates to local midnight for iteration
  const normalize = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let cursor = normalize(startDate);
  const last = normalize(endDate);

  while (cursor.getTime() <= last.getTime()) {
    // Count members (from those present at purchase) who are still present on this day
    const presentCount = membersAtPurchase.filter(m => {
      const jm = new Date(m.joined_at);
      const lm = m.leave_date ? new Date(m.leave_date) : null;
      const day = cursor;
      // Member must have joined by this day (already filtered by membersAtPurchase)
      if (jm.getTime() > day.getTime()) return false;
      // Member must not have left before this day
      if (lm && lm.getTime() < day.getTime()) return false;
      return true;
    }).length;

    if (presentCount > 0) {
      total += perDayValue / presentCount;
    }

    cursor = new Date(cursor.getTime() + oneDayMs);
  }

  return total;
}

function calculateItemBreakdown(member: Member, item: Item, allMembers: Member[]): { usage: number; totalPaid: number; refundable: number } | null {
  // If member has no leave date, they haven't left — no breakdown
  if (!member.leave_date) return null;

  const purchaseDate = new Date(item.purchase_date);
  const memberJoinDate = new Date(member.joined_at);
  const memberLeaveDate = new Date(member.leave_date);

  // If the member joined after purchase date, they don't pay anything (not present at purchase)
  if (memberJoinDate > purchaseDate) return null;

  // If the member left on or before purchase date, they pay nothing
  if (memberLeaveDate <= purchaseDate) return null;

  // Filter members who were present at purchase time (joined on or before purchase date)
  const membersAtPurchase = allMembers.filter(m => {
    const joinDate = new Date(m.joined_at);
    return joinDate <= purchaseDate;
  });

  // Total paid = equal share among members present at purchase
  const totalPaid = item.price / membersAtPurchase.length;

  // Usage = what they actually used (calculated the same way as refund but represents cost)
  const usage = calculateRefundForItem(member, item, allMembers);

  // Refundable = what they paid minus what they used
  const refundable = totalPaid - usage;

  return { usage, totalPaid, refundable };
}



function calculateTotalRefundForMember(member: Member, items: Item[], allMembers: Member[]): number {
  return items.reduce((total, item) => {
    const breakdown = calculateItemBreakdown(member, item, allMembers);
    if (!breakdown) return total;
    return total + breakdown.refundable;
  }, 0);
}


function ItemForm({ setOpen, existingItem, groupId, onSuccess }: {
  setOpen: (open: boolean) => void;
  existingItem?: Item;
  groupId: number;
  onSuccess: () => void;
}) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as any,
    // We'll set initial values via reset below so that the form updates when editing different items
    defaultValues: {
      name: '',
      price: 0,
      purchaseDate: new Date(),
      periodType: 'days',
      periodValue: 365 * 3,
    },
  });

  // When an existing item is provided (editing), reset the form so fields reflect the item's stored depreciation units
  useEffect(() => {
    if (!existingItem) {
      form.reset({
        name: '',
        price: 0,
        purchaseDate: new Date(),
        periodType: 'days',
        periodValue: 365 * 3,
      });
      return;
    }

    // Determine period type: prefer canonical `period_type`/`period_days` if present, otherwise fall back to older fields
    const explicitType = (existingItem as any).period_type ?? (existingItem as any).depreciation_period_type;
    const daysValue = (existingItem as any).period_days ?? (existingItem as any).depreciation_days;
    const yearsValue = (existingItem as any).depreciation_years;
    const hasDays = typeof daysValue === 'number' && !isNaN(daysValue);
    const hasYears = typeof yearsValue === 'number' && !isNaN(yearsValue);

    const periodType: 'days' | 'years' = explicitType === 'years' || (!explicitType && hasYears && !hasDays)
      ? 'years'
      : 'days';

    // Compute period value according to chosen type
    let periodValue = 365 * 3;
    if (periodType === 'years') {
      if (hasYears) {
        periodValue = Math.max(1, Math.round(yearsValue));
      } else if (hasDays) {
        periodValue = Math.max(1, Math.round(daysValue / 365));
      }
    } else {
      if (hasDays) {
        periodValue = Math.max(1, Math.round(daysValue));
      } else if (hasYears) {
        periodValue = Math.max(1, Math.round(yearsValue * 365));
      }
    }

    form.reset({
      name: existingItem.name,
      price: existingItem.price,
      purchaseDate: new Date(existingItem.purchase_date),
      periodType,
      periodValue,
    });
  }, [existingItem]);

  async function onSubmit(values: ItemFormValues) {
    try {
      const url = existingItem
        ? `/api/groups/${groupId}/items/${existingItem.id}`
        : `/api/groups/${groupId}/items`;

      const method = existingItem ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: values.name,
          price: values.price,
          purchaseDate: values.purchaseDate.toISOString().split('T')[0],
          // Save canonical fields expected by the backend: period_days and period_type.
          // If the user selected years, convert years -> days before saving.
          period_days: values.periodType === 'years' ? Math.max(1, Math.round(values.periodValue * 365)) : values.periodValue,
          period_type: values.periodType,
        }),
      });

      const data = (await response.json()) as { error?: string } | any;

      if (response.ok) {
        toast.success(`Item "${values.name}" ${existingItem ? 'updated' : 'added'}.`);
        form.reset();
        setOpen(false);
        // Trigger parent refresh (reload items) if provided
        try { onSuccess(); } catch (e) { }
      } else {
        toast.error(data.error || 'Failed to save item');
      }
    } catch (error) {
      toast.error('Failed to save item');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Item Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Refrigerator" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Item Price</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" placeholder="1200.00" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="purchaseDate" render={({ field }) => (
          <FormItem>
            <FormLabel>Purchase Date</FormLabel>
            <FormControl>
              <Input
                type="date"
                value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    field.onChange(new Date(value));
                  }
                }}
                max={new Date().toISOString().split('T')[0]}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="periodType" render={({ field }) => (
          <FormItem>
            <FormLabel>Period Type</FormLabel>
            <FormControl>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={field.value === 'days' ? 'default' : 'outline'}
                  onClick={() => {
                    if (field.value === 'days') return;
                    // switching from years -> days: convert value
                    const current = form.getValues('periodValue') as number;
                    const newVal = convertYearsToDays(Number(current) || 1);
                    form.setValue('periodValue', newVal, { shouldValidate: true, shouldDirty: true });
                    field.onChange('days');
                  }}
                >Days</Button>
                <Button
                  type="button"
                  variant={field.value === 'years' ? 'default' : 'outline'}
                  onClick={() => {
                    if (field.value === 'years') return;
                    // switching from days -> years: convert value (round)
                    const current = form.getValues('periodValue') as number;
                    const newVal = convertDaysToYears(Number(current) || 365);
                    form.setValue('periodValue', newVal, { shouldValidate: true, shouldDirty: true });
                    field.onChange('years');
                  }}
                >Years</Button>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="periodValue" render={({ field }) => (
          <FormItem>
            <FormLabel>{form.watch('periodType') === 'years' ? 'Depreciation (Years)' : 'Depreciation (Days)'}</FormLabel>
            <FormControl>
              <Input type="number" placeholder={form.watch('periodType') === 'years' ? '3' : '1095'} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <DialogFooter className="pt-4">
          <Button type="submit">{existingItem ? 'Save Changes' : 'Add Item'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function AddMemberForm({ groupId, onSuccess }: { groupId: number; onSuccess: (link: string) => void }) {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    joinedAt: z.string().optional(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', joinedAt: undefined } });

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', name: values.name, email: values.email, joinedAt: values.joinedAt || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess(data.link);
      } else {
        toast.error(data.error || 'Failed to invite member');
      }
    } catch (error) {
      toast.error('Failed to invite member');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="joinedAt" render={({ field }) => (
          <FormItem><FormLabel>Joining Date (optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="pt-4 flex justify-end"><Button type="submit">Invite</Button></div>
      </form>
    </Form>
  );
}

function GroupSettings({ groupId, groupData, members, items, allMembers, onRefresh }: {
  groupId: number;
  groupData: any;
  members: Member[];
  items: Item[];
  allMembers: Member[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyInviteCode = async () => {
    if (!groupData?.invite_code) return;

    try {
      await navigator.clipboard.writeText(groupData.invite_code);
      setCopied(true);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = groupData.invite_code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Group Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group Settings</DialogTitle>
          <DialogDescription>
            Manage members and invites for {groupData?.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="invites">Invites</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Group Members</h3>
                <p className="text-sm text-muted-foreground">Manage member access and dates</p>
              </div>
              {groupData?.currentUserRole === 'owner' && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="mr-2 h-4 w-4" /> Add Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Member</DialogTitle>
                      <DialogDescription>Invite a member to this group and generate a signup link.</DialogDescription>
                    </DialogHeader>
                    <AddMemberForm
                      onSuccess={(link) => {
                        navigator.clipboard?.writeText(link).catch(() => { });
                        toast.success('Invite link copied to clipboard');
                        onRefresh();
                      }}
                      groupId={groupId}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="grid gap-3 mt-4">
              {members.length > 0 ? (
                members.map(member => {
                  const handleUpdateLeaveDate = async (leaveDate: Date | undefined) => {
                    try {
                      const dateToSend = leaveDate ? leaveDate.toISOString().split('T')[0] : null;
                      const response = await fetch(`/api/groups/${groupId}/members`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leaveDate: dateToSend, memberId: member.id }),
                      });
                      if (response.ok) {
                        toast.success('Leave date updated');
                        onRefresh();
                      } else {
                        toast.error('Failed to update leave date');
                      }
                    } catch (error) {
                      toast.error('Failed to update leave date');
                    }
                  };

                  const handleUpdateJoinDate = async (joinDate: Date | undefined) => {
                    if (!joinDate) return;
                    try {
                      const dateToSend = joinDate.toISOString().split('T')[0];
                      const response = await fetch(`/api/groups/${groupId}/members`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ joinedAt: dateToSend, memberId: member.id }),
                      });
                      if (response.ok) {
                        toast.success('Joining date updated');
                        onRefresh();
                      } else {
                        toast.error('Failed to update joining date');
                      }
                    } catch (error) {
                      toast.error('Failed to update joining date');
                    }
                  };

                  const handleResetPassword = async () => {
                    try {
                      const response = await fetch(`/api/groups/${groupId}/members/reset-password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memberId: member.id }),
                      });
                      const data = await response.json();
                      if (response.ok) {
                        toast.success('Password reset link generated');
                        if (data.link) {
                          try {
                            await navigator.clipboard.writeText(data.link);
                            toast('Link copied to clipboard');
                          } catch { }
                        }
                      } else {
                        toast.error(data.error || 'Failed to generate reset link');
                      }
                    } catch (error) {
                      toast.error('Failed to generate reset link');
                    }
                  };

                  const handleUpdateName = async (newName: string) => {
                    if (!newName || newName === member.name) return;
                    try {
                      const response = await fetch(`/api/groups/${groupId}/members`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName, memberId: member.id }),
                      });
                      if (response.ok) {
                        toast.success('Name updated');
                        onRefresh();
                      } else {
                        toast.error('Failed to update name');
                      }
                    } catch (error) {
                      toast.error('Failed to update name');
                    }
                  };

                  const handleUpdateEmail = async (newEmail: string) => {
                    if (!newEmail || newEmail === member.email) return;
                    try {
                      const response = await fetch(`/api/groups/${groupId}/members`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: newEmail, memberId: member.id }),
                      });
                      const data = await response.json();
                      if (response.ok) {
                        toast.success('Email updated');
                        onRefresh();
                      } else {
                        toast.error(data.error || 'Failed to update email');
                      }
                    } catch (error) {
                      toast.error('Failed to update email');
                    }
                  };

                  return (
                    <Card key={member.id}>
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              {groupData?.currentUserRole === 'owner' ? (
                                <div className="space-y-2">
                                  <Input
                                    defaultValue={member.name}
                                    onBlur={(e) => handleUpdateName(e.target.value)}
                                    className="font-semibold text-lg h-auto p-1"
                                  />
                                  <Input
                                    type="email"
                                    defaultValue={member.email}
                                    onBlur={(e) => handleUpdateEmail(e.target.value)}
                                    className="text-sm text-muted-foreground h-auto p-1"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <h4 className="font-semibold">{member.name}</h4>
                                  <p className="text-sm text-muted-foreground">{member.email}</p>
                                </div>
                              )}
                            </div>
                            <span className={cn(
                              "text-xs px-2 py-1 rounded",
                              member.leave_date
                                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            )}>
                              {member.leave_date ? 'Left' : 'Active'}
                            </span>
                          </div>

                          {groupData?.currentUserRole === 'owner' && (
                            <div className="space-y-2 pt-2 border-t">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Leave Date</label>
                                <div className="flex gap-2">
                                  <Input
                                    type="date"
                                    value={member.leave_date ? new Date(member.leave_date).toISOString().split('T')[0] : ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value) {
                                        handleUpdateLeaveDate(new Date(value));
                                      }
                                    }}
                                    min={new Date(member.joined_at).toISOString().split('T')[0]}
                                    className="flex-1"
                                  />
                                  {member.leave_date && (
                                    <Button variant="outline" size="sm" onClick={() => handleUpdateLeaveDate(undefined)}>
                                      Clear
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium">Joining Date</label>
                                <Input
                                  type="date"
                                  value={member.joined_at ? new Date(member.joined_at).toISOString().split('T')[0] : ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value) {
                                      handleUpdateJoinDate(new Date(value));
                                    }
                                  }}
                                  className="w-full"
                                />
                              </div>

                              <Button variant="outline" className="w-full" onClick={handleResetPassword}>
                                <RotateCw className="mr-2 h-4 w-4" />
                                Reset Password
                              </Button>
                            </div>
                          )}

                          {groupData?.currentUserRole !== 'owner' && (
                            <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t">
                              <div>
                                <span className="text-muted-foreground">Joined:</span>
                                <p className="font-medium">{format(new Date(member.joined_at), 'MMM d, yyyy')}</p>
                              </div>
                              {member.leave_date && (
                                <div>
                                  <span className="text-muted-foreground">Left:</span>
                                  <p className="font-medium">{format(new Date(member.leave_date), 'MMM d, yyyy')}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No members yet</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invites" className="space-y-4 mt-4">
            <div>
              <h3 className="text-lg font-semibold">Group Invite Code</h3>
              <p className="text-sm text-muted-foreground">Share this code with others to invite them to join your group</p>
            </div>

            {groupData?.invite_code && (
              <Card className="border-2 border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 p-3 bg-background border rounded-lg">
                        <code className="font-mono text-lg font-bold tracking-wider">
                          {groupData.invite_code}
                        </code>
                      </div>
                    </div>
                    <Button
                      onClick={handleCopyInviteCode}
                      variant={copied ? "default" : "outline"}
                      size="lg"
                      className="min-w-[120px]"
                    >
                      {copied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Code
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Anyone with this code can join your group and access shared items and calculations.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MemberSummaryCard({ member, items, allMembers }: { member: Member; items: Item[]; allMembers: Member[] }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const totalRefund = calculateTotalRefundForMember(member, items, allMembers);

  // Calculate total usage (what they paid for)
  const totalUsage = items.reduce((total, item) => {
    const breakdown = calculateItemBreakdown(member, item, allMembers);
    if (!breakdown) return total;
    return total + breakdown.usage;
  }, 0);

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setShowBreakdown(true)}
      >
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              {member.leave_date && (
                <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-1 rounded">
                  Left
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Joined</p>
                <p className="font-medium">{format(new Date(member.joined_at), 'MMM d, yyyy')}</p>
              </div>
              {member.leave_date && (
                <div>
                  <p className="text-muted-foreground">Left</p>
                  <p className="font-medium">{format(new Date(member.leave_date), 'MMM d, yyyy')}</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Usage</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(totalUsage)}</span>
              </div>
              {member.leave_date && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-muted-foreground">Refundable</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalRefund)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cost Breakdown - {member.name}</DialogTitle>
            <DialogDescription>
              Detailed breakdown of usage and refundable amounts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Usage</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totalUsage)}</p>
                  </div>
                  {member.leave_date && (
                    <div>
                      <p className="text-sm text-muted-foreground">Total Refundable</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalRefund)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Item Breakdown */}
            <div>
              <h3 className="font-semibold mb-3">Item Breakdown</h3>
              <div className="space-y-3">
                {items.filter(item => new Date(item.purchase_date) < (member.leave_date ? new Date(member.leave_date) : new Date())).map(item => {
                  const breakdown = calculateItemBreakdown(member, item, allMembers);
                  if (!breakdown) return null;

                  return (
                    <Card key={item.id}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="font-medium">{item.name}</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Paid (Equal Share):</span>
                              <span className="font-mono font-medium">{formatCurrency(breakdown.totalPaid)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Usage (Days Used):</span>
                              <span className="font-mono text-orange-600 dark:text-orange-400">-{formatCurrency(breakdown.usage)}</span>
                            </div>
                            <div className="border-t pt-1 mt-1 flex justify-between font-medium">
                              <span>Refundable:</span>
                              <span className="font-mono text-green-600 dark:text-green-400">{formatCurrency(breakdown.refundable)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }).filter(Boolean)}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemberCard({ member, items, allMembers, isOwner, groupId, onRefresh }: { member: Member; items: Item[]; allMembers: Member[]; isOwner: boolean; groupId: number; onRefresh: () => void }) {
  const totalRefund = calculateTotalRefundForMember(member, items, allMembers);

  const handleUpdateLeaveDate = async (leaveDate: Date | undefined) => {
    try {
      const dateToSend = leaveDate ? leaveDate.toISOString().split('T')[0] : null;
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaveDate: dateToSend,
          memberId: member.id,
        }),
      });

      if (response.ok) {
        toast.success('Leave date updated');
        // Refresh data
        try { onRefresh(); } catch { window.location.reload(); }
      } else {
        toast.error('Failed to update leave date');
      }
    } catch (error) {
      toast.error('Failed to update leave date');
    }
  };

  const handleClearLeaveDate = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveDate: null, memberId: member.id }),
      });
      if (response.ok) {
        toast.success('Leave date cleared');
        try { onRefresh(); } catch { window.location.reload(); }
      } else {
        toast.error('Failed to clear leave date');
      }
    } catch (error) {
      toast.error('Failed to clear leave date');
    }
  };

  const handleUpdateJoinDate = async (date: Date | undefined) => {
    try {
      if (!date) return;
      const joinedAt = date.toISOString().split('T')[0];
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinedAt, memberId: member.id }),
      });
      if (response.ok) {
        toast.success('Joining date updated');
        try { onRefresh(); } catch { window.location.reload(); }
      } else {
        toast.error('Failed to update joining date');
      }
    } catch (error) {
      toast.error('Failed to update joining date');
    }
  };

  const handleResetPassword = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', userId: (member as any).user_id || member.id }),
      });
      const data = await response.json();
      if (response.ok) {
        // show link to owner so they can share
        toast.success('Password reset link generated');
        // copy link if present
        if (data.link) {
          try { await navigator.clipboard.writeText(data.link); toast('Link copied to clipboard'); } catch { }
        }
      } else {
        toast.error(data.error || 'Failed to generate reset link');
      }
    } catch (error) {
      toast.error('Failed to generate reset link');
    }
  };

  return (
    <motion.div layout transition={{ duration: 0.3, type: 'spring', stiffness: 500, damping: 30 }}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-medium">{member.name}</CardTitle>
            <CardDescription className="text-xs">
              Joined: {isValid(new Date(member.joined_at)) ? format(new Date(member.joined_at), "PPP") : 'Invalid Date'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">{formatCurrency(totalRefund)}</div>
          <p className="text-xs text-muted-foreground">Total Refundable Amount</p>
          <div className="mt-4 space-y-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Leave Date</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={member.leave_date ? new Date(member.leave_date).toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      handleUpdateLeaveDate(new Date(value));
                    }
                  }}
                  min={new Date(member.joined_at).toISOString().split('T')[0]}
                  className="flex-1"
                />
                {member.leave_date && (
                  <Button variant="outline" size="sm" onClick={handleClearLeaveDate}>Clear</Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Joining Date</label>
              <Input
                type="date"
                value={member.joined_at ? new Date(member.joined_at).toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    handleUpdateJoinDate(new Date(value));
                  }
                }}
                className="w-full"
              />
            </div>
            {member.leave_date && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="w-full">
                    <Info className="mr-2 h-4 w-4" /> View Breakdown
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Cost Breakdown</h4>
                      <p className="text-sm text-muted-foreground">Calculation for {member.name}</p>
                    </div>
                    <div className="grid gap-3 max-h-96 overflow-y-auto pr-2">
                      {items.filter(item => new Date(item.purchase_date) < new Date(member.leave_date!)).map(item => {
                        const breakdown = calculateItemBreakdown(member, item, allMembers);
                        if (!breakdown) return null;

                        return (
                          <div key={item.id} className="border rounded-lg p-3 space-y-2">
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Paid (Equal Share):</span>
                                <span className="font-mono font-medium">{formatCurrency(breakdown.totalPaid)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Usage (Days Used):</span>
                                <span className="font-mono text-orange-600 dark:text-orange-400">-{formatCurrency(breakdown.usage)}</span>
                              </div>
                              <div className="border-t pt-1 mt-1 flex justify-between font-medium">
                                <span>Refundable:</span>
                                <span className="font-mono text-green-600 dark:text-green-400">{formatCurrency(breakdown.refundable)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }).filter(Boolean)}
                      {items.filter(item => new Date(item.purchase_date) < new Date(member.leave_date!)).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">No items were purchased before the leave date.</p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {isOwner && (
              <Button variant="outline" className="w-full mt-2" onClick={handleResetPassword}>
                Reset Password
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function GroupHomePage({ groupId }: GroupHomePageProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [groupData, setGroupData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchGroupData();
  }, [groupId]);

  const fetchGroupData = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}`);
      if (response.ok) {
        const data = (await response.json()) as { group?: any } | any;
        setGroupData(data.group);
        setMembers(data.group?.members || []);
        setItems(data.group?.items || []);
      } else {
        toast.error('Failed to load group data');
      }
    } catch (error) {
      toast.error('Failed to load group data');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (item: Item) => {
    setEditingItem(item);
    setItemModalOpen(true);
  };

  const handleItemModalOpenChange = (open: boolean) => {
    if (!open) {
      setEditingItem(undefined);
    }
    setItemModalOpen(open);
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Item deleted successfully');
        fetchGroupData();
      } else {
        toast.error('Failed to delete item');
      }
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const handleCopyInviteCode = async () => {
    if (!groupData?.invite_code) return;

    try {
      await navigator.clipboard.writeText(groupData.invite_code);
      setCopied(true);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = groupData.invite_code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      toast.success('Invite code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading group data...</p>
        </div>
      </div>
    );
  }

  const totalItemValue = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="container mx-auto px-4 py-12 md:py-16">
      <div className="absolute inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      <ThemeToggle className="absolute top-6 right-6" />

      {/* Header with Group Settings */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{groupData?.name}</h1>
          <p className="text-muted-foreground">Manage your shared items and expenses</p>
        </div>
        <GroupSettings
          groupId={groupId}
          groupData={groupData}
          members={members}
          items={items}
          allMembers={members}
          onRefresh={fetchGroupData}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Asset Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalItemValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Member Summary Section */}
      {members.length > 0 && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Members</h2>
            <p className="text-sm text-muted-foreground">Click on a member to see detailed breakdown</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {members.map(member => (
              <MemberSummaryCard
                key={member.id}
                member={member}
                items={items}
                allMembers={members}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shared Items Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Shared Items</CardTitle>
          <Dialog open={isItemModalOpen} onOpenChange={handleItemModalOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Shared Item'}</DialogTitle>
                <DialogDescription>
                  {editingItem ? 'Update the details of this item.' : 'Add a new item shared by the members.'}
                </DialogDescription>
              </DialogHeader>
              <ItemForm
                setOpen={setItemModalOpen}
                existingItem={editingItem}
                groupId={groupId}
                onSuccess={fetchGroupData}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead>Added by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {items.map(item => (
                    <motion.tr
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{formatCurrency(item.price)}</TableCell>
                      <TableCell>
                        {isValid(new Date(item.purchase_date)) ? format(new Date(item.purchase_date), "PPP") : 'Invalid Date'}
                      </TableCell>
                      <TableCell>{item.created_by_name}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditClick(item)}
                        >
                          <Edit className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No shared items yet</p>
              <p className="text-sm text-muted-foreground">Add your first shared item to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <footer className="text-center text-slate-500 dark:text-slate-400 text-sm pt-16">
        <p>Built with ❤️ by Sajid Anam Ifti</p>
      </footer>
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default GroupHomePage;
