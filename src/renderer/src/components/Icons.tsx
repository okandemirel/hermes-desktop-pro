/**
 * Minimal inline SVG icon component.
 * Replaces lucide-react to avoid build issues with the package's exports resolution.
 * Each icon is a simple SVG path rendered inline.
 */

import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fill?: string;
}

type IconComponent = React.FC<IconProps>;

// ─── Icon data (paths from Lucide) ────────────────────────

const ICONS: Record<string, { paths: string[]; fill?: string; circle?: [number, number, number]; rect?: [number, number, number, number] }> = {
  "message-square": {
    paths: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  },
  "history": {
    paths: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  },
  "server": {
    paths: ["M20 2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z", "M20 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z", "M6 6h.01", "M6 18h.01"],
  },
  "users": {
    paths: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
    circle: [9, 7, 4],
  },
  "user": {
    paths: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"],
    circle: [12, 7, 4],
  },
  "settings": {
    paths: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"],
    circle: [12, 12, 3],
  },
  "chevron-left": {
    paths: ["m15 18-6-6 6-6"],
  },
  "chevron-right": {
    paths: ["m9 18 6-6-6-6"],
  },
  "chevron-down": {
    paths: ["m6 9 6 6 6-6"],
  },
  "sun": {
    paths: ["M12 12h.01", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
    circle: [12, 12, 4],
  },
  "moon": {
    paths: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  },
  "sparkles": {
    paths: ["M12 3v3", "M12 18v3", "M4.22 5.64l2.12 2.12", "M17.66 17.66l2.12 2.12", "M3 12h3", "M18 12h3", "m5.64 19.78 2.12-2.12", "m17.66 6.34 2.12-2.12"],
  },
  "plus": {
    paths: ["M5 12h14", "M12 5v14"],
  },
  "x": {
    paths: ["M18 6 6 18", "m6 6 12 12"],
  },
  "send": {
    paths: ["m22 2-7 20-4-9-9-4Z", "M22 2 11 13"],
  },
  "square": {
    paths: [], rect: [3, 3, 18, 18],
  },
  "search": {
    paths: ["m21 21-4.3-4.3"],
    circle: [11, 11, 8],
  },
  "trash-2": {
    paths: ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11v6", "M14 11v6"],
  },
  "calendar": {
    paths: ["M8 2v4", "M16 2v4"],
    rect: [3, 4, 18, 18],
  },
  "clock": {
    paths: ["M12 6v6l4 2"],
    circle: [12, 12, 10],
  },
  "key": {
    paths: ["m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"],
  },
  "external-link": {
    paths: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  },
  "copy": {
    paths: ["M9 9H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-4Z", "M15 3h4a2 2 0 0 1 2 2v4"],
    rect: [9, 9, 8, 8],
  },
  "check": {
    paths: ["M20 6 9 17l-5-5"],
  },
  "globe": {
    paths: ["M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20"],
    circle: [12, 12, 10],
  },
  "brain": {
    paths: ["M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z", "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z", "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4", "M17.599 6.5a3 3 0 0 0 .399-1.375", "M6.003 5.125A3 3 0 0 0 6.401 6.5", "M3.477 10.896a4 4 0 0 1 .585-.396", "M19.938 10.5a4 4 0 0 1 .585.396", "M6 18a4 4 0 0 1-1.967-.516", "M19.967 17.484A4 4 0 0 1 18 18"],
  },
  "wrench": {
    paths: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"],
  },
  "bot": {
    paths: ["M12 8V4H8", "M12 8h.01", "M12 16h.01", "M9 12h6"],
    rect: [2, 4, 20, 16],
  },
  "folder-open": {
    paths: ["m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"],
  },
  "power": {
    paths: ["M18.36 6.64A9 9 0 0 1 20.77 15", "M12 2v10"],
  },
  "power-off": {
    paths: ["M18.36 6.64A9 9 0 0 1 20.77 15", "M12 2v10", "m2 2 20 20"],
  },
  "activity": {
    paths: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  },
  "radio": {
    paths: ["M4.9 19.1C1 15.2 1 8.8 4.9 4.9", "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5", "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5", "M19.1 4.9C23 8.8 23 15.1 19.1 19"],
    circle: [12, 12, 2],
  },
  "monitor": {
    paths: ["M8 21h8", "M12 17v4", "M12 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8Z"],
  },
  "terminal": {
    paths: ["m4 17 6-6-6-6", "M12 19h8"],
  },
  "database": {
    paths: ["M12 2c4.97 0 9 1.79 9 4s-4.03 4-9 4-9-1.79-9-4 4.03-4 9-4Z", "M3 6v6c0 2.21 4.03 4 9 4s9-1.79 9-4V6", "M3 12v6c0 2.21 4.03 4 9 4s9-1.79 9-4v-6"],
  },
  "info": {
    paths: ["M12 16v-4", "M12 8h.01"],
    circle: [12, 12, 10],
  },
  "download": {
    paths: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  },
  "upload": {
    paths: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  },
  "file-text": {
    paths: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
  },
  "book-open": {
    paths: ["M12 7v14", "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-9a2 2 0 0 0-2 2Z"],
  },
  "eye": {
    paths: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"],
    circle: [12, 12, 3],
  },
  "eye-off": {
    paths: ["M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20"],
  },
  "rotate-ccw": {
    paths: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  },
  "alert-triangle": {
    paths: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  },
  "pencil": {
    paths: ["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"],
  },
  "image": {
    paths: ["M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"],
    circle: [8.5, 8.5, 1.5],
  },
  "zap": {
    paths: ["M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"],
  },
  "play": {
    paths: ["M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z"],
  },
  "pause": {
    paths: ["M4 6h4v12H4z", "M14 6h4v12h-4z"],
  },
  "bell": {
    paths: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  },
  "timer": {
    paths: ["M10 2h4", "M12 14v-4"],
    circle: [12, 13, 8],
  },
  "filter": {
    paths: ["M22 3H2l8 9.46V19l4 2v-8.54z"],
  },
  "code": {
    paths: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  },
  "layers": {
    paths: ["m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", "m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L3.18 12.5", "m22 17-8.58 3.91a2 2 0 0 1-1.66 0L3.18 17"],
  },
};

// ─── Icon factory ────────────────────────────────────────

function createIcon(iconName: string): IconComponent {
  const data = ICONS[iconName];
  if (!data) {
    return ({ size = 24, className, style }: IconProps) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
      />
    );
  }

  return ({ size = 24, className, style, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...props}
    >
      {data.circle && (
        <circle cx={data.circle[0]} cy={data.circle[1]} r={data.circle[2]} />
      )}
      {data.rect && (
        <rect x={data.rect[0]} y={data.rect[1]} width={data.rect[2]} height={data.rect[3]} rx="2" />
      )}
      {data.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {data.fill && <path d={data.fill} fill="currentColor" />}
    </svg>
  );
}

// ─── Named exports ────────────────────────────────────────

export const MessageSquare = createIcon("message-square");
export const History = createIcon("history");
export const Server = createIcon("server");
export const Users = createIcon("users");
export const User = createIcon("user");
export const Settings = createIcon("settings");
export const ChevronLeft = createIcon("chevron-left");
export const ChevronRight = createIcon("chevron-right");
export const ChevronDown = createIcon("chevron-down");
export const Sun = createIcon("sun");
export const Moon = createIcon("moon");
export const Sparkles = createIcon("sparkles");
export const Plus = createIcon("plus");
export const X = createIcon("x");
export const Send = createIcon("send");
export const Square = createIcon("square");
export const Search = createIcon("search");
export const Trash2 = createIcon("trash-2");
export const Calendar = createIcon("calendar");
export const Clock = createIcon("clock");
export const Key = createIcon("key");
export const ExternalLink = createIcon("external-link");
export const Copy = createIcon("copy");
export const Check = createIcon("check");
export const Globe = createIcon("globe");
export const Brain = createIcon("brain");
export const Wrench = createIcon("wrench");
export const Bot = createIcon("bot");
export const FolderOpen = createIcon("folder-open");
export const Power = createIcon("power");
export const PowerOff = createIcon("power-off");
export const Activity = createIcon("activity");
export const Radio = createIcon("radio");
export const Monitor = createIcon("monitor");
export const Terminal = createIcon("terminal");
export const Database = createIcon("database");
export const Info = createIcon("info");
export const Download = createIcon("download");
export const Upload = createIcon("upload");
export const FileText = createIcon("file-text");
export const BookOpen = createIcon("book-open");
export const Eye = createIcon("eye");
export const EyeOff = createIcon("eye-off");
export const RotateCcw = createIcon("rotate-ccw");
export const AlertTriangle = createIcon("alert-triangle");
export const Pencil = createIcon("pencil");
export const ImageIcon = createIcon("image");
export const Zap = createIcon("zap");
export const Play = createIcon("play");
export const Pause = createIcon("pause");
export const Bell = createIcon("bell");
export const Timer = createIcon("timer");
export const Filter = createIcon("filter");
export const Code = createIcon("code");
export const Layers = createIcon("layers");
