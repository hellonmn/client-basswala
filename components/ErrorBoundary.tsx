/**
 * components/ErrorBoundary.tsx
 * Catches rendering errors anywhere in the React tree and shows a graceful
 * fallback UI instead of a white screen.
 */

import React, { Component, ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ errorInfo: info.componentStack || null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={s.gradient}>
            <View style={s.card}>
              <View style={s.iconWrap}>
                <Ionicons name="warning-outline" size={44} color="#ef4444" />
              </View>
              <Text style={s.title}>Something went wrong</Text>
              <Text style={s.subtitle}>
                An unexpected error occurred. You can try again, or restart the app if it keeps happening.
              </Text>

              {__DEV__ && this.state.error && (
                <ScrollView style={s.errorBox}>
                  <Text style={s.errorText}>
                    {this.state.error.name}: {this.state.error.message}
                  </Text>
                  {this.state.errorInfo && (
                    <Text style={s.stackText}>{this.state.errorInfo}</Text>
                  )}
                </ScrollView>
              )}

              <TouchableOpacity style={s.resetBtn} onPress={this.handleReset} activeOpacity={0.85}>
                <LinearGradient colors={["#02023E", "#02023E"]} style={s.resetBtnGrad}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={s.resetBtnText}>Try Again</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  gradient: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  card: {
    width: "100%", maxWidth: 420, backgroundColor: "#fff",
    borderRadius: 24, padding: 28, alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 28, backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#101720", textAlign: "center" },
  subtitle: {
    fontSize: 14, color: "#8696a0", fontWeight: "500",
    textAlign: "center", lineHeight: 21, marginTop: 10,
  },
  errorBox: {
    maxHeight: 160, alignSelf: "stretch",
    marginTop: 16, padding: 12,
    backgroundColor: "#fef2f2", borderRadius: 12,
    borderWidth: 1, borderColor: "#fecaca",
  },
  errorText: { fontSize: 12, color: "#991b1b", fontFamily: "monospace", fontWeight: "700" },
  stackText: { fontSize: 10, color: "#7f1d1d", fontFamily: "monospace", marginTop: 8 },
  resetBtn: { marginTop: 22, borderRadius: 16, overflow: "hidden", alignSelf: "stretch" },
  resetBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 8,
  },
  resetBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
