/**
 * app/(auth)/register.tsx
 *
 * DEPRECATED — new users sign up via OTP on the login screen. This
 * legacy password-based registration flow is kept as a redirect so any
 * stale button still works.
 */

import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(auth)/login" as any);
  }, [router]);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f8ff" }}>
      <ActivityIndicator size="large" color="#02023E" />
    </View>
  );
}
