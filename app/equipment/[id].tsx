/**
 * app/equipment/[id].tsx
 *
 * LEGACY REDIRECT — this route used to be a separate DJ detail screen with a
 * parallel implementation. The canonical screen is now `/dj-detail`, which
 * has the richer features (image gallery, package equipment, Add Extras,
 * reviews, etc.). This shim simply forwards any inbound navigation to the
 * new route so shared links and old history entries keep working.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function EquipmentIdRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = params.id as string | undefined;
  const captainId = params.captainId as string | undefined;

  useEffect(() => {
    if (!id) {
      router.replace("/(tabs)" as any);
      return;
    }
    router.replace({
      pathname: "/dj-detail",
      params: {
        djId: id,
        ...(captainId ? { captainId } : {}),
      },
    } as any);
  }, [id, captainId, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f8ff" }}>
      <ActivityIndicator size="large" color="#02023E" />
    </View>
  );
}
