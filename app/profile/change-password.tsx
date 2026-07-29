/**
 * app/profile/change-password.tsx
 *
 * DEPRECATED — the Basswala user app uses OTP login (phone-number based),
 * so users don't have a password to change. This route is kept as a
 * no-op redirect so any stale navigation or deep link just bounces back
 * to the profile screen.
 */

import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ChangePasswordRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/profile" as any);
  }, [router]);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f8ff" }}>
      <ActivityIndicator size="large" color="#02023E" />
    </View>
  );
}
