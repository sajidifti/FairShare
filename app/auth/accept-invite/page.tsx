"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const acceptInviteSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type AcceptInviteFormValues = z.infer<typeof acceptInviteSchema>;

interface AcceptInviteResponse {
    success?: boolean;
    error?: string;
}

function AcceptInviteContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams?.get('token');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const form = useForm<AcceptInviteFormValues>({
        resolver: zodResolver(acceptInviteSchema),
        defaultValues: {
            name: '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (values: AcceptInviteFormValues) => {
        if (!token) {
            toast.error('Invalid invite link - missing token');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/auth/accept-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    name: values.name,
                    password: values.password,
                }),
            });

            const data: AcceptInviteResponse = await res.json();

            if (res.ok && data.success) {
                setIsSuccess(true);
                toast.success('Account setup complete! Redirecting...');
                // Redirect to home page after a short delay
                setTimeout(() => {
                    router.push('/');
                }, 1500);
            } else {
                toast.error(data.error || 'Failed to complete account setup');
            }
        } catch (error) {
            console.error('Accept invite error:', error);
            toast.error('An error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl text-destructive">Invalid Invite Link</CardTitle>
                        <CardDescription>
                            This invite link is invalid or has expired. Please contact the group owner for a new invite.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <Button onClick={() => router.push('/')}>
                            Go to Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl text-green-600">Success!</CardTitle>
                        <CardDescription>
                            Your account has been set up. Redirecting you to the app...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Welcome to FairShare!</CardTitle>
                    <CardDescription>
                        You've been invited to join a group. Complete your account setup below.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Your Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Enter your name" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="Create a password"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Confirm Password</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="Confirm your password"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    'Complete Setup'
                                )}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </CardContent>
                </Card>
            </div>
        }>
            <AcceptInviteContent />
        </Suspense>
    );
}
