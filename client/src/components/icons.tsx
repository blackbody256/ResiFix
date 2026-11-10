// Inline stroke icons (24x24, currentColor). Kept in the bundle so the PWA works offline and
// no icon font or extra dependency is downloaded.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: ReactNode) {
  return function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const HomeIcon = make(
  <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
);
export const PlusCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </>,
);
export const TicketIcon = make(
  <>
    <path d="M3 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
    <path d="M14 4v13" strokeDasharray="2 2" />
  </>,
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const BellIcon = make(
  <>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
    <path d="M10 21h4" />
  </>,
);
export const BoltIcon = make(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />);
export const DropIcon = make(<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />);
export const KeyIcon = make(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M15 8l2 2" />
  </>,
);
export const SofaIcon = make(
  <>
    <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
    <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" />
    <path d="M6 18v2M18 18v2" />
  </>,
);
export const BugIcon = make(
  <>
    <rect x="8" y="7" width="8" height="12" rx="4" />
    <path d="M12 7V5M9 4l1.5 2M15 4l-1.5 2M8 11H4M20 11h-4M8 15H5M19 15h-3" />
  </>,
);
export const WifiIcon = make(
  <>
    <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19.5" r="0.5" fill="currentColor" />
  </>,
);
export const WrenchIcon = make(
  <path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8a2.8 2.8 0 0 1-4-4l8-8-1.5-1.5a4 4 0 0 0-1-1z" />,
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </>,
);
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />);
export const ArrowLeftIcon = make(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const ArrowRightIcon = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const CalendarIcon = make(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const CameraIcon = make(
  <>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);
export const TrashIcon = make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const CheckIcon = make(<path d="m5 12 5 5 9-10" />);
export const CheckCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </>,
);
export const AlertIcon = make(
  <>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.5" />
  </>,
);
export const SunIcon = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
  </>,
);
export const SunriseIcon = make(
  <>
    <path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M5 9l1.5 1.5M19 9l-1.5 1.5M2 14h2M20 14h2" />
  </>,
);
export const MoonIcon = make(<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />);
export const BuildingIcon = make(
  <>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
  </>,
);
export const ChartIcon = make(
  <>
    <path d="M4 19V5M4 19h16" />
    <path d="m7 15 3-4 3 2 4-6" />
  </>,
);
export const StarIcon = make(
  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
);
export const SendIcon = make(<path d="M4 12 20 4l-6 16-3-7z" />);
export const PencilIcon = make(<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />);
export const LightbulbIcon = make(
  <>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </>,
);
export const LogOutIcon = make(
  <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />,
);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />);
export const UsersIcon = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
  </>,
);
