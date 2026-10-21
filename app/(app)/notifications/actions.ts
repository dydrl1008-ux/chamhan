'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

export async function markAllRead(): Promise<void> {
  const me = await getProfile(); if (!me) return;
  await supabaseServer().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me.id).is('read_at', null);
  revalidatePath('/', 'layout');
}

export async function openNotification(fd: FormData): Promise<void> {
  const me = await getProfile(); if (!me) return;
  const id = Number(fd.get('id'));
  await supabaseServer().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', me.id).is('read_at', null);
  revalidatePath('/', 'layout');
  const link = String(fd.get('link') || '');
  if (link.startsWith('/') && !link.startsWith('//')) redirect(link);
}
