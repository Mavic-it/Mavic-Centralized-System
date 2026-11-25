import { BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export const categories = ['inquiries','workforce', 'reservations', 'spaces', 'attendance', 'leave', 'official-business', 'inventory', 'movements', 'assets', 'tasks', 'incidents', 'accounts', 'branches'] as const;
export type AnalyticsCategory = typeof categories[number];
export type AnalyticsMode = 'overview' | 'hr';
export class AnalyticsQuery {
  @IsIn(['overview', 'hr']) mode: AnalyticsMode = 'overview';
  @IsOptional() @IsString() @MaxLength(100) branchId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsIn(['all', ...categories]) category: 'all' | AnalyticsCategory = 'all';
  @IsIn(['day', 'week', 'month', 'year']) grouping: 'day' | 'week' | 'month' | 'year' = 'day';
  @IsOptional() @IsString() @MaxLength(80) status?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) reservationPage = 1;
}
export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function reportingRange(query: AnalyticsQuery, now = new Date()) {
  const to = query.to ?? manilaDate(now);
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(to)) throw new BadRequestException('Select a valid end date.');
  const from = query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  if (!valid(from) || !valid(to) || to < from || Date.parse(to) - Date.parse(from) >= 366 * 86400000)
    throw new BadRequestException('Select valid ordered dates covering at most 366 days.');
  return { from, to };
}
