/**
 * components/DateTimePickerField.tsx
 * Zero-dependency custom date + time picker fields for React Native.
 *
 * DateField supports two modes:
 *   - mode="future" (default) — for event dates. Past dates are disabled,
 *     initial view = today.
 *   - mode="past" — for DOB. Future dates are disabled, initial view =
 *     ~25 years ago. Has a tappable year/month header that opens fast
 *     pickers so users can jump decades in 2 taps.
 */

import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type DateMode = "future" | "past";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── DateField ────────────────────────────────────────────────────────────────
export const DateField = React.memo(function DateField({
  label,
  value,
  onChange,
  mode = "future",
  minDate,
  maxDate,
  placeholder = "Select date",
}: {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  mode?: DateMode;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pickerView, setPickerView] = useState<"calendar" | "month" | "year">("calendar");

  // Resolve min/max bounds based on mode
  const { bMin, bMax, initialYear, initialMonth } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (mode === "past") {
      // DOB-style: go back 120 years, cap at today
      const defaultMin = new Date(now.getFullYear() - 120, 0, 1);
      const defaultMax = now;
      // If no value yet, start the calendar at ~25 years ago
      const anchor = new Date(now.getFullYear() - 25, now.getMonth(), 1);
      return {
        bMin: minDate ?? defaultMin,
        bMax: maxDate ?? defaultMax,
        initialYear: anchor.getFullYear(),
        initialMonth: anchor.getMonth(),
      };
    }
    // Future mode (event dates): from today forward
    const defaultMin = now;
    const defaultMax = new Date(now.getFullYear() + 10, 11, 31);
    return {
      bMin: minDate ?? defaultMin,
      bMax: maxDate ?? defaultMax,
      initialYear: now.getFullYear(),
      initialMonth: now.getMonth(),
    };
  }, [mode, minDate, maxDate]);

  // Start the calendar at the currently-selected value if there is one
  const startPoint = useMemo(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    }
    return { y: initialYear, m: initialMonth };
  }, [value, initialYear, initialMonth]);

  const [calY, setCalY] = useState(startPoint.y);
  const [calM, setCalM] = useState(startPoint.m);

  // Re-sync when the field value changes externally (e.g. another form reset)
  React.useEffect(() => {
    setCalY(startPoint.y);
    setCalM(startPoint.m);
  }, [startPoint.y, startPoint.m]);

  const formatDisplay = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  // Build calendar grid for the current calY/calM
  const firstOfMonth = new Date(calY, calM, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const select = (d: number) => {
    const picked = new Date(calY, calM, d);
    // Format as YYYY-MM-DD in local time (avoid timezone off-by-one from toISOString)
    const y = picked.getFullYear();
    const m = String(picked.getMonth() + 1).padStart(2, "0");
    const day = String(picked.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${day}`);
    setOpen(false);
    setPickerView("calendar");
  };

  const prevMonth = () => {
    if (calM === 0) {
      if (calY > bMin.getFullYear()) {
        setCalM(11);
        setCalY(calY - 1);
      }
    } else {
      setCalM(calM - 1);
    }
  };
  const nextMonth = () => {
    if (calM === 11) {
      if (calY < bMax.getFullYear()) {
        setCalM(0);
        setCalY(calY + 1);
      }
    } else {
      setCalM(calM + 1);
    }
  };

  const isDisabled = (d: number) => {
    const cell = new Date(calY, calM, d);
    cell.setHours(0, 0, 0, 0);
    return cell < bMin || cell > bMax;
  };

  const isSelected = (d: number) => {
    if (!value) return false;
    const v = new Date(value);
    return v.getFullYear() === calY && v.getMonth() === calM && v.getDate() === d;
  };

  const isTodayCell = (d: number) => {
    const now = new Date();
    return now.getFullYear() === calY && now.getMonth() === calM && now.getDate() === d;
  };

  const closeModal = () => {
    setOpen(false);
    setPickerView("calendar");
  };

  // Build the year list for the year picker (descending, most recent first)
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = bMax.getFullYear(); y >= bMin.getFullYear(); y--) out.push(y);
    return out;
  }, [bMin, bMax]);

  const isMonthDisabled = (monthIdx: number) => {
    // A month is disabled if ALL its days fall outside [bMin, bMax]
    const monthEnd = new Date(calY, monthIdx + 1, 0);
    const monthStart = new Date(calY, monthIdx, 1);
    return monthEnd < bMin || monthStart > bMax;
  };

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Ionicons name="calendar-outline" size={18} color="#02023E" />
        <Text style={[s.triggerText, !value && { color: "#8696a0" }]} numberOfLines={1}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#8696a0" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeModal}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closeModal}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            {/* Header — always visible, tappable title for month/year picker */}
            <View style={s.calHeader}>
              <TouchableOpacity
                onPress={prevMonth}
                style={s.navBtn}
                disabled={pickerView !== "calendar"}
              >
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={pickerView === "calendar" ? "#101720" : "#d1d5db"}
                />
              </TouchableOpacity>

              <View style={s.titleChips}>
                <TouchableOpacity
                  style={[s.titleChip, pickerView === "month" && s.titleChipActive]}
                  onPress={() => setPickerView(pickerView === "month" ? "calendar" : "month")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      s.titleChipText,
                      pickerView === "month" && s.titleChipTextActive,
                    ]}
                  >
                    {MONTH_NAMES[calM]}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.titleChip, pickerView === "year" && s.titleChipActive]}
                  onPress={() => setPickerView(pickerView === "year" ? "calendar" : "year")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      s.titleChipText,
                      pickerView === "year" && s.titleChipTextActive,
                    ]}
                  >
                    {calY}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={12}
                    color={pickerView === "year" ? "#fff" : "#02023E"}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={nextMonth}
                style={s.navBtn}
                disabled={pickerView !== "calendar"}
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={pickerView === "calendar" ? "#101720" : "#d1d5db"}
                />
              </TouchableOpacity>
            </View>

            {/* Calendar view */}
            {pickerView === "calendar" && (
              <>
                <View style={s.weekRow}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                    <Text key={w} style={s.weekLabel}>{w}</Text>
                  ))}
                </View>
                <View style={s.grid}>
                  {cells.map((cell, idx) => {
                    if (cell === null) {
                      return <View key={idx} style={s.cell} />;
                    }
                    const disabled = isDisabled(cell);
                    const selected = isSelected(cell);
                    const todayCell = isTodayCell(cell);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          s.cell,
                          selected && s.cellSelected,
                          todayCell && !selected && s.cellToday,
                        ]}
                        onPress={() => !disabled && select(cell)}
                        disabled={disabled}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            s.cellText,
                            disabled && { color: "#d1d5db" },
                            selected && { color: "#fff", fontWeight: "800" },
                            todayCell && !selected && { color: "#02023E", fontWeight: "800" },
                          ]}
                        >
                          {cell}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Month picker view */}
            {pickerView === "month" && (
              <View style={s.monthGrid}>
                {MONTH_ABBR.map((m, idx) => {
                  const disabled = isMonthDisabled(idx);
                  const selected = idx === calM;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        s.monthCell,
                        selected && s.monthCellSelected,
                        disabled && { opacity: 0.3 },
                      ]}
                      onPress={() => {
                        if (disabled) return;
                        setCalM(idx);
                        setPickerView("calendar");
                      }}
                      disabled={disabled}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          s.monthCellText,
                          selected && { color: "#fff", fontWeight: "800" },
                        ]}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Year picker view */}
            {pickerView === "year" && (
              <FlatList
                data={years}
                keyExtractor={(y) => String(y)}
                showsVerticalScrollIndicator={false}
                style={s.yearList}
                contentContainerStyle={{ paddingVertical: 6 }}
                initialScrollIndex={Math.max(0, years.indexOf(calY))}
                getItemLayout={(_, index) => ({
                  length: 48,
                  offset: 48 * index,
                  index,
                })}
                renderItem={({ item: y }) => {
                  const selected = y === calY;
                  return (
                    <TouchableOpacity
                      style={[s.yearRow, selected && s.yearRowSelected]}
                      onPress={() => {
                        setCalY(y);
                        setPickerView("calendar");
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          s.yearRowText,
                          selected && { color: "#fff", fontWeight: "800" },
                        ]}
                      >
                        {y}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity style={s.closeBtn} onPress={closeModal}>
              <Text style={s.closeBtnText}>
                {pickerView === "calendar" ? "Cancel" : "Back to calendar"}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

// ─── TimeField ────────────────────────────────────────────────────────────────
export const TimeField = React.memo(function TimeField({
  label,
  value,
  onChange,
  placeholder = "Select time",
}: {
  label: string;
  value: string; // HH:MM (24h)
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const parsed = value ? value.split(":") : ["18", "00"];
  const [h, setH] = useState(parseInt(parsed[0]) || 18);
  const [m, setM] = useState(parseInt(parsed[1]) || 0);

  const formatDisplay = (t: string) => {
    if (!t) return "";
    const [hh, mm] = t.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${ampm}`;
  };

  const confirm = () => {
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    setOpen(false);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Ionicons name="time-outline" size={18} color="#02023E" />
        <Text style={[s.triggerText, !value && { color: "#8696a0" }]} numberOfLines={1}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#8696a0" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={s.timeSheet} activeOpacity={1}>
            <Text style={s.timeTitle}>{label}</Text>

            <View style={s.timeRow}>
              {/* Hours column */}
              <View style={s.timeCol}>
                <Text style={s.timeColLabel}>HOUR</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={s.timeScroll}
                >
                  {hours.map((hr) => {
                    const active = hr === h;
                    return (
                      <TouchableOpacity
                        key={hr}
                        style={[s.timeItem, active && s.timeItemActive]}
                        onPress={() => setH(hr)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.timeItemText, active && s.timeItemTextActive]}>
                          {String(hr).padStart(2, "0")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={s.timeSeparator}>:</Text>

              {/* Minutes column */}
              <View style={s.timeCol}>
                <Text style={s.timeColLabel}>MIN</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={s.timeScroll}
                >
                  {minutes.map((mn) => {
                    const active = mn === m;
                    return (
                      <TouchableOpacity
                        key={mn}
                        style={[s.timeItem, active && s.timeItemActive]}
                        onPress={() => setM(mn)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.timeItemText, active && s.timeItemTextActive]}>
                          {String(mn).padStart(2, "0")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity style={s.confirmBtn} onPress={confirm} activeOpacity={0.85}>
              <LinearGradient colors={["#02023E", "#02023E"]} style={s.confirmBtnGrad}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={s.confirmBtnText}>Confirm</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setOpen(false)}>
              <Text style={s.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

const s = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: "700", color: "#5a6169", marginBottom: 7, letterSpacing: 0.3 },
  trigger: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 13, backgroundColor: "#fff",
  },
  triggerText: { flex: 1, fontSize: 14, color: "#101720", fontWeight: "600", minWidth: 0 },

  overlay: {
    flex: 1, backgroundColor: "rgba(16,23,32,0.55)",
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: "#fff", borderRadius: 24, padding: 20,
    width: "100%", maxWidth: 380,
  },

  // Calendar
  calHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },
  titleChips: { flexDirection: "row", gap: 8, alignItems: "center" },
  titleChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  titleChipActive: { backgroundColor: "#02023E", borderColor: "#02023E" },
  titleChipText: { fontSize: 14, fontWeight: "800", color: "#02023E" },
  titleChipTextActive: { color: "#fff" },

  weekRow: { flexDirection: "row", marginBottom: 8 },
  weekLabel: {
    flex: 1, textAlign: "center", fontSize: 11,
    fontWeight: "800", color: "#8696a0", letterSpacing: 0.3,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center", justifyContent: "center",
    marginVertical: 2,
  },
  cellSelected: { backgroundColor: "#02023E", borderRadius: 12 },
  cellToday: { backgroundColor: "#f0fffe", borderRadius: 12 },
  cellText: { fontSize: 14, color: "#101720", fontWeight: "600" },

  // Month picker grid (3 cols × 4 rows)
  monthGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    paddingVertical: 8,
  },
  monthCell: {
    width: "31.5%",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  monthCellSelected: { backgroundColor: "#02023E", borderColor: "#02023E" },
  monthCellText: { fontSize: 14, fontWeight: "700", color: "#101720" },

  // Year picker list
  yearList: { maxHeight: 280, marginVertical: 4 },
  yearRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: 44, marginVertical: 2, marginHorizontal: 4,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  yearRowSelected: { backgroundColor: "#02023E" },
  yearRowText: { fontSize: 15, fontWeight: "700", color: "#101720" },

  closeBtn: { alignItems: "center", paddingVertical: 12, marginTop: 12 },
  closeBtnText: { fontSize: 14, color: "#8696a0", fontWeight: "700" },

  // Time picker
  timeSheet: {
    backgroundColor: "#fff", borderRadius: 24, padding: 20,
    width: "100%", maxWidth: 320,
  },
  timeTitle: {
    fontSize: 16, fontWeight: "800", color: "#101720",
    textAlign: "center", marginBottom: 16,
  },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  timeCol: { alignItems: "center", width: 90 },
  timeColLabel: { fontSize: 10, fontWeight: "800", color: "#8696a0", letterSpacing: 0.5, marginBottom: 6 },
  timeScroll: { maxHeight: 200, width: "100%" },
  timeItem: {
    paddingVertical: 10, borderRadius: 10, alignItems: "center", marginVertical: 2,
  },
  timeItemActive: { backgroundColor: "#02023E" },
  timeItemText: { fontSize: 18, fontWeight: "700", color: "#8696a0" },
  timeItemTextActive: { color: "#fff", fontWeight: "800" },
  timeSeparator: { fontSize: 24, fontWeight: "800", color: "#101720" },

  confirmBtn: { marginTop: 16, borderRadius: 14, overflow: "hidden" },
  confirmBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
  },
  confirmBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
