import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase-client';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const inAuthGroup = segments[0] === '(tabs)';
      if (!session && inAuthGroup) {
        router.replace('/entrar');
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setChecked(true);
      const inAuthGroup = segments[0] === '(tabs)';
      if (!data.session && inAuthGroup) {
        router.replace('/entrar');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, segments]);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
