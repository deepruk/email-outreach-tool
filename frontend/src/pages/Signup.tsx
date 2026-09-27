import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, LockKeyhole } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import type { UserPublic } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Signup() {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [error,setError]=useState("");
  const navigate=useNavigate();
  const signup=useMutation({mutationFn:()=>apiPost<UserPublic>("/auth/signup",{name,email,password}),onSuccess:()=>{navigate(`/verify-email?email=${encodeURIComponent(email)}`);},onError:(e)=>{const body=e instanceof ApiError?e.body as {detail?:string}:null;setError(body?.detail||"Unable to create account.");}});
  const submit=(e:React.FormEvent)=>{e.preventDefault();setError("");if(password.length<10)return setError("Password must be at least 10 characters.");if(password!==confirm)return setError("Passwords do not match.");signup.mutate();};
  return <div className="grid min-h-svh bg-slate-50 lg:grid-cols-[0.9fr_1.1fr]">
    <section className="flex flex-col justify-between bg-slate-950 p-8 text-white lg:p-12"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-blue-600"><Activity size={17}/></div><span className="text-xl font-bold">Rohly</span></div><div className="max-w-lg py-16"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">Get started</p><h1 className="mt-5 text-4xl font-semibold lg:text-5xl">Create your Rohly account.</h1><p className="mt-5 text-base leading-relaxed text-slate-400">Sign up with your email and start using the outbound workspace.</p><div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/60 p-4"><LockKeyhole size={16} className="text-blue-400"/><p className="mt-3 text-sm font-semibold">Secure account</p><p className="mt-1 text-xs text-slate-400">Passwords are stored as secure PBKDF2 hashes.</p></div></div><p className="text-xs text-slate-600">Rohly · Outbound command center</p></section>
    <section className="flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-sm"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Create account</p><h2 className="mt-2 text-3xl font-semibold text-slate-950">Sign up</h2><p className="mt-2 text-sm text-slate-500">We’ll send a verification link to your email before you can access your dashboard.</p>
      <label className="mt-7 block"><span className="mb-2 block text-xs font-semibold">Name</span><Input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required className="h-11"/></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-semibold">Email address</span><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required className="h-11"/></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-semibold">Password</span><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required className="h-11"/></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-semibold">Confirm password</span><Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required className="h-11"/></label>
      {error?<div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>:null}
      <Button type="submit" disabled={signup.isPending} className="mt-5 h-11 w-full gap-2 bg-blue-700 hover:bg-blue-800">{signup.isPending?"Creating account...":"Create account"}<ArrowRight size={15}/></Button>
      <p className="mt-5 text-center text-xs text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>
    </form></section>
  </div>;
}