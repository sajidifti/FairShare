'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, PlusCircle, UserPlus, Trash2, Edit, Info, RotateCw, Users, Package, DollarSign, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
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
  depreciation_years: number;
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
  depreciationYears: z.coerce.number().int().min(1, { message: "Must be at least 1 year." }),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function calculateRefundForItem(member: Member, item: Item, allMembers: Member[]): number {
  if (!member.leave_date) return 0;
  
  const purchaseDate = new Date(item.purchase_date);
  const leaveDate = new Date(member.leave_date);
  
  if (purchaseDate >= leaveDate) return 0;
  
  const yearsOwned = (leaveDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const depreciation = Math.min(yearsOwned / item.depreciation_years, 1);
  const currentValue = item.price * (1 - depreciation);
  
  const membersAtPurchase = allMembers.filter(m => 
    new Date(m.joined_at) <= purchaseDate && 
    (!m.leave_date || new Date(m.leave_date) > purchaseDate)
  ).length;
  
  return currentValue / membersAtPurchase;
}

function calculateTotalRefundForMember(member: Member, items: Item[], allMembers: Member[]): number {
  return items.reduce((total, item) => total + calculateRefundForItem(member, item, allMembers), 0);
}

function ItemForm({ setOpen, existingItem, groupId, onSuccess }: { 
  setOpen: (open: boolean) => void; 
  existingItem?: Item;
  groupId: number;
  onSuccess: () => void;
}) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as any,
    defaultValues: existingItem ? { 
      name: existingItem.name,
      price: existingItem.price,
      purchaseDate: new Date(existingItem.purchase_date),
      depreciationYears: existingItem.depreciation_years
    } : {
      name: '',
      price: 0,
      purchaseDate: new Date(),
      depreciationYears: 3
    },
  });

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
          depreciationYears: values.depreciationYears,
        }),
      });

  const data = (await response.json()) as { error?: string } | any;

      if (response.ok) {
        toast.success(`Item "${values.name}" ${existingItem ? 'updated' : 'added'}.`);
        form.reset();
        setOpen(false);
        onSuccess();
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
          <FormItem className="flex flex-col">
            <FormLabel>Purchase Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="depreciationYears" render={({ field }) => (
          <FormItem>
            <FormLabel>Depreciation (Years)</FormLabel>
            <FormControl>
              <Input type="number" placeholder="3" {...field} />
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

function MemberCard({ member, items, allMembers }: { member: Member; items: Item[]; allMembers: Member[] }) {
  const totalRefund = calculateTotalRefundForMember(member, items, allMembers);

  const handleUpdateLeaveDate = async (leaveDate: Date | undefined) => {
    try {
      const dateToSend = leaveDate ? leaveDate.toISOString().split('T')[0] : null;
      const response = await fetch(`/api/groups/${member.id}/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaveDate: dateToSend,
        }),
      });

      if (response.ok) {
        toast.success('Leave date updated');
        // Refresh data
        window.location.reload();
      } else {
        toast.error('Failed to update leave date');
      }
    } catch (error) {
      toast.error('Failed to update leave date');
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {member.leave_date && isValid(new Date(member.leave_date)) ? format(new Date(member.leave_date), "PPP") : "Set Leave Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar 
                  mode="single" 
                  required={false}
                  selected={member.leave_date ? new Date(member.leave_date) : undefined} 
                  onSelect={handleUpdateLeaveDate} 
                  disabled={(date) => date < new Date(member.joined_at)} 
                  initialFocus 
                />
              </PopoverContent>
            </Popover>
            {member.leave_date && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="w-full">
                    <Info className="mr-2 h-4 w-4" /> View Breakdown
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Refund Breakdown</h4>
                      <p className="text-sm text-muted-foreground">Calculation for {member.name}</p>
                    </div>
                    <div className="grid gap-2 max-h-60 overflow-y-auto pr-2">
                      {items.filter(item => new Date(item.purchase_date) < new Date(member.leave_date!)).map(item => {
                        const refund = calculateRefundForItem(member, item, allMembers);
                        return (
                          <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm">
                            <span className="truncate">{item.name}</span>
                            <span className="font-mono">{formatCurrency(refund)}</span>
                          </div>
                        );
                      })}
                      {items.filter(item => new Date(item.purchase_date) < new Date(member.leave_date!)).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">No items were purchased before the leave date.</p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
      
      {/* Invite Code Section */}
      {groupData?.invite_code && (
        <Card className="mb-8 border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Group Invite Code
            </CardTitle>
            <CardDescription>
              Share this code with others to invite them to join your group
            </CardDescription>
          </CardHeader>
          <CardContent>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnimatePresence>
                {members.length > 0 ? (
                  members.map(member => (
                    <MemberCard 
                      key={member.id} 
                      member={member} 
                      items={items} 
                      allMembers={members} 
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No members yet</p>
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-2 space-y-6">
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
        </div>
      </div>
      
      <footer className="text-center text-slate-500 dark:text-slate-400 text-sm pt-16">
        <p>Built with ❤️ at Cloudflare</p>
      </footer>
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default GroupHomePage;
