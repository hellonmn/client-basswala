/**
 * app/(auth)/forgot-password.tsx
 *
 * DEPRECATED — the app uses OTP login, so there's no password to reset.
 * Redirects back to the OTP login screen.
 */

import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ForgotPasswordRedirect() {
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
