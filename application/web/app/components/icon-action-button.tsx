"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
} from "react";
import { createPortal } from "react-dom";
import { createFrameScheduler } from "../lib/frame-scheduler";
import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";

type TooltipPosition = { left: number; top: number };

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export function usePortalTooltip<T extends HTMLElement>(
  text: string,
  placement: "bottom" | "right" = "bottom",
) {
  const id = useId();
  const triggerRef = useRef<T | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  const show = useCallback(() => {
    if (!text) return;
    setPortalTarget(triggerRef.current?.closest("dialog[open]") ?? document.body);
    setPosition(null);
    setVisible(true);
  }, [text]);
  const hide = useCallback(() => {
    setVisible(false);
    setPosition(null);
  }, []);

  const setTriggerRef = useCallback((node: T | null) => {
    triggerRef.current = node;
  }, []);

  useEffect(() => {
    if (!visible || !text) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const gutter = 8;
      const centeredLeft =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      const preferredLeft =
        placement === "right" ? triggerRect.right + gutter : centeredLeft;
      const left = Math.max(
        gutter,
        Math.min(preferredLeft, window.innerWidth - tooltipRect.width - gutter),
      );
      const belowTop = triggerRect.bottom + gutter;
      const aboveTop = triggerRect.top - tooltipRect.height - gutter;
      const top =
        placement === "right"
          ? triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
          : belowTop + tooltipRect.height <= window.innerHeight - gutter ||
              aboveTop < gutter
            ? Math.min(belowTop, window.innerHeight - tooltipRect.height - gutter)
            : aboveTop;

      const nextPosition = {
        left,
        top: Math.max(
          gutter,
          Math.min(top, window.innerHeight - tooltipRect.height - gutter),
        ),
      };
      setPosition(previous => previous?.left === nextPosition.left && previous.top === nextPosition.top ? previous : nextPosition);
    };

    const scheduler = createFrameScheduler(updatePosition);
    scheduler.schedule();
    window.addEventListener("resize", scheduler.schedule);
    window.addEventListener("scroll", scheduler.schedule, true);
    return () => {
      scheduler.dispose();
      window.removeEventListener("resize", scheduler.schedule);
      window.removeEventListener("scroll", scheduler.schedule, true);
    };
  }, [placement, text, visible]);

  const tooltip =
    visible && text && typeof document !== "undefined"
      ? createPortal(
          <span
            className="ui-tooltip-portal"
            id={id}
            ref={tooltipRef}
            role="tooltip"
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {text}
          </span>,
          portalTarget ?? document.body,
        )
      : null;

  return { id, setTriggerRef, show, hide, tooltip, visible };
}

function describedBy(visible: boolean, id: string, current?: string) {
  return [current, visible ? id : undefined].filter(Boolean).join(" ") || undefined;
}

type IconActionButtonProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "aria-label" | "children" | "data-tooltip" | "title"
> & {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  tooltip?: string;
  showLabel?: boolean;
  variant?: "default" | "danger";
};

export const IconActionButton = forwardRef<
  HTMLButtonElement,
  IconActionButtonProps
>(function IconActionButton(
  {
    className = "",
    icon: Icon,
    iconClassName,
    label,
    tooltip = label,
    showLabel = false,
    type = "button",
    variant = "default",
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    "aria-describedby": existingDescription,
    ...buttonProps
  },
  forwardedRef,
) {
  const {
    setTriggerRef: setTooltipTriggerRef,
    ...tooltipLayer
  } = usePortalTooltip<HTMLButtonElement>(tooltip);
  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setTooltipTriggerRef(node);
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef, setTooltipTriggerRef],
  );

  return (
    <>
      <Button
        {...buttonProps}
        aria-describedby={describedBy(
          tooltipLayer.visible,
          tooltipLayer.id,
          existingDescription,
        )}
        aria-label={label}
        className={[
          "ui-icon-button",
          showLabel ? "ui-icon-button-labeled" : "",
          variant === "danger" ? "ui-icon-button-danger" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onBlur={(event) => {
          tooltipLayer.hide();
          onBlur?.(event);
        }}
        onFocus={(event) => {
          tooltipLayer.show();
          onFocus?.(event);
        }}
        onMouseEnter={(event) => {
          tooltipLayer.show();
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          tooltipLayer.hide();
          onMouseLeave?.(event);
        }}
        ref={setTriggerRef}
        title={undefined}
        type={type}
        variant={variant === "danger" ? "destructive" : "outline"}
        size="icon"
      >
        <Icon
          aria-hidden="true"
          className={iconClassName}
          size={17}
          strokeWidth={1.9}
        />
        {showLabel && <span className="ui-icon-button-label" aria-hidden="true">{label}</span>}
      </Button>
      {tooltipLayer.tooltip}
    </>
  );
});

type IconActionLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "aria-label" | "children" | "data-tooltip" | "title"
> & {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  tooltip?: string;
  variant?: "default" | "danger";
};

export const IconActionLink = forwardRef<
  HTMLAnchorElement,
  IconActionLinkProps
>(function IconActionLink(
  {
    className = "",
    icon: Icon,
    iconClassName,
    label,
    tooltip = label,
    variant = "default",
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    "aria-describedby": existingDescription,
    ...linkProps
  },
  ref,
) {
  const {
    setTriggerRef: setTooltipTriggerRef,
    ...tooltipLayer
  } = usePortalTooltip<HTMLAnchorElement>(tooltip);
  const setTriggerRef = useCallback(
    (node: HTMLAnchorElement | null) => {
      setTooltipTriggerRef(node);
      setForwardedRef(ref, node);
    },
    [ref, setTooltipTriggerRef],
  );

  return (
    <>
      <Button
        asChild
        aria-describedby={describedBy(
          tooltipLayer.visible,
          tooltipLayer.id,
          existingDescription,
        )}
        aria-label={label}
        className={[
          "ui-icon-button",
          variant === "danger" ? "ui-icon-button-danger" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        title={undefined}
        variant={variant === "danger" ? "destructive" : "outline"}
        size="icon"
      >
        <a
          {...linkProps}
          className={className}
          onBlur={(event) => {
            tooltipLayer.hide();
            onBlur?.(event);
          }}
          onFocus={(event) => {
            tooltipLayer.show();
            onFocus?.(event);
          }}
          onMouseEnter={(event) => {
            tooltipLayer.show();
            onMouseEnter?.(event);
          }}
          onMouseLeave={(event) => {
            tooltipLayer.hide();
            onMouseLeave?.(event);
          }}
          ref={setTriggerRef}
          title={undefined}
        >
          <Icon
            aria-hidden="true"
            className={iconClassName}
            size={17}
            strokeWidth={1.9}
          />
        </a>
      </Button>
      {tooltipLayer.tooltip}
    </>
  );
});
