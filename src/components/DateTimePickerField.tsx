import { useState } from "react";
import { Platform, TouchableOpacity, Text, View, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

// value:  "YYYY-MM-DD" for date, "HH:MM" for time
// onChange: (newValue: string) => void

interface Props {
  mode: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  style?: object;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseTime(timeStr: string): Date {
  const [h, min] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

// ─── Web ──────────────────────────────────────────────────────────────────────
// Use native inputs directly. CSS trick: expand ::-webkit-calendar-picker-indicator
// to cover the full input so clicking anywhere opens the picker.
// For date: we overlay a custom text span (DD/MM/YYYY) using the color trick.

let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const s = document.createElement("style");
  // Use type selectors (not class) to avoid relying on className in Expo web
  s.textContent = `
    input[type="date"], input[type="time"] {
      position: relative;
      cursor: pointer;
    }
    input[type="date"]::-webkit-calendar-picker-indicator,
    input[type="time"]::-webkit-calendar-picker-indicator {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      width: 100%; height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    input[type="date"]:focus, input[type="time"]:focus {
      outline: none;
      border-color: #C97826 !important;
    }
    input[type="time"]::-webkit-datetime-edit-ampm-field {
      display: none !important;
    }
  `;
  document.head.appendChild(s);
}

const fieldStyle: any = {
  backgroundColor: "#fff",
  borderRadius: 12,
  paddingLeft: 14,
  paddingRight: 14,
  paddingTop: 14,
  paddingBottom: 14,
  fontSize: 15,
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "system-ui, sans-serif",
  cursor: "pointer",
};

function WebPicker({ mode, value, onChange }: Props) {
  injectCSS();

  if (mode === "time") {
    return (
      // @ts-ignore
      <input
        type="time"
        className="moto-dt"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={fieldStyle}
      />
    );
  }

  // Date: native input with color:transparent + custom overlay showing DD/MM/YYYY
  const display = value ? formatDisplayDate(value) : "DD/MM/AAAA";
  const hasValue = Boolean(value);

  return (
    // @ts-ignore
    <div style={{ position: "relative" }}>
      {/* @ts-ignore */}
      <input
        type="date"
        className="moto-dt"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          ...fieldStyle,
          color: "transparent",       // hide browser's date text
          WebkitTextFillColor: "transparent",
        }}
      />
      {/* Custom text overlay — pointer-events:none so clicks pass to the input */}
      {/* @ts-ignore */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          display: "flex",
          alignItems: "center",
          paddingLeft: 14,
          paddingRight: 14,
          fontSize: 15,
          color: hasValue ? "#1A1A1A" : "#999",
          pointerEvents: "none",
          userSelect: "none",
          fontFamily: "system-ui, sans-serif",
          justifyContent: "space-between",
        }}
      >
        {/* @ts-ignore */}
        <span>{display}</span>
        {/* @ts-ignore */}
        <span style={{ opacity: 0.35, fontSize: 13 }}>📅</span>
      </div>
    </div>
  );
}

// ─── Native (iOS / Android) ───────────────────────────────────────────────────
function NativePicker({ mode, value, onChange, style }: Props) {
  const [show, setShow] = useState(false);
  const date = mode === "date" ? parseDate(value) : parseTime(value);
  const label = mode === "date" ? formatDisplayDate(value) : value;

  return (
    <View>
      <TouchableOpacity style={[styles.nativeBtn, style]} onPress={() => setShow(true)}>
        <Text style={styles.nativeBtnText}>{label}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          mode={mode}
          value={date}
          display={mode === "date" ? "calendar" : "spinner"}
          is24Hour={true}
          onChange={(_event, selected) => {
            setShow(Platform.OS === "ios");
            if (selected) {
              onChange(mode === "date" ? formatDate(selected) : formatTime(selected));
            }
          }}
        />
      )}
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function DateTimePickerField(props: Props) {
  if (Platform.OS === "web") return <WebPicker {...props} />;
  return <NativePicker {...props} />;
}

const styles = StyleSheet.create({
  nativeBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  nativeBtnText: { fontSize: 15, color: "#1A1A1A" },
});
