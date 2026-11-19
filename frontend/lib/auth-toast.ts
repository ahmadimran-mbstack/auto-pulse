import { toast, type ExternalToast } from "sonner";

export interface AuthToastAction {
  label: string;
  onClick: () => void;
}

export interface AuthToastOptions {
  id?: string;
  description?: string;
  action?: AuthToastAction;
  duration?: number;
}

type AnnouncementListener = (message: string) => void;
const listeners = new Set<AnnouncementListener>();

// Lets AuthToaster subscribe to screen-reader announcements without stealing focus
export function subscribeAuthAnnouncement(listener: AnnouncementListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Sends the message to the hidden alert region so screen readers announce it
function announceMessage(title: string, description?: string) {
  const fullText = description ? `${title}. ${description}` : title;
  for (const listener of listeners) {
    listener(fullText);
  }
}

// Builds a stable toast id from the message when no explicit id is passed
function resolveToastId(title: string, explicitId?: string) {
  if (explicitId) return explicitId;
  return `auth-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
}

// Picks the right duration: 8s when an action button exists, otherwise default
function resolveDuration(defaultMs: number, options?: AuthToastOptions) {
  if (options?.duration !== undefined) return options.duration;
  return options?.action ? 8000 : defaultMs;
}

// Builds Sonner options with fixed id, optional description, and optional action button
function buildSonnerOptions(
  title: string,
  defaultDuration: number,
  options?: AuthToastOptions
): ExternalToast {
  return {
    id: resolveToastId(title, options?.id),
    description: options?.description,
    duration: resolveDuration(defaultDuration, options),
    action: options?.action
      ? {
          label: options.action.label,
          onClick: options.action.onClick,
        }
      : undefined,
  };
}

// Shared toast helpers used by every auth page for form-level messages
export const authToast = {
  // Shows an error toast for 6s (or 8s with an action) and announces it
  error(title: string, options?: AuthToastOptions) {
    announceMessage(title, options?.description);
    return toast.error(title, buildSonnerOptions(title, 6000, options));
  },

  // Shows a success toast for 4s (or 8s with an action)
  success(title: string, options?: AuthToastOptions) {
    return toast.success(title, buildSonnerOptions(title, 4000, options));
  },

  // Shows a warning toast for 6s (or 8s with an action) and announces it
  warning(title: string, options?: AuthToastOptions) {
    announceMessage(title, options?.description);
    return toast.warning(title, buildSonnerOptions(title, 6000, options));
  },

  // Shows an info toast for 4s (or 8s with an action)
  info(title: string, options?: AuthToastOptions) {
    return toast.info(title, buildSonnerOptions(title, 4000, options));
  },

  // Clears any visible auth toast before a new form submission starts
  dismiss(id?: string) {
    toast.dismiss(id);
  },
};
