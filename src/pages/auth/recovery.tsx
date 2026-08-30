import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useT } from "@/i18n";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { IS_MOCK } from "@/lib/config";
import { generateRecoveryCode, verifyCode, getMockRecoveryData, setMockRecoveryData, clearMockRecoveryData, logRecoveryAttempt } from "@/lib/recovery";
import { Dumbbell, Loader2, CheckCircle2, Copy, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const RECOVERY_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") + "/functions/v1/recovery";

const codeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(16, "Code must be exactly 16 characters"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "Minimum 6 characters"),
  confirmPassword: z.string().min(6, "Minimum 6 characters"),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type Step = "code" | "password" | "newCode" | "done";

export default function Recovery() {
  const t = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("code");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewCode, setShowNewCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { email: "", code: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onVerifyCode(values: z.infer<typeof codeSchema>) {
    setIsSubmitting(true);
    try {
      if (IS_MOCK) {
        const mockData = getMockRecoveryData();
        if (!mockData || mockData.userId !== "mock-admin-id") {
          toast({ variant: "destructive", title: "Error", description: "Invalid credentials" });
          setIsSubmitting(false);
          return;
        }
        const valid = await verifyCode(values.code.toUpperCase(), mockData.hash);
        if (!valid) {
          await logRecoveryAttempt("mock-admin-id", false);
          toast({ variant: "destructive", title: "Error", description: "Invalid credentials" });
          setIsSubmitting(false);
          return;
        }
        if (values.email.toLowerCase() !== "moussamohamedelmabrouk@gmail.com") {
          toast({ variant: "destructive", title: "Error", description: "Invalid credentials" });
          setIsSubmitting(false);
          return;
        }
        setVerifiedUserId(mockData.userId);
        await logRecoveryAttempt(mockData.userId, true);
        setStep("password");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(RECOVERY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: values.email, code: values.code.toUpperCase() }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: data.error || "Invalid credentials" });
        setIsSubmitting(false);
        return;
      }
      setVerifiedUserId(data.userId);
      setStep("password");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Invalid credentials" });
    }
    setIsSubmitting(false);
  }

  async function onResetPassword(values: z.infer<typeof passwordSchema>) {
    if (!verifiedUserId) return;
    setIsSubmitting(true);
    try {
      if (IS_MOCK) {
        const { plainText, hash } = await generateRecoveryCode();
        setNewRecoveryCode(plainText);
        clearMockRecoveryData();
        setMockRecoveryData({
          userId: verifiedUserId,
          hash,
          created_at: new Date().toISOString(),
          last_used_at: null,
        });
        setStep("newCode");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(RECOVERY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", email: codeForm.getValues("email"), code: codeForm.getValues("code").toUpperCase(), newPassword: values.password }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setNewRecoveryCode(data.newCode);

      const { supabase } = await import("@/lib/supabase");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: codeForm.getValues("email"),
        password: values.password,
      });
      if (signInError) throw signInError;

      setStep("newCode");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" });
    }
    setIsSubmitting(false);
  }

  async function onComplete() {
    navigate("/dashboard", { replace: true });
  }

  function copyCode() {
    navigator.clipboard.writeText(newRecoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.3) saturate(1.2)',
      }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a12]/80 via-[#0a0a12]/50 to-[#0a0a12]/70" />

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-lg">
              <Dumbbell className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-gradient">QLF GYM</span>
            </span>
          </div>

          <Card className="shadow-2xl glass-card gradient-border">
            <CardHeader className="text-center space-y-2 pb-6 pt-8">
              <CardTitle className="text-2xl font-bold">
                <AnimatePresence mode="wait">
                  {step === "code" && <motion.span key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Account Recovery</motion.span>}
                  {step === "password" && <motion.span key="password" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Set New Password</motion.span>}
                  {step === "newCode" && <motion.span key="newCode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Save Your Recovery Code</motion.span>}
                </AnimatePresence>
              </CardTitle>
              <CardDescription>
                {step === "code" && "Enter your admin email and recovery code"}
                {step === "password" && "Choose a new password for your account"}
                {step === "newCode" && "Your new recovery code is shown below. Save it in a safe place."}
              </CardDescription>
            </CardHeader>

            <CardContent className="pb-8 px-8">
              <AnimatePresence mode="wait">
                {step === "code" && (
                  <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <Form {...codeForm}>
                      <form onSubmit={codeForm.handleSubmit(onVerifyCode)} className="space-y-5">
                        <FormField control={codeForm.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="admin@example.com" className="h-11 text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={codeForm.control} name="code" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recovery Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="A7F9K2M8Q5X1L9PW"
                                className="h-11 text-base font-mono tracking-widest uppercase"
                                maxLength={16}
                                {...field}
                                onChange={e => field.onChange(e.target.value.toUpperCase())}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <Button type="submit" size="lg" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                          Verify Code
                        </Button>
                      </form>
                    </Form>
                    <div className="mt-6 text-center text-sm text-muted-foreground">
                      <Link to="/auth" className="text-primary hover:underline font-medium">Back to Sign In</Link>
                    </div>
                  </motion.div>
                )}

                {step === "password" && (
                  <motion.div key="password" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(onResetPassword)} className="space-y-5">
                        <FormField control={passwordForm.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input type={showPassword ? "text" : "password"} placeholder="••••••••" className="h-11 text-base pr-10" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 px-3" onClick={() => setShowPassword(!showPassword)}>
                                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" className="h-11 text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <Button type="submit" size="lg" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                          Reset Password
                        </Button>
                      </form>
                    </Form>
                  </motion.div>
                )}

                {step === "newCode" && (
                  <motion.div key="newCode" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                    <div className="flex items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                        <CheckCircle2 className="h-8 w-8 text-success" />
                      </div>
                    </div>

                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Your password has been successfully reset.
                      </p>
                      <p className="text-sm font-medium text-warning">
                        Save your new recovery code now. It will not be shown again.
                      </p>
                    </div>

                    <div className="relative">
                      <div className="bg-muted rounded-lg p-4 text-center">
                        <code className={`text-lg font-mono tracking-widest ${showNewCode ? "text-foreground" : "text-muted"}`}>
                          {showNewCode ? newRecoveryCode : newRecoveryCode.replace(/./g, "•")}
                        </code>
                      </div>
                      <div className="flex justify-center gap-2 mt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCode(!showNewCode)}>
                          {showNewCode ? "Hide" : "Show"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                          <Copy className="h-4 w-4 mr-1" />
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>

                    <Button onClick={onComplete} size="lg" className="w-full h-11 text-base font-semibold">
                      Continue to Dashboard
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
