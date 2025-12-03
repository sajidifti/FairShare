'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, PlusCircle, UserPlus, Trash2, Edit, Info, RotateCw, Users, Package, DollarSign, Copy, Check, Settings, ChevronsUpDown, Link as LinkIcon } from 'lucide-react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface Member {
  id: number;
  user_id: number;
  group_id: number;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  name: string;
  email: string;
  leave_date?: string | null;
  pending_invite_count?: number;
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

// Utility: Normalize date to local midnight
const normalizeDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

// Get depreciation days for an item
function getDepreciationDays(item: Item): number {
  return Math.max(1, Math.round((item.depreciation_days ?? (item.depreciation_years ? item.depreciation_years * 365 : 365))));
}

// Get depreciation end date for an item
function getDepreciationEndDate(item: Item): Date {
  const purchaseDate = new Date(item.purchase_date);
  const depreciationDays = getDepreciationDays(item);
  const depreciationEnd = new Date(purchaseDate.getTime());
  depreciationEnd.setDate(depreciationEnd.getDate() + (depreciationDays - 1));
  return depreciationEnd;
}

// Calculate remaining depreciated value of an item at a specific date
function getDepreciatedValueAtDate(item: Item, atDate: Date): number {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const checkDate = normalizeDate(atDate);
  const depreciationDays = getDepreciationDays(item);
  
  // If check date is before purchase, full value remains
  if (checkDate < purchaseDate) return item.price;
  
  // Days elapsed since purchase
  const daysElapsed = Math.floor((checkDate.getTime() - purchaseDate.getTime()) / ONE_DAY_MS);
  
  // If fully depreciated, value is 0
  if (daysElapsed >= depreciationDays) return 0;
  
  // Linear depreciation: remaining value
  const remainingDays = depreciationDays - daysElapsed;
  return (item.price / depreciationDays) * remainingDays;
}

// Check if a member is present on a specific day
function isMemberPresentOnDay(member: Member, day: Date): boolean {
  const joinDate = normalizeDate(new Date(member.joined_at));
  const checkDay = normalizeDate(day);
  const leaveDate = member.leave_date ? normalizeDate(new Date(member.leave_date)) : null;
  
  // Must have joined by this day
  if (joinDate > checkDay) return false;
  // Must not have left before this day
  if (leaveDate && leaveDate < checkDay) return false;
  return true;
}

// Get all members present on a specific day
function getMembersPresentOnDay(members: Member[], day: Date): Member[] {
  return members.filter(m => isMemberPresentOnDay(m, day));
}

// Calculate buy-in amount for a member who joined after item purchase
// Returns the amount they need to pay to existing members for their share of remaining value
function calculateBuyInForItem(member: Member, item: Item, allMembers: Member[]): number {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const memberJoinDate = normalizeDate(new Date(member.joined_at));
  
  // Only applies if member joined after purchase
  if (memberJoinDate <= purchaseDate) return 0;
  
  // Get depreciated value at the time member joined
  const valueAtJoin = getDepreciatedValueAtDate(item, memberJoinDate);
  if (valueAtJoin <= 0) return 0; // Item fully depreciated before member joined
  
  // Count members present at the moment the new member joins (including the new member)
  const membersAtJoin = getMembersPresentOnDay(allMembers, memberJoinDate);
  if (membersAtJoin.length === 0) return 0;
  
  // New member's share of the remaining value
  return valueAtJoin / membersAtJoin.length;
}

// Calculate daily usage cost for a member for an item
// This handles both original purchasers and late joiners
function calculateUsageForItem(member: Member, item: Item, allMembers: Member[], endDate?: Date): number {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const memberJoinDate = normalizeDate(new Date(member.joined_at));
  const depreciationEnd = normalizeDate(getDepreciationEndDate(item));
  const depreciationDays = getDepreciationDays(item);
  const perDayValue = item.price / depreciationDays;
  
  // Member's effective start date for this item
  const startDate = memberJoinDate > purchaseDate ? memberJoinDate : purchaseDate;
  
  // End date for calculation (either leave date, provided end date, depreciation end, or today)
  const today = normalizeDate(new Date());
  let calcEndDate = depreciationEnd < today ? depreciationEnd : today;
  if (member.leave_date) {
    const leaveDate = normalizeDate(new Date(member.leave_date));
    if (leaveDate < calcEndDate) calcEndDate = leaveDate;
  }
  if (endDate) {
    const ed = normalizeDate(endDate);
    if (ed < calcEndDate) calcEndDate = ed;
  }
  
  // If member's start is after calculation end, no usage
  if (startDate > calcEndDate) return 0;
  if (startDate > depreciationEnd) return 0;
  
  // Iterate each day and calculate member's share
  let total = 0;
  let cursor = new Date(startDate.getTime());
  const last = calcEndDate < depreciationEnd ? calcEndDate : depreciationEnd;
  
  while (cursor.getTime() <= last.getTime()) {
    const presentMembers = getMembersPresentOnDay(allMembers, cursor);
    if (presentMembers.length > 0) {
      total += perDayValue / presentMembers.length;
    }
    cursor = new Date(cursor.getTime() + ONE_DAY_MS);
  }
  
  return total;
}

// Calculate what a member originally paid for an item (or bought in for)
function calculateInitialPaymentForItem(member: Member, item: Item, allMembers: Member[]): number {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const memberJoinDate = normalizeDate(new Date(member.joined_at));
  
  if (memberJoinDate <= purchaseDate) {
    // Original purchaser: paid equal share at purchase time
    const membersAtPurchase = allMembers.filter(m => {
      const joinDate = normalizeDate(new Date(m.joined_at));
      return joinDate <= purchaseDate;
    });
    return item.price / membersAtPurchase.length;
  } else {
    // Late joiner: pays buy-in amount
    return calculateBuyInForItem(member, item, allMembers);
  }
}

// Calculate what each member owes to or receives from others for an item
interface MemberBalance {
  memberId: number;
  memberName: string;
  initialPayment: number;  // What they paid upfront (purchase share or buy-in)
  usage: number;           // Their actual usage cost
  buyInPaid: number;       // Amount paid to buy into past items
  buyInReceived: number;   // Amount received from new members
  netBalance: number;      // Positive = owed money, Negative = owes money
}

function calculateMemberBalanceForItem(member: Member, item: Item, allMembers: Member[]): MemberBalance {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const memberJoinDate = normalizeDate(new Date(member.joined_at));
  const isOriginalPurchaser = memberJoinDate <= purchaseDate;
  
  const initialPayment = calculateInitialPaymentForItem(member, item, allMembers);
  const usage = calculateUsageForItem(member, item, allMembers);
  const buyInPaid = isOriginalPurchaser ? 0 : calculateBuyInForItem(member, item, allMembers);
  
  // Calculate buy-in received from members who joined after this member and during item depreciation
  let buyInReceived = 0;
  if (isOriginalPurchaser || memberJoinDate <= purchaseDate) {
    // Check for members who joined after purchase but while this member was present
    const depreciationEnd = getDepreciationEndDate(item);
    allMembers.forEach(laterMember => {
      const laterJoinDate = normalizeDate(new Date(laterMember.joined_at));
      // Later member joined after purchase and within depreciation period
      if (laterJoinDate > purchaseDate && laterJoinDate <= depreciationEnd) {
        // Check if current member was present when later member joined
        if (isMemberPresentOnDay(member, laterJoinDate)) {
          const valueAtLaterJoin = getDepreciatedValueAtDate(item, laterJoinDate);
          const membersWhenLaterJoined = getMembersPresentOnDay(allMembers, laterJoinDate);
          // Members who were there BEFORE the new member joined get compensation
          const existingMembers = membersWhenLaterJoined.filter(m => {
            const mJoin = normalizeDate(new Date(m.joined_at));
            return mJoin < laterJoinDate;
          });
          if (existingMembers.length > 0 && existingMembers.some(m => m.id === member.id)) {
            // This member receives a portion of the buy-in
            const buyInFromLater = valueAtLaterJoin / membersWhenLaterJoined.length;
            buyInReceived += buyInFromLater / existingMembers.length * existingMembers.length / membersWhenLaterJoined.length;
          }
        }
      }
    });
  }
  
  // Recalculate buy-in received properly:
  // When a new member joins, they pay (depreciated value / total members including themselves)
  // This amount is distributed to existing members proportionally
  buyInReceived = 0;
  const depreciationEnd = getDepreciationEndDate(item);
  allMembers.forEach(laterMember => {
    if (laterMember.id === member.id) return;
    const laterJoinDate = normalizeDate(new Date(laterMember.joined_at));
    if (laterJoinDate > purchaseDate && laterJoinDate <= depreciationEnd) {
      // Was current member present when later member joined?
      if (isMemberPresentOnDay(member, laterJoinDate)) {
        const valueAtLaterJoin = getDepreciatedValueAtDate(item, laterJoinDate);
        const allMembersAtThatTime = getMembersPresentOnDay(allMembers, laterJoinDate);
        const existingMembersAtThatTime = allMembersAtThatTime.filter(m => {
          const mJoin = normalizeDate(new Date(m.joined_at));
          return mJoin < laterJoinDate;
        });
        if (existingMembersAtThatTime.length > 0) {
          // New member pays their share
          const newMemberShare = valueAtLaterJoin / allMembersAtThatTime.length;
          // This is distributed among existing members
          buyInReceived += newMemberShare / existingMembersAtThatTime.length;
        }
      }
    }
  });
  
  // Net balance: what they paid - what they used + what they received
  // Positive means they're owed money (used less than paid)
  // Negative means they owe money (used more than paid, though this shouldn't happen)
  const netBalance = initialPayment - usage + buyInReceived - buyInPaid;
  
  return {
    memberId: member.id,
    memberName: member.name,
    initialPayment,
    usage,
    buyInPaid,
    buyInReceived,
    netBalance,
  };
}

// Full breakdown for a member across all items
interface ItemBreakdown {
  item: Item;
  initialPayment: number;
  usage: number;
  buyInPaid: number;
  buyInReceived: number;
  refundable: number;
  isLateJoiner: boolean;
}

function calculateItemBreakdown(member: Member, item: Item, allMembers: Member[]): ItemBreakdown | null {
  const purchaseDate = normalizeDate(new Date(item.purchase_date));
  const memberJoinDate = normalizeDate(new Date(member.joined_at));
  const memberLeaveDate = member.leave_date ? normalizeDate(new Date(member.leave_date)) : null;
  const depreciationEnd = normalizeDate(getDepreciationEndDate(item));
  
  // If member left before or on purchase date, they have no involvement
  if (memberLeaveDate && memberLeaveDate <= purchaseDate) return null;
  
  // If member joined after depreciation ended, they have no involvement
  if (memberJoinDate > depreciationEnd) return null;
  
  const isLateJoiner = memberJoinDate > purchaseDate;
  const balance = calculateMemberBalanceForItem(member, item, allMembers);
  
  return {
    item,
    initialPayment: balance.initialPayment,
    usage: balance.usage,
    buyInPaid: balance.buyInPaid,
    buyInReceived: balance.buyInReceived,
    refundable: balance.netBalance,
    isLateJoiner,
  };
}

// Calculate total across all items for a member
interface MemberTotals {
  totalInitialPayment: number;
  totalUsage: number;
  totalBuyInPaid: number;
  totalBuyInReceived: number;
  totalRefundable: number;
}

function calculateMemberTotals(member: Member, items: Item[], allMembers: Member[]): MemberTotals {
  const totals: MemberTotals = {
    totalInitialPayment: 0,
    totalUsage: 0,
    totalBuyInPaid: 0,
    totalBuyInReceived: 0,
    totalRefundable: 0,
  };
  
  items.forEach(item => {
    const breakdown = calculateItemBreakdown(member, item, allMembers);
    if (breakdown) {
      totals.totalInitialPayment += breakdown.initialPayment;
      totals.totalUsage += breakdown.usage;
      totals.totalBuyInPaid += breakdown.buyInPaid;
      totals.totalBuyInReceived += breakdown.buyInReceived;
      totals.totalRefundable += breakdown.refundable;
    }
  });
  
  return totals;
}

function calculateTotalRefundForMember(member: Member, items: Item[], allMembers: Member[]): number {
  const totals = calculateMemberTotals(member, items, allMembers);
  return totals.totalRefundable;
}


function UserCombobox({ onSelect }: { onSelect: (user: { name: string; email: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([])

  useEffect(() => {
    if (query.length < 2) {
      setUsers([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        if (data.users) setUsers(data.users)
      } catch (error) {
        console.error('Search error:', error)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value
            ? users.find((user) => user.email === value)?.name || value
            : "Search user..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name or email..." onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.email}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue)
                    onSelect({ name: user.name, email: user.email })
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === user.email ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
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

  const handleUserSelect = (user: { name: string; email: string }) => {
    form.setValue('name', user.name);
    form.setValue('email', user.email);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <div className="space-y-2">
          <FormLabel>Search Existing User</FormLabel>
          <UserCombobox onSelect={handleUserSelect} />
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or enter details manually</span>
          </div>
        </div>
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

  const handleCopyInviteLink = async (memberId: number) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-invite-link', memberId }),
      });
      const data = await res.json();
      if (res.ok && data.link) {
        await navigator.clipboard.writeText(data.link);
        toast.success('Invite link copied to clipboard');
      } else {
        toast.error(data.error || 'Failed to get invite link');
      }
    } catch (error) {
      toast.error('Failed to get invite link');
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

                              <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={handleResetPassword}>
                                  <RotateCw className="mr-2 h-4 w-4" />
                                  Reset Password
                                </Button>
                                {member.pending_invite_count && member.pending_invite_count > 0 && (
                                  <Button variant="outline" className="flex-1" onClick={() => handleCopyInviteLink(member.id)} title="Copy Invite Link">
                                    <LinkIcon className="mr-2 h-4 w-4" />
                                    Copy Invite
                                  </Button>
                                )}
                              </div>
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
  const totals = calculateMemberTotals(member, items, allMembers);

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

            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Paid / Buy-in</span>
                <span className="font-semibold">{formatCurrency(totals.totalInitialPayment)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Usage</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(totals.totalUsage)}</span>
              </div>
              {totals.totalBuyInReceived > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">From New Members</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">+{formatCurrency(totals.totalBuyInReceived)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t">
                <span className="text-sm font-medium">
                  {member.leave_date ? (totals.totalRefundable >= 0 ? 'Refundable' : 'Owes') : 'Net Balance'}
                </span>
                <span className={cn(
                  "font-bold",
                  totals.totalRefundable >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {totals.totalRefundable >= 0 ? '+' : ''}{formatCurrency(Math.abs(totals.totalRefundable))}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cost Breakdown - {member.name}</DialogTitle>
            <DialogDescription>
              Detailed breakdown of payments, usage, and balance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-xl font-bold">{formatCurrency(totals.totalInitialPayment)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Usage</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totals.totalUsage)}</p>
                  </div>
                  {totals.totalBuyInReceived > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">From New Members</p>
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400">+{formatCurrency(totals.totalBuyInReceived)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {member.leave_date ? (totals.totalRefundable >= 0 ? 'Refundable' : 'Owes') : 'Net Balance'}
                    </p>
                    <p className={cn(
                      "text-xl font-bold",
                      totals.totalRefundable >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}>
                      {totals.totalRefundable >= 0 ? '+' : ''}{formatCurrency(Math.abs(totals.totalRefundable))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Item Breakdown */}
            <div>
              <h3 className="font-semibold mb-3">Item Breakdown</h3>
              <div className="space-y-3">
                {items.map(item => {
                  const breakdown = calculateItemBreakdown(member, item, allMembers);
                  if (!breakdown) return null;

                  return (
                    <Card key={item.id}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{breakdown.item.name}</span>
                            {breakdown.isLateJoiner && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded">
                                Joined Late
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {breakdown.isLateJoiner ? 'Buy-in Amount:' : 'Initial Share:'}
                              </span>
                              <span className="font-mono font-medium">{formatCurrency(breakdown.initialPayment)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Usage Cost:</span>
                              <span className="font-mono text-orange-600 dark:text-orange-400">-{formatCurrency(breakdown.usage)}</span>
                            </div>
                            {breakdown.buyInReceived > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Received from New Members:</span>
                                <span className="font-mono text-green-600 dark:text-green-400">+{formatCurrency(breakdown.buyInReceived)}</span>
                              </div>
                            )}
                            <div className="border-t pt-1 mt-1 flex justify-between font-medium">
                              <span>{member.leave_date ? (breakdown.refundable >= 0 ? 'Refundable:' : 'Owes:') : 'Net Balance:'}</span>
                              <span className={cn(
                                "font-mono",
                                breakdown.refundable >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                              )}>
                                {breakdown.refundable >= 0 ? '+' : ''}{formatCurrency(Math.abs(breakdown.refundable))}
                              </span>
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
  const totals = calculateMemberTotals(member, items, allMembers);

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
          <div className={cn(
            "text-2xl font-bold",
            totals.totalRefundable >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          )}>
            {totals.totalRefundable >= 0 ? '+' : ''}{formatCurrency(Math.abs(totals.totalRefundable))}
          </div>
          <p className="text-xs text-muted-foreground">
            {member.leave_date ? (totals.totalRefundable >= 0 ? 'Refundable Amount' : 'Amount Owed') : 'Net Balance'}
          </p>
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
                      {items.map(item => {
                        const breakdown = calculateItemBreakdown(member, item, allMembers);
                        if (!breakdown) return null;

                        return (
                          <div key={item.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{breakdown.item.name}</span>
                              {breakdown.isLateJoiner && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                  Late
                                </span>
                              )}
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {breakdown.isLateJoiner ? 'Buy-in:' : 'Initial Share:'}
                                </span>
                                <span className="font-mono font-medium">{formatCurrency(breakdown.initialPayment)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Usage:</span>
                                <span className="font-mono text-orange-600 dark:text-orange-400">-{formatCurrency(breakdown.usage)}</span>
                              </div>
                              {breakdown.buyInReceived > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">From New Members:</span>
                                  <span className="font-mono text-green-600 dark:text-green-400">+{formatCurrency(breakdown.buyInReceived)}</span>
                                </div>
                              )}
                              <div className="border-t pt-1 mt-1 flex justify-between font-medium">
                                <span>{member.leave_date ? (breakdown.refundable >= 0 ? 'Refundable:' : 'Owes:') : 'Balance:'}</span>
                                <span className={cn(
                                  "font-mono",
                                  breakdown.refundable >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                )}>
                                  {breakdown.refundable >= 0 ? '+' : ''}{formatCurrency(Math.abs(breakdown.refundable))}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }).filter(Boolean)}
                      {items.every(item => !calculateItemBreakdown(member, item, allMembers)) && (
                        <p className="text-sm text-muted-foreground text-center py-2">No item involvement for this member.</p>
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
