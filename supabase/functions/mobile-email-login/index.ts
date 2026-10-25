import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import { emailLoginHandler } from './handler.js';
const url=Deno.env.get('SUPABASE_URL') || '';
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const publicKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
const serverKey=keys.default || '';
const publicKey=publicKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || '';
const db=serverKey ? createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
Deno.serve(emailLoginHandler({
 ready:!!db && !!publicKey,
 resolve:async (email:string)=>{
  const {data,error}=await db!.rpc('resolve_mobile_login_email',{p_email:email});
  if(error || !data?.[0])throw Error('LOOKUP_FAILED');
  return data[0];
 },
 signIn:async (phone:string,password:string)=>{
  // Never use admin APIs to create a session or confirm an identity.
  const response=await fetch(url+'/auth/v1/token?grant_type=password',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{apikey:publicKey,'Content-Type':'application/json'},
   body:JSON.stringify({phone,password})
  });
  if(response.status===400 || response.status===401)return null;
  if(!response.ok)throw Error('AUTH_UNAVAILABLE');
  return await response.json();
 }
}));
