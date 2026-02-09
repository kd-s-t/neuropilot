"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Button,
  Card,
  Form,
  Fieldset,
  FieldGroup,
  TextField,
  Label,
  Input,
  FieldError,
  Alert,
  Kbd,
  Spinner,
} from "@heroui/react";
import { api } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [status, callbackUrl, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [isMac, setIsMac] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  const emailInvalid = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailEmpty = email.length === 0;
  const passwordInvalid = !isLogin && password.length > 0 && password.length < 6;
  const passwordEmpty = password.length === 0;

  useEffect(() => {
    api.backendReachable(3000).then(setBackendReachable).catch(() => setBackendReachable(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (emailEmpty || passwordEmpty || emailInvalid || passwordInvalid) return;
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (res?.error) {
          setError(res.error === "CredentialsSignin" ? "Incorrect email or password" : res.error);
          setLoading(false);
          return;
        }
        if (res?.ok) {
          router.push(callbackUrl);
          router.refresh();
        } else {
          setError("Login failed. Please try again.");
          setLoading(false);
        }
        return;
      }
      await api.auth.register({ email, password });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Registration successful but login failed");
        setLoading(false);
        return;
      }
      if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setLoading(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Request failed";
      console.error("Login error:", err);
      setError(
        errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("timed out")
          ? "Cannot reach backend. Start it with: cd _Backend && uvicorn app:app --reload --port 8000"
          : errorMessage
      );
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || status === "authenticated") return null;

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <Image
          src="/neuropilot.png"
          alt="NeuroPilot"
          width={64}
          height={64}
          className="h-16 w-16"
        />
        <h1 className="text-2xl font-bold">
          Neuro<span className="text-accent">Pilot</span>
        </h1>
      </div>
      <motion.div
        layout
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-[338px]"
      >
        <Card className="w-full overflow-hidden">
          <Card.Header className="overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.h2
                key={isLogin ? "login" : "register"}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="text-center text-xl font-semibold w-full"
              >
                {isLogin ? "Login" : "Register"}
              </motion.h2>
            </AnimatePresence>
          </Card.Header>
          <Card.Content className="space-y-4">
            {backendReachable === false && (
            <Alert status="warning" className="mb-4">
              <Alert.Description>
                Backend not reachable. Start it: <code className="text-xs">cd _Backend && uvicorn app:app --reload --port 8000</code>
              </Alert.Description>
            </Alert>
            )}
            <Form className="w-full" onSubmit={handleSubmit}>
              <Fieldset>
                <Fieldset.Legend className="sr-only">{isLogin ? "Login" : "Register"}</Fieldset.Legend>
                <FieldGroup>
                  <TextField isRequired name="email" type="email" isInvalid={(submitAttempted && emailEmpty) || (submitAttempted && emailInvalid)}>
                    <Label>Email</Label>
                    <Input
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).form?.requestSubmit();
                      }}
                      placeholder="Email"
                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <FieldError>{submitAttempted && emailEmpty ? "Email is required" : submitAttempted && emailInvalid ? "Enter a valid email address" : ""}</FieldError>
                  </TextField>
                  <TextField isRequired name="password" type="password" isInvalid={(submitAttempted && passwordEmpty) || passwordInvalid || !!error}>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).form?.requestSubmit();
                      }}
                      placeholder="Password"
                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <FieldError>
                      {error || (submitAttempted && passwordEmpty ? "Password is required" : passwordInvalid ? "Password must be at least 6 characters" : "")}
                    </FieldError>
                  </TextField>
                </FieldGroup>
                <Fieldset.Actions className="flex flex-col gap-2">
                  <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
                    <Button type="submit" className="w-full" isDisabled={loading}>
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Spinner size="sm" />
                          Loading...
                        </span>
                      ) : (
                        <>
                          {isMac && (
                            <Kbd className="ml-1.5 !bg-transparent">
                              <Kbd.Abbr keyValue="enter" />
                            </Kbd>
                          )}
                          {isLogin ? "Login" : "Register"}
                        </>
                      )}
                    </Button>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onPress={() => {
                        setIsLogin(!isLogin);
                        setError("");
                        setSubmitAttempted(false);
                      }}
                    >
                      {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
                    </Button>
                  </motion.div>
                </Fieldset.Actions>
              </Fieldset>
            </Form>
          </Card.Content>
        </Card>
      </motion.div>
    </div>
  );
}
