import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Activity, CheckCircle2 } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import type { UserPublic } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const token = params.get("token");
  const email = params.get("email") || "";
  const [state, setState] = useState(token ? "verifying" : "waiting");
  const [message, setMessage] = useState(token ? "" : "Check your inbox for the verification link.");
  useEffect(() => {
    if (!token) return;
    apiPost<UserPublic>("/auth/verify-email", { token }).then((user) => {
      client.setQueryData(["me"], user);
      setState("success");
      setMessage("Your email is verified. Redirecting to your dashboard...");
      setTimeout(() => navigate("/", { replace: true }), 700);
    }).catch((error) => {
      const body = error instanceof ApiError ? error.body as {detail?: string} : null;
      setState("error");
      setMessage(body?.detail || "This verification link is invalid or expired.");
    });
  }, [token, navigate, client]);
  return <div className="flex min-h-svh items-center justify-center bg-slate-50 p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-blue-700 text-white"><Activity size={20}/></div>
      {state === "success" ? <CheckCircle2 className="mx-auto mt-7 size-12 text-emerald-600"/> : null}
      <h1 className="mt-5 text-2xl font-semibold text-slate-950">{state === "success" ? "Email verified" : "Verify your email"}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
      {state === "waiting" ? <p className="mt-2 text-xs text-slate-400">We sent the verification link to <strong>{email}</strong>. Check spam if you don't see it.</p> : null}
      {state === "error" ? <Link to="/signup" className="mt-6 inline-block text-sm font-semibold text-blue-700">Create a new account</Link> : null}
      {state === "waiting" ? <Button onClick={() => navigate("/login")} className="mt-6 bg-blue-700">Go to login</Button> : null}
    </div>
  </div>;
}
