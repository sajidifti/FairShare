import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, PlusCircle, UserPlus, Trash2, Edit, Info, RotateCw, Users, Package, DollarSign } from 'lucide-react';
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
import { useMembers, useItems, useAppActions, calculateTotalRefundForMember, Member, Item, calculateRefundForItem } from '@/stores/app-store';
import { StatCard, EmptyState } from '@/components/DashboardComponents';
const memberSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  joiningDate: z.date({ message: "A valid joining date is required." }),
});
type MemberFormValues = z.infer<typeof memberSchema>;
const itemSchema = z.object({
  name: z.string().min(2, { message: "Item name must be at least 2 characters." }),
  price: z.coerce.number().positive({ message: "Price must be a positive number." }),
  purchaseDate: z.date({ message: "A valid purchase date is required." }),
  depreciationYears: z.coerce.number().int().min(1, { message: "Must be at least 1 year." }),
});
type ItemFormValues = z.infer<typeof itemSchema>;
function AddMemberForm({ setOpen }: { setOpen: (open: boolean) => void }) {
  const { addMember } = useAppActions();
  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema) as any,
    defaultValues: { name: '', joiningDate: new Date() },
  });
  function onSubmit(values: MemberFormValues) {
    addMember(values.name, values.joiningDate);
    toast.success(`Member "${values.name}" added.`);
    form.reset();
    setOpen(false);
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Member Name</FormLabel>
            <FormControl><Input placeholder="e.g., Alex" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="joiningDate" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Joining Date</FormLabel>
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
        <DialogFooter className="pt-4">
          <Button type="submit">Add Member</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
function ItemForm({ setOpen, existingItem }: { setOpen: (open: boolean) => void; existingItem?: Item }) {
  const { addItem, editItem } = useAppActions();
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as any,
    defaultValues: existingItem ? { ...existingItem } : {
      name: '',
      price: 0,
      purchaseDate: new Date(),
      depreciationYears: 3
    },
  });
  function onSubmit(values: ItemFormValues) {
    if (existingItem) {
      editItem(existingItem.id, values);
      toast.success(`Item "${values.name}" updated.`);
    } else {
      addItem(values);
      toast.success(`Item "${values.name}" added.`);
    }
    form.reset();
    setOpen(false);
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Item Name</FormLabel><FormControl><Input placeholder="e.g., Refrigerator" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem><FormLabel>Item Price</FormLabel><FormControl><Input type="number" step="0.01" placeholder="1200.00" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="purchaseDate" render={({ field }) => (
          <FormItem className="flex flex-col"><FormLabel>Purchase Date</FormLabel>
            <Popover><PopoverTrigger asChild><FormControl>
              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
              </Button></FormControl></PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus /></PopoverContent>
            </Popover><FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="depreciationYears" render={({ field }) => (
          <FormItem><FormLabel>Depreciation (Years)</FormLabel><FormControl><Input type="number" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <DialogFooter className="pt-4">
          <Button type="submit">{existingItem ? 'Save Changes' : 'Add Item'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
function MemberCard({ member }: { member: Member }) {
  const { removeMember, updateMemberLeaveDate } = useAppActions();
  const items = useItems();
  const members = useMembers();
  const totalRefund = calculateTotalRefundForMember(member, items, members);
  return (
    <motion.div layout transition={{ duration: 0.3, type: 'spring', stiffness: 500, damping: 30 }}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-medium">{member.name}</CardTitle>
            <CardDescription className="text-xs">
              Joined: {isValid(member.joiningDate) ? format(member.joiningDate, "PPP") : 'Invalid Date'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { removeMember(member.id); toast.error(`Member "${member.name}" removed.`); }}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">{formatCurrency(totalRefund)}</div>
          <p className="text-xs text-muted-foreground">Total Refundable Amount</p>
          <div className="mt-4 space-y-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {member.leaveDate && isValid(member.leaveDate) ? format(member.leaveDate, "PPP") : "Set Leave Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={member.leaveDate ?? undefined} onSelect={(date) => updateMemberLeaveDate(member.id, date || null)} disabled={(date) => date < member.joiningDate} initialFocus />
              </PopoverContent>
            </Popover>
            {member.leaveDate && (
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
                      {items.filter(item => item.purchaseDate < member.leaveDate!).map(item => {
                        const refund = calculateRefundForItem(member, item, members);
                        return (
                          <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm">
                            <span className="truncate">{item.name}</span>
                            <span className="font-mono">{formatCurrency(refund)}</span>
                          </div>
                        );
                      })}
                       {items.filter(item => item.purchaseDate < member.leaveDate!).length === 0 && (
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
export function HomePage() {
  const members = useMembers();
  const items = useItems();
  const { removeItem, resetStore } = useAppActions();
  const [isMemberModalOpen, setMemberModalOpen] = useState(false);
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | undefined>(undefined);
  const totalItemValue = items.reduce((sum, item) => sum + item.price, 0);
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
  const handleReset = () => {
    resetStore();
    toast.success("All data has been reset.");
  };
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans antialiased">
      <div className="absolute inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      <ThemeToggle className="absolute top-6 right-6" />
      <main className="container mx-auto px-4 py-12 md:py-16">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50">FairShare Ledger</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mt-4">Manage shared items and calculate refunds for leaving members with ease.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3 mb-8">
            <StatCard title="Total Members" value={members.length} icon={<Users className="h-4 w-4" />} />
            <StatCard title="Total Items" value={items.length} icon={<Package className="h-4 w-4" />} />
            <StatCard title="Total Asset Value" value={formatCurrency(totalItemValue)} icon={<DollarSign className="h-4 w-4" />} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Members</CardTitle>
                <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
                  <DialogTrigger asChild><Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Add New Member</DialogTitle><DialogDescription>Add a new member to the group.</DialogDescription></DialogHeader><AddMemberForm setOpen={setMemberModalOpen} /></DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                <AnimatePresence>
                  {members.length > 0 ? (
                    members.map(member => <MemberCard key={member.id} member={member} />)
                  ) : (
                    <EmptyState 
                      title="No Members Yet"
                      description="Add a member to get started with calculations."
                      icon={<Users className="h-8 w-8" />}
                      action={
                        <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
                          <DialogTrigger asChild><Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add Member</Button></DialogTrigger>
                          <DialogContent><DialogHeader><DialogTitle>Add New Member</DialogTitle><DialogDescription>Add a new member to the group.</DialogDescription></DialogHeader><AddMemberForm setOpen={setMemberModalOpen} /></DialogContent>
                        </Dialog>
                      }
                    />
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
                  <DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Shared Item'}</DialogTitle>
                      <DialogDescription>{editingItem ? 'Update the details of this item.' : 'Add a new item shared by the members.'}</DialogDescription>
                    </DialogHeader>
                    <ItemForm setOpen={setItemModalOpen} existingItem={editingItem} />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {items.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Price</TableHead><TableHead>Purchase Date</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {items.map(item => (
                          <motion.tr key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{formatCurrency(item.price)}</TableCell>
                            <TableCell>{isValid(item.purchaseDate) ? format(item.purchaseDate, "PPP") : 'Invalid Date'}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(item)}><Edit className="h-4 w-4 text-blue-500" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { removeItem(item.id); toast.error(`Item "${item.name}" removed.`); }}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No Shared Items"
                    description="Add your first shared item to see it here."
                    icon={<Package className="h-8 w-8" />}
                    action={
                      <Dialog open={isItemModalOpen} onOpenChange={handleItemModalOpenChange}>
                        <DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button></DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Shared Item</DialogTitle>
                            <DialogDescription>Add a new item shared by the members.</DialogDescription>
                          </DialogHeader>
                          <ItemForm setOpen={setItemModalOpen} />
                        </DialogContent>
                      </Dialog>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        {(members.length > 0 || items.length > 0) && (
            <div className="mt-12 flex justify-center">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm"><RotateCw className="mr-2 h-4 w-4" /> Reset All Data</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete all members and items from local storage.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReset}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        )}
        <footer className="text-center text-slate-500 dark:text-slate-400 text-sm pt-16">
          <p>Built with ❤️ at Cloudflare</p>
        </footer>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default HomePage;