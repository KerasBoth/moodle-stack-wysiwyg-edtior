import type { SVGProps } from "react";

const base = (d: React.ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
        {d}
      </svg>
    );
  };

export const IconFile = base(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>);
export const IconFolder = base(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconSave = base(<><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></>);
export const IconDownload = base(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /></>);
export const IconUpload = base(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 19h16" /></>);
export const IconPlus = base(<path d="M12 5v14M5 12h14" />);
export const IconTrash = base(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const IconCopy = base(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
export const IconBook = base(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>);
export const IconDice = base(<><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>);
export const IconEye = base(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconInfo = base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const IconVars = base(<><path d="M7 4c-2 2-3 5-3 8s1 6 3 8M17 4c2 2 3 5 3 8s-1 6-3 8" /><path d="M9 9l6 6M15 9l-6 6" /></>);
export const IconText = base(<><path d="M4 6h16M4 12h16M4 18h10" /></>);
export const IconChat = base(<path d="M4 5h16v11H8l-4 4z" />);
export const IconInput = base(<><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 10v4" /></>);
export const IconTree = base(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.5 8l3.5 7.5M16.5 8 13 15.5" /></>);
export const IconGear = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconCheck = base(<path d="M5 12l5 5L20 7" />);
export const IconFlask = base(<><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" /><path d="M7 15h10" /></>);
export const IconCode = base(<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />);
export const IconX = base(<path d="M6 6l12 12M18 6 6 18" />);
export const IconChevron = base(<path d="M9 6l6 6-6 6" />);
export const IconUp = base(<path d="M6 15l6-6 6 6" />);
export const IconDown = base(<path d="M6 9l6 6 6-6" />);
export const IconPanel = base(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></>);
export const IconWand = base(<><path d="M4 20 16 8M14 6l2-2 4 4-2 2z" /><path d="M7 3v3M5.5 4.5h3M19 14v3M17.5 15.5h3" /></>);
export const IconPencil = base(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
export const IconLogout = base(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>);
export const IconUser = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>);
export const IconSearch = base(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>);
export const IconHome = base(<><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></>);
export const IconTag = base(<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>);
export const IconClock = base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconPara = base(<><path d="M13 4v16M17 4v16" /><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" /></>);
export const IconList = base(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></>);
export const IconListNum = base(<><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5l1.5-1V9M3.5 14.5a1.5 1.5 0 1 1 2.5 1.1L3.5 19H6.5" /></>);
export const IconClearFormat = base(<><path d="M6 5h12M12 5l-3 14M7 19h5" /><path d="M15 14l5 5M20 14l-5 5" /></>);
export const IconBraces = base(<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2c0 2-1 3-3 3" />);
export const IconMenu = base(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconChart = base(<><path d="M4 4v16h16" /><path d="M7 15c2-6 4-8 6-4s3 2 5-4" /><circle cx="13" cy="11" r="1.4" fill="currentColor" /></>);
