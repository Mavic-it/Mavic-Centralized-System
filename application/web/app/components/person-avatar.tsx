"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import s from "./person-avatar.module.css";

export function PersonAvatar({
  name,
  employeeId,
  profilePictureUpdatedAt,
  className = "",
  size = 40,
  fallback,
}: {
  name: string;
  employeeId?: string | null;
  profilePictureUpdatedAt?: string | null;
  className?: string;
  size?: number;
  fallback?: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photoUrl =
    employeeId && profilePictureUpdatedAt
      ? `/api/employees/${encodeURIComponent(employeeId)}/profile-picture?v=${encodeURIComponent(profilePictureUpdatedAt)}`
      : null;
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`${s.avatar} ${className}`} aria-hidden="true">
      {photoUrl && failedUrl !== photoUrl ? (
        <Image
          alt=""
          className={s.image}
          height={size}
          src={photoUrl}
          unoptimized
          width={size}
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        (fallback ?? initials)
      )}
    </span>
  );
}
